"""
ml/model.py
───────────
Machine Learning demand forecasting model with Random Forest regression,
chronological evaluation, automatic retraining detection, and 7-day multi-step prediction.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor

from .dataset import fetch_historical_demand_data
from .features import FEATURE_COLUMNS, build_future_feature_row, extract_features_for_ingredient
from .evaluation import (
    chronological_split,
    compute_rule_based_baseline_metrics,
    evaluate_forecast_predictions,
)

logger = logging.getLogger("ai_service.ml.model")

MODEL_DIR = Path(__file__).resolve().parent.parent / "models"
MODEL_FILE = MODEL_DIR / "demand_model.joblib"
METADATA_FILE = MODEL_DIR / "model_metadata.json"

MIN_RECORDS_FOR_ML = 7  # Minimum daily history records to attempt ML prediction


class DemandForecastPipeline:
    """
    ML Demand Forecasting engine.
    Trains Random Forest models per ingredient or globally, evaluates against rule-based baseline,
    and produces 7-day continuous forward predictions.
    """

    def __init__(self):
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        self.models: dict[str, RandomForestRegressor] = {}
        self.global_model: RandomForestRegressor | None = None
        self.metadata: dict[str, Any] = {}
        self._load_saved_model()

    def _load_saved_model(self) -> bool:
        """Load persisted model and metadata from disk if available."""
        if MODEL_FILE.exists() and METADATA_FILE.exists():
            try:
                bundle = joblib.load(MODEL_FILE)
                self.models = bundle.get("models", {})
                self.global_model = bundle.get("global_model")
                with open(METADATA_FILE, "r", encoding="utf-8") as f:
                    self.metadata = json.load(f)
                logger.info("Loaded persisted ML demand forecasting model from %s", MODEL_FILE)
                return True
            except Exception as exc:
                logger.warning("Failed to load existing ML model: %s", exc)
        return False

    def _save_model(self, metadata: dict[str, Any]) -> None:
        """Persist trained model artifacts and evaluation metadata."""
        try:
            bundle = {
                "models": self.models,
                "global_model": self.global_model,
            }
            joblib.dump(bundle, MODEL_FILE)
            with open(METADATA_FILE, "w", encoding="utf-8") as f:
                json.dump(metadata, f, indent=2, default=str)
            self.metadata = metadata
            logger.info("Saved ML demand model to %s with MAE: %s", MODEL_FILE, metadata.get("mae"))
        except Exception as exc:
            logger.error("Failed to save ML demand model: %s", exc)

    def is_stale(self, latest_db_date: datetime | None = None) -> bool:
        """
        Check if the current model requires retraining:
        1. Model not loaded
        2. No metadata
        3. Latest DB record date is newer than model training data_to
        4. Model was trained more than 24 hours ago
        """
        if not self.metadata or (not self.models and self.global_model is None):
            return True

        trained_at_str = self.metadata.get("trained_at")
        if trained_at_str:
            try:
                trained_at = datetime.fromisoformat(trained_at_str)
                if datetime.now(timezone.utc) - trained_at > timedelta(hours=24):
                    return True
            except Exception:
                return True

        if latest_db_date:
            data_to_str = self.metadata.get("data_to")
            if data_to_str:
                try:
                    data_to = datetime.fromisoformat(data_to_str)
                    if latest_db_date.date() > data_to.date():
                        return True
                except Exception:
                    pass

        return False

    async def train_and_evaluate(
        self,
        get_fn: Any,
        lookback_days: int = 60,
        force: bool = False,
    ) -> dict[str, Any]:
        """
        Extract latest database data, engineer features, perform chronological validation,
        train models, and save if valid.
        """
        df_daily = await fetch_historical_demand_data(get_fn, days=lookback_days)
        if df_daily.empty or len(df_daily) < MIN_RECORDS_FOR_ML:
            return {
                "status": "INSUFFICIENT_DATA",
                "message": f"Historical data has {len(df_daily)} records; minimum {MIN_RECORDS_FOR_ML} required.",
                "training_records": len(df_daily),
            }

        unique_dates = df_daily["date"].unique()
        data_from = str(pd.to_datetime(df_daily["date"].min()).date())
        data_to = str(pd.to_datetime(df_daily["date"].max()).date())

        # Check if retraining is needed
        if not force and not self.is_stale(pd.to_datetime(df_daily["date"].max())):
            return {
                "status": "UP_TO_DATE",
                "message": "Existing model is up-to-date with current database history.",
                **self.metadata,
            }

        # Engineer features per ingredient
        augmented_dfs = []
        for _, group in df_daily.groupby("ingredient_id"):
            feat_df = extract_features_for_ingredient(group)
            augmented_dfs.append(feat_df)

        full_df = pd.concat(augmented_dfs, ignore_index=True)
        train_df, test_df = chronological_split(full_df, test_ratio=0.2, min_test_days=7)

        # Baseline calculation
        baseline_metrics = compute_rule_based_baseline_metrics(train_df, test_df)

        # Train models per ingredient & globally
        new_models: dict[str, RandomForestRegressor] = {}
        all_y_true: list[float] = []
        all_y_pred: list[float] = []

        for ing_id, ing_train in train_df.groupby("ingredient_id"):
            if len(ing_train) >= MIN_RECORDS_FOR_ML:
                rf = RandomForestRegressor(
                    n_estimators=100,
                    max_depth=8,
                    min_samples_split=2,
                    random_state=42,
                    n_jobs=-1,
                )
                rf.fit(ing_train[FEATURE_COLUMNS], ing_train["demand"])
                new_models[str(ing_id)] = rf

                # Test evaluation if test records exist
                ing_test = test_df[test_df["ingredient_id"] == ing_id]
                if not ing_test.empty:
                    preds = rf.predict(ing_test[FEATURE_COLUMNS])
                    all_y_true.extend(ing_test["demand"].tolist())
                    all_y_pred.extend(preds.tolist())

        # Global fallback model on all training records
        global_rf = RandomForestRegressor(
            n_estimators=100,
            max_depth=8,
            min_samples_split=2,
            random_state=42,
            n_jobs=-1,
        )
        global_rf.fit(train_df[FEATURE_COLUMNS], train_df["demand"])
        self.global_model = global_rf
        self.models = new_models

        # If any test items weren't covered by per-ingredient models, test with global model
        uncovered_test = test_df[~test_df["ingredient_id"].isin(new_models.keys())]
        if not uncovered_test.empty:
            global_preds = global_rf.predict(uncovered_test[FEATURE_COLUMNS])
            all_y_true.extend(uncovered_test["demand"].tolist())
            all_y_pred.extend(global_preds.tolist())

        ml_metrics = evaluate_forecast_predictions(all_y_true, all_y_pred)
        mae = ml_metrics["mae"]
        rmse = ml_metrics["rmse"]
        baseline_mae = baseline_metrics.get("baseline_mae", 0.0)

        metadata = {
            "status": "TRAINED",
            "model_type": "RandomForestRegressor",
            "trained_at": datetime.now(timezone.utc).isoformat(),
            "data_from": data_from,
            "data_to": data_to,
            "unique_days_analyzed": len(unique_dates),
            "training_records": len(train_df),
            "validation_records": len(test_df),
            "mae": mae,
            "rmse": rmse,
            "baseline_mae": baseline_mae,
            "ml_outperformed_baseline": bool(mae <= baseline_mae) if baseline_mae > 0 else True,
            "ingredient_model_count": len(new_models),
            "features": FEATURE_COLUMNS,
        }

        self._save_model(metadata)
        return metadata

    async def generate_forecast(
        self,
        get_fn: Any,
        days: int = 7,
        ingredient_id: str | None = None,
        weather_context: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """
        Generate multi-day forward demand predictions for catalog ingredients with weather context.
        Returns a list of structured prediction dictionaries with explainable weather influence.
        """
        # Ensure model is trained or fresh
        await self.train_and_evaluate(get_fn, lookback_days=60, force=False)

        df_daily = await fetch_historical_demand_data(get_fn, days=60, ingredient_id=ingredient_id)
        if df_daily.empty:
            return []

        forecasts: list[dict[str, Any]] = []
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

        # Build date -> weather map from weather_context
        weather_by_date: dict[str, dict[str, Any]] = {}
        daily_forecast_list: list[dict[str, Any]] = []
        if weather_context:
            forecast_items = weather_context.get("forecast") or []
            if isinstance(forecast_items, list):
                daily_forecast_list = forecast_items
                for item in forecast_items:
                    d_str = item.get("date")
                    if d_str:
                        clean_d = d_str.split("T")[0]
                        weather_by_date[clean_d] = item

            # If current weather is present and no forecast list, use current as fallback
            current_w = weather_context.get("current")
            if current_w and not daily_forecast_list:
                daily_forecast_list = [current_w]

        for ing_id, group in df_daily.groupby("ingredient_id"):
            ing_id_str = str(ing_id)
            if ingredient_id and ing_id_str != str(ingredient_id):
                continue

            sorted_group = group.sort_values(by="date").reset_index(drop=True)
            name = str(sorted_group["ingredient_name"].iloc[0])
            unit = str(sorted_group["unit"].iloc[0])
            hist_demands = sorted_group["demand"].tolist()
            hist_count = len(sorted_group)

            # Determine appropriate model
            model = self.models.get(ing_id_str, self.global_model)
            use_ml = (model is not None) and (hist_count >= MIN_RECORDS_FOR_ML)

            daily_predictions: list[float] = []
            baseline_daily_preds: list[float] = []
            simulated_history = list(hist_demands)
            simulated_baseline_history = list(hist_demands)

            sampled_weather: list[dict[str, Any]] = []

            for step in range(1, days + 1):
                target_dt = pd.to_datetime(today + timedelta(days=step))
                target_d_str = target_dt.strftime("%Y-%m-%d")

                # Find weather info for this day
                w_info = weather_by_date.get(target_d_str)
                if not w_info and daily_forecast_list:
                    w_idx = min(step - 1, len(daily_forecast_list) - 1)
                    w_info = daily_forecast_list[w_idx]

                if w_info:
                    sampled_weather.append(w_info)

                # Weather-aware feature row
                feat_dict = build_future_feature_row(target_dt, simulated_history, weather_info=w_info)
                # Neutral baseline feature row (no weather effect)
                baseline_feat_dict = build_future_feature_row(target_dt, simulated_baseline_history, weather_info=None)

                if use_ml and model is not None:
                    feat_row = pd.DataFrame([feat_dict])[FEATURE_COLUMNS]
                    pred_val = float(model.predict(feat_row)[0])
                    pred_val = max(0.0, round(pred_val, 3))

                    base_row = pd.DataFrame([baseline_feat_dict])[FEATURE_COLUMNS]
                    base_val = float(model.predict(base_row)[0])
                    base_val = max(0.0, round(base_val, 3))
                else:
                    # Rule-based day prediction
                    is_we = feat_dict["is_weekend"] == 1
                    weekday_vals = [d for i, d in enumerate(hist_demands) if sorted_group.iloc[i]["date"].dayofweek < 5]
                    weekend_vals = [d for i, d in enumerate(hist_demands) if sorted_group.iloc[i]["date"].dayofweek >= 5]
                    avg_wd = sum(weekday_vals) / max(1, len(weekday_vals)) if weekday_vals else 0.0
                    avg_we = sum(weekend_vals) / max(1, len(weekend_vals)) if weekend_vals else avg_wd
                    pred_val = max(0.0, round(avg_we if is_we else avg_wd, 3))
                    base_val = pred_val

                daily_predictions.append(pred_val)
                baseline_daily_preds.append(base_val)
                simulated_history.append(pred_val)
                simulated_baseline_history.append(base_val)

            weekly_forecast = round(float(sum(daily_predictions)), 2)
            baseline_weekly = round(float(sum(baseline_daily_preds)), 2)
            daily_avg = round(weekly_forecast / days, 2) if days > 0 else 0.0

            # Compute weather influence explanation
            weather_influence_dict = None
            if sampled_weather or weather_context:
                avg_temp = (
                    sum(
                        float((w.get("tempMax", 20.0) + w.get("tempMin", 20.0)) / 2.0 if "tempMax" in w else w.get("temperature", 20.0))
                        for w in sampled_weather
                    ) / max(1, len(sampled_weather))
                    if sampled_weather
                    else 20.0
                )
                avg_rain_prob = (
                    sum(float(w.get("rainProbability", 0.0)) for w in sampled_weather) / max(1, len(sampled_weather))
                    if sampled_weather
                    else 0.0
                )
                primary_cond = sampled_weather[0].get("condition", "Clear") if sampled_weather else "Clear"

                diff = weekly_forecast - baseline_weekly
                pct_change = (diff / baseline_weekly * 100) if baseline_weekly > 0 else 0.0

                if abs(diff) < 0.2 or abs(pct_change) < 2.0:
                    impact = "NEUTRAL"
                    explanation = f"Forecasted weather ({primary_cond}, {round(avg_temp, 1)}°C) shows minimal historical impact on {name}."
                elif diff > 0:
                    impact = "INCREASED"
                    explanation = f"Forecasted weather conditions ({primary_cond}, rain prob {round(avg_rain_prob*100)}%) correlate with a +{round(pct_change, 1)}% uptick in predicted {name} demand."
                else:
                    impact = "DECREASED"
                    explanation = f"Forecasted conditions ({primary_cond}, {round(avg_temp, 1)}°C) correlate with a {round(pct_change, 1)}% decrease in predicted {name} demand."

                weather_influence_dict = {
                    "condition": primary_cond,
                    "temperature": round(avg_temp, 1),
                    "rainProbability": round(avg_rain_prob, 2),
                    "impact": impact,
                    "explanation": explanation,
                    "baselineDemand": baseline_weekly,
                    "weatherAdjustedDemand": weekly_forecast,
                }

            forecasts.append({
                "ingredientId": ing_id_str,
                "ingredientName": name,
                "unit": unit,
                "forecastPeriodDays": days,
                "weeklyForecast": weekly_forecast,
                "dailyAverageDemand": daily_avg,
                "dailyPredictions": daily_predictions,
                "predictionSource": "ML" if use_ml else "RULE_BASED",
                "modelType": "RandomForestRegressor" if use_ml else "RuleBasedWeekdayWeekend",
                "trainingRecords": hist_count,
                "mae": self.metadata.get("mae", 0.0) if use_ml else self.metadata.get("baseline_mae", 0.0),
                "confidenceScore": 0.88 if use_ml else (0.65 if hist_count > 0 else 0.10),
                "weatherInfluence": weather_influence_dict,
            })

        return forecasts


# Global pipeline singleton
forecast_pipeline = DemandForecastPipeline()

"""
ml/evaluation.py
────────────────
Chronological model evaluation and baseline comparison against rule-based demand estimation.
Computes MAE, RMSE, and validates whether ML model outperforms the baseline.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd


def evaluate_forecast_predictions(
    y_true: list[float] | np.ndarray | pd.Series,
    y_pred: list[float] | np.ndarray | pd.Series,
) -> dict[str, float]:
    """Calculate standard regression metrics: MAE, RMSE."""
    arr_true = np.array(y_true, dtype=float)
    arr_pred = np.array(y_pred, dtype=float)

    if len(arr_true) == 0 or len(arr_pred) == 0:
        return {"mae": 0.0, "rmse": 0.0}

    errors = arr_true - arr_pred
    mae = float(np.mean(np.abs(errors)))
    rmse = float(math.sqrt(np.mean(errors ** 2)))

    return {
        "mae": round(mae, 4),
        "rmse": round(rmse, 4),
    }


def chronological_split(
    df_augmented: pd.DataFrame,
    test_ratio: float = 0.2,
    min_test_days: int = 7,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Split time-series dataset chronologically by unique dates to prevent lookahead bias.
    """
    if df_augmented.empty:
        return pd.DataFrame(), pd.DataFrame()

    unique_dates = sorted(df_augmented["date"].unique())
    total_dates = len(unique_dates)

    if total_dates < 14:
        # If very few days, use last min_test_days or half
        test_count = max(1, min(min_test_days, total_dates // 2))
    else:
        test_count = max(min_test_days, int(total_dates * test_ratio))

    split_idx = max(1, total_dates - test_count)
    train_dates = set(unique_dates[:split_idx])
    test_dates = set(unique_dates[split_idx:])

    train_df = df_augmented[df_augmented["date"].isin(train_dates)].copy()
    test_df = df_augmented[df_augmented["date"].isin(test_dates)].copy()

    return train_df, test_df


def compute_rule_based_baseline_metrics(
    train_df: pd.DataFrame,
    test_df: pd.DataFrame,
) -> dict[str, Any]:
    """
    Evaluate the existing rule-based forecasting logic on the test partition.
    Rule-based formula:
      Weekday demand = sum(weekday sales * recipe qty) / weekday_days
      Weekend demand = sum(weekend sales * recipe qty) / weekend_days
      Daily forecast = (avg_weekday * 5 + avg_weekend * 2) / 7
    """
    if train_df.empty or test_df.empty:
        return {"baseline_mae": 0.0, "baseline_rmse": 0.0}

    y_trues = []
    y_baseline_preds = []

    # Calculate rule-based averages per ingredient from train_df
    for ing_id, ing_train in train_df.groupby("ingredient_id"):
        ing_test = test_df[test_df["ingredient_id"] == ing_id]
        if ing_test.empty:
            continue

        weekday_rows = ing_train[ing_train["is_weekend"] == 0]
        weekend_rows = ing_train[ing_train["is_weekend"] == 1]

        avg_weekday = float(weekday_rows["demand"].mean()) if not weekday_rows.empty else 0.0
        avg_weekend = float(weekend_rows["demand"].mean()) if not weekend_rows.empty else 0.0

        if avg_weekday > 0 and avg_weekend == 0:
            avg_weekend = avg_weekday
        elif avg_weekend > 0 and avg_weekday == 0:
            avg_weekday = avg_weekend

        # Rule-based prediction for each test day
        for _, row in ing_test.iterrows():
            pred = avg_weekend if row["is_weekend"] == 1 else avg_weekday
            y_trues.append(float(row["demand"]))
            y_baseline_preds.append(pred)

    if not y_trues:
        return {"baseline_mae": 0.0, "baseline_rmse": 0.0}

    metrics = evaluate_forecast_predictions(y_trues, y_baseline_preds)
    return {
        "baseline_mae": metrics["mae"],
        "baseline_rmse": metrics["rmse"],
        "sample_count": len(y_trues),
    }

"""
ml/features.py
──────────────
Feature engineering pipeline for ingredient-level demand forecasting.
Constructs calendar, lag, and rolling historical features without future data leakage.
"""

from __future__ import annotations

import pandas as pd

FEATURE_COLUMNS = [
    "day_of_week",
    "is_weekend",
    "day_of_month",
    "month",
    "lag_1",
    "lag_2",
    "lag_7",
    "rolling_mean_3",
    "rolling_mean_7",
    "rolling_mean_14",
    "temperature",
    "rain_probability",
    "is_rainy",
]


def extract_features_for_ingredient(df_ing: pd.DataFrame) -> pd.DataFrame:
    """
    Given a single ingredient's daily time-series DataFrame sorted by date:
    Compute calendar, lag, rolling, and historical weather features strictly using historical values.
    """
    df = df_ing.copy().sort_values(by="date").reset_index(drop=True)

    # Calendar features
    df["day_of_week"] = df["date"].dt.dayofweek
    df["is_weekend"] = df["day_of_week"].isin([5, 6]).astype(int)
    df["day_of_month"] = df["date"].dt.day
    df["month"] = df["date"].dt.month

    # Strict historical lag features (shift by 1 or more to prevent leakage)
    df["lag_1"] = df["demand"].shift(1)
    df["lag_2"] = df["demand"].shift(2)
    df["lag_7"] = df["demand"].shift(7)

    # Strict historical rolling windows (shifted first so current day demand is excluded)
    df["rolling_mean_3"] = df["demand"].shift(1).rolling(window=3, min_periods=1).mean()
    df["rolling_mean_7"] = df["demand"].shift(1).rolling(window=7, min_periods=1).mean()
    df["rolling_mean_14"] = df["demand"].shift(1).rolling(window=14, min_periods=1).mean()

    # Weather features from historical records (if present, otherwise neutral defaults)
    if "temperature" not in df.columns:
        df["temperature"] = 20.0
    else:
        df["temperature"] = pd.to_numeric(df["temperature"], errors="coerce").fillna(20.0)

    if "rain_probability" not in df.columns:
        df["rain_probability"] = 0.0
    else:
        df["rain_probability"] = pd.to_numeric(df["rain_probability"], errors="coerce").fillna(0.0)

    if "is_rainy" not in df.columns:
        df["is_rainy"] = (df["rain_probability"] >= 0.4).astype(float)
    else:
        df["is_rainy"] = pd.to_numeric(df["is_rainy"], errors="coerce").fillna(0.0)

    # Backfill earliest rows where lag_7/lag_14 might be NaN with available rolling mean or lag_1
    df["lag_1"] = df["lag_1"].bfill().fillna(0.0)
    df["lag_2"] = df["lag_2"].bfill().fillna(0.0)
    df["lag_7"] = df["lag_7"].bfill().fillna(0.0)
    df["rolling_mean_3"] = df["rolling_mean_3"].bfill().fillna(0.0)
    df["rolling_mean_7"] = df["rolling_mean_7"].bfill().fillna(0.0)
    df["rolling_mean_14"] = df["rolling_mean_14"].bfill().fillna(0.0)

    return df


def prepare_training_features(df_daily: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series, pd.DataFrame]:
    """
    Build full feature matrix X and target y for all ingredients.
    Returns (X, y, df_augmented).
    """
    if df_daily.empty:
        return pd.DataFrame(), pd.Series(dtype=float), pd.DataFrame()

    augmented_dfs = []
    for _, group in df_daily.groupby("ingredient_id"):
        ing_feat = extract_features_for_ingredient(group)
        augmented_dfs.append(ing_feat)

    if not augmented_dfs:
        return pd.DataFrame(), pd.Series(dtype=float), pd.DataFrame()

    df_all = pd.concat(augmented_dfs, ignore_index=True)
    df_all = df_all.sort_values(by="date").reset_index(drop=True)

    X = df_all[FEATURE_COLUMNS].copy()
    y = df_all["demand"].copy()

    return X, y, df_all


def build_future_feature_row(
    target_date: pd.Timestamp,
    past_demands: list[float],
    weather_info: dict[str, Any] | None = None,
) -> dict[str, float]:
    """
    Construct feature vector for a future prediction date given recent demands and future forecasted weather.
    past_demands[-1] is yesterday's demand, past_demands[-2] is 2 days ago, etc.
    """
    dow = target_date.dayofweek
    is_we = 1 if dow in [5, 6] else 0
    dom = target_date.day
    m = target_date.month

    # Lags
    lag_1 = past_demands[-1] if len(past_demands) >= 1 else 0.0
    lag_2 = past_demands[-2] if len(past_demands) >= 2 else lag_1
    lag_7 = past_demands[-7] if len(past_demands) >= 7 else (sum(past_demands) / max(1, len(past_demands)))

    # Rolling means
    win3 = past_demands[-3:] if len(past_demands) >= 3 else past_demands
    rm3 = sum(win3) / max(1, len(win3))

    win7 = past_demands[-7:] if len(past_demands) >= 7 else past_demands
    rm7 = sum(win7) / max(1, len(win7))

    win14 = past_demands[-14:] if len(past_demands) >= 14 else past_demands
    rm14 = sum(win14) / max(1, len(win14))

    # Weather extraction
    temp = 20.0
    rain_prob = 0.0
    is_rainy = 0.0

    if weather_info:
        # Check temperature (min/max avg or direct)
        if "tempMax" in weather_info and "tempMin" in weather_info:
            temp = float(weather_info["tempMax"] + weather_info["tempMin"]) / 2.0
        elif "temperature" in weather_info:
            temp = float(weather_info["temperature"])

        rain_prob = float(weather_info.get("rainProbability", 0.0))
        cond = str(weather_info.get("condition", "")).lower()
        desc = str(weather_info.get("description", "")).lower()
        if "rain" in cond or "drizzle" in cond or "thunder" in cond or "rain" in desc or rain_prob >= 0.4:
            is_rainy = 1.0

    return {
        "day_of_week": float(dow),
        "is_weekend": float(is_we),
        "day_of_month": float(dom),
        "month": float(m),
        "lag_1": float(lag_1),
        "lag_2": float(lag_2),
        "lag_7": float(lag_7),
        "rolling_mean_3": float(rm3),
        "rolling_mean_7": float(rm7),
        "rolling_mean_14": float(rm14),
        "temperature": float(temp),
        "rain_probability": float(rain_prob),
        "is_rainy": float(is_rainy),
    }

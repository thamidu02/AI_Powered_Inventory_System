"""
test_weather_forecast.py
────────────────────────
Comprehensive test suite for Weather-Aware ML Demand Forecasting Pipeline.
Tests:
1. Feature engineering with and without weather features.
2. Training and evaluation pipeline.
3. Multi-day forward prediction with future weather forecast.
4. Weather impact and explanation engine.
5. Graceful fallback when weather is unavailable.
"""

import asyncio
import pandas as pd
from datetime import datetime, timedelta, timezone

from ml.features import (
    FEATURE_COLUMNS,
    extract_features_for_ingredient,
    prepare_training_features,
    build_future_feature_row,
)
from ml.model import DemandForecastPipeline


def test_feature_columns():
    """Verify weather features are part of FEATURE_COLUMNS."""
    assert "temperature" in FEATURE_COLUMNS
    assert "rain_probability" in FEATURE_COLUMNS
    assert "is_rainy" in FEATURE_COLUMNS
    print("PASS: test_feature_columns")


def test_feature_extraction_with_neutral_weather():
    """Test feature extraction defaults when historical weather is unrecorded."""
    dates = [pd.Timestamp("2026-08-01") + pd.Timedelta(days=i) for i in range(14)]
    df = pd.DataFrame({
        "date": dates,
        "ingredient_id": "test-ing-1",
        "demand": [10.0 + i for i in range(14)],
    })
    feat_df = extract_features_for_ingredient(df)
    assert len(feat_df) == 14
    assert feat_df["temperature"].iloc[0] == 20.0
    assert feat_df["rain_probability"].iloc[0] == 0.0
    assert feat_df["is_rainy"].iloc[0] == 0.0
    print("PASS: test_feature_extraction_with_neutral_weather")


def test_build_future_feature_row_with_weather():
    """Test future feature row construction with rain and temperature forecast."""
    target_date = pd.Timestamp("2026-09-29")
    past_demands = [15.0, 18.0, 20.0, 22.0, 19.0, 25.0, 24.0]
    
    # Weather forecast: Rainy, 18°C, 80% rain probability
    weather_info = {
        "tempMax": 20.0,
        "tempMin": 16.0,
        "condition": "Light Rain",
        "rainProbability": 0.8,
    }
    feat_row = build_future_feature_row(target_date, past_demands, weather_info=weather_info)
    assert feat_row["temperature"] == 18.0
    assert feat_row["rain_probability"] == 0.8
    assert feat_row["is_rainy"] == 1.0
    assert feat_row["lag_1"] == 24.0
    print("PASS: test_build_future_feature_row_with_weather")


async def test_forecast_pipeline_weather_aware():
    """Test DemandForecastPipeline with synthetic mock database data and weather context."""
    # Synthetic mock database getter
    dates = [(datetime.now(timezone.utc) - timedelta(days=i)).date().isoformat() for i in range(30, 0, -1)]
    mock_history = [
        {
            "date": d,
            "ingredientId": "ing-chicken-001",
            "ingredientName": "Chicken Breast",
            "unit": "kg",
            "demand": 20.0 + (i % 5) * 2.0,
        }
        for i, d in enumerate(dates)
    ]

    async def mock_get(endpoint: str, params: dict | None = None):
        if "demand-history" in endpoint:
            return mock_history
        return []

    pipeline = DemandForecastPipeline()
    # Force train with mock data
    await pipeline.train_and_evaluate(mock_get, lookback_days=30, force=True)

    # Future weather context
    weather_context = {
        "city": "Colombo",
        "current": {
            "temperature": 24.0,
            "humidity": 85,
            "condition": "Rainy",
            "rainProbability": 0.9,
        },
        "forecast": [
            {
                "date": (datetime.now(timezone.utc) + timedelta(days=i)).strftime("%Y-%m-%d"),
                "dayOfWeek": "Weekday",
                "tempMin": 22.0,
                "tempMax": 26.0,
                "condition": "Heavy Rain",
                "rainProbability": 0.95,
            }
            for i in range(1, 8)
        ],
    }

    # Generate forecast with weather
    forecasts = await pipeline.generate_forecast(mock_get, days=7, weather_context=weather_context)
    assert len(forecasts) > 0
    f = forecasts[0]
    assert f["ingredientName"] == "Chicken Breast"
    assert f["weeklyForecast"] > 0
    assert "weatherInfluence" in f
    assert f["weatherInfluence"] is not None
    assert f["weatherInfluence"]["condition"] in ["Heavy Rain", "Rainy", "Clear"]
    print("PASS: test_forecast_pipeline_weather_aware -> Forecast:", f["weeklyForecast"], "Influence:", f["weatherInfluence"]["impact"])

    # Test fallback when weather_context is None
    fallback_forecasts = await pipeline.generate_forecast(mock_get, days=7, weather_context=None)
    assert len(fallback_forecasts) > 0
    print("PASS: test_forecast_pipeline_fallback_without_weather -> Forecast:", fallback_forecasts[0]["weeklyForecast"])


if __name__ == "__main__":
    test_feature_columns()
    test_feature_extraction_with_neutral_weather()
    test_build_future_feature_row_with_weather()
    asyncio.run(test_forecast_pipeline_weather_aware())
    print("\nALL WEATHER-AWARE DEMAND FORECASTING TESTS PASSED!")

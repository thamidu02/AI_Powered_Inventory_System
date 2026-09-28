"""
ml package initialization.
Exposes dataset, features, model pipeline, and evaluation helpers.
"""

from .dataset import fetch_historical_demand_data
from .features import FEATURE_COLUMNS, extract_features_for_ingredient, prepare_training_features
from .evaluation import (
    chronological_split,
    evaluate_forecast_predictions,
    compute_rule_based_baseline_metrics,
)
from .model import DemandForecastPipeline, forecast_pipeline

__all__ = [
    "fetch_historical_demand_data",
    "FEATURE_COLUMNS",
    "extract_features_for_ingredient",
    "prepare_training_features",
    "chronological_split",
    "evaluate_forecast_predictions",
    "compute_rule_based_baseline_metrics",
    "DemandForecastPipeline",
    "forecast_pipeline",
]

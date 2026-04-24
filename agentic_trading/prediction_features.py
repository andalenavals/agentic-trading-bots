from __future__ import annotations

import math
from pathlib import Path

from agentic_trading.pipeline_common import require_columns, to_number


DEFAULT_LAGS = [1, 2, 5, 10]
DEFAULT_WINDOWS = [5, 20]
OBSERVED_HISTORY = "observed_history"
RECURSIVE_PATH = "recursive_path"

SENTIMENT_COLUMNS = {
    "news_count",
    "sentiment_score",
    "finbert_sentiment_score",
    "positive",
    "neutral",
    "negative",
    "finbert_positive",
    "finbert_neutral",
    "finbert_negative",
}


def ensure_prediction_columns(
    rows: list[dict[str, str]],
    source: Path,
    *,
    include_sentiment_features: bool,
) -> None:
    require_columns(rows, {"date", "commodity", "price"}, source)
    if include_sentiment_features:
        require_columns(rows, SENTIMENT_COLUMNS, source)


def feature_start_index(lags: list[int], windows: list[int]) -> int:
    return max(max(lags, default=1) + 1, max(windows, default=1) + 1)


def build_feature_vector(
    rows: list[dict[str, str]],
    log_prices: list[float],
    log_returns_series: list[float],
    index: int,
    lags: list[int],
    windows: list[int],
    include_sentiment_features: bool,
) -> list[float]:
    previous = rows[index - 1]
    features: list[float] = []

    for lag in lags:
        features.append(log_prices[index - lag])

    for lag in lags:
        features.append(log_returns_series[index - lag])

    for window in windows:
        window_returns = log_returns_series[index - window:index]
        mean = sum(window_returns) / len(window_returns)
        variance = sum((value - mean) ** 2 for value in window_returns) / len(window_returns)
        features.extend([mean, math.sqrt(variance)])

    if include_sentiment_features:
        features.extend(exogenous_features(previous))

    return features


def feature_names(lags: list[int], windows: list[int], include_sentiment_features: bool) -> list[str]:
    names = [f"lag_log_price_{lag}" for lag in lags]
    names.extend(f"lag_log_return_{lag}" for lag in lags)
    for window in windows:
        names.extend([f"rolling_log_return_mean_{window}", f"rolling_log_return_vol_{window}"])
    if include_sentiment_features:
        names.extend([
            "sentiment_score",
            "finbert_sentiment_score",
            "positive",
            "neutral",
            "negative",
            "finbert_positive",
            "finbert_neutral",
            "finbert_negative",
            "news_count",
        ])
    return names


def exogenous_features(row: dict[str, str]) -> list[float]:
    return [
        to_number(row.get("sentiment_score", "")),
        to_number(row.get("finbert_sentiment_score", "")),
        to_number(row.get("positive", "")),
        to_number(row.get("neutral", "")),
        to_number(row.get("negative", "")),
        to_number(row.get("finbert_positive", "")),
        to_number(row.get("finbert_neutral", "")),
        to_number(row.get("finbert_negative", "")),
        to_number(row.get("news_count", "")),
    ]


def safe_log(value: float) -> float:
    return math.log(max(value, 1e-9))


def log_returns(log_prices: list[float]) -> list[float]:
    returns = [0.0]
    for index in range(1, len(log_prices)):
        returns.append(log_prices[index] - log_prices[index - 1])
    return returns


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))

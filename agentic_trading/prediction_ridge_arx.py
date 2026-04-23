from __future__ import annotations

import argparse
import csv
import math
import sys
from pathlib import Path

from agentic_trading.training.common import load_config, require_config_keys


REQUIRED_CONFIG_KEYS = {
    "input_csv",
    "output_dir",
    "n_splits",
    "ridge_alpha",
}

DEFAULT_LAGS = [1, 2, 5, 10]
DEFAULT_WINDOWS = [5, 20]
csv.field_size_limit(sys.maxsize)


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict[str, object]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def resolve_input_files(input_csv: str) -> list[Path]:
    path = Path(input_csv)
    if any(character in input_csv for character in "*?[]"):
        files = sorted(path.parent.glob(path.name))
    elif path.is_dir():
        files = sorted(path.glob("*.csv"))
    else:
        files = [path]

    if not files:
        raise ValueError(f"No ridge-arx input CSVs matched {input_csv!r}.")
    return files


def walk_forward_boundaries(length: int, n_splits: int):
    if n_splits < 1:
        raise ValueError("n_splits must be at least 1.")

    split_size = length // (n_splits + 1)
    if split_size <= 1:
        raise ValueError("Not enough rows for the requested walk-forward split count.")

    for index in range(n_splits):
        train_end = split_size * (index + 1)
        yield index + 1, train_end


def generate_full_predictions(
    rows: list[dict[str, str]],
    split: int,
    train_end: int,
    ridge_alpha: float,
    lags: list[int] | None = None,
    windows: list[int] | None = None,
) -> list[dict[str, object]]:
    lags = lags or list(DEFAULT_LAGS)
    windows = windows or list(DEFAULT_WINDOWS)
    actual_prices = [to_number(row.get("price", "")) for row in rows]
    actual_returns = price_returns(actual_prices)
    feature_start = max(max(lags, default=1) + 1, max(windows, default=1) + 1)
    train_sample_end = max(feature_start, train_end)
    model = fit_ridge_arx_model(rows, actual_prices, actual_returns, feature_start, train_sample_end, ridge_alpha, lags, windows)
    generated: list[dict[str, object]] = []

    for index, row in enumerate(rows):
        phase = "train" if index < train_end else "test"
        predicted_price = None
        error = None
        absolute_error = None

        if phase == "test" and index >= feature_start:
            features = build_feature_vector(rows, actual_prices, actual_returns, index, lags, windows)
            predicted_return = predict_return(model, features)
            predicted_price = actual_prices[index - 1] * (1 + predicted_return)
            error = predicted_price - actual_prices[index]
            absolute_error = abs(error)

        generated.append(
            {
                "date": row.get("date", ""),
                "commodity": row.get("commodity", ""),
                "dataset_index": index,
                "split": split,
                "phase": phase,
                "price": row.get("price", ""),
                "predicted_price": "" if predicted_price is None else predicted_price,
                "error": "" if error is None else error,
                "absolute_error": "" if absolute_error is None else absolute_error,
                "alpha": model["intercept"],
                "beta": coefficient_for_feature(model, "lag_return_1"),
            }
        )

    return generated


def fit_ridge_arx_model(
    rows: list[dict[str, str]],
    prices: list[float],
    returns: list[float],
    feature_start: int,
    train_end: int,
    ridge_alpha: float,
    lags: list[int],
    windows: list[int],
) -> dict[str, object]:
    sample_indices = [index for index in range(feature_start, train_end) if index < len(rows)]
    if not sample_indices:
        return empty_model(feature_names(lags, windows))

    feature_names_list = feature_names(lags, windows)
    x_rows = [build_feature_vector(rows, prices, returns, index, lags, windows) for index in sample_indices]
    y_values = [returns[index] for index in sample_indices]

    means = []
    scales = []
    for column in range(len(feature_names_list)):
        values = [row[column] for row in x_rows]
        mean = sum(values) / len(values)
        variance = sum((value - mean) ** 2 for value in values) / len(values)
        scale = math.sqrt(variance) if variance > 1e-12 else 1.0
        means.append(mean)
        scales.append(scale)

    standardized = [
        [(value - mean) / scale for value, mean, scale in zip(row, means, scales, strict=True)]
        for row in x_rows
    ]
    intercept = sum(y_values) / len(y_values)
    centered_y = [value - intercept for value in y_values]
    coefficients = ridge_fit(standardized, centered_y, ridge_alpha)
    observed_min = min(y_values)
    observed_max = max(y_values)
    observed_span = max(0.01, observed_max - observed_min)

    return {
        "coefficients": coefficients,
        "feature_names": feature_names_list,
        "intercept": intercept,
        "means": means,
        "scales": scales,
        "return_floor": max(-0.2, observed_min - observed_span * 0.5),
        "return_ceiling": min(0.2, observed_max + observed_span * 0.5),
    }


def ridge_fit(x_rows: list[list[float]], y_values: list[float], ridge_alpha: float) -> list[float]:
    if not x_rows:
        return []

    n_features = len(x_rows[0])
    xtx = [[0.0 for _ in range(n_features)] for _ in range(n_features)]
    xty = [0.0 for _ in range(n_features)]

    for row, target in zip(x_rows, y_values, strict=True):
        for left in range(n_features):
            xty[left] += row[left] * target
            for right in range(n_features):
                xtx[left][right] += row[left] * row[right]

    for index in range(n_features):
        xtx[index][index] += ridge_alpha

    return solve_linear_system(xtx, xty)


def solve_linear_system(matrix: list[list[float]], vector: list[float]) -> list[float]:
    size = len(vector)
    augmented = [row[:] + [value] for row, value in zip(matrix, vector, strict=True)]

    for pivot in range(size):
        pivot_row = max(range(pivot, size), key=lambda row_index: abs(augmented[row_index][pivot]))
        if abs(augmented[pivot_row][pivot]) < 1e-12:
            continue

        augmented[pivot], augmented[pivot_row] = augmented[pivot_row], augmented[pivot]
        pivot_value = augmented[pivot][pivot]
        augmented[pivot] = [value / pivot_value for value in augmented[pivot]]

        for row_index in range(size):
            if row_index == pivot:
                continue
            factor = augmented[row_index][pivot]
            augmented[row_index] = [
                current - factor * pivot_value
                for current, pivot_value in zip(augmented[row_index], augmented[pivot], strict=True)
            ]

    return [row[-1] for row in augmented]


def predict_return(model: dict[str, object], features: list[float]) -> float:
    coefficients = model["coefficients"]
    means = model["means"]
    scales = model["scales"]
    intercept = float(model["intercept"])
    standardized = [
        clamp((value - mean) / scale, -8.0, 8.0)
        for value, mean, scale in zip(features, means, scales, strict=True)
    ]
    raw_prediction = intercept + sum(coefficient * value for coefficient, value in zip(coefficients, standardized, strict=True))
    return clamp(raw_prediction, float(model["return_floor"]), float(model["return_ceiling"]))


def build_feature_vector(
    rows: list[dict[str, str]],
    prices: list[float],
    returns: list[float],
    index: int,
    lags: list[int],
    windows: list[int],
) -> list[float]:
    previous = rows[index - 1]
    features: list[float] = []

    for lag in lags:
        features.append(returns[index - lag])

    for window in windows:
        window_returns = returns[index - window:index]
        mean = sum(window_returns) / len(window_returns)
        variance = sum((value - mean) ** 2 for value in window_returns) / len(window_returns)
        features.extend([mean, math.sqrt(variance)])

    features.extend([
        to_number(previous.get("sentiment_score", "")),
        to_number(previous.get("finbert_sentiment_score", "")),
        to_number(previous.get("positive", "")),
        to_number(previous.get("neutral", "")),
        to_number(previous.get("negative", "")),
        to_number(previous.get("finbert_positive", "")),
        to_number(previous.get("finbert_neutral", "")),
        to_number(previous.get("finbert_negative", "")),
        to_number(previous.get("news_count", "")),
    ])

    return features


def feature_names(lags: list[int], windows: list[int]) -> list[str]:
    names = [f"lag_return_{lag}" for lag in lags]
    for window in windows:
        names.extend([f"rolling_mean_{window}", f"rolling_vol_{window}"])
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


def coefficient_for_feature(model: dict[str, object], feature_name: str) -> float:
    names = model["feature_names"]
    coefficients = model["coefficients"]
    if feature_name not in names:
        return 0.0
    return float(coefficients[names.index(feature_name)])


def price_returns(prices: list[float]) -> list[float]:
    returns = [0.0]
    for index in range(1, len(prices)):
        previous = prices[index - 1]
        current = prices[index]
        returns.append(0.0 if previous == 0 else (current - previous) / previous)
    return returns


def empty_model(names: list[str]) -> dict[str, object]:
    return {
        "coefficients": [0.0 for _ in names],
        "feature_names": names,
        "intercept": 0.0,
        "means": [0.0 for _ in names],
        "scales": [1.0 for _ in names],
        "return_floor": -0.2,
        "return_ceiling": 0.2,
    }


def to_number(value: str) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def run(config_path: str) -> None:
    config = load_config(config_path)
    require_config_keys(config, REQUIRED_CONFIG_KEYS, config_path)
    output_dir = Path(config["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)
    ridge_alpha = float(config["ridge_alpha"])
    lags = [int(value) for value in config.get("lags", DEFAULT_LAGS)]
    windows = [int(value) for value in config.get("windows", DEFAULT_WINDOWS)]

    for input_file in resolve_input_files(config["input_csv"]):
        rows = read_csv(input_file)
        if not rows:
            continue

        commodity = rows[0].get("commodity", input_file.stem)
        for split, train_end in walk_forward_boundaries(len(rows), int(config["n_splits"])):
            full_predictions = generate_full_predictions(rows, split, train_end, ridge_alpha, lags, windows)
            write_csv(
                output_dir / f"full_dataset_predictions_{commodity}_split_{split}.csv",
                full_predictions,
                [
                    "date",
                    "commodity",
                    "dataset_index",
                    "split",
                    "phase",
                    "price",
                    "predicted_price",
                    "error",
                    "absolute_error",
                    "alpha",
                    "beta",
                ],
            )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/predictions/ridge_arx.json")
    args = parser.parse_args()
    run(args.config)


if __name__ == "__main__":
    main()

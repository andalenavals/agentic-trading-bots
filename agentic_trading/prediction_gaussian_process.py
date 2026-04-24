from __future__ import annotations

import argparse
import math
import warnings
from pathlib import Path
from typing import Any

from agentic_trading.prediction_features import (
    DEFAULT_LAGS,
    DEFAULT_WINDOWS,
    OBSERVED_HISTORY,
    RECURSIVE_PATH,
    build_feature_vector,
    clamp,
    ensure_prediction_columns,
    feature_names,
    feature_start_index,
    log_returns,
    safe_log,
)
from agentic_trading.prediction_lightgbm_common import DEFAULT_RETURN_BAND, estimate_target_band
from agentic_trading.prediction_metrics import PREDICTION_OUTPUT_FIELDNAMES, build_prediction_output_row
from agentic_trading.pipeline_common import (
    load_json_config,
    read_csv_rows,
    require_config_keys,
    resolve_input_files,
    to_number,
    walk_forward_boundaries,
    write_csv_rows,
)


REQUIRED_CONFIG_KEYS = {
    "input_csv",
    "output_dir",
    "n_splits",
}

DEFAULT_CONFIG_NAME = "gaussian_process_sentiment"
DEFAULT_MAX_TRAIN_SAMPLES = 240
DEFAULT_SIGNAL_VARIANCE = 1.0
DEFAULT_LENGTH_SCALE = 1.5
DEFAULT_NOISE_LEVEL = 0.3
DEFAULT_ALPHA = 0.0001
DEFAULT_N_RESTARTS_OPTIMIZER = 0


def generate_full_predictions(
    rows: list[dict[str, str]],
    split: int,
    train_end: int,
    *,
    lags: list[int] | None = None,
    windows: list[int] | None = None,
    include_sentiment_features: bool = True,
    evaluation_mode: str = OBSERVED_HISTORY,
    model_params: dict[str, Any] | None = None,
) -> list[dict[str, object]]:
    lags = lags or list(DEFAULT_LAGS)
    windows = windows or list(DEFAULT_WINDOWS)
    params = build_model_params(model_params)
    actual_prices = [to_number(row.get("price", "")) for row in rows]
    actual_log_prices = [safe_log(price) for price in actual_prices]
    actual_log_returns = log_returns(actual_log_prices)
    feature_start = feature_start_index(lags, windows)
    train_sample_end = max(feature_start, train_end)
    model = fit_gaussian_process_model(
        rows,
        actual_log_prices,
        actual_log_returns,
        feature_start,
        train_sample_end,
        lags,
        windows,
        include_sentiment_features,
        params,
    )

    if evaluation_mode not in {OBSERVED_HISTORY, RECURSIVE_PATH}:
        raise ValueError(f"Unsupported evaluation_mode {evaluation_mode!r}.")

    predicted_log_prices = list(actual_log_prices)
    predicted_log_returns = list(actual_log_returns)
    generated: list[dict[str, object]] = []

    for index, row in enumerate(rows):
        phase = "train" if index < train_end else "test"
        predicted_price = None
        actual_origin_price = None
        predicted_origin_price = None

        if phase == "test" and index >= feature_start:
            if evaluation_mode == OBSERVED_HISTORY:
                actual_origin_price = actual_prices[index - 1]
                features = build_feature_vector(
                    rows,
                    actual_log_prices,
                    actual_log_returns,
                    index,
                    lags,
                    windows,
                    include_sentiment_features,
                )
                previous_log_price = actual_log_prices[index - 1]
            else:
                actual_origin_price = actual_prices[index - 1]
                predicted_origin_price = math.exp(predicted_log_prices[index - 1])
                features = build_feature_vector(
                    rows,
                    predicted_log_prices,
                    predicted_log_returns,
                    index,
                    lags,
                    windows,
                    include_sentiment_features,
                )
                previous_log_price = predicted_log_prices[index - 1]

            predicted_log_return = clamp(
                predict_return(model, features),
                -float(model["return_band"]),
                float(model["return_band"]),
            )
            next_log_price = previous_log_price + predicted_log_return
            predicted_log_prices[index] = next_log_price
            predicted_log_returns[index] = predicted_log_return
            predicted_price = math.exp(next_log_price)

        generated.append(
            build_prediction_output_row(
                row=row,
                dataset_index=index,
                split=split,
                phase=phase,
                actual_price=actual_prices[index],
                predicted_price=predicted_price,
                actual_origin_price=actual_origin_price,
                predicted_origin_price=predicted_origin_price,
                alpha=float(model["sample_count"]),
                beta=float(model["length_scale"]),
            )
        )

    return generated


def fit_gaussian_process_model(
    rows: list[dict[str, str]],
    log_prices: list[float],
    log_returns_series: list[float],
    feature_start: int,
    train_end: int,
    lags: list[int],
    windows: list[int],
    include_sentiment_features: bool,
    model_params: dict[str, Any],
) -> dict[str, object]:
    sample_indices = [index for index in range(feature_start, train_end) if index < len(rows)]
    if int(model_params["max_train_samples"]) > 0 and len(sample_indices) > int(model_params["max_train_samples"]):
        sample_indices = sample_indices[-int(model_params["max_train_samples"]):]

    feature_names_list = feature_names(lags, windows, include_sentiment_features)
    if not sample_indices:
        return empty_model(feature_names_list, model_params)

    x_rows = [
        build_feature_vector(rows, log_prices, log_returns_series, index, lags, windows, include_sentiment_features)
        for index in sample_indices
    ]
    y_values = [log_returns_series[index] for index in sample_indices]
    means, scales = fit_feature_standardization(x_rows)
    standardized_features = [standardize_features(row, means, scales) for row in x_rows]
    target_mean, target_scale = fit_target_standardization(y_values)
    standardized_targets = [(value - target_mean) / target_scale for value in y_values]
    regressor = train_gaussian_process_regressor(standardized_features, standardized_targets, model_params)

    return {
        "regressor": regressor,
        "feature_names": feature_names_list,
        "means": means,
        "scales": scales,
        "target_mean": target_mean,
        "target_scale": target_scale,
        "return_band": estimate_target_band(y_values),
        "sample_count": len(sample_indices),
        "length_scale": extract_length_scale(regressor, float(model_params["length_scale"])),
    }


def build_model_params(config: dict[str, Any] | None) -> dict[str, Any]:
    config = config or {}
    return {
        "max_train_samples": int(config.get("max_train_samples", DEFAULT_MAX_TRAIN_SAMPLES)),
        "signal_variance": float(config.get("signal_variance", DEFAULT_SIGNAL_VARIANCE)),
        "length_scale": float(config.get("length_scale", DEFAULT_LENGTH_SCALE)),
        "noise_level": float(config.get("noise_level", DEFAULT_NOISE_LEVEL)),
        "alpha": float(config.get("alpha", DEFAULT_ALPHA)),
        "n_restarts_optimizer": int(config.get("n_restarts_optimizer", DEFAULT_N_RESTARTS_OPTIMIZER)),
    }


def empty_model(names: list[str], params: dict[str, Any]) -> dict[str, object]:
    return {
        "regressor": None,
        "feature_names": names,
        "means": [],
        "scales": [],
        "target_mean": 0.0,
        "target_scale": 1.0,
        "return_band": DEFAULT_RETURN_BAND,
        "sample_count": 0,
        "length_scale": float(params["length_scale"]),
    }


def fit_feature_standardization(x_rows: list[list[float]]) -> tuple[list[float], list[float]]:
    means: list[float] = []
    scales: list[float] = []
    width = len(x_rows[0]) if x_rows else 0
    for column in range(width):
        values = [row[column] for row in x_rows]
        mean = sum(values) / len(values)
        variance = sum((value - mean) ** 2 for value in values) / len(values)
        scale = math.sqrt(variance) if variance > 1e-12 else 1.0
        means.append(mean)
        scales.append(scale)
    return means, scales


def fit_target_standardization(values: list[float]) -> tuple[float, float]:
    mean = sum(values) / len(values)
    variance = sum((value - mean) ** 2 for value in values) / len(values)
    scale = math.sqrt(variance) if variance > 1e-12 else 1.0
    return mean, scale


def standardize_features(values: list[float], means: list[float], scales: list[float]) -> list[float]:
    return [
        (value - mean) / scale
        for value, mean, scale in zip(values, means, scales, strict=True)
    ]


def train_gaussian_process_regressor(
    x_rows: list[list[float]],
    y_values: list[float],
    model_params: dict[str, Any],
):
    if not x_rows:
        return None

    numpy = import_numpy()
    GaussianProcessRegressor, kernels, convergence_warning = import_sklearn_gaussian_process()
    kernel = (
        kernels.ConstantKernel(
            constant_value=float(model_params["signal_variance"]),
            constant_value_bounds=(0.1, 10.0),
        )
        * kernels.Matern(
            length_scale=float(model_params["length_scale"]),
            length_scale_bounds=(0.05, 10.0),
            nu=1.5,
        )
        + kernels.WhiteKernel(
            noise_level=float(model_params["noise_level"]),
            noise_level_bounds=(1e-4, 2.0),
        )
    )
    regressor = GaussianProcessRegressor(
        kernel=kernel,
        alpha=float(model_params["alpha"]),
        normalize_y=False,
        n_restarts_optimizer=int(model_params["n_restarts_optimizer"]),
    )

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", convergence_warning)
        regressor.fit(
            numpy.asarray(x_rows, dtype=float),
            numpy.asarray(y_values, dtype=float),
        )

    return regressor


def predict_return(model: dict[str, object], features: list[float]) -> float:
    regressor = model.get("regressor")
    if regressor is None:
        return 0.0

    standardized_features = standardize_features(
        features,
        list(model["means"]),
        list(model["scales"]),
    )
    numpy = import_numpy()
    prediction = regressor.predict(numpy.asarray([standardized_features], dtype=float))
    standardized_return = float(prediction[0])
    return standardized_return * float(model["target_scale"]) + float(model["target_mean"])


def extract_length_scale(regressor, fallback: float) -> float:
    if regressor is None:
        return fallback
    return find_length_scale(getattr(regressor, "kernel_", None), fallback)


def find_length_scale(kernel, fallback: float) -> float:
    if kernel is None:
        return fallback

    if hasattr(kernel, "length_scale"):
        value = getattr(kernel, "length_scale")
        if hasattr(value, "tolist"):
            value = value.tolist()
        if isinstance(value, (list, tuple)):
            if not value:
                return fallback
            return sum(float(item) for item in value) / len(value)
        return float(value)

    for attribute in ("k1", "k2"):
        nested_kernel = getattr(kernel, attribute, None)
        if nested_kernel is None:
            continue
        nested_length_scale = find_length_scale(nested_kernel, math.nan)
        if not math.isnan(nested_length_scale):
            return nested_length_scale

    return fallback


def import_numpy():
    try:
        import numpy  # type: ignore[import-not-found]
    except ModuleNotFoundError as error:
        raise ModuleNotFoundError(
            "numpy is required for Gaussian-process forecasts. Install it with `.venv/bin/python -m pip install numpy`."
        ) from error
    return numpy


def import_sklearn_gaussian_process():
    try:
        from sklearn.exceptions import ConvergenceWarning  # type: ignore[import-not-found]
        from sklearn.gaussian_process import GaussianProcessRegressor, kernels  # type: ignore[import-not-found]
    except ModuleNotFoundError as error:
        raise ModuleNotFoundError(
            "scikit-learn is required for Gaussian-process forecasts. Install it with `.venv/bin/python -m pip install scikit-learn`."
        ) from error
    return GaussianProcessRegressor, kernels, ConvergenceWarning


def run(config_path: str) -> None:
    config = load_json_config(config_path)
    require_config_keys(config, REQUIRED_CONFIG_KEYS, config_path)
    output_dir = Path(config["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)
    lags = [int(value) for value in config.get("lags", DEFAULT_LAGS)]
    windows = [int(value) for value in config.get("windows", DEFAULT_WINDOWS)]
    include_sentiment_features = bool(config.get("include_sentiment_features", True))
    model_params = build_model_params(config)

    for input_file in resolve_input_files(config["input_csv"]):
        rows = read_csv_rows(input_file)
        if not rows:
            continue
        ensure_prediction_columns(rows, input_file, include_sentiment_features=include_sentiment_features)

        commodity = rows[0].get("commodity", input_file.stem)
        for split, train_end in walk_forward_boundaries(len(rows), int(config["n_splits"])):
            observed_predictions = generate_full_predictions(
                rows,
                split,
                train_end,
                lags=lags,
                windows=windows,
                include_sentiment_features=include_sentiment_features,
                evaluation_mode=OBSERVED_HISTORY,
                model_params=model_params,
            )
            write_csv_rows(
                output_dir / f"full_dataset_predictions_{commodity}_split_{split}.csv",
                observed_predictions,
                PREDICTION_OUTPUT_FIELDNAMES,
            )
            recursive_predictions = generate_full_predictions(
                rows,
                split,
                train_end,
                lags=lags,
                windows=windows,
                include_sentiment_features=include_sentiment_features,
                evaluation_mode=RECURSIVE_PATH,
                model_params=model_params,
            )
            write_csv_rows(
                output_dir / f"full_dataset_predictions_{commodity}_split_{split}_{RECURSIVE_PATH}.csv",
                recursive_predictions,
                PREDICTION_OUTPUT_FIELDNAMES,
            )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=f"configs/predictions/{DEFAULT_CONFIG_NAME}.json")
    args = parser.parse_args()
    run(args.config)


if __name__ == "__main__":
    main()

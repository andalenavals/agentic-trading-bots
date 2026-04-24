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

DEFAULT_CONFIG_NAME = "arimax_sentiment"
DEFAULT_MAX_TRAIN_SAMPLES = 240
DEFAULT_AR_ORDER = 2
DEFAULT_MA_ORDER = 1
DEFAULT_MAXITER = 80
DEFAULT_TREND = "c"
DEFAULT_BAND_WINDOW = 20
DEFAULT_CENTER_BLEND = 0.9


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
    model = fit_arimax_model(
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

    state = model.get("results")
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

            standardized_features = standardize_features(
                features,
                list(model["means"]),
                list(model["scales"]),
                list(model["active_columns"]),
            )
            predicted_log_return = clamp(
                predict_return(model, state, standardized_features),
                -float(model["return_band"]),
                float(model["return_band"]),
            )
            raw_next_log_price = previous_log_price + predicted_log_return
            next_log_price = raw_next_log_price

            if evaluation_mode == RECURSIVE_PATH and float(model["center_blend"]) > 0.0:
                recent_prices = predicted_log_prices[max(0, index - int(model["band_window"])):index]
                center = sum(recent_prices) / len(recent_prices) if recent_prices else previous_log_price
                blended_next_log_price = (
                    float(model["center_blend"]) * center
                    + (1.0 - float(model["center_blend"])) * raw_next_log_price
                )
                next_log_price = clamp(
                    blended_next_log_price,
                    center - float(model["level_band"]),
                    center + float(model["level_band"]),
                )
                predicted_log_return = next_log_price - previous_log_price

            predicted_log_prices[index] = next_log_price
            predicted_log_returns[index] = predicted_log_return
            predicted_price = math.exp(next_log_price)

            appended_return = actual_log_returns[index] if evaluation_mode == OBSERVED_HISTORY else predicted_log_return
            state = append_observation(model, state, appended_return, standardized_features)

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
                alpha=float(model["ar_order"]),
                beta=float(model["ma_order"]),
            )
        )

    return generated


def fit_arimax_model(
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
    means, scales, active_columns = fit_feature_standardization(x_rows)
    standardized_exog = [standardize_features(row, means, scales, active_columns) for row in x_rows]
    target_mean, target_scale = fit_target_standardization(y_values)
    standardized_endog = [(value - target_mean) / target_scale for value in y_values]
    results = fit_sarimax_results(standardized_endog, standardized_exog, model_params)

    return {
        "results": results,
        "feature_names": feature_names_list,
        "means": means,
        "scales": scales,
        "active_columns": active_columns,
        "target_mean": target_mean,
        "target_scale": target_scale,
        "return_band": estimate_target_band(y_values),
        "band_window": max(max(windows, default=DEFAULT_BAND_WINDOW), DEFAULT_BAND_WINDOW),
        "center_blend": float(model_params["center_blend"]),
        "level_band": estimate_level_band(log_prices, sample_indices),
        "sample_count": len(sample_indices),
        "ar_order": int(model_params["ar_order"]),
        "ma_order": int(model_params["ma_order"]),
    }


def build_model_params(config: dict[str, Any] | None) -> dict[str, Any]:
    config = config or {}
    return {
        "max_train_samples": int(config.get("max_train_samples", DEFAULT_MAX_TRAIN_SAMPLES)),
        "ar_order": int(config.get("ar_order", DEFAULT_AR_ORDER)),
        "ma_order": int(config.get("ma_order", DEFAULT_MA_ORDER)),
        "maxiter": int(config.get("maxiter", DEFAULT_MAXITER)),
        "trend": str(config.get("trend", DEFAULT_TREND)),
        "center_blend": float(config.get("center_blend", DEFAULT_CENTER_BLEND)),
    }


def empty_model(names: list[str], params: dict[str, Any]) -> dict[str, object]:
    return {
        "results": None,
        "feature_names": names,
        "means": [],
        "scales": [],
        "active_columns": [],
        "target_mean": 0.0,
        "target_scale": 1.0,
        "return_band": DEFAULT_RETURN_BAND,
        "band_window": DEFAULT_BAND_WINDOW,
        "center_blend": float(params["center_blend"]),
        "level_band": 0.12,
        "sample_count": 0,
        "ar_order": int(params["ar_order"]),
        "ma_order": int(params["ma_order"]),
    }


def fit_feature_standardization(x_rows: list[list[float]]) -> tuple[list[float], list[float], list[int]]:
    means: list[float] = []
    scales: list[float] = []
    active_columns: list[int] = []
    width = len(x_rows[0]) if x_rows else 0
    for column in range(width):
        values = [row[column] for row in x_rows]
        mean = sum(values) / len(values)
        variance = sum((value - mean) ** 2 for value in values) / len(values)
        scale = math.sqrt(variance) if variance > 1e-12 else 1.0
        if variance > 1e-12:
            active_columns.append(column)
        means.append(mean)
        scales.append(scale)
    return means, scales, active_columns


def fit_target_standardization(values: list[float]) -> tuple[float, float]:
    mean = sum(values) / len(values)
    variance = sum((value - mean) ** 2 for value in values) / len(values)
    scale = math.sqrt(variance) if variance > 1e-12 else 1.0
    return mean, scale


def estimate_level_band(log_prices: list[float], sample_indices: list[int]) -> float:
    deviations = []
    for index in sample_indices:
        start = max(0, index - DEFAULT_BAND_WINDOW)
        history = log_prices[start:index]
        if not history:
            continue
        center = sum(history) / len(history)
        deviations.append(log_prices[index] - center)

    if not deviations:
        return 0.12

    mean = sum(deviations) / len(deviations)
    variance = sum((value - mean) ** 2 for value in deviations) / len(deviations)
    return clamp(2.5 * math.sqrt(variance), 0.04, 0.18)


def standardize_features(
    values: list[float],
    means: list[float],
    scales: list[float],
    active_columns: list[int],
) -> list[float]:
    return [
        (values[column] - means[column]) / scales[column]
        for column in active_columns
    ]


def fit_sarimax_results(endog: list[float], exog: list[list[float]], model_params: dict[str, Any]):
    if not endog:
        return None

    numpy = import_numpy()
    SARIMAX, convergence_warning = import_statsmodels_sarimax()
    exog_matrix = None if not exog or not exog[0] else numpy.asarray(exog, dtype=float)
    model = SARIMAX(
        numpy.asarray(endog, dtype=float),
        exog=exog_matrix,
        order=(int(model_params["ar_order"]), 0, int(model_params["ma_order"])),
        trend=str(model_params["trend"]),
        enforce_stationarity=False,
        enforce_invertibility=False,
        simple_differencing=False,
    )

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", convergence_warning)
        warnings.simplefilter("ignore", RuntimeWarning)
        try:
            return model.fit(disp=False, maxiter=int(model_params["maxiter"]))
        except Exception:
            return None


def predict_return(model: dict[str, object], state, standardized_features: list[float]) -> float:
    if state is None:
        return float(model["target_mean"])

    numpy = import_numpy()
    exog_matrix = None if not standardized_features else numpy.asarray([standardized_features], dtype=float)
    prediction = state.forecast(steps=1, exog=exog_matrix)
    standardized_return = float(prediction[0])
    return standardized_return * float(model["target_scale"]) + float(model["target_mean"])


def append_observation(model: dict[str, object], state, observed_return: float, standardized_features: list[float]):
    if state is None:
        return None

    numpy = import_numpy()
    standardized_return = (observed_return - float(model["target_mean"])) / float(model["target_scale"])
    _, convergence_warning = import_statsmodels_append_warning()
    exog_matrix = None if not standardized_features else numpy.asarray([standardized_features], dtype=float)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", convergence_warning)
        warnings.simplefilter("ignore", RuntimeWarning)
        try:
            return state.append(
                [standardized_return],
                exog=exog_matrix,
                refit=False,
            )
        except Exception:
            return state


def import_numpy():
    try:
        import numpy  # type: ignore[import-not-found]
    except ModuleNotFoundError as error:
        raise ModuleNotFoundError(
            "numpy is required for ARIMAX forecasts. Install it with `.venv/bin/python -m pip install numpy`."
        ) from error
    return numpy


def import_statsmodels_sarimax():
    try:
        from statsmodels.tools.sm_exceptions import ConvergenceWarning  # type: ignore[import-not-found]
        from statsmodels.tsa.statespace.sarimax import SARIMAX  # type: ignore[import-not-found]
    except ModuleNotFoundError as error:
        raise ModuleNotFoundError(
            "statsmodels is required for ARIMAX forecasts. Install it with `.venv/bin/python -m pip install statsmodels`."
        ) from error
    return SARIMAX, ConvergenceWarning


def import_statsmodels_append_warning():
    try:
        from statsmodels.tools.sm_exceptions import ConvergenceWarning  # type: ignore[import-not-found]
    except ModuleNotFoundError as error:
        raise ModuleNotFoundError(
            "statsmodels is required for ARIMAX forecasts. Install it with `.venv/bin/python -m pip install statsmodels`."
        ) from error
    return None, ConvergenceWarning


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

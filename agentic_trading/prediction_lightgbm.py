from __future__ import annotations

import argparse
import math
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

DEFAULT_CONFIG_NAME = "lightgbm_sentiment"
DEFAULT_NUM_BOOST_ROUND = 140
DEFAULT_LEARNING_RATE = 0.05
DEFAULT_NUM_LEAVES = 15
DEFAULT_MIN_DATA_IN_LEAF = 6
DEFAULT_FEATURE_FRACTION = 0.9
DEFAULT_BAGGING_FRACTION = 0.9
DEFAULT_BAGGING_FREQ = 1
DEFAULT_LAMBDA_L2 = 0.4
DEFAULT_RETURN_BAND = 0.12
DEFAULT_SEED = 7


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
    model = fit_lightgbm_model(
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
        error = None
        absolute_error = None

        if phase == "test" and index >= feature_start:
            if evaluation_mode == OBSERVED_HISTORY:
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

            predicted_log_return = clamp(predict_return(model, features), -float(model["return_band"]), float(model["return_band"]))
            next_log_price = previous_log_price + predicted_log_return
            predicted_log_prices[index] = next_log_price
            predicted_log_returns[index] = predicted_log_return

            predicted_price = math.exp(next_log_price)
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
                "alpha": model["num_trees"],
                "beta": model["num_leaves"],
            }
        )

    return generated


def fit_lightgbm_model(
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
    feature_names_list = feature_names(lags, windows, include_sentiment_features)
    if not sample_indices:
        return empty_model(feature_names_list, model_params)

    x_rows = [
        build_feature_vector(rows, log_prices, log_returns_series, index, lags, windows, include_sentiment_features)
        for index in sample_indices
    ]
    y_values = [log_returns_series[index] for index in sample_indices]
    return_band = estimate_return_band(log_returns_series, sample_indices)

    lightgbm = import_lightgbm()
    numpy = import_numpy()
    training_data = lightgbm.Dataset(
        numpy.asarray(x_rows, dtype=float),
        label=numpy.asarray(y_values, dtype=float),
        feature_name=feature_names_list,
        free_raw_data=False,
    )
    booster = lightgbm.train(
        {
            "objective": "regression",
            "metric": "l2",
            "verbosity": -1,
            "seed": int(model_params["seed"]),
            "learning_rate": float(model_params["learning_rate"]),
            "num_leaves": int(model_params["num_leaves"]),
            "min_data_in_leaf": int(model_params["min_data_in_leaf"]),
            "feature_fraction": float(model_params["feature_fraction"]),
            "bagging_fraction": float(model_params["bagging_fraction"]),
            "bagging_freq": int(model_params["bagging_freq"]),
            "lambda_l2": float(model_params["lambda_l2"]),
        },
        training_data,
        num_boost_round=int(model_params["num_boost_round"]),
    )

    return {
        "booster": booster,
        "feature_names": feature_names_list,
        "num_trees": booster.current_iteration(),
        "num_leaves": int(model_params["num_leaves"]),
        "return_band": return_band,
    }


def build_model_params(config: dict[str, Any] | None) -> dict[str, Any]:
    config = config or {}
    return {
        "num_boost_round": int(config.get("num_boost_round", DEFAULT_NUM_BOOST_ROUND)),
        "learning_rate": float(config.get("learning_rate", DEFAULT_LEARNING_RATE)),
        "num_leaves": int(config.get("num_leaves", DEFAULT_NUM_LEAVES)),
        "min_data_in_leaf": int(config.get("min_data_in_leaf", DEFAULT_MIN_DATA_IN_LEAF)),
        "feature_fraction": float(config.get("feature_fraction", DEFAULT_FEATURE_FRACTION)),
        "bagging_fraction": float(config.get("bagging_fraction", DEFAULT_BAGGING_FRACTION)),
        "bagging_freq": int(config.get("bagging_freq", DEFAULT_BAGGING_FREQ)),
        "lambda_l2": float(config.get("lambda_l2", DEFAULT_LAMBDA_L2)),
        "seed": int(config.get("seed", DEFAULT_SEED)),
    }


def estimate_return_band(log_returns_series: list[float], sample_indices: list[int]) -> float:
    values = [log_returns_series[index] for index in sample_indices]
    if not values:
        return DEFAULT_RETURN_BAND

    mean = sum(values) / len(values)
    variance = sum((value - mean) ** 2 for value in values) / len(values)
    return clamp(3.0 * math.sqrt(variance), 0.015, DEFAULT_RETURN_BAND)


def empty_model(names: list[str], params: dict[str, Any]) -> dict[str, object]:
    return {
        "booster": None,
        "feature_names": names,
        "num_trees": 0,
        "num_leaves": int(params["num_leaves"]),
        "return_band": DEFAULT_RETURN_BAND,
    }


def predict_return(model: dict[str, object], features: list[float]) -> float:
    booster = model.get("booster")
    if booster is None:
        return 0.0

    numpy = import_numpy()
    prediction = booster.predict(numpy.asarray([features], dtype=float), num_iteration=booster.current_iteration())
    return float(prediction[0])


def import_lightgbm():
    try:
        import lightgbm  # type: ignore[import-not-found]
    except ModuleNotFoundError as error:
        raise ModuleNotFoundError(
            "lightgbm is required for LightGBM forecasts. Install it with `.venv/bin/python -m pip install lightgbm`."
        ) from error
    return lightgbm


def import_numpy():
    try:
        import numpy  # type: ignore[import-not-found]
    except ModuleNotFoundError as error:
        raise ModuleNotFoundError(
            "numpy is required for LightGBM forecasts. Install it with `.venv/bin/python -m pip install numpy`."
        ) from error
    return numpy


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
    parser.add_argument("--config", default=f"configs/predictions/{DEFAULT_CONFIG_NAME}.json")
    args = parser.parse_args()
    run(args.config)


if __name__ == "__main__":
    main()

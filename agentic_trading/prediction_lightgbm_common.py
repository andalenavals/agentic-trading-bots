from __future__ import annotations

import math
from typing import Any


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


def estimate_target_band(values: list[float], *, lower: float = 0.015, upper: float = DEFAULT_RETURN_BAND) -> float:
    if not values:
        return upper

    mean = sum(values) / len(values)
    variance = sum((value - mean) ** 2 for value in values) / len(values)
    return clamp(3.0 * math.sqrt(variance), lower, upper)


def train_lightgbm_booster(
    x_rows: list[list[float]],
    y_values: list[float],
    feature_names_list: list[str],
    model_params: dict[str, Any],
):
    if not x_rows:
        return None

    lightgbm = import_lightgbm()
    numpy = import_numpy()
    training_data = lightgbm.Dataset(
        numpy.asarray(x_rows, dtype=float),
        label=numpy.asarray(y_values, dtype=float),
        feature_name=feature_names_list,
        free_raw_data=False,
    )
    return lightgbm.train(
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


def predict_with_booster(booster, features: list[float]) -> float:
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


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))

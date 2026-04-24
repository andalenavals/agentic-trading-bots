from __future__ import annotations

import argparse
import math
from pathlib import Path
from typing import Any

from agentic_trading.prediction_features import (
    DEFAULT_LAGS,
    DEFAULT_WINDOWS,
    build_feature_vector,
    clamp,
    ensure_prediction_columns,
    feature_names,
    feature_start_index,
    log_returns,
    safe_log,
)
from agentic_trading.prediction_metrics import PREDICTION_OUTPUT_FIELDNAMES, build_prediction_output_row
from agentic_trading.prediction_lightgbm_common import (
    DEFAULT_RETURN_BAND,
    build_model_params,
    estimate_target_band,
    predict_with_booster,
    train_lightgbm_booster,
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

DEFAULT_CONFIG_NAME = "lightgbm_direct_sentiment"
DIRECT_MULTI_HORIZON = "direct_multi_horizon"
DEFAULT_DIRECT_RETURN_BAND = 1.2


def generate_full_predictions(
    rows: list[dict[str, str]],
    split: int,
    train_end: int,
    *,
    lags: list[int] | None = None,
    windows: list[int] | None = None,
    include_sentiment_features: bool = True,
    model_params: dict[str, Any] | None = None,
) -> list[dict[str, object]]:
    lags = lags or list(DEFAULT_LAGS)
    windows = windows or list(DEFAULT_WINDOWS)
    params = build_model_params(model_params)
    actual_prices = [to_number(row.get("price", "")) for row in rows]
    actual_log_prices = [safe_log(price) for price in actual_prices]
    actual_log_returns = log_returns(actual_log_prices)
    feature_start = feature_start_index(lags, windows)
    test_length = max(0, len(rows) - train_end)
    direct_model = fit_direct_model(
        rows,
        actual_log_prices,
        actual_log_returns,
        feature_start,
        train_end,
        test_length,
        lags,
        windows,
        include_sentiment_features,
        params,
    )
    max_trained_horizon = int(direct_model["max_trained_horizon"])
    feature_horizon_scale = max(1, max_trained_horizon)

    origin_features = (
        build_feature_vector(
            rows,
            actual_log_prices,
            actual_log_returns,
            train_end,
            lags,
            windows,
            include_sentiment_features,
        )
        if train_end >= feature_start and train_end < len(rows)
        else None
    )
    origin_log_price = actual_log_prices[train_end - 1] if train_end > 0 else 0.0
    origin_actual_price = actual_prices[train_end - 1] if train_end > 0 else None
    generated: list[dict[str, object]] = []

    for index, row in enumerate(rows):
        phase = "train" if index < train_end else "test"
        predicted_price = None
        horizon = index - train_end + 1

        if phase == "test" and origin_features is not None and direct_model.get("booster") is not None:
            effective_horizon = min(max(1, horizon), feature_horizon_scale)
            raw_return = predict_with_booster(
                direct_model.get("booster"),
                augment_features(origin_features, effective_horizon, feature_horizon_scale),
            )
            cumulative_log_return = clamp(
                raw_return,
                -float(direct_model["return_band"]),
                float(direct_model["return_band"]),
            )
            next_log_price = origin_log_price + cumulative_log_return
            predicted_price = math.exp(next_log_price)

        generated.append(
            build_prediction_output_row(
                row=row,
                dataset_index=index,
                split=split,
                phase=phase,
                actual_price=actual_prices[index],
                predicted_price=predicted_price,
                actual_origin_price=origin_actual_price,
                predicted_origin_price=origin_actual_price,
                alpha=float(direct_model["num_trees"]),
                beta=float(direct_model["num_leaves"]),
            )
        )

    return generated


def fit_direct_model(
    rows: list[dict[str, str]],
    log_prices: list[float],
    log_returns_series: list[float],
    feature_start: int,
    train_end: int,
    test_length: int,
    lags: list[int],
    windows: list[int],
    include_sentiment_features: bool,
    model_params: dict[str, Any],
) -> dict[str, object]:
    max_horizon = max(0, min(test_length, train_end - feature_start))
    base_feature_names = feature_names(lags, windows, include_sentiment_features)
    feature_names_list = base_feature_names + ["forecast_horizon", "forecast_horizon_ratio", "forecast_horizon_log1p"]
    if max_horizon <= 0:
        return empty_model(model_params)

    horizon_grid = build_horizon_grid(max_horizon)
    x_rows: list[list[float]] = []
    y_values: list[float] = []

    for index in range(feature_start, train_end):
        base_features = build_feature_vector(rows, log_prices, log_returns_series, index, lags, windows, include_sentiment_features)
        for horizon in horizon_grid:
            target_index = index + horizon - 1
            if target_index >= train_end:
                continue
            x_rows.append(augment_features(base_features, horizon, max_horizon))
            y_values.append(log_prices[target_index] - log_prices[index - 1])

    if len(x_rows) < 2:
        return empty_model(model_params)

    booster = train_lightgbm_booster(x_rows, y_values, feature_names_list, model_params)
    return {
        "booster": booster,
        "num_trees": 0 if booster is None else booster.current_iteration(),
        "num_leaves": int(model_params["num_leaves"]),
        "return_band": estimate_target_band(y_values, upper=max(DEFAULT_RETURN_BAND, DEFAULT_DIRECT_RETURN_BAND)),
        "max_trained_horizon": max_horizon,
    }


def build_horizon_grid(max_horizon: int) -> list[int]:
    horizons: set[int] = set()
    add_range(horizons, 1, min(max_horizon, 15), 1)
    add_range(horizons, 20, min(max_horizon, 60), 5)
    add_range(horizons, 75, min(max_horizon, 180), 15)
    add_range(horizons, 210, min(max_horizon, 365), 30)
    add_range(horizons, 485, max_horizon, 120)
    horizons.add(max_horizon)
    return sorted(value for value in horizons if value > 0)


def add_range(target: set[int], start: int, stop: int, step: int) -> None:
    if start > stop:
        return
    for value in range(start, stop + 1, step):
        target.add(value)


def augment_features(base_features: list[float], horizon: int, max_horizon: int) -> list[float]:
    horizon_scale = max(1, max_horizon)
    return [
        *base_features,
        float(horizon),
        horizon / horizon_scale,
        math.log1p(horizon),
    ]


def empty_model(model_params: dict[str, Any]) -> dict[str, object]:
    return {
        "booster": None,
        "num_trees": 0,
        "num_leaves": int(model_params["num_leaves"]),
        "return_band": DEFAULT_DIRECT_RETURN_BAND,
        "max_trained_horizon": 0,
    }


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
            predictions = generate_full_predictions(
                rows,
                split,
                train_end,
                lags=lags,
                windows=windows,
                include_sentiment_features=include_sentiment_features,
                model_params=model_params,
            )
            write_csv_rows(
                output_dir / f"full_dataset_predictions_{commodity}_split_{split}.csv",
                predictions,
                PREDICTION_OUTPUT_FIELDNAMES,
            )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=f"configs/predictions/{DEFAULT_CONFIG_NAME}.json")
    args = parser.parse_args()
    run(args.config)


if __name__ == "__main__":
    main()

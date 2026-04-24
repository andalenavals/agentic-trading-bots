from __future__ import annotations

import argparse
import math
from pathlib import Path
from typing import Any

from agentic_trading.prediction_lightgbm_common import (
    DEFAULT_RETURN_BAND,
    build_model_params,
    estimate_target_band,
    predict_with_booster,
    train_lightgbm_booster,
)
from agentic_trading.prediction_metrics import PREDICTION_OUTPUT_FIELDNAMES, build_prediction_output_row
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

            predicted_log_return = clamp(predict_return(model, features), -float(model["return_band"]), float(model["return_band"]))
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
                alpha=float(model["num_trees"]),
                beta=float(model["num_leaves"]),
            )
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
    return_band = estimate_target_band([log_returns_series[index] for index in sample_indices], upper=DEFAULT_RETURN_BAND)
    booster = train_lightgbm_booster(x_rows, y_values, feature_names_list, model_params)

    return {
        "booster": booster,
        "feature_names": feature_names_list,
        "num_trees": 0 if booster is None else booster.current_iteration(),
        "num_leaves": int(model_params["num_leaves"]),
        "return_band": return_band,
    }


def empty_model(names: list[str], params: dict[str, Any]) -> dict[str, object]:
    return {
        "booster": None,
        "feature_names": names,
        "num_trees": 0,
        "num_leaves": int(params["num_leaves"]),
        "return_band": DEFAULT_RETURN_BAND,
    }


def predict_return(model: dict[str, object], features: list[float]) -> float:
    return predict_with_booster(model.get("booster"), features)


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

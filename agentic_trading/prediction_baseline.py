from __future__ import annotations

import argparse
from pathlib import Path

from agentic_trading.prediction_features import OBSERVED_HISTORY, RECURSIVE_PATH
from agentic_trading.prediction_metrics import PREDICTION_OUTPUT_FIELDNAMES, build_prediction_output_row
from agentic_trading.pipeline_common import (
    load_json_config,
    read_csv_rows,
    require_columns,
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


def fit_trend_slope(train_prices: list[float]) -> float:
    if len(train_prices) < 2:
        return 0.0

    x_values = list(range(len(train_prices)))
    mean_x = sum(x_values) / len(x_values)
    mean_y = sum(train_prices) / len(train_prices)
    variance_x = sum((value - mean_x) ** 2 for value in x_values)

    if variance_x == 0:
        return 0.0

    covariance = sum((x - mean_x) * (y - mean_y) for x, y in zip(x_values, train_prices, strict=True))
    return covariance / variance_x


def generate_full_predictions(
    rows: list[dict[str, str]],
    split: int,
    train_end: int,
    evaluation_mode: str = OBSERVED_HISTORY,
) -> list[dict[str, object]]:
    prices = [to_number(row.get("price", "")) for row in rows]
    anchor_price = prices[train_end - 1] if train_end > 0 else 0.0
    slope = fit_trend_slope(prices[:train_end])
    if evaluation_mode not in {OBSERVED_HISTORY, RECURSIVE_PATH}:
        raise ValueError(f"Unsupported evaluation_mode {evaluation_mode!r}.")

    recursive_previous_price = anchor_price
    generated: list[dict[str, object]] = []

    for index, row in enumerate(rows):
        phase = "train" if index < train_end else "test"
        predicted_price = None
        actual_origin_price = None
        predicted_origin_price = None
        alpha = anchor_price
        beta = slope

        if phase == "test":
            if evaluation_mode == OBSERVED_HISTORY:
                actual_origin_price = prices[index - 1]
                predicted_price = actual_origin_price + slope
            else:
                actual_origin_price = prices[index - 1]
                predicted_origin_price = recursive_previous_price
                predicted_price = recursive_previous_price + slope
                recursive_previous_price = predicted_price

        generated.append(
            build_prediction_output_row(
                row=row,
                dataset_index=index,
                split=split,
                phase=phase,
                actual_price=prices[index],
                predicted_price=predicted_price,
                actual_origin_price=actual_origin_price,
                predicted_origin_price=predicted_origin_price,
                alpha=alpha,
                beta=beta,
            )
        )

    return generated
def run(config_path: str) -> None:
    config = load_json_config(config_path)
    require_config_keys(config, REQUIRED_CONFIG_KEYS, config_path)
    output_dir = Path(config["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)

    for input_file in resolve_input_files(config["input_csv"]):
        rows = read_csv_rows(input_file)
        if not rows:
            continue
        require_columns(rows, {"date", "commodity", "price"}, input_file)

        commodity = rows[0].get("commodity", input_file.stem)
        for split, train_end in walk_forward_boundaries(len(rows), int(config["n_splits"])):
            observed_predictions = generate_full_predictions(
                rows,
                split,
                train_end,
                evaluation_mode=OBSERVED_HISTORY,
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
                evaluation_mode=RECURSIVE_PATH,
            )
            write_csv_rows(
                output_dir / f"full_dataset_predictions_{commodity}_split_{split}_{RECURSIVE_PATH}.csv",
                recursive_predictions,
                PREDICTION_OUTPUT_FIELDNAMES,
            )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/predictions/ar1_baseline.json")
    args = parser.parse_args()
    run(args.config)


if __name__ == "__main__":
    main()

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

from agentic_trading.training.common import load_config, require_config_keys


REQUIRED_CONFIG_KEYS = {
    "input_csv",
    "output_dir",
    "n_splits",
}

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
        raise ValueError(f"No prediction input CSVs matched {input_csv!r}.")
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


def fit_ar1(train_prices: list[float]) -> tuple[float, float]:
    if len(train_prices) < 2:
        return 0.0, 1.0

    x_values = train_prices[:-1]
    y_values = train_prices[1:]
    mean_x = sum(x_values) / len(x_values)
    mean_y = sum(y_values) / len(y_values)
    variance_x = sum((value - mean_x) ** 2 for value in x_values)

    if variance_x == 0:
        return 0.0, 1.0

    covariance = sum((x - mean_x) * (y - mean_y) for x, y in zip(x_values, y_values, strict=True))
    beta = covariance / variance_x
    alpha = mean_y - beta * mean_x
    return alpha, beta


def generate_full_predictions(rows: list[dict[str, str]], split: int, train_end: int) -> list[dict[str, object]]:
    prices = [to_number(row.get("price", "")) for row in rows]
    base_alpha, base_beta = fit_ar1(prices[:train_end])
    generated: list[dict[str, object]] = []

    for index, row in enumerate(rows):
        phase = "train" if index < train_end else "test"
        predicted_price = None
        error = None
        absolute_error = None
        alpha = base_alpha
        beta = base_beta

        if phase == "test":
            alpha, beta = fit_ar1(prices[:index])
            predicted_price = alpha + beta * prices[index - 1]
            error = predicted_price - prices[index]
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
                "alpha": alpha,
                "beta": beta,
            }
        )

    return generated


def run(config_path: str) -> None:
    config = load_config(config_path)
    require_config_keys(config, REQUIRED_CONFIG_KEYS, config_path)
    output_dir = Path(config["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)

    for input_file in resolve_input_files(config["input_csv"]):
        rows = read_csv(input_file)
        if not rows:
            continue

        commodity = rows[0].get("commodity", input_file.stem)
        for split, train_end in walk_forward_boundaries(len(rows), int(config["n_splits"])):
            full_predictions = generate_full_predictions(rows, split, train_end)
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


def to_number(value: str) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/predictions/ar1_baseline.json")
    args = parser.parse_args()
    run(args.config)


if __name__ == "__main__":
    main()

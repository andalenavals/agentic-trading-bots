from __future__ import annotations

import argparse
import math
import random
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
    feature_start_index,
    log_returns,
    safe_log,
)
from agentic_trading.prediction_lightgbm_common import estimate_target_band
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

DEFAULT_CONFIG_NAME = "lstm_sentiment"
DEFAULT_SEQUENCE_LENGTH = 12
DEFAULT_HIDDEN_SIZE = 24
DEFAULT_NUM_LAYERS = 1
DEFAULT_DROPOUT = 0.0
DEFAULT_EPOCHS = 180
DEFAULT_LEARNING_RATE = 0.01
DEFAULT_WEIGHT_DECAY = 0.0001
DEFAULT_BATCH_SIZE = 16
DEFAULT_SEED = 7
DEFAULT_BAND_WINDOW = 20
DEFAULT_CENTER_BLEND = 0.0


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
    sequence_start = feature_start + int(params["sequence_length"]) - 1
    train_sample_end = max(sequence_start, train_end)
    model = fit_lstm_model(
        rows,
        actual_log_prices,
        actual_log_returns,
        sequence_start,
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

        if phase == "test" and index >= sequence_start:
            if evaluation_mode == OBSERVED_HISTORY:
                actual_origin_price = actual_prices[index - 1]
                features = build_sequence_features(
                    rows,
                    actual_log_prices,
                    actual_log_returns,
                    index,
                    int(model["sequence_length"]),
                    lags,
                    windows,
                    include_sentiment_features,
                )
                previous_log_price = actual_log_prices[index - 1]
            else:
                actual_origin_price = actual_prices[index - 1]
                predicted_origin_price = math.exp(predicted_log_prices[index - 1])
                features = build_sequence_features(
                    rows,
                    predicted_log_prices,
                    predicted_log_returns,
                    index,
                    int(model["sequence_length"]),
                    lags,
                    windows,
                    include_sentiment_features,
                )
                previous_log_price = predicted_log_prices[index - 1]

            raw_predicted_log_return = clamp(
                predict_return(model, features),
                -float(model["return_band"]),
                float(model["return_band"]),
            )
            raw_next_log_price = previous_log_price + raw_predicted_log_return
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
                alpha=float(model["epochs"]),
                beta=float(model["hidden_size"]),
            )
        )

    return generated


def fit_lstm_model(
    rows: list[dict[str, str]],
    log_prices: list[float],
    log_returns_series: list[float],
    sequence_start: int,
    train_end: int,
    lags: list[int],
    windows: list[int],
    include_sentiment_features: bool,
    model_params: dict[str, Any],
) -> dict[str, object]:
    sample_indices = [index for index in range(sequence_start, train_end) if index < len(rows)]
    if not sample_indices:
        return empty_model(model_params)

    sequences = [
        build_sequence_features(
            rows,
            log_prices,
            log_returns_series,
            index,
            int(model_params["sequence_length"]),
            lags,
            windows,
            include_sentiment_features,
        )
        for index in sample_indices
    ]
    targets = [log_returns_series[index] for index in sample_indices]

    feature_means, feature_scales = fit_sequence_standardization(sequences)
    target_mean, target_scale = fit_target_standardization(targets)
    standardized_sequences = [
        standardize_sequence(sequence, feature_means, feature_scales)
        for sequence in sequences
    ]
    standardized_targets = [(target - target_mean) / target_scale for target in targets]
    module = train_lstm_module(standardized_sequences, standardized_targets, model_params)

    return {
        "module": module,
        "feature_means": feature_means,
        "feature_scales": feature_scales,
        "target_mean": target_mean,
        "target_scale": target_scale,
        "return_band": estimate_target_band(targets),
        "band_window": max(max(windows, default=DEFAULT_BAND_WINDOW), DEFAULT_BAND_WINDOW),
        "center_blend": float(model_params["center_blend"]),
        "level_band": estimate_level_band(log_prices, sample_indices),
        "sequence_length": int(model_params["sequence_length"]),
        "epochs": int(model_params["epochs"]),
        "hidden_size": int(model_params["hidden_size"]),
    }


def build_sequence_features(
    rows: list[dict[str, str]],
    log_prices: list[float],
    log_returns_series: list[float],
    index: int,
    sequence_length: int,
    lags: list[int],
    windows: list[int],
    include_sentiment_features: bool,
) -> list[list[float]]:
    start = index - sequence_length + 1
    return [
        build_feature_vector(
            rows,
            log_prices,
            log_returns_series,
            step,
            lags,
            windows,
            include_sentiment_features,
        )
        for step in range(start, index + 1)
    ]


def fit_sequence_standardization(
    sequences: list[list[list[float]]],
) -> tuple[list[float], list[float]]:
    width = len(sequences[0][0]) if sequences else 0
    means: list[float] = []
    scales: list[float] = []
    for column in range(width):
        values = [
            timestep[column]
            for sequence in sequences
            for timestep in sequence
        ]
        mean = sum(values) / len(values)
        variance = sum((value - mean) ** 2 for value in values) / len(values)
        scale = math.sqrt(variance) if variance > 1e-12 else 1.0
        means.append(mean)
        scales.append(scale)
    return means, scales


def fit_target_standardization(targets: list[float]) -> tuple[float, float]:
    mean = sum(targets) / len(targets)
    variance = sum((value - mean) ** 2 for value in targets) / len(targets)
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


def standardize_sequence(
    sequence: list[list[float]],
    means: list[float],
    scales: list[float],
) -> list[list[float]]:
    return [
        [
            (value - mean) / scale
            for value, mean, scale in zip(timestep, means, scales, strict=True)
        ]
        for timestep in sequence
    ]


def train_lstm_module(
    sequences: list[list[list[float]]],
    targets: list[float],
    model_params: dict[str, Any],
):
    if not sequences:
        return None

    torch = import_torch()
    numpy = import_numpy()
    set_random_seed(torch, int(model_params["seed"]))

    feature_width = len(sequences[0][0])
    module = LSTMForecaster(
        input_size=feature_width,
        hidden_size=int(model_params["hidden_size"]),
        num_layers=int(model_params["num_layers"]),
        dropout=float(model_params["dropout"]),
        torch_module=torch.nn,
    )
    module.train()
    optimizer = torch.optim.Adam(
        module.parameters(),
        lr=float(model_params["learning_rate"]),
        weight_decay=float(model_params["weight_decay"]),
    )
    loss_fn = torch.nn.MSELoss()

    x_tensor = torch.tensor(numpy.asarray(sequences, dtype="float32"))
    y_tensor = torch.tensor(numpy.asarray(targets, dtype="float32")).view(-1, 1)
    batch_size = max(1, min(int(model_params["batch_size"]), len(sequences)))

    for _ in range(int(model_params["epochs"])):
        permutation = torch.randperm(len(sequences))
        for start in range(0, len(sequences), batch_size):
            batch_indices = permutation[start:start + batch_size]
            batch_x = x_tensor[batch_indices]
            batch_y = y_tensor[batch_indices]

            optimizer.zero_grad()
            predicted = module(batch_x)
            loss = loss_fn(predicted, batch_y)
            loss.backward()
            optimizer.step()

    module.eval()
    return module


def predict_return(model: dict[str, object], sequence: list[list[float]]) -> float:
    module = model.get("module")
    if module is None:
        return 0.0

    torch = import_torch()
    numpy = import_numpy()
    standardized = standardize_sequence(
        sequence,
        list(model["feature_means"]),
        list(model["feature_scales"]),
    )
    features = torch.tensor(numpy.asarray([standardized], dtype="float32"))
    with torch.no_grad():
        standardized_prediction = float(module(features).item())
    return standardized_prediction * float(model["target_scale"]) + float(model["target_mean"])


def build_model_params(config: dict[str, Any] | None) -> dict[str, Any]:
    config = config or {}
    return {
        "sequence_length": int(config.get("sequence_length", DEFAULT_SEQUENCE_LENGTH)),
        "hidden_size": int(config.get("hidden_size", DEFAULT_HIDDEN_SIZE)),
        "num_layers": int(config.get("num_layers", DEFAULT_NUM_LAYERS)),
        "dropout": float(config.get("dropout", DEFAULT_DROPOUT)),
        "epochs": int(config.get("epochs", DEFAULT_EPOCHS)),
        "learning_rate": float(config.get("learning_rate", DEFAULT_LEARNING_RATE)),
        "weight_decay": float(config.get("weight_decay", DEFAULT_WEIGHT_DECAY)),
        "batch_size": int(config.get("batch_size", DEFAULT_BATCH_SIZE)),
        "center_blend": float(config.get("center_blend", DEFAULT_CENTER_BLEND)),
        "seed": int(config.get("seed", DEFAULT_SEED)),
    }


def empty_model(model_params: dict[str, Any]) -> dict[str, object]:
    return {
        "module": None,
        "feature_means": [],
        "feature_scales": [],
        "target_mean": 0.0,
        "target_scale": 1.0,
        "return_band": 0.12,
        "band_window": DEFAULT_BAND_WINDOW,
        "center_blend": float(model_params["center_blend"]),
        "level_band": 0.12,
        "sequence_length": int(model_params["sequence_length"]),
        "epochs": int(model_params["epochs"]),
        "hidden_size": int(model_params["hidden_size"]),
    }


def set_random_seed(torch, seed: int) -> None:
    random.seed(seed)
    torch.manual_seed(seed)
    if hasattr(torch, "cuda") and torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


class LSTMForecaster:
    def __init__(
        self,
        *,
        input_size: int,
        hidden_size: int,
        num_layers: int,
        dropout: float,
        torch_module,
    ) -> None:
        effective_dropout = dropout if num_layers > 1 else 0.0
        self._model = torch_module.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=effective_dropout,
        )
        self._head = torch_module.Linear(hidden_size, 1)

    def parameters(self):
        return list(self._model.parameters()) + list(self._head.parameters())

    def train(self) -> None:
        self._model.train()
        self._head.train()

    def eval(self) -> None:
        self._model.eval()
        self._head.eval()

    def __call__(self, inputs):
        outputs, _ = self._model(inputs)
        return self._head(outputs[:, -1, :])


def import_numpy():
    try:
        import numpy  # type: ignore[import-not-found]
    except ModuleNotFoundError as error:
        raise ModuleNotFoundError(
            "numpy is required for LSTM forecasts. Install it with `.venv/bin/python -m pip install numpy`."
        ) from error
    return numpy


def import_torch():
    try:
        import torch  # type: ignore[import-not-found]
    except ModuleNotFoundError as error:
        raise ModuleNotFoundError(
            "torch is required for LSTM forecasts. Install it with `.venv/bin/python -m pip install torch`."
        ) from error
    return torch


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

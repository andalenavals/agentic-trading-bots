from __future__ import annotations


PREDICTION_OUTPUT_FIELDNAMES = [
    "date",
    "commodity",
    "dataset_index",
    "split",
    "phase",
    "price",
    "predicted_price",
    "error",
    "absolute_error",
    "predicted_direction",
    "actual_direction",
    "direction_correct",
    "alpha",
    "beta",
]


def direction_label(delta: float, *, tolerance: float = 1e-9) -> str:
    if delta > tolerance:
        return "up"
    if delta < -tolerance:
        return "down"
    return "flat"


def build_prediction_output_row(
    *,
    row: dict[str, str],
    dataset_index: int,
    split: int,
    phase: str,
    actual_price: float,
    predicted_price: float | None,
    actual_origin_price: float | None,
    predicted_origin_price: float | None,
    alpha: float,
    beta: float,
) -> dict[str, object]:
    error = None if predicted_price is None else predicted_price - actual_price
    absolute_error = None if error is None else abs(error)
    predicted_direction = ""
    actual_direction = ""
    direction_correct: int | str = ""

    if predicted_price is not None and actual_origin_price is not None:
        predicted_base_price = actual_origin_price if predicted_origin_price is None else predicted_origin_price
        predicted_direction = direction_label(predicted_price - predicted_base_price)
        actual_direction = direction_label(actual_price - actual_origin_price)
        direction_correct = int(predicted_direction == actual_direction)

    return {
        "date": row.get("date", ""),
        "commodity": row.get("commodity", ""),
        "dataset_index": dataset_index,
        "split": split,
        "phase": phase,
        "price": row.get("price", ""),
        "predicted_price": "" if predicted_price is None else predicted_price,
        "error": "" if error is None else error,
        "absolute_error": "" if absolute_error is None else absolute_error,
        "predicted_direction": predicted_direction,
        "actual_direction": actual_direction,
        "direction_correct": direction_correct,
        "alpha": alpha,
        "beta": beta,
    }

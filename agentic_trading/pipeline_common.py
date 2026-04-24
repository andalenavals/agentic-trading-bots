from __future__ import annotations

import csv
import json
import sys
from pathlib import Path
from typing import Any, Iterable, Iterator


csv.field_size_limit(sys.maxsize)


def load_json_config(path: str | Path) -> dict[str, Any]:
    with Path(path).open(encoding="utf-8") as handle:
        return json.load(handle)


def require_config_keys(config: dict[str, Any], required: set[str], source: str | Path) -> None:
    missing = sorted(required - set(config))
    if missing:
        raise ValueError(f"{source} is missing required config keys: {missing}")


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def require_columns(rows: list[dict[str, str]], columns: set[str], source: Path | str) -> None:
    if not rows:
        raise ValueError(f"{source} is empty.")

    missing = columns - set(rows[0].keys())
    if missing:
        raise ValueError(f"{source} is missing required columns: {sorted(missing)}")


def write_csv_rows(path: Path, rows: Iterable[dict[str, object]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def resolve_input_files(input_csv: str) -> list[Path]:
    path = Path(input_csv)
    if any(character in input_csv for character in "*?[]"):
        files = sorted(path.parent.glob(path.name))
    elif path.is_dir():
        files = sorted(path.glob("*.csv"))
    else:
        files = [path]

    if not files:
        raise ValueError(f"No input CSVs matched {input_csv!r}.")
    return files


def walk_forward_boundaries(length: int, n_splits: int) -> Iterator[tuple[int, int]]:
    if n_splits < 1:
        raise ValueError("n_splits must be at least 1.")

    split_size = length // (n_splits + 1)
    if split_size <= 1:
        raise ValueError("Not enough rows for the requested walk-forward split count.")

    for index in range(n_splits):
        train_end = split_size * (index + 1)
        yield index + 1, train_end


def to_number(value: str | float | int | None) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0

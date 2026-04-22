from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ACTION_NAMES = {0: "hold", 1: "buy", 2: "sell"}


def load_config(path: str | Path) -> dict[str, Any]:
    with Path(path).open(encoding="utf-8") as handle:
        return json.load(handle)


def require_config_keys(config: dict[str, Any], required: set[str], source: str | Path) -> None:
    missing = sorted(required - set(config))
    if missing:
        raise ValueError(f"{source} is missing required config keys: {missing}")


def action_name(action: int) -> str:
    return ACTION_NAMES[int(action)]

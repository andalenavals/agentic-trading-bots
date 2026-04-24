from __future__ import annotations

from pathlib import Path
from typing import Any

from agentic_trading.pipeline_common import load_json_config, require_config_keys


ACTION_NAMES = {0: "hold", 1: "buy", 2: "sell"}


def load_config(path: str | Path) -> dict[str, Any]:
    return load_json_config(path)


def action_name(action: int) -> str:
    return ACTION_NAMES[int(action)]

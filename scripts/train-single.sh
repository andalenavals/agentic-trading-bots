#!/bin/sh
set -eu

if [ -x ".venv/bin/python" ]; then
  PYTHON_BIN=".venv/bin/python"
else
  PYTHON_BIN="python3"
fi

exec "$PYTHON_BIN" -m agentic_trading.training.single_asset_ppo --config configs/agents/single_asset_ppo.json

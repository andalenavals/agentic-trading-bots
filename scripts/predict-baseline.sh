#!/bin/sh
set -eu

CONFIG_PATH="${PREDICTION_CONFIG:-configs/predictions/ar1_baseline.json}"

if [ -x ".venv/bin/python" ]; then
  PYTHON_BIN=".venv/bin/python"
else
  PYTHON_BIN="python3"
fi

exec "$PYTHON_BIN" -m agentic_trading.prediction_baseline --config "$CONFIG_PATH"

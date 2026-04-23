#!/bin/sh
set -eu

CONFIG_PATH="${PREPROCESS_CONFIG:-configs/preprocessing/default.json}"

if [ -x ".venv/bin/python" ]; then
  PYTHON_BIN=".venv/bin/python"
else
  PYTHON_BIN="python3"
fi

exec "$PYTHON_BIN" -m agentic_trading.preprocessing --config "$CONFIG_PATH" "${1:-all}"

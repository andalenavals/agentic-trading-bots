#!/bin/sh
set -eu

if [ -x ".venv/bin/python" ]; then
  PYTHON_BIN=".venv/bin/python"
else
  PYTHON_BIN="python3"
fi

if [ -n "${PREDICTION_CONFIG:-}" ]; then
  exec "$PYTHON_BIN" -m agentic_trading.prediction_gaussian_process --config "$PREDICTION_CONFIG"
fi

"$PYTHON_BIN" -m agentic_trading.prediction_gaussian_process --config "configs/predictions/gaussian_process_sentiment.json"
exec "$PYTHON_BIN" -m agentic_trading.prediction_gaussian_process --config "configs/predictions/gaussian_process_price_only.json"

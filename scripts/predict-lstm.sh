#!/bin/sh
set -eu

if [ -x ".venv/bin/python" ]; then
  PYTHON_BIN=".venv/bin/python"
else
  PYTHON_BIN="python3"
fi

if [ -n "${PREDICTION_CONFIG:-}" ]; then
  exec "$PYTHON_BIN" -m agentic_trading.prediction_lstm --config "$PREDICTION_CONFIG"
fi

"$PYTHON_BIN" -m agentic_trading.prediction_lstm --config "configs/predictions/lstm_sentiment.json"
exec "$PYTHON_BIN" -m agentic_trading.prediction_lstm --config "configs/predictions/lstm_price_only.json"

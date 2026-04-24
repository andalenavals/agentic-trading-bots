# Agentic Trading Bots

[![Deploy GitHub Pages](https://github.com/andalenavals/agentic-trading-bots/actions/workflows/deploy.yml/badge.svg)](https://github.com/andalenavals/agentic-trading-bots/actions/workflows/deploy.yml)

[Demo](https://andalenavals.github.io/agentic-trading-bots/) · [Sphinx docs](https://andalenavals.github.io/agentic-trading-bots/docs/)

Agentic Trading Bots is a local-first commodity intelligence dashboard built around three inputs:

1. LME price history
2. curated commodity news
3. generated model outputs for PPO agents and price forecasts

The deployed demo exposes four synchronized chart panels:

* `News Chart`
* `Sentiment Chart`
* `Decision Chart`
* `Predictions Chart`

## What the repo does

The codebase is split into three practical layers:

* `agentic_trading/`: Python preprocessing, sentiment scoring, forecasting, and PPO training
* `src/`: Next.js dashboard, typed loaders, and chart interaction code
* `docs/`: Sphinx documentation built and deployed together with the static app

The preprocessing pipeline turns `data/raw/prices.csv` and `data/raw/news.csv` into:

* normalized news events
* joined price/news rows
* simple sentiment features
* FinBERT event scores and aggregated row-level FinBERT signals
* per-commodity training files for the single-asset PPO modules

The dashboard then reads those derived files plus committed prediction and PPO output snapshots.

## Repository shape

```text
agentic-trading-bots/
├── agentic_trading/
│   ├── pipeline_common.py       # Shared config/CSV/split helpers
│   ├── preprocessing.py         # Raw-to-derived data pipeline
│   ├── finbert_sentiment.py     # FinBERT event scoring + cache helpers
│   ├── prediction_features.py   # Shared lag/sentiment feature builder
│   ├── prediction_baseline.py   # Baseline forecast generator
│   ├── prediction_ridge_arx.py  # Ridge ARX forecast generator
│   ├── prediction_lightgbm.py   # LightGBM forecast generator
│   ├── prediction_lightgbm_direct.py # Direct multi-horizon LightGBM generator
│   ├── prediction_lstm.py       # LSTM forecast generator
│   └── training/                # PPO training modules
├── configs/
│   ├── preprocessing/
│   ├── predictions/
│   └── agents/
├── data/
│   ├── raw/                     # Required checked-in source data
│   ├── processed/               # Generated rows, plus committed FinBERT cache
│   ├── prediction_outputs/      # Committed forecast snapshots for the demo
│   └── agent_outputs/           # Committed PPO output snapshots for the demo
├── docs/                        # Sphinx source
├── scripts/                     # Thin CLI wrappers
├── src/                         # Next.js app, loaders, analytics, UI
└── tests/                       # Python pipeline tests
```

## Quickstart

Use Node 20 and Python 3.11 or newer.

```bash
npm install
python3 -m pip install ".[agents,sentiment]"
npm run preprocess
npm run dev
```

Then open:

```text
http://127.0.0.1:3000
```

## Core commands

Preprocessing:

```bash
npm run preprocess
```

PPO training:

```bash
npm run train:single
npm run train:multi
```

Forecast generation:

```bash
npm run predict:baseline
npm run predict:ridge
npm run predict:lightgbm
npm run predict:lightgbm:direct
npm run predict:lstm
```

Checks:

```bash
npm test
GITHUB_PAGES=true npm run build
npm run docs:install
npm run docs:build
```

## Data policy

The required source data is:

```text
data/raw/prices.csv
data/raw/news.csv
```

Some generated artifacts are intentionally committed because the public demo depends on them:

* `data/processed/finbert_event_sentiment.csv`
* `data/agent_outputs/**`
* `data/prediction_outputs/**`

Other derived files are regenerated locally or in CI.

## Current forecasting setup

The predictions layer currently includes:

* baseline trend forecast
* Ridge ARX with price-only features
* Ridge ARX with price + sentiment features
* LightGBM with price-only features
* LightGBM with price + sentiment features
* Direct multi-horizon LightGBM with price-only features
* Direct multi-horizon LightGBM with price + sentiment features
* LSTM with price-only features
* LSTM with price + sentiment features

Ridge ARX and one-step LightGBM support two evaluation modes in the app:

* `Observed history`
* `Recursive path`

Direct multi-horizon LightGBM appears as its own evaluation family:

* `Direct multi-horizon`

## Notes for contributors

A few repo conventions matter:

* keep preprocessing, forecasting, and training modules config-driven
* avoid embedding file-system assumptions in React components
* keep the dashboard focused on loading and visualization, not model generation
* update `docs/` when commands, file conventions, or panel behavior change

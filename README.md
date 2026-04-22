# Agentic Trading Bots

[![Deploy GitHub Pages](https://github.com/andalenavals/agentic-trading-bots/actions/workflows/deploy.yml/badge.svg)](https://github.com/andalenavals/agentic-trading-bots/actions/workflows/deploy.yml)

[Demo](https://andalenavals.github.io/agentic-trading-bots/) · [Sphinx docs](https://andalenavals.github.io/agentic-trading-bots/docs/)

Modular commodity decision-support dashboard built around LME price data, curated commodity news, FinBERT sentiment, and PPO trading bot outputs.

The GitHub Pages deployment publishes two pages from the same workflow:

- interactive demo: `https://andalenavals.github.io/agentic-trading-bots/`
- Sphinx docs: `https://andalenavals.github.io/agentic-trading-bots/docs/`

The MVP is intentionally local-first. It reads curated CSV files from `data/`, computes typed price/news/sentiment signals in `src/lib/`, and renders a Next.js dashboard with reusable chart components.

## What it does

- Shows LME copper, nickel, and aluminium price history
- Links each commodity to curated news summaries and FinBERT sentiment scores
- Compares commodities using normalized relative-performance charts
- Displays recent market events with source and commodity tags
- Includes single-asset and multi-asset PPO training scripts under `agents/`
- Adds a trading bots gym layer that overlays hold/buy/sell decisions on the price series with opacity for uncertainty

## Project Structure

```text
agentic-trading-bots/
├── data/
│   ├── raw/                 # Original commodity price/news snapshots
│   ├── processed/           # Sentiment-enriched price rows
│   └── agent_outputs/       # PPO evaluation samples for future policy views
├── agents/
│   ├── single_asset/         # Individual-commodity PPO trainer and plotting scripts
│   └── multiple_asset/       # Shared multi-asset PPO trainer and plotting scripts
├── docs/
│   ├── architecture.md
│   └── data.md
├── src/
│   ├── app/                 # Next app entrypoints
│   ├── components/dashboard/ # UI panels and charts
│   └── lib/
│       ├── analytics/       # Signal, commodity, and news helpers
│       └── data/            # CSV parser and local data loaders
└── tests/                   # Placeholder for parser/analytics tests
```

## Quickstart

```bash
npm install
npm run dev
```

Then open:

```text
http://127.0.0.1:3000
```

## Data Refresh

The current data snapshot contains:

```text
data/raw/prices.csv
data/raw/news.csv
data/processed/prices_with_sentiment.csv
data/agent_outputs/single_asset_ppo/*.csv
data/agent_outputs/multiple_asset_ppo/*.csv
```

For now, refresh by copying those files into the matching `data/` folders. A scripted sync can be added once the MVP stabilizes.

## Design Notes

This repo deliberately keeps the first useful slice compact:

1. local CSV data
2. typed domain objects
3. deterministic analytics helpers
4. visual dashboard components
5. saved PPO decision outputs for the trading bots gym layer

That keeps the MVP easy to test and lets future layers, such as a policy simulator or forecasting service, be added without rewriting the dashboard.

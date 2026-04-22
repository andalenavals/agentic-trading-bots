# Agentic Trading Bots

Modular commodity decision-support dashboard built from three existing local projects:

- **Data source:** `CreareCorpAndres`
- **Visual inspiration:** `CreareCorp`
- **Project organization:** `chatbot_performance_evaluator`

The MVP is intentionally local-first. It reads curated CSV files from `data/`, computes typed price/news/sentiment signals in `src/lib/`, and renders a Next.js dashboard with reusable chart components.

## What it does

- Shows LME copper, nickel, and aluminium price history
- Links each commodity to curated news summaries and FinBERT sentiment scores
- Compares commodities using normalized relative-performance charts
- Displays recent market events with source and commodity tags
- Includes single-asset and multi-asset PPO training scripts under `agents/`
- Adds a PPO training-gym layer that visualizes hold/buy/sell decisions with opacity for uncertainty

## Project Structure

```text
agentic-trading-bots/
├── data/
│   ├── raw/                 # Original prices/news copied from CreareCorpAndres
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

The current data snapshot was copied from:

```text
/Users/andres/git_repos/CreareCorpAndres/original_data/prices.csv
/Users/andres/git_repos/CreareCorpAndres/original_data/news.csv
/Users/andres/git_repos/CreareCorpAndres/data_preprocessing/prices_with_sentiment.csv
/Users/andres/git_repos/CreareCorpAndres/single_asset_agent_ppo/*.csv
/Users/andres/git_repos/CreareCorpAndres/multiple_asset_agent/*.csv
```

For now, refresh by copying those files into the matching `data/` folders. A scripted sync can be added once the MVP stabilizes.

## Design Notes

This repo deliberately avoids copying the older Supabase and forecast API coupling from `CreareCorp`. The first useful slice is:

1. local CSV data
2. typed domain objects
3. deterministic analytics helpers
4. visual dashboard components
5. saved PPO decision outputs for the training-gym layer

That keeps the MVP easy to test and lets future layers, such as a policy simulator or forecasting service, be added without rewriting the dashboard.

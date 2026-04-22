# Data

## Current Files

| Path | Source | Purpose |
| --- | --- | --- |
| `data/raw/prices.csv` | `CreareCorpAndres/original_data/prices.csv` | Base LME price rows |
| `data/raw/news.csv` | `CreareCorpAndres/original_data/news.csv` | Curated news events |
| `data/processed/prices_with_sentiment.csv` | `CreareCorpAndres/data_preprocessing/prices_with_sentiment.csv` | Joined price, summary, and FinBERT sentiment rows |
| `data/agent_outputs/single_asset_ppo/*.csv` | `CreareCorpAndres/single_asset_agent_ppo/` | Single-asset PPO test and full-dataset decisions |
| `data/agent_outputs/multiple_asset_ppo/*.csv` | `CreareCorpAndres/multiple_asset_agent/` | Multi-asset PPO test and full-dataset decisions |

## Primary Dashboard Schema

`prices_with_sentiment.csv` is the dashboard's main fact table:

```text
date,commodity,price,news_summary,negative,neutral,positive,sentiment_score
```

The loader maps commodities into canonical slugs:

- `copper_lme`
- `nickel_lme`
- `aluminium_lme`

## Refresh Rule

Keep raw data snapshots in `data/`. Keep transformation logic in `src/lib/data` and `src/lib/analytics`. Avoid embedding data assumptions directly inside React components.

## Agent Output Schema

The dashboard normalizes single-asset and multi-asset PPO outputs into one UI shape:

```text
date, commodity, action, prob_hold, prob_buy, prob_sell, entropy, net_worth, reward
```

For the training-gym layer, opacity is derived from decision confidence:

```text
confidence = max(prob_hold, prob_buy, prob_sell)
```

Lower opacity means the agent was more uncertain.

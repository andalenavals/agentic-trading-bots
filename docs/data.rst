Data
====

Current Files
-------------

.. list-table::
   :header-rows: 1

   * - Path
     - Source
     - Purpose
   * - ``data/raw/prices.csv``
     - Commodity snapshot
     - Base LME price rows
   * - ``data/raw/news.csv``
     - Commodity snapshot
     - Curated news events
   * - ``data/processed/prices_with_sentiment.csv``
     - Enriched commodity snapshot
     - Joined price, summary, and FinBERT sentiment rows
   * - ``data/agent_outputs/single_asset_ppo/*.csv``
     - PPO output snapshot
     - Single-asset PPO test and full-dataset decisions
   * - ``data/agent_outputs/multiple_asset_ppo/*.csv``
     - PPO output snapshot
     - Multi-asset PPO test and full-dataset decisions

Primary Dashboard Schema
------------------------

``prices_with_sentiment.csv`` is the dashboard's main fact table:

.. code-block:: text

   date,commodity,price,news_summary,negative,neutral,positive,sentiment_score

The loader maps commodities into canonical slugs:

* ``copper_lme``
* ``nickel_lme``
* ``aluminium_lme``

Agent Output Schema
-------------------

The dashboard normalizes single-asset and multi-asset PPO outputs into one UI shape:

.. code-block:: text

   date, commodity, action, prob_hold, prob_buy, prob_sell, entropy, net_worth, reward

For the trading bots gym layer, opacity is derived from decision confidence:

.. code-block:: text

   confidence = max(prob_hold, prob_buy, prob_sell)

Lower opacity means the agent was more uncertain.

Refresh Rule
------------

Keep raw data snapshots in ``data/``. Keep transformation logic in ``src/lib/data`` and ``src/lib/analytics``. Avoid embedding data assumptions directly inside React components.


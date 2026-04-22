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
   * - ``data/processed/*.csv``
     - Generated
     - Joined price, news, and sentiment rows
   * - ``data/training/commodity_outputs/*.csv``
     - Generated
     - Per-commodity training data for single-asset bots
   * - ``data/agent_outputs/**/*.csv``
     - Generated
     - PPO evaluation outputs used by the trading bots gym

Only ``data/raw/prices.csv`` and ``data/raw/news.csv`` are required checked-in data. The other paths are generated and ignored by Git.

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

The agent-output loader discovers files rather than relying on a fixed split count. Supported filename patterns are:

.. code-block:: text

   data/agent_outputs/single_asset_ppo/evaluation_split_<n>.csv
   data/agent_outputs/single_asset_ppo/full_dataset_predictions_split_<n>.csv
   data/agent_outputs/multiple_asset_ppo/evaluation_split_<n>_multi_asset_<mode>.csv
   data/agent_outputs/multiple_asset_ppo/evaluation_full_dataset_split_<n>_multi_asset_<mode>.csv

Refresh Rule
------------

Keep raw data snapshots in ``data/raw/``. Generate processed visualization data and bot training data with:

.. code-block:: bash

   npm run preprocess

Keep transformation logic in ``agentic_trading/preprocessing.py``, ``src/lib/data``, and ``src/lib/analytics``. Avoid embedding data assumptions directly inside React components.

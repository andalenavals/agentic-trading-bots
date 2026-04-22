Agentic Trading Bots
====================

Agentic Trading Bots is a commodity decision-support project that combines LME price data, curated commodity news, FinBERT sentiment, and saved PPO trading-bot decisions.

The deployed project has two public pages:

* `Interactive demo <../>`_
* `Sphinx documentation <./>`_

What the Demo Shows
-------------------

The demo has two layers:

* **Market + news**: price charts, sentiment summaries, relative commodity performance, and market events.
* **Trading bots gym**: price time series with trained PPO buy, hold, and sell decisions overlaid.

Repository Shape
----------------

.. code-block:: text

   agentic-trading-bots/
   ├── agents/              # PPO training and plotting scripts
   ├── data/                # Raw CSV snapshots plus ignored generated artifacts
   ├── docs/                # Sphinx documentation source
   ├── src/                 # Next.js app, components, loaders, analytics
   └── tests/               # Test placeholders

Contents
--------

.. toctree::
   :maxdepth: 2

   overview
   architecture
   data
   agents
   modularity_review
   deployment

Agentic Trading Bots
====================

Agentic Trading Bots is a commodity decision-support project that combines LME price data, curated commodity news, generated sentiment features, and saved PPO trading-bot decisions.

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
   ├── agentic_trading/     # Python preprocessing and config-driven PPO training
   ├── agents/              # Agent environment and usage notes
   ├── configs/             # Preprocessing and training configs
   ├── data/                # Raw CSV snapshots plus ignored generated artifacts
   ├── docs/                # Sphinx documentation source
   ├── pyproject.toml       # Optional Python package metadata
   ├── src/                 # Next.js app, components, loaders, analytics
   └── tests/               # Python preprocessing tests

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

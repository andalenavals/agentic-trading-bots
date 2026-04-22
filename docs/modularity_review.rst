Modularity Review
=================

Review Findings
---------------

The project previously mixed three concerns:

* checked-in raw data and checked-in generated data
* copied PPO scripts with hardcoded paths
* plotting scripts living beside training logic

That made the MVP work, but it also meant the repository could drift from its source data and training pipeline.

Refactor Decisions
------------------

Raw Data Boundary
~~~~~~~~~~~~~~~~~

Only ``data/raw/prices.csv`` and ``data/raw/news.csv`` are required source data.

Generated artifacts are ignored:

* ``data/processed/``
* ``data/training/``
* ``data/agent_outputs/``

Preprocessing Boundary
~~~~~~~~~~~~~~~~~~~~~~

``agentic_trading/preprocessing.py`` now has two responsibilities:

* generate visualization-friendly data by joining prices, news summaries, and sentiment fields
* organize bot-training data by commodity

The pipeline is configured by ``configs/preprocessing/default.json``.

Agent Boundary
~~~~~~~~~~~~~~

Agent behavior is configured under ``configs/agents/``. Training modules read configs instead of embedding direct data paths.

The single-asset and multi-asset PPO modules both emit the action, probability, entropy, position, reward, and net-worth fields that the dashboard expects. Feature scalers are fit on each training window and then applied to that split's test and full-dataset diagnostic outputs.

Plotting code was removed from the agent layer. Visualization belongs in the Next.js dashboard or separate analysis notebooks/scripts, not in the training modules.

App Boundary
~~~~~~~~~~~~

The Next.js app reads derived files. It does not generate them. The build command runs preprocessing first so deployment is reproducible from raw CSVs.

Agent-output discovery is file-pattern based rather than hardcoded to three splits. This keeps config changes in the training layer from forcing app-loader changes.

Documentation Boundary
~~~~~~~~~~~~~~~~~~~~~~

Sphinx documentation uses the Read the Docs theme and is built into ``out/docs`` by the same GitHub Pages workflow that builds the static demo.

Cleanup Policy
~~~~~~~~~~~~~~

Generated folders such as ``data/processed/``, ``data/training/``, ``data/agent_outputs/``, ``out/``, and ``.next/`` stay ignored. Local cache files such as ``.DS_Store``, ``__pycache__/``, and ``*.tsbuildinfo`` should not be committed.

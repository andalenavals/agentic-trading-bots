Architecture
============

The repository is organized around one simple rule: generation logic stays in Python, while the Next.js app only loads and visualizes derived files.

Layers
------

Python pipeline
~~~~~~~~~~~~~~~

``agentic_trading/`` contains generation code:

* ``pipeline_common.py``: shared config, CSV, and split helpers
* ``preprocessing.py``: raw prices/news to derived dashboard and training data
* ``finbert_sentiment.py``: FinBERT scoring and cache helpers
* ``prediction_baseline.py`` and ``prediction_ridge_arx.py``: forecast generators
* ``training/``: PPO training modules

This is the main refactor boundary for reproducibility. Forecasting and training modules should not own UI logic, plotting logic, or browser-only assumptions.

App-side loading
~~~~~~~~~~~~~~~~

``src/lib/data/`` owns local file loading and normalization for the dashboard. The React components consume typed data objects rather than reading CSV files directly.

The main loaders are:

* ``loaders.ts``
* ``agent-loaders.ts``
* ``prediction-loaders.ts``

Analytics helpers
~~~~~~~~~~~~~~~~~

``src/lib/analytics/`` contains deterministic helpers for:

* commodity normalization and metadata
* chart viewport math
* signal summaries
* news source labels

UI
~~

``src/components/dashboard/`` contains reusable chart and control components. The dashboard owns interaction state such as:

* selected commodity
* shared viewport range
* marker and line styling
* panel open/closed state

The UI should stay thin: it reads generated files and renders them.

Current modularity improvements
-------------------------------

The main cleanup applied in this review was:

* shared Python pipeline utilities moved into ``agentic_trading/pipeline_common.py``
* preprocessing config coercion moved into a typed ``PreprocessingConfig``
* duplicate prediction config removed
* multi-asset loader stopped hardcoding a fixed commodity list and now discovers commodity price columns from the output schema
* docs were rewritten to match the current four-chart dashboard

Non-goals
---------

Still intentionally out of scope:

* in-browser retraining
* a backend API service
* database-backed persistence
* notebook-style plotting embedded in training code

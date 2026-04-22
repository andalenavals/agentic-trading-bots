Architecture
============

The project follows a small modular structure so that data loading, analytics, UI, and PPO code can evolve independently.

Layers
------

Data
~~~~

``agentic_trading/preprocessing.py`` owns raw-to-derived data generation. ``src/lib/data/`` owns app-side file loading and CSV parsing. UI components should not read files directly.

Analytics
~~~~~~~~~

``src/lib/analytics/`` owns deterministic transformations:

* commodity metadata and normalization
* price signal calculations
* clicked-date news matching and source labels

These helpers are framework-light and can be tested without React.

Application
~~~~~~~~~~~

``src/app/`` loads dashboard data once on the server and passes serializable props to client dashboard components.

``src/lib/data/agent-loaders.ts`` discovers generated agent outputs by filename pattern, so the UI is not coupled to a fixed number of train/test splits.

Components
~~~~~~~~~~

``src/components/dashboard/`` contains reusable visual panels:

* commodity cards
* single-commodity price chart
* relative performance chart
* clicked-date news context panel
* trading bots gym visualization

MVP Boundary
------------

Included:

* local CSV ingestion
* generated processed/training data from raw CSVs
* price and sentiment dashboard
* clicked-date news context panel
* config-driven single-asset and multi-asset PPO training modules
* PPO decision-output visualization
* Sphinx documentation deployed with the demo using the Read the Docs theme
* repeatable local checks through ``npm test`` and docs/static build commands

Deferred:

* Supabase import/export
* ARIMA or model-backed forecasts
* chatbot or briefing API
* full trading-policy simulator
* browser-based PPO retraining

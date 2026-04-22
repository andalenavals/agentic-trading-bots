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
* event filtering and source labels

These helpers are framework-light and can be tested without React.

Application
~~~~~~~~~~~

``src/app/`` loads dashboard data once on the server and passes serializable props to client dashboard components.

Components
~~~~~~~~~~

``src/components/dashboard/`` contains reusable visual panels:

* commodity cards
* single-commodity price chart
* relative performance chart
* event feed
* trading bots gym visualization

MVP Boundary
------------

Included:

* local CSV ingestion
* generated processed/training data from raw CSVs
* price and sentiment dashboard
* event feed
* single-asset and multi-asset PPO training scripts
* PPO decision-output visualization
* Sphinx documentation deployed with the demo

Deferred:

* Supabase import/export
* ARIMA or model-backed forecasts
* chatbot or briefing API
* full trading-policy simulator
* browser-based PPO retraining

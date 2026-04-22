# Architecture

The project follows a small modular structure inspired by `chatbot_performance_evaluator`.

## Layers

### Data

`src/lib/data/` owns file loading and CSV parsing. UI components should not read files directly.

### Analytics

`src/lib/analytics/` owns deterministic transformations:

- commodity metadata and normalization
- price signal calculations
- event filtering and source labels

These helpers are framework-light and can be moved into tests or scripts without pulling in React.

### Application

`src/app/` loads dashboard data once on the server and passes serializable props to client dashboard components.

### Components

`src/components/dashboard/` contains reusable visual panels:

- commodity cards
- single-commodity price chart
- relative performance chart
- event feed
- trading bots gym visualization

The components use a dense market-dashboard visual language: dark surfaces, gold active controls, material chips, and compact trading panels.

## MVP Boundary

Included:

- local CSV ingestion
- price/sentiment dashboard
- event feed
- single-asset and multi-asset PPO training scripts
- PPO decision output visualization

Deferred:

- Supabase import/export
- ARIMA or model-backed forecasts
- chatbot/briefing API
- full trading-policy simulator
- browser-based PPO retraining

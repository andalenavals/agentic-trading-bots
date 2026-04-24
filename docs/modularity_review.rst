Modularity Review
=================

Review summary
--------------

The main weaknesses identified in this review were:

* duplicated Python pipeline helpers across preprocessing and prediction modules
* one stale duplicate prediction config
* docs describing older UI concepts such as relative performance and market-event panels
* app-side multi-asset loading tied too tightly to one fixed commodity list
* tests concentrated in one file and not covering shared pipeline utilities

Fixes applied
-------------

Shared Python helpers
~~~~~~~~~~~~~~~~~~~~~

``agentic_trading/pipeline_common.py`` now centralizes:

* JSON config loading
* config-key validation
* CSV reading and writing
* input-file discovery
* walk-forward split boundaries
* numeric coercion

Preprocessing boundary
~~~~~~~~~~~~~~~~~~~~~~

``preprocessing.py`` now uses a typed ``PreprocessingConfig`` plus a ``run_command`` dispatcher so the CLI and full pipeline path share the same config semantics.

Prediction boundary
~~~~~~~~~~~~~~~~~~~

Both prediction modules now reuse the shared pipeline helpers and validate their input schemas more explicitly.

Loader boundary
~~~~~~~~~~~~~~~

``src/lib/data/agent-loaders.ts`` no longer hardcodes the multi-asset commodity set when parsing output rows. It now infers commodity price columns from the file schema.

Docs boundary
~~~~~~~~~~~~~

The Sphinx docs and README were updated to describe the current dashboard structure:

* News Chart
* Sentiment Chart
* Decision Chart
* Predictions Chart

Remaining tradeoffs
-------------------

The project is still intentionally small. A deeper future refactor could extract:

* shared TS chart interaction helpers
* a server-side schema validation layer for dashboard CSVs
* richer JS/TS unit tests in addition to the existing Python pipeline tests

Agents And Forecasting
======================

Configuration
-------------

The repo keeps behavior in config files:

.. code-block:: text

   configs/agents/
   ├── single_asset_ppo.json
   └── multiple_asset_ppo.json

.. code-block:: text

   configs/predictions/
   ├── ar1_baseline.json
   ├── arimax_price_only.json
   ├── arimax_sentiment.json
   ├── gaussian_process_price_only.json
   ├── gaussian_process_sentiment.json
   ├── lstm_price_only.json
   ├── lstm_sentiment.json
   ├── ridge_arx_price_only.json
   ├── ridge_arx_sentiment.json
   ├── lightgbm_direct_price_only.json
   ├── lightgbm_direct_sentiment.json
   ├── lightgbm_price_only.json
   └── lightgbm_sentiment.json

Training modules and forecast generators read configs rather than embedding direct file paths in the browser layer.

PPO commands
------------

.. code-block:: bash

   npm run preprocess
   npm run train:single
   npm run train:multi

Forecast commands
-----------------

.. code-block:: bash

   npm run predict:baseline
   npm run predict:arimax
   npm run predict:ridge
   npm run predict:lightgbm
   npm run predict:lightgbm:direct
   npm run predict:gp
   npm run predict:lstm

Single-asset PPO
----------------

The single-asset PPO module trains one model per commodity CSV under ``data/training/commodity_outputs/`` and emits:

* action
* greedy action
* hold/buy/sell probabilities
* entropy
* position
* reward
* net worth

Multi-asset PPO
---------------

The multi-asset PPO module trains a shared portfolio policy across the configured commodity set. Output rows contain one action-probability block per commodity plus shared portfolio state.

Forecast outputs
----------------

The forecast layer currently exposes:

* a baseline trend forecast
* Ridge ARX price-only
* Ridge ARX price-plus-sentiment
* ARIMAX price-only
* ARIMAX price-plus-sentiment
* LightGBM price-only
* LightGBM price-plus-sentiment
* Direct multi-horizon LightGBM price-only
* Direct multi-horizon LightGBM price-plus-sentiment
* Gaussian process price-only
* Gaussian process price-plus-sentiment
* LSTM price-only
* LSTM price-plus-sentiment

Ridge ARX, ARIMAX, one-step LightGBM, Gaussian process, and LSTM emit two evaluation variants:

* ``observed_history``
* ``recursive_path``

Direct multi-horizon LightGBM is exposed as:

* ``direct_multi_horizon``

Dashboard loading
-----------------

The browser demo does not retrain models. It discovers generated or committed CSV outputs under:

.. code-block:: text

   data/agent_outputs/
   data/prediction_outputs/

The app-side loaders normalize those files into a stable UI shape for the charts.

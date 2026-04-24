Data
====

Source boundary
---------------

The only required source files are:

* ``data/raw/prices.csv``
* ``data/raw/news.csv``

Everything else is either generated or a committed demo snapshot.

Generated and committed artifacts
---------------------------------

Some derived files are intentionally committed because the deployed static demo depends on them:

* ``data/processed/finbert_event_sentiment.csv``
* ``data/agent_outputs/**``
* ``data/prediction_outputs/**``

Other derived files are regenerated during preprocessing or local training runs.

Primary derived tables
----------------------

``data/processed/news_events.csv``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Normalized event table generated from raw news:

.. code-block:: text

   event_id,date,event_day,title,url,impacted_commodities,summary

``impacted_commodities`` is a semicolon-separated list of canonical slugs.

``data/processed/prices_with_news.csv``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Joined price/news table used before sentiment enrichment:

.. code-block:: text

   date,commodity,price,news_ids,news_count,news_items,news_summary

``news_items`` stores the full event payload list as JSON so the dashboard can show multiple events for a single date row without flattening them away.

``data/processed/prices_with_sentiment.csv``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Main dashboard fact table:

.. code-block:: text

   date,commodity,price,news_ids,news_count,news_items,news_summary,negative,neutral,positive,sentiment_score,finbert_negative,finbert_neutral,finbert_positive,finbert_sentiment_score,finbert_label

Training and model outputs
--------------------------

``data/training/commodity_outputs/*.csv``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Per-commodity training inputs for single-asset PPO and forecast modules.

``data/agent_outputs/**/*.csv``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Saved PPO outputs used by the ``Decision Chart``.

``data/prediction_outputs/**/*.csv``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Saved baseline, Ridge ARX, and LightGBM outputs used by the ``Predictions Chart``.

Refresh workflow
----------------

Generate preprocessing outputs with:

.. code-block:: bash

   npm run preprocess

Optional regeneration of model outputs:

.. code-block:: bash

   npm run train:single
   npm run train:multi
   npm run predict:baseline
   npm run predict:ridge
   npm run predict:lightgbm
   npm run predict:lightgbm:direct
   npm run predict:lstm

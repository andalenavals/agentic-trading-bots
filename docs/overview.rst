Overview
========

Purpose
-------

The current project focuses on four synchronized chart panels for one selected commodity:

* ``News Chart``
* ``Sentiment Chart``
* ``Decision Chart``
* ``Predictions Chart``

Each panel shares the same horizontal viewport controls so the user can inspect price, sentiment, bot behavior, and forecast behavior over the same time region.

What the demo shows
-------------------

News Chart
~~~~~~~~~~

The price series is linked to normalized news events. News is shown only after clicking the chart. Multiple news items can appear on the same day, and a single event can affect more than one commodity.

Sentiment Chart
~~~~~~~~~~~~~~~

The sentiment panel lets the user switch between:

* simple rule-based sentiment
* FinBERT sentiment

Decision Chart
~~~~~~~~~~~~~~

The PPO panel overlays buy, hold, and sell decisions on top of the price series. Clicking a point reveals the stored action probabilities and portfolio state for that step.

Predictions Chart
~~~~~~~~~~~~~~~~~

The prediction panel shows:

* a baseline trend forecast
* Ridge ARX price-only forecasts
* Ridge ARX price-plus-sentiment forecasts

For Ridge ARX the UI exposes both:

* ``Observed history``
* ``Recursive path``

Local workflow
--------------

The project is intentionally local-first:

1. keep source CSVs in ``data/raw/``
2. generate derived data with preprocessing
3. optionally retrain PPO agents or regenerate predictions
4. inspect the outputs in the dashboard

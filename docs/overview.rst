Overview
========

Purpose
-------

The project is a local-first MVP for exploring commodity market signals and trained trading-bot behavior.

It answers three practical questions:

* What are copper, nickel, and aluminium prices doing?
* Which market events and sentiment summaries explain the recent context?
* How did trained PPO agents choose between hold, buy, and sell over the price series?

Application Layers
------------------

Market + News
~~~~~~~~~~~~~

The market layer shows:

* commodity cards with price, trend, volatility, and sentiment
* a single-commodity price chart
* relative performance across commodities
* a market-event feed

News summaries are not shown in the price-chart hover tooltip. They appear when a chart point is clicked.

Trading Bots Gym
~~~~~~~~~~~~~~~~

The trading bots gym shows:

* a selected commodity price time series
* PPO decisions overlaid as colored markers
* buy, hold, and sell probabilities
* confidence via marker size and opacity
* controls for model, dataset, split, commodity, date interval, and granularity


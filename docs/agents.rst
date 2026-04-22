Trading Agents
==============

Python Agent Code
-----------------

The repository includes PPO training and evaluation scripts under ``agents/``.

.. code-block:: text

   agents/
   ├── single_asset/
   │   ├── agent_individual_ppo.py
   │   ├── split_data_by_commodity.py
   │   └── plot_prob_action_range.py
   └── multiple_asset/
       ├── agent_ppo.py
       ├── agent_ppo2.py
       ├── plot_prob_action.py
       └── plot_prob_action_ind.py

Single-Asset PPO
----------------

The single-asset agent trains one PPO policy for an individual commodity. It uses price and sentiment features and emits per-step actions:

* ``0``: hold
* ``1``: buy
* ``2``: sell

Multi-Asset PPO
---------------

The multi-asset agent uses a shared policy over aluminium, copper, and nickel. It emits one action per commodity and tracks shared portfolio state.

Dashboard Visualization
-----------------------

The browser demo does not retrain PPO models. It reads saved CSV outputs and visualizes:

* action chosen
* greedy action
* probability of hold, buy, and sell
* entropy and normalized entropy
* net worth and reward
* position when available

Decision-marker opacity is derived from confidence:

.. code-block:: text

   confidence = max(prob_hold, prob_buy, prob_sell)

Higher confidence produces stronger, larger markers.


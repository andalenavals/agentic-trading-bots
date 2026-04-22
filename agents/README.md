# PPO Agents

This folder contains the Python training and evaluation code for the commodity PPO agents.

## Layout

```text
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
```

The Next.js dashboard does not retrain models in the browser. It visualizes saved PPO outputs from:

```text
data/agent_outputs/single_asset_ppo/
data/agent_outputs/multiple_asset_ppo/
```

## Python Environment

Create a separate Python environment when you want to retrain:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r agents/requirements.txt
```

## Notes

The copied scripts preserve the original research workflow. The next modularity step would be to extract shared environment, split, metrics, and plotting utilities into a reusable Python package under `agents/ppo_trading/`.

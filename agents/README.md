# PPO Agents

This folder intentionally no longer contains hardcoded agent scripts or plotting utilities.

Agent configuration lives in:

```text
configs/agents/
```

Reusable training code lives in:

```text
agentic_trading/training/
```

## Layout

```text
configs/agents/
├── single_asset_ppo.json
└── multiple_asset_ppo.json
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

The same dependencies are also exposed as the optional Python package extra in `pyproject.toml`:

```bash
pip install -e ".[agents]"
```

## Training Commands

```bash
npm run preprocess
npm run train:single
npm run train:multi
```

The dashboard discovers generated evaluation files from `data/agent_outputs`, so new split counts or finite/infinite multi-asset capital modes are picked up automatically when filenames follow the trainer conventions.

## Notes

The training layer should stay config-driven: no direct data paths, no plotting functions, and no checked-in generated outputs.

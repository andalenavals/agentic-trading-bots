from __future__ import annotations

import argparse

from agentic_trading.training.common import load_config


def run(config_path: str) -> None:
    config = load_config(config_path)
    raise NotImplementedError(
        "Multi-asset PPO is now config-driven, but the reusable implementation "
        "is intentionally separate from plotting and direct paths. Port the "
        "environment logic here when retraining is needed. "
        f"Loaded config for commodities: {config.get('commodities', [])}"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/agents/multiple_asset_ppo.json")
    args = parser.parse_args()
    run(args.config)


if __name__ == "__main__":
    main()


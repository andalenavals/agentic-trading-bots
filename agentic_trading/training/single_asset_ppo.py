from __future__ import annotations

import argparse
from pathlib import Path

import gymnasium as gym
import numpy as np
import pandas as pd
from gymnasium import spaces
from sklearn.preprocessing import StandardScaler
from stable_baselines3 import PPO
from torch import nn

from agentic_trading.training.common import load_config


class SingleAssetTradingEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(self, data: pd.DataFrame, window_size: int, initial_balance: float):
        super().__init__()
        required = {"raw_price", "feature_price", "feature_sentiment_score"}
        missing = required - set(data.columns)
        if missing:
            raise ValueError(f"Missing columns for single-asset environment: {missing}")

        self.data = data.reset_index(drop=True)
        self.window_size = int(window_size)
        self.initial_balance = float(initial_balance)
        self.feature_cols = ["feature_price", "feature_sentiment_score"]
        self.action_space = spaces.Discrete(3)
        self.observation_space = spaces.Box(
            low=-np.inf,
            high=np.inf,
            shape=(self.window_size * len(self.feature_cols),),
            dtype=np.float32,
        )

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        self.current_step = self.window_size
        self.balance = self.initial_balance
        self.position = 0
        self.net_worth = self.initial_balance
        self.max_steps = len(self.data) - 1
        return self._get_observation(), {}

    def _get_observation(self) -> np.ndarray:
        return self.data.iloc[
            self.current_step - self.window_size:self.current_step
        ][self.feature_cols].values.astype(np.float32).flatten()

    def step(self, action: int):
        prev_price = float(self.data.iloc[self.current_step - 1]["raw_price"])
        current_price = float(self.data.iloc[self.current_step]["raw_price"])
        prev_worth = self.balance + self.position * prev_price

        if action == 1:
            self.position += 1
            self.balance -= current_price
        elif action == 2 and self.position > 0:
            self.position -= 1
            self.balance += current_price

        self.net_worth = self.balance + self.position * current_price
        reward = np.log((self.net_worth + 1e-8) / (prev_worth + 1e-8))
        self.current_step += 1

        terminated = self.current_step >= self.max_steps
        info = {"net_worth": self.net_worth, "position": self.position}
        return self._get_observation(), float(reward), terminated, False, info


def prepare_features(train_df: pd.DataFrame, test_df: pd.DataFrame):
    scaler = StandardScaler()
    feature_cols = ["price", "sentiment_score"]
    scaler.fit(train_df[feature_cols])

    def transform(df: pd.DataFrame) -> pd.DataFrame:
        out = df.copy()
        scaled = scaler.transform(df[feature_cols])
        out["raw_price"] = out["price"]
        out["feature_price"] = scaled[:, 0]
        out["feature_sentiment_score"] = scaled[:, 1]
        return out

    return transform(train_df), transform(test_df)


def walk_forward_split(data: pd.DataFrame, n_splits: int):
    split_size = len(data) // (n_splits + 1)
    for index in range(n_splits):
        train_end = split_size * (index + 1)
        test_end = split_size * (index + 2)
        yield index + 1, data.iloc[:train_end].copy(), data.iloc[train_end:test_end].copy()


def policy_kwargs():
    return {"net_arch": {"pi": [64, 64], "vf": [64, 64]}, "activation_fn": nn.Tanh}


def run(config_path: str) -> None:
    config = load_config(config_path)
    data = pd.read_csv(config["input_csv"]).reset_index(drop=True)
    output_dir = Path(config["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)

    for split, train_raw, test_raw in walk_forward_split(data, config["n_splits"]):
        train, test = prepare_features(train_raw, test_raw)
        train_env = SingleAssetTradingEnv(train, config["window_size"], config["initial_balance"])
        test_env = SingleAssetTradingEnv(test, config["window_size"], config["initial_balance"])

        model = PPO(
            "MlpPolicy",
            train_env,
            policy_kwargs=policy_kwargs(),
            verbose=0,
            learning_rate=config["learning_rate"],
            n_steps=config["n_steps"],
            batch_size=config["batch_size"],
            gamma=config["gamma"],
            seed=config["seed"],
        )
        model.learn(total_timesteps=config["total_timesteps"])

        rows = []
        obs, _ = test_env.reset()
        terminated = False
        while not terminated:
            current_idx = test_env.current_step
            action, _ = model.predict(obs, deterministic=True)
            next_obs, reward, terminated, _, info = test_env.step(int(action))
            row = test.iloc[current_idx].to_dict()
            row.update({"action": int(action), "net_worth": info["net_worth"], "reward": reward})
            rows.append(row)
            obs = next_obs

        pd.DataFrame(rows).to_csv(output_dir / f"evaluation_split_{split}.csv", index=False)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/agents/single_asset_ppo.json")
    args = parser.parse_args()
    run(args.config)


if __name__ == "__main__":
    main()


from __future__ import annotations

import argparse
import math
from pathlib import Path

import gymnasium as gym
import numpy as np
import pandas as pd
import torch
from gymnasium import spaces
from sklearn.preprocessing import StandardScaler
from stable_baselines3 import PPO
from torch import nn

from agentic_trading.training.common import load_config, require_config_keys


REQUIRED_CONFIG_KEYS = {
    "input_csv",
    "output_dir",
    "commodities",
    "feature_columns",
    "window_size",
    "initial_balance",
    "n_splits",
    "total_timesteps",
    "learning_rate",
    "n_steps",
    "batch_size",
    "gamma",
    "epsilon",
    "allow_infinite_capital",
    "seed",
}


class MultiAssetTradingEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(
        self,
        raw_data: pd.DataFrame,
        scaled_data: pd.DataFrame,
        commodities: list[str],
        feature_columns: list[str],
        window_size: int,
        initial_balance: float,
        allow_infinite_capital: bool,
    ):
        super().__init__()
        self.raw_data = raw_data.reset_index(drop=True)
        self.scaled_data = scaled_data.reset_index(drop=True)
        self.commodities = commodities
        self.feature_columns = feature_columns
        self.window_size = int(window_size)
        self.initial_balance = float(initial_balance)
        self.allow_infinite_capital = bool(allow_infinite_capital)
        self.n_assets = len(self.commodities)
        self.price_cols = [f"price_{commodity}" for commodity in self.commodities]
        self.observation_columns = [
            f"{feature}_{commodity}"
            for feature in self.feature_columns
            for commodity in self.commodities
        ]

        if len(self.raw_data) <= self.window_size:
            raise ValueError("Dataset must be longer than window_size.")

        missing_raw = set(self.price_cols) - set(self.raw_data.columns)
        missing_scaled = set(self.observation_columns) - set(self.scaled_data.columns)
        if missing_raw or missing_scaled:
            raise ValueError(
                "Missing columns for multi-asset environment: "
                f"raw={sorted(missing_raw)}, scaled={sorted(missing_scaled)}"
            )

        self.action_space = spaces.MultiDiscrete([3] * self.n_assets)
        self.observation_space = spaces.Box(
            low=-np.inf,
            high=np.inf,
            shape=(self.window_size * len(self.observation_columns),),
            dtype=np.float32,
        )

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        self.current_step = self.window_size
        self.balance = self.initial_balance
        self.positions = np.zeros(self.n_assets, dtype=np.int32)
        self.net_worth = self.initial_balance
        self.max_steps = len(self.raw_data) - 1
        return self._get_observation(), {
            "capital_mode": "infinite" if self.allow_infinite_capital else "finite"
        }

    def _get_observation(self) -> np.ndarray:
        return self.scaled_data.iloc[
            self.current_step - self.window_size:self.current_step
        ][self.observation_columns].values.astype(np.float32).flatten()

    def _get_current_prices(self) -> np.ndarray:
        row = self.raw_data.iloc[self.current_step]
        return np.array([row[column] for column in self.price_cols], dtype=np.float32)

    def step(self, action):
        action = np.array(action, dtype=np.int32)
        previous_worth = self.net_worth
        prices = self._get_current_prices()

        for index, asset_action in enumerate(action):
            price = float(prices[index])
            if asset_action == 1 and (self.allow_infinite_capital or self.balance >= price):
                self.positions[index] += 1
                self.balance -= price
            elif asset_action == 2 and self.positions[index] > 0:
                self.positions[index] -= 1
                self.balance += price

        self.net_worth = float(self.balance + np.dot(self.positions, prices))
        reward = self.net_worth - previous_worth
        self.current_step += 1
        terminated = self.current_step >= self.max_steps
        observation = (
            np.zeros(self.observation_space.shape, dtype=np.float32)
            if terminated
            else self._get_observation()
        )
        info = {
            "balance": float(self.balance),
            "positions": self.positions.copy(),
            "net_worth": float(self.net_worth),
            "capital_mode": "infinite" if self.allow_infinite_capital else "finite",
        }
        return observation, float(reward), terminated, False, info


def load_and_prepare_data(
    input_csv: str,
    commodities: list[str],
    feature_columns: list[str],
) -> pd.DataFrame:
    data = pd.read_csv(input_csv)
    required = {"date", "commodity", *feature_columns}
    missing = required - set(data.columns)
    if missing:
        raise ValueError(f"Missing required columns: {sorted(missing)}")

    data["date"] = pd.to_datetime(data["date"])
    data = data[data["commodity"].isin(commodities)].sort_values(["date", "commodity"])
    missing_commodities = sorted(set(commodities) - set(data["commodity"].unique()))
    if missing_commodities:
        raise ValueError(f"Expected commodities not found: {missing_commodities}")

    wide_parts = []
    for feature in feature_columns:
        pivot = data.pivot(index="date", columns="commodity", values=feature)
        pivot = pivot.reindex(columns=commodities)
        pivot.columns = [f"{feature}_{commodity}" for commodity in pivot.columns]
        wide_parts.append(pivot)

    return pd.concat(wide_parts, axis=1).sort_index().reset_index().dropna().reset_index(drop=True)


def transform_with_scaler(data: pd.DataFrame, scaler: StandardScaler) -> pd.DataFrame:
    scaled = data.copy()
    scale_columns = [column for column in scaled.columns if column != "date"]
    scaled[scale_columns] = scaler.transform(scaled[scale_columns])
    return scaled


def scale_split(
    train_data: pd.DataFrame,
    test_data: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame, StandardScaler]:
    scale_columns = [column for column in train_data.columns if column != "date"]
    scaler = StandardScaler()
    scaler.fit(train_data[scale_columns])
    return transform_with_scaler(train_data, scaler), transform_with_scaler(test_data, scaler), scaler


def walk_forward_split(raw_data: pd.DataFrame, n_splits: int):
    if n_splits < 1:
        raise ValueError("n_splits must be at least 1.")

    split_size = len(raw_data) // (n_splits + 1)
    if split_size <= 0:
        raise ValueError("Not enough rows for the requested walk-forward split count.")

    for index in range(n_splits):
        train_end = split_size * (index + 1)
        test_end = split_size * (index + 2)
        yield (
            index + 1,
            raw_data.iloc[:train_end].reset_index(drop=True),
            raw_data.iloc[train_end:test_end].reset_index(drop=True),
        )


def policy_kwargs():
    return {"net_arch": {"pi": [64, 64], "vf": [64, 64]}, "activation_fn": nn.Tanh}


def action_name(action: int) -> str:
    return {0: "hold", 1: "buy", 2: "sell"}[int(action)]


def entropy(probabilities: np.ndarray) -> float:
    values = np.asarray(probabilities, dtype=np.float64)
    values = np.maximum(values, 1e-12)
    values = values / values.sum()
    return float(-(values * np.log(values)).sum())


def normalized_entropy(probabilities: np.ndarray) -> float:
    return entropy(probabilities) / math.log(len(probabilities))


def action_probabilities(model: PPO, observation: np.ndarray) -> np.ndarray:
    observation_tensor = model.policy.obs_to_tensor(observation)[0]
    distribution = model.policy.get_distribution(observation_tensor).distribution
    if not isinstance(distribution, (list, tuple)):
        raise RuntimeError("Expected separate categorical distributions for MultiDiscrete actions.")
    return np.array([item.probs.detach().cpu().numpy()[0] for item in distribution], dtype=np.float32)


def choose_action(model: PPO, observation: np.ndarray, epsilon: float, action_space) -> tuple[np.ndarray, np.ndarray]:
    probabilities = action_probabilities(model, observation)
    if np.random.rand() < epsilon:
        return np.array(action_space.sample(), dtype=np.int32), probabilities
    action, _ = model.predict(observation, deterministic=False)
    return np.array(action, dtype=np.int32), probabilities


def build_evaluation_row(
    base_row: dict[str, object],
    action: np.ndarray,
    probabilities: np.ndarray,
    commodities: list[str],
    positions: np.ndarray,
    net_worth: float,
    reward: float,
    balance: float,
    capital_mode: str,
) -> dict[str, object]:
    row = dict(base_row)
    per_asset_entropy = []

    for index, commodity in enumerate(commodities):
        asset_probabilities = probabilities[index]
        greedy_action = int(np.argmax(asset_probabilities))
        asset_entropy = entropy(asset_probabilities)
        asset_normalized_entropy = normalized_entropy(asset_probabilities)

        row[f"action_{commodity}"] = int(action[index])
        row[f"action_name_{commodity}"] = action_name(int(action[index]))
        row[f"greedy_action_{commodity}"] = greedy_action
        row[f"greedy_action_name_{commodity}"] = action_name(greedy_action)
        row[f"prob_hold_{commodity}"] = float(asset_probabilities[0])
        row[f"prob_buy_{commodity}"] = float(asset_probabilities[1])
        row[f"prob_sell_{commodity}"] = float(asset_probabilities[2])
        row[f"entropy_{commodity}"] = asset_entropy
        row[f"normalized_entropy_{commodity}"] = asset_normalized_entropy
        row[f"position_{commodity}"] = int(positions[index])
        per_asset_entropy.append(asset_normalized_entropy)

    row["cash_balance"] = float(balance)
    row["net_worth"] = float(net_worth)
    row["reward"] = float(reward)
    row["capital_mode"] = capital_mode
    row["mean_normalized_entropy"] = float(np.mean(per_asset_entropy))
    return row


def evaluate_model(model: PPO, env: MultiAssetTradingEnv, commodities: list[str], epsilon: float) -> pd.DataFrame:
    rows = []
    observation, _ = env.reset()
    terminated = False

    while not terminated:
        current_idx = env.current_step
        action, probabilities = choose_action(model, observation, epsilon, env.action_space)
        next_observation, reward, terminated, _, info = env.step(action)
        rows.append(
            build_evaluation_row(
                base_row=env.raw_data.iloc[current_idx].to_dict(),
                action=action,
                probabilities=probabilities,
                commodities=commodities,
                positions=info["positions"],
                net_worth=info["net_worth"],
                reward=reward,
                balance=info["balance"],
                capital_mode=info["capital_mode"],
            )
        )
        observation = next_observation

    return pd.DataFrame(rows)


def run(config_path: str) -> None:
    config = load_config(config_path)
    require_config_keys(config, REQUIRED_CONFIG_KEYS, config_path)
    commodities = config["commodities"]
    feature_columns = config["feature_columns"]
    np.random.seed(config["seed"])
    torch.manual_seed(config["seed"])

    raw_data = load_and_prepare_data(
        input_csv=config["input_csv"],
        commodities=commodities,
        feature_columns=feature_columns,
    )
    output_dir = Path(config["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)
    capital_suffix = "infinite_capital" if config["allow_infinite_capital"] else "finite_capital"

    for split, raw_train, raw_test in walk_forward_split(
        raw_data,
        config["n_splits"],
    ):
        scaled_train, scaled_test, scaler = scale_split(raw_train, raw_test)
        train_env = MultiAssetTradingEnv(
            raw_data=raw_train,
            scaled_data=scaled_train,
            commodities=commodities,
            feature_columns=feature_columns,
            window_size=config["window_size"],
            initial_balance=config["initial_balance"],
            allow_infinite_capital=config["allow_infinite_capital"],
        )

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

        test_env = MultiAssetTradingEnv(
            raw_data=raw_test,
            scaled_data=scaled_test,
            commodities=commodities,
            feature_columns=feature_columns,
            window_size=config["window_size"],
            initial_balance=config["initial_balance"],
            allow_infinite_capital=config["allow_infinite_capital"],
        )
        evaluation = evaluate_model(model, test_env, commodities, config["epsilon"])
        evaluation.to_csv(
            output_dir / f"evaluation_split_{split}_multi_asset_{capital_suffix}.csv",
            index=False,
        )

        full_scaled = transform_with_scaler(raw_data, scaler)
        full_env = MultiAssetTradingEnv(
            raw_data=raw_data,
            scaled_data=full_scaled,
            commodities=commodities,
            feature_columns=feature_columns,
            window_size=config["window_size"],
            initial_balance=config["initial_balance"],
            allow_infinite_capital=config["allow_infinite_capital"],
        )
        full_evaluation = evaluate_model(model, full_env, commodities, config["epsilon"])
        full_evaluation.to_csv(
            output_dir / f"evaluation_full_dataset_split_{split}_multi_asset_{capital_suffix}.csv",
            index=False,
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/agents/multiple_asset_ppo.json")
    args = parser.parse_args()
    run(args.config)


if __name__ == "__main__":
    main()

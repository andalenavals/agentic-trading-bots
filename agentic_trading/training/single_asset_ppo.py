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

from agentic_trading.training.common import load_config, require_config_keys


REQUIRED_CONFIG_KEYS = {
    "input_csv",
    "output_dir",
    "window_size",
    "initial_balance",
    "n_splits",
    "total_timesteps",
    "learning_rate",
    "n_steps",
    "batch_size",
    "gamma",
    "seed",
}


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
        if len(self.data) <= self.window_size:
            raise ValueError("Dataset must be longer than window_size.")

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
        reward = (self.net_worth - prev_worth) / self.initial_balance
        self.current_step += 1

        terminated = self.current_step >= self.max_steps
        observation = (
            np.zeros(self.observation_space.shape, dtype=np.float32)
            if terminated
            else self._get_observation()
        )
        info = {"net_worth": self.net_worth, "position": self.position}
        return observation, float(reward), terminated, False, info


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

    return transform(train_df), transform(test_df), scaler


def transform_full_dataset(data: pd.DataFrame, scaler: StandardScaler) -> pd.DataFrame:
    out = data.copy()
    scaled = scaler.transform(data[["price", "sentiment_score"]])
    out["raw_price"] = out["price"]
    out["feature_price"] = scaled[:, 0]
    out["feature_sentiment_score"] = scaled[:, 1]
    return out


def walk_forward_split(data: pd.DataFrame, n_splits: int):
    if n_splits < 1:
        raise ValueError("n_splits must be at least 1.")

    split_size = len(data) // (n_splits + 1)
    if split_size <= 0:
        raise ValueError("Not enough rows for the requested walk-forward split count.")

    for index in range(n_splits):
        train_end = split_size * (index + 1)
        test_end = split_size * (index + 2)
        yield index + 1, data.iloc[:train_end].copy(), data.iloc[train_end:test_end].copy()


def policy_kwargs():
    return {"net_arch": {"pi": [64, 64], "vf": [64, 64]}, "activation_fn": nn.Tanh}


def model_probabilities(model: PPO, observation: np.ndarray) -> np.ndarray:
    observation_tensor = model.policy.obs_to_tensor(observation)[0]
    distribution = model.policy.get_distribution(observation_tensor)
    return distribution.distribution.probs.detach().cpu().numpy()[0]


def entropy(probabilities: np.ndarray) -> float:
    probabilities = np.asarray(probabilities, dtype=np.float64)
    probabilities = np.maximum(probabilities, 1e-12)
    probabilities = probabilities / probabilities.sum()
    return float(-(probabilities * np.log(probabilities)).sum())


def evaluate_model(
    model: PPO,
    data: pd.DataFrame,
    window_size: int,
    initial_balance: float,
    train_end_index: int | None = None,
) -> pd.DataFrame:
    env = SingleAssetTradingEnv(data, window_size, initial_balance)
    rows = []
    obs, _ = env.reset()
    terminated = False

    while not terminated:
        current_idx = env.current_step
        probabilities = model_probabilities(model, obs)
        action, _ = model.predict(obs, deterministic=True)
        action = int(action)
        next_obs, reward, terminated, _, info = env.step(action)

        row = data.iloc[current_idx].to_dict()
        dataset_index = int(row.get("dataset_index", current_idx))
        row.update(
            {
                "dataset_index": dataset_index,
                "phase": "test" if train_end_index is not None and dataset_index >= train_end_index else "train",
                "action": action,
                "greedy_action": int(np.argmax(probabilities)),
                "prob_hold": float(probabilities[0]),
                "prob_buy": float(probabilities[1]),
                "prob_sell": float(probabilities[2]),
                "entropy": entropy(probabilities),
                "net_worth": float(info["net_worth"]),
                "position": int(info["position"]),
                "reward": float(reward),
            }
        )
        rows.append(row)
        obs = next_obs

    return pd.DataFrame(rows)


def run(config_path: str) -> None:
    config = load_config(config_path)
    require_config_keys(config, REQUIRED_CONFIG_KEYS, config_path)
    output_dir = Path(config["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)

    for input_csv in resolve_input_files(config["input_csv"]):
        data = load_dataset(input_csv)
        commodity = str(data.iloc[0]["commodity"])

        for split, train_raw, test_raw in walk_forward_split(data, config["n_splits"]):
            train, test, scaler = prepare_features(train_raw, test_raw)
            train_env = SingleAssetTradingEnv(train, config["window_size"], config["initial_balance"])

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

            train_end_index = int(train_raw["dataset_index"].max()) + 1
            evaluation = evaluate_model(
                model=model,
                data=test,
                window_size=config["window_size"],
                initial_balance=config["initial_balance"],
                train_end_index=train_end_index,
            )
            evaluation.to_csv(output_dir / f"evaluation_{commodity}_split_{split}.csv", index=False)

            full_data = transform_full_dataset(data, scaler)
            full_predictions = evaluate_model(
                model=model,
                data=full_data,
                window_size=config["window_size"],
                initial_balance=config["initial_balance"],
                train_end_index=train_end_index,
            )
            full_predictions.to_csv(output_dir / f"full_dataset_predictions_{commodity}_split_{split}.csv", index=False)


def resolve_input_files(input_csv: str) -> list[str]:
    path = Path(input_csv)
    if any(character in input_csv for character in "*?[]"):
        files = sorted(str(file) for file in path.parent.glob(path.name))
    elif path.is_dir():
        files = sorted(str(file) for file in path.glob("*.csv"))
    else:
        files = [input_csv]

    if not files:
        raise ValueError(f"No single-asset input CSVs matched {input_csv!r}.")
    return files


def load_dataset(input_csv: str) -> pd.DataFrame:
    data = pd.read_csv(input_csv)
    required = {"commodity", "price", "sentiment_score"}
    missing = required - set(data.columns)
    if missing:
        raise ValueError(f"{input_csv} is missing required columns: {sorted(missing)}")
    if "date" in data.columns:
        data = data.sort_values("date")
    data = data.reset_index(drop=True)
    data["dataset_index"] = np.arange(len(data))
    return data


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/agents/single_asset_ppo.json")
    args = parser.parse_args()
    run(args.config)


if __name__ == "__main__":
    main()

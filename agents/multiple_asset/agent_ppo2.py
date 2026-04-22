import math
import numpy as np
import pandas as pd
import torch
from torch import nn
import gymnasium as gym
from gymnasium import spaces
from stable_baselines3 import PPO
from sklearn.preprocessing import StandardScaler


# ============================================================
# CONFIG
# ============================================================
CSV_PATH = "prices_with_sentiment.csv"

COMMODITIES = ["aluminium_lme", "copper_lme", "nickel_lme"]
FEATURE_COLUMNS = ["price", "negative", "neutral", "positive", "sentiment_score"]

WINDOW_SIZE = 10
INITIAL_BALANCE = 10000.0
N_SPLITS = 1
TOTAL_TIMESTEPS = 10000
EPSILON = 0.05
RANDOM_SEED = 42

# New option:
# False -> standard finite-cash trading
# True  -> infinite capital: buys are never blocked by cash balance
ALLOW_INFINITE_CAPITAL = True

np.random.seed(RANDOM_SEED)
torch.manual_seed(RANDOM_SEED)


# ============================================================
# DATA PREP
# ============================================================
def load_and_prepare_data(csv_path: str):
    df = pd.read_csv(csv_path)

    required_cols = {
        "date", "commodity", "price", "negative", "neutral",
        "positive", "sentiment_score"
    }
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values(["date", "commodity"]).reset_index(drop=True)

    found_commodities = sorted(df["commodity"].unique().tolist())
    expected_missing = [c for c in COMMODITIES if c not in found_commodities]
    if expected_missing:
        raise ValueError(f"Expected commodities not found: {expected_missing}")

    df = df[df["commodity"].isin(COMMODITIES)].copy()

    wide_parts = []
    for feat in FEATURE_COLUMNS:
        pivot = df.pivot(index="date", columns="commodity", values=feat)
        pivot.columns = [f"{feat}_{c}" for c in pivot.columns]
        wide_parts.append(pivot)

    raw_wide_df = pd.concat(wide_parts, axis=1).sort_index().reset_index()
    raw_wide_df = raw_wide_df.dropna().reset_index(drop=True)

    scaled_wide_df = raw_wide_df.copy()
    feature_cols_wide = [c for c in scaled_wide_df.columns if c != "date"]

    scaler = StandardScaler()
    scaled_wide_df[feature_cols_wide] = scaler.fit_transform(
        scaled_wide_df[feature_cols_wide]
    )

    return raw_wide_df, scaled_wide_df


def walk_forward_split(raw_df, scaled_df, n_splits=3):
    split_size = len(raw_df) // (n_splits + 1)
    splits = []

    for i in range(n_splits):
        train_end = split_size * (i + 1)
        test_end = split_size * (i + 2)

        raw_train = raw_df.iloc[:train_end].reset_index(drop=True)
        raw_test = raw_df.iloc[train_end:test_end].reset_index(drop=True)

        scaled_train = scaled_df.iloc[:train_end].reset_index(drop=True)
        scaled_test = scaled_df.iloc[train_end:test_end].reset_index(drop=True)

        splits.append((raw_train, scaled_train, raw_test, scaled_test))

    return splits


# ============================================================
# ENVIRONMENT
# ============================================================
class MultiCommodityTradingEnv(gym.Env):
    """
    One shared agent, three commodities, one shared cash account.

    Action per commodity:
      0 = HOLD
      1 = BUY  one unit
      2 = SELL one unit

    Overall action space:
      MultiDiscrete([3, 3, 3])

    Capital modes:
      - finite capital: buys require enough cash
      - infinite capital: buys always allowed, balance can go negative
    """

    metadata = {"render_modes": []}

    def __init__(
        self,
        raw_data: pd.DataFrame,
        scaled_data: pd.DataFrame,
        commodities,
        feature_columns,
        window_size=10,
        initial_balance=10000.0,
        allow_infinite_capital=False,
    ):
        super().__init__()

        self.raw_data = raw_data.reset_index(drop=True)
        self.scaled_data = scaled_data.reset_index(drop=True)
        self.commodities = commodities
        self.feature_columns = feature_columns
        self.window_size = window_size
        self.initial_balance = float(initial_balance)
        self.allow_infinite_capital = bool(allow_infinite_capital)

        self.n_assets = len(self.commodities)
        self.price_cols = [f"price_{c}" for c in self.commodities]

        self.obs_feature_cols = []
        for feat in self.feature_columns:
            for comm in self.commodities:
                self.obs_feature_cols.append(f"{feat}_{comm}")

        obs_dim = self.window_size * len(self.obs_feature_cols)

        self.action_space = spaces.MultiDiscrete([3] * self.n_assets)
        self.observation_space = spaces.Box(
            low=-np.inf,
            high=np.inf,
            shape=(obs_dim,),
            dtype=np.float32,
        )

        self.reset()

    def _get_observation(self):
        window = self.scaled_data.iloc[
            self.current_step - self.window_size:self.current_step
        ][self.obs_feature_cols].values.astype(np.float32)

        return window.flatten()

    def _get_current_prices(self):
        row = self.raw_data.iloc[self.current_step]
        return np.array([row[col] for col in self.price_cols], dtype=np.float32)

    def _compute_net_worth(self, prices):
        return float(self.balance + np.dot(self.positions, prices))

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)

        self.current_step = self.window_size
        self.balance = float(self.initial_balance)
        self.positions = np.zeros(self.n_assets, dtype=np.int32)
        self.net_worth = float(self.initial_balance)
        self.max_steps = len(self.raw_data) - 1

        obs = self._get_observation()
        info = {
            "capital_mode": "infinite" if self.allow_infinite_capital else "finite"
        }
        return obs, info

    def step(self, action):
        action = np.array(action, dtype=np.int32)
        prev_worth = self.net_worth
        prices = self._get_current_prices()

        for i, a in enumerate(action):
            price = float(prices[i])

            if a == 1:  # BUY
                if self.allow_infinite_capital:
                    self.positions[i] += 1
                    self.balance -= price
                else:
                    if self.balance >= price:
                        self.positions[i] += 1
                        self.balance -= price

            elif a == 2:  # SELL
                if self.positions[i] > 0:
                    self.positions[i] -= 1
                    self.balance += price

        self.net_worth = self._compute_net_worth(prices)
        reward = self.net_worth - prev_worth

        self.current_step += 1
        terminated = self.current_step >= self.max_steps
        truncated = False

        if terminated:
            obs = np.zeros(self.observation_space.shape, dtype=np.float32)
        else:
            obs = self._get_observation()

        info = {
            "balance": float(self.balance),
            "positions": self.positions.copy(),
            "net_worth": float(self.net_worth),
            "prices": prices.copy(),
            "capital_mode": "infinite" if self.allow_infinite_capital else "finite",
        }

        return obs, reward, terminated, truncated, info


# ============================================================
# POLICY WRAPPER
# ============================================================
class EpsilonGreedyMultiAssetPolicy:
    def __init__(self, model, action_space, epsilon=0.05):
        self.model = model
        self.action_space = action_space
        self.epsilon = epsilon

    def get_action_probs(self, obs):
        obs_tensor = torch.tensor(obs, dtype=torch.float32).unsqueeze(0)
        dist = self.model.policy.get_distribution(obs_tensor)

        if hasattr(dist, "distribution"):
            sub_dists = dist.distribution
            if isinstance(sub_dists, (list, tuple)):
                probs = [d.probs.detach().cpu().numpy()[0] for d in sub_dists]
                return np.array(probs, dtype=np.float32)

        raise RuntimeError("Unable to extract action probabilities for MultiDiscrete action space.")

    def predict(self, obs):
        if np.random.rand() < self.epsilon:
            return np.array(self.action_space.sample(), dtype=np.int32), None

        action, _ = self.model.predict(obs, deterministic=False)
        probs = self.get_action_probs(obs)
        return np.array(action, dtype=np.int32), probs


# ============================================================
# HELPERS
# ============================================================
def create_policy_kwargs():
    return {
        "net_arch": {"pi": [64, 64], "vf": [64, 64]},
        "activation_fn": nn.Tanh,
    }


def action_name(a: int):
    return {0: "hold", 1: "buy", 2: "sell"}[int(a)]


def safe_entropy(prob_vector, eps=1e-12):
    p = np.asarray(prob_vector, dtype=np.float64)
    p = np.maximum(p, eps)
    p = p / p.sum()
    return float(-(p * np.log(p)).sum())


def normalized_entropy(prob_vector, eps=1e-12):
    p = np.asarray(prob_vector, dtype=np.float64)
    p = np.maximum(p, eps)
    p = p / p.sum()

    h = float(-(p * np.log(p)).sum())
    h_max = math.log(len(p))
    return 0.0 if h_max <= 0 else float(h / h_max)


def compute_metrics(eval_df: pd.DataFrame, initial_balance: float):
    if eval_df.empty:
        return {}

    metrics = {}

    net_worth = eval_df["net_worth"].astype(float).values
    reward = eval_df["reward"].astype(float).values
    returns = pd.Series(net_worth).pct_change().fillna(0.0).values

    metrics["n_rows"] = int(len(eval_df))
    metrics["initial_balance"] = float(initial_balance)
    metrics["final_net_worth"] = float(net_worth[-1])
    metrics["total_pnl"] = float(net_worth[-1] - initial_balance)
    metrics["total_return"] = float(net_worth[-1] / initial_balance - 1.0)
    metrics["mean_reward"] = float(np.mean(reward))
    metrics["std_reward"] = float(np.std(reward))
    metrics["mean_step_return"] = float(np.mean(returns))
    metrics["std_step_return"] = float(np.std(returns))

    running_max = np.maximum.accumulate(net_worth)
    drawdown = (net_worth - running_max) / running_max
    metrics["max_drawdown"] = float(np.min(drawdown))

    entropy_cols = [c for c in eval_df.columns if c.startswith("normalized_entropy_")]
    if entropy_cols:
        metrics["mean_normalized_entropy"] = float(
            eval_df[entropy_cols].mean(axis=1).mean()
        )

    return metrics


def build_eval_row(base_row, action, probs, positions, net_worth, reward, balance, capital_mode):
    row = dict(base_row)

    per_asset_entropy = []

    for i, commodity in enumerate(COMMODITIES):
        p = np.asarray(probs[i], dtype=np.float64)
        greedy = int(np.argmax(p))
        ent = safe_entropy(p)
        norm_ent = normalized_entropy(p)

        row[f"action_{commodity}"] = int(action[i])
        row[f"action_name_{commodity}"] = action_name(int(action[i]))

        row[f"prob_hold_{commodity}"] = float(p[0])
        row[f"prob_buy_{commodity}"] = float(p[1])
        row[f"prob_sell_{commodity}"] = float(p[2])

        row[f"greedy_action_{commodity}"] = greedy
        row[f"greedy_action_name_{commodity}"] = action_name(greedy)

        row[f"entropy_{commodity}"] = float(ent)
        row[f"normalized_entropy_{commodity}"] = float(norm_ent)

        row[f"position_{commodity}"] = int(positions[i])

        per_asset_entropy.append(norm_ent)

    row["cash_balance"] = float(balance)
    row["net_worth"] = float(net_worth)
    row["reward"] = float(reward)
    row["capital_mode"] = capital_mode
    row["mean_normalized_entropy"] = float(np.mean(per_asset_entropy))

    return row


def evaluate_model(model, env, epsilon, save_path=None):
    policy = EpsilonGreedyMultiAssetPolicy(
        model=model,
        action_space=env.action_space,
        epsilon=epsilon,
    )

    obs, info = env.reset()
    capital_mode = info.get("capital_mode", "unknown")
    terminated = False
    truncated = False
    rows = []

    while not (terminated or truncated):
        current_idx = env.current_step

        action, probs = policy.predict(obs)

        if probs is None:
            probs = np.array([[1/3, 1/3, 1/3]] * len(COMMODITIES), dtype=np.float32)

        next_obs, reward, terminated, truncated, info = env.step(action)

        original_row = env.raw_data.iloc[current_idx].to_dict()
        row = build_eval_row(
            base_row=original_row,
            action=action,
            probs=probs,
            positions=info["positions"],
            net_worth=info["net_worth"],
            reward=reward,
            balance=info["balance"],
            capital_mode=info["capital_mode"],
        )
        rows.append(row)

        obs = next_obs

    eval_df = pd.DataFrame(rows)
    metrics = compute_metrics(eval_df, env.initial_balance)

    if save_path is not None:
        eval_df.to_csv(save_path, index=False)

    return eval_df, metrics


# ============================================================
# MAIN
# ============================================================
def main():
    raw_wide_df, scaled_wide_df = load_and_prepare_data(CSV_PATH)
    splits = walk_forward_split(raw_wide_df, scaled_wide_df, n_splits=N_SPLITS)

    capital_suffix = "infinite_capital" if ALLOW_INFINITE_CAPITAL else "finite_capital"

    for split_idx, (raw_train, scaled_train, raw_test, scaled_test) in enumerate(splits, start=1):
        print(f"\n=== WALK-FORWARD SPLIT {split_idx} ===")
        print(f"Train rows: {len(raw_train)} | Test rows: {len(raw_test)}")
        print(f"Capital mode: {'infinite' if ALLOW_INFINITE_CAPITAL else 'finite'}")

        train_env = MultiCommodityTradingEnv(
            raw_data=raw_train,
            scaled_data=scaled_train,
            commodities=COMMODITIES,
            feature_columns=FEATURE_COLUMNS,
            window_size=WINDOW_SIZE,
            initial_balance=INITIAL_BALANCE,
            allow_infinite_capital=ALLOW_INFINITE_CAPITAL,
        )

        model = PPO(
            policy="MlpPolicy",
            env=train_env,
            policy_kwargs=create_policy_kwargs(),
            verbose=0,
            learning_rate=3e-4,
            n_steps=256,
            batch_size=64,
            gamma=0.99,
            seed=RANDOM_SEED,
        )

        model.learn(total_timesteps=TOTAL_TIMESTEPS)

        test_env = MultiCommodityTradingEnv(
            raw_data=raw_test,
            scaled_data=scaled_test,
            commodities=COMMODITIES,
            feature_columns=FEATURE_COLUMNS,
            window_size=WINDOW_SIZE,
            initial_balance=INITIAL_BALANCE,
            allow_infinite_capital=ALLOW_INFINITE_CAPITAL,
        )

        split_eval_path = f"evaluation_split_{split_idx}_multi_asset_{capital_suffix}.csv"
        _, split_metrics = evaluate_model(
            model=model,
            env=test_env,
            epsilon=EPSILON,
            save_path=split_eval_path,
        )

        print(f"Saved: {split_eval_path}")
        print(
            f"Test-only metrics | "
            f"Final Net Worth: {split_metrics.get('final_net_worth', np.nan):.2f}, "
            f"Total PnL: {split_metrics.get('total_pnl', np.nan):.2f}, "
            f"Total Return: {split_metrics.get('total_return', np.nan):.4f}"
        )

        full_env = MultiCommodityTradingEnv(
            raw_data=raw_wide_df,
            scaled_data=scaled_wide_df,
            commodities=COMMODITIES,
            feature_columns=FEATURE_COLUMNS,
            window_size=WINDOW_SIZE,
            initial_balance=INITIAL_BALANCE,
            allow_infinite_capital=ALLOW_INFINITE_CAPITAL,
        )

        full_eval_path = f"evaluation_full_dataset_split_{split_idx}_multi_asset_{capital_suffix}.csv"
        _, full_metrics = evaluate_model(
            model=model,
            env=full_env,
            epsilon=EPSILON,
            save_path=full_eval_path,
        )

        print(f"Saved: {full_eval_path}")
        print(
            f"Full-dataset metrics | "
            f"Final Net Worth: {full_metrics.get('final_net_worth', np.nan):.2f}, "
            f"Total PnL: {full_metrics.get('total_pnl', np.nan):.2f}, "
            f"Total Return: {full_metrics.get('total_return', np.nan):.4f}, "
            f"Max Drawdown: {full_metrics.get('max_drawdown', np.nan):.4f}, "
            f"Mean Normalized Entropy: {full_metrics.get('mean_normalized_entropy', np.nan):.4f}"
        )


if __name__ == "__main__":
    main()

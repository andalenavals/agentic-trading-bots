import numpy as np
import pandas as pd
import gymnasium as gym
from gymnasium import spaces
from torch import nn
from stable_baselines3 import PPO
from sklearn.preprocessing import StandardScaler

# =========================
# LOAD DATA
# =========================
DATA_PATH = "commodity_outputs/aluminium_lme.csv"
# DATA_PATH = "commodity_outputs/copper_lme.csv"
# DATA_PATH = "commodity_outputs/nickel_lme.csv"


def load_dataset(path: str) -> pd.DataFrame:
    df = pd.read_csv(path).copy()
    assert 'price' in df.columns and 'sentiment_score' in df.columns
    return df.reset_index(drop=True)


# =========================
# PREPROCESSING
# =========================
def fit_transform_split(train_df: pd.DataFrame, test_df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, StandardScaler]:
    """
    Fit the scaler on the TRAIN split only, then transform train/test features.
    Keep raw execution prices untouched for PnL and accounting.
    """
    feature_cols = ['price', 'sentiment_score']

    scaler = StandardScaler()
    scaler.fit(train_df[feature_cols])

    train_out = train_df.copy()
    test_out = test_df.copy()

    train_scaled = scaler.transform(train_df[feature_cols])
    test_scaled = scaler.transform(test_df[feature_cols])

    train_out['raw_price'] = train_out['price']
    test_out['raw_price'] = test_out['price']

    train_out['feature_price'] = train_scaled[:, 0]
    train_out['feature_sentiment_score'] = train_scaled[:, 1]
    test_out['feature_price'] = test_scaled[:, 0]
    test_out['feature_sentiment_score'] = test_scaled[:, 1]

    return train_out, test_out, scaler


def transform_full_dataset(df: pd.DataFrame, scaler: StandardScaler) -> pd.DataFrame:
    feature_cols = ['price', 'sentiment_score']
    out = df.copy()
    scaled = scaler.transform(df[feature_cols])
    out['raw_price'] = out['price']
    out['feature_price'] = scaled[:, 0]
    out['feature_sentiment_score'] = scaled[:, 1]
    return out


# =========================
# TRADING ENVIRONMENT
# =========================
class TradingEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(self, data: pd.DataFrame, window_size: int = 10, initial_balance: float = 1000.0):
        super().__init__()

        required_cols = {'raw_price', 'feature_price', 'feature_sentiment_score'}
        missing = required_cols - set(data.columns)
        if missing:
            raise ValueError(f"TradingEnv data is missing required columns: {missing}")
        if len(data) <= window_size:
            raise ValueError("Dataset must be longer than window_size")

        self.data = data.reset_index(drop=True)
        self.window_size = window_size
        self.initial_balance = float(initial_balance)
        self.feature_cols = ['feature_price', 'feature_sentiment_score']

        self.action_space = spaces.Discrete(3)  # 0=hold, 1=buy, 2=sell
        self.observation_space = spaces.Box(
            low=-np.inf,
            high=np.inf,
            shape=(window_size * len(self.feature_cols),),
            dtype=np.float32,
        )

        self.current_step = None
        self.balance = None
        self.position = None
        self.net_worth = None
        self.max_steps = None

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        self.current_step = self.window_size
        self.balance = self.initial_balance
        self.position = 0
        self.net_worth = self.initial_balance
        self.max_steps = len(self.data) - 1
        return self._get_observation(), {}

    def _get_observation(self) -> np.ndarray:
        obs = self.data.iloc[
            self.current_step - self.window_size:self.current_step
        ][self.feature_cols].values.astype(np.float32)
        return obs.flatten()

    def step(self, action: int):
        prev_price = float(self.data.iloc[self.current_step - 1]['raw_price'])
        current_price = float(self.data.iloc[self.current_step]['raw_price'])
        prev_worth = self.balance + self.position * prev_price

        # Execute at current step price using RAW price.
        if action == 1:  # BUY
            self.position += 1
            self.balance -= current_price
        elif action == 2:  # SELL
            if self.position > 0:
                self.position -= 1
                self.balance += current_price

        self.net_worth = self.balance + self.position * current_price

        # Return-based reward is more meaningful than raw dollar delta.
        reward = np.log((self.net_worth + 1e-8) / (prev_worth + 1e-8))

        self.current_step += 1
        terminated = self.current_step >= self.max_steps
        truncated = False

        info = {
            'net_worth': self.net_worth,
            'balance': self.balance,
            'position': self.position,
            'execution_price': current_price,
            'prev_net_worth': prev_worth,
        }

        return self._get_observation(), float(reward), terminated, truncated, info


# =========================
# HELPERS
# =========================
def compute_entropy(probs: np.ndarray) -> float:
    """Normalized entropy in [0, 1]."""
    entropy = -np.sum(probs * np.log(probs + 1e-10))
    return float(entropy / np.log(len(probs)))


def get_model_probs(model: PPO, obs: np.ndarray) -> np.ndarray:
    obs_tensor = model.policy.obs_to_tensor(obs)[0]
    dist = model.policy.get_distribution(obs_tensor)
    probs = dist.distribution.probs.detach().cpu().numpy()[0]
    return probs


def predict_full_dataset(
    model: PPO,
    data: pd.DataFrame,
    window_size: int = 10,
    initial_balance: float = 1000.0,
    deterministic: bool = True,
) -> pd.DataFrame:
    env = TradingEnv(data, window_size=window_size, initial_balance=initial_balance)

    obs, _ = env.reset()
    terminated = False
    truncated = False
    records = []

    while not (terminated or truncated):
        current_idx = env.current_step
        probs = get_model_probs(model, obs)
        entropy = compute_entropy(probs)
        greedy_action = int(np.argmax(probs))
        action, _ = model.predict(obs, deterministic=deterministic)
        action = int(action)

        next_obs, reward, terminated, truncated, info = env.step(action)

        row = data.iloc[current_idx].to_dict()
        row.update({
            'action': action,
            'greedy_action': greedy_action,
            'prob_hold': float(probs[0]),
            'prob_buy': float(probs[1]),
            'prob_sell': float(probs[2]),
            'entropy': entropy,
            'net_worth': float(info['net_worth']),
            'reward': float(reward),
        })

        records.append(row)
        obs = next_obs

    return pd.DataFrame(records)


# =========================
# WALK-FORWARD SPLIT
# =========================
def walk_forward_split(data: pd.DataFrame, n_splits: int = 3) -> list[tuple[pd.DataFrame, pd.DataFrame]]:
    if n_splits < 1:
        raise ValueError("n_splits must be at least 1")

    split_size = len(data) // (n_splits + 1)
    if split_size <= 0:
        raise ValueError("Not enough data for the requested number of splits")

    splits = []
    for i in range(n_splits):
        train_end = split_size * (i + 1)
        test_end = split_size * (i + 2)

        train = data.iloc[:train_end].copy()
        test = data.iloc[train_end:test_end].copy()

        if len(test) == 0:
            break

        splits.append((train, test))

    return splits


# =========================
# PPO CONFIG
# =========================
policy_kwargs = dict(
    net_arch=dict(pi=[64, 64], vf=[64, 64]),
    activation_fn=nn.Tanh,
)


# =========================
# TRAINING + EVALUATION
# =========================
def main():
    df = load_dataset(DATA_PATH)
    splits = walk_forward_split(df, n_splits=3)

    all_results = []

    for i, (train_raw, test_raw) in enumerate(splits):
        print(f"\n=== WALK FORWARD ITERATION {i + 1} ===")

        train_data, test_data, scaler = fit_transform_split(train_raw, test_raw)

        train_env = TradingEnv(train_data)
        test_env = TradingEnv(test_data)

        model = PPO(
            "MlpPolicy",
            train_env,
            policy_kwargs=policy_kwargs,
            verbose=0,
            learning_rate=3e-4,
            n_steps=256,
            batch_size=64,
            gamma=0.99,
        )

        # Train
        model.learn(total_timesteps=10_000)

        # =========================
        # TEST SPLIT EVALUATION
        # =========================
        obs, _ = test_env.reset()
        terminated = False
        truncated = False
        records = []

        while not (terminated or truncated):
            current_idx = test_env.current_step

            probs = get_model_probs(model, obs)
            entropy = compute_entropy(probs)
            greedy_action = int(np.argmax(probs))

            # Evaluate PPO directly instead of adding epsilon-greedy noise.
            action, _ = model.predict(obs, deterministic=True)
            action = int(action)

            next_obs, reward, terminated, truncated, info = test_env.step(action)

            original_row = test_data.iloc[current_idx].to_dict()
            original_row.update({
                'action': action,
                'greedy_action': greedy_action,
                'prob_hold': float(probs[0]),
                'prob_buy': float(probs[1]),
                'prob_sell': float(probs[2]),
                'entropy': entropy,
                'net_worth': float(info['net_worth']),
                'reward': float(reward),
            })

            records.append(original_row)
            obs = next_obs

        final_worth = float(test_env.net_worth)
        print(f"Final Net Worth: {final_worth:.2f}")

        eval_df = pd.DataFrame(records)
        eval_filename = f"evaluation_split_{i + 1}.csv"
        eval_df.to_csv(eval_filename, index=False)
        print(f"Saved: {eval_filename}")

        all_results.append(final_worth)

        # =========================
        # FULL DATASET PREDICTIONS
        # Uses the scaler fit on this TRAIN split.
        # This file is diagnostic only; it is not an out-of-sample metric.
        full_feature_df = transform_full_dataset(df, scaler)
        full_pred_df = predict_full_dataset(
            model=model,
            data=full_feature_df,
            window_size=train_env.window_size,
            initial_balance=train_env.initial_balance,
            deterministic=True,
        )

        full_pred_filename = f"full_dataset_predictions_split_{i + 1}.csv"
        full_pred_df.to_csv(full_pred_filename, index=False)
        print(f"Saved: {full_pred_filename}")

    # =========================
    # SUMMARY
    # =========================
    print("\n=== WALK-FORWARD RESULTS ===")
    for i, res in enumerate(all_results):
        print(f"Split {i + 1}: {res:.2f}")

    print(f"Average Net Worth: {np.mean(all_results):.2f}")


if __name__ == "__main__":
    main()

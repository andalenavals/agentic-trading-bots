import pandas as pd
import matplotlib.pyplot as plt

# ============================================================
# CONFIG
# ============================================================
CSV_PATH = "evaluation_full_dataset_split_1_multi_asset_infinite_capital.csv"
COMMODITIES = ["aluminium_lme", "copper_lme", "nickel_lme"]

ACTION_COLORS = {
    "hold": "blue",
    "buy": "green",
    "sell": "red",
}

# ============================================================
# LOAD DATA
# ============================================================
df = pd.read_csv(CSV_PATH)

if "date" in df.columns:
    df["date"] = pd.to_datetime(df["date"])
    x_axis = df["date"]
else:
    x_axis = df.index

# ============================================================
# PLOTTING PER COMMODITY
# ============================================================
for commodity in COMMODITIES:
    price_col = f"price_{commodity}"
    #action_col = f"action_name_{commodity}"
    action_col = f"greedy_action_name_{commodity}"
    entropy_col = f"normalized_entropy_{commodity}"

    if price_col not in df.columns:
        raise ValueError(f"Missing column: {price_col}")

    y = df[price_col].values
    actions = df[action_col].astype(str).str.lower().values
    entropy = df[entropy_col].clip(0, 1).values

    fig, ax = plt.subplots(figsize=(12, 6))

    # Base faint line
    ax.plot(x_axis, y, color="black", alpha=0.2, linewidth=1)

    # Colored segments
    for i in range(len(df) - 1):
        color = ACTION_COLORS.get(actions[i], "black")
        alpha = 1.0 #- entropy[i]
        alpha = max(0.05, min(1.0, alpha))  # keep visible

        ax.plot(
            x_axis[i:i+2],
            y[i:i+2],
            color=color,
            alpha=alpha,
            linewidth=2.5
        )

    # Optional: scatter points
    for xi, yi, a, e in zip(x_axis, y, actions, entropy):
        ax.scatter(
            xi, yi,
            color=ACTION_COLORS.get(a, "black"),
            alpha=max(0.05, 1.0 - e),
            s=15
        )

    # Titles & labels
    ax.set_title(f"{commodity} — Actions (color) & Confidence (alpha)")
    ax.set_ylabel("Price")
    ax.set_xlabel("Date")
    ax.grid(True, alpha=0.3)

    # Legend
    for label, color in ACTION_COLORS.items():
        ax.plot([], [], color=color, label=label)
    ax.legend(loc="upper left")

    plt.tight_layout()
    plt.show()

import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

# ============================================================
# CONFIG
# ============================================================
CSV_PATH = "evaluation_full_dataset_split_1_multi_asset.csv"
COMMODITIES = ["aluminium_lme", "copper_lme", "nickel_lme"]

# action colors
ACTION_COLORS = {
    "hold": "gray",
    "buy": "green",
    "sell": "red",
}

# ============================================================
# LOAD DATA
# ============================================================
df = pd.read_csv(CSV_PATH)

if "date" in df.columns:
    df["date"] = pd.to_datetime(df["date"])

# ============================================================
# PLOT
# ============================================================
fig, axes = plt.subplots(
    nrows=len(COMMODITIES),
    ncols=1,
    figsize=(16, 10),
    sharex=True
)

if len(COMMODITIES) == 1:
    axes = [axes]

for ax, commodity in zip(axes, COMMODITIES):
    price_col = f"price_{commodity}"
    action_col = f"action_name_{commodity}"
    entropy_col = f"normalized_entropy_{commodity}"

    if price_col not in df.columns:
        raise ValueError(f"Missing column: {price_col}")
    if action_col not in df.columns:
        raise ValueError(f"Missing column: {action_col}")
    if entropy_col not in df.columns:
        raise ValueError(f"Missing column: {entropy_col}")

    x = df["date"] if "date" in df.columns else df.index
    y = df[price_col].values
    actions = df[action_col].astype(str).str.lower().values
    entropies = df[entropy_col].clip(0, 1).values

    # plot faint base line
    ax.plot(x, y, linewidth=1.0, alpha=0.25)

    # color each segment by action, alpha = 1 - entropy
    for i in range(len(df) - 1):
        action = actions[i]
        color = ACTION_COLORS.get(action, "black")
        alpha = float(1.0 - entropies[i])
        alpha = max(0.05, min(1.0, alpha))  # keep minimally visible

        ax.plot(
            x[i:i+2],
            y[i:i+2],
            color=color,
            alpha=alpha,
            linewidth=2.5
        )

    # optional markers at each point
    point_colors = [ACTION_COLORS.get(a, "black") for a in actions]
    point_alphas = [max(0.05, min(1.0, 1.0 - e)) for e in entropies]

    for xi, yi, c, a in zip(x, y, point_colors, point_alphas):
        ax.scatter(xi, yi, color=c, alpha=a, s=18)

    ax.set_title(commodity)
    ax.set_ylabel("Price")
    ax.grid(True, alpha=0.3)

# legend
legend_elements = [
    Line2D([0], [0], color="green", lw=2.5, label="buy"),
    Line2D([0], [0], color="red", lw=2.5, label="sell"),
    Line2D([0], [0], color="gray", lw=2.5, label="hold"),
]
axes[0].legend(handles=legend_elements, loc="upper left")

axes[-1].set_xlabel("Date" if "date" in df.columns else "Index")
fig.suptitle("Commodity Prices Colored by Action, Alpha = 1 - Normalized Entropy", fontsize=14)
plt.tight_layout()
plt.show()

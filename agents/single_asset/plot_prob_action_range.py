import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
import matplotlib.patches as mpatches

# =========================
# User settings
# =========================
file_path = "full_dataset_predictions_split_1.csv"

# Set to None to use full range
start_date = "2023-01-01"
end_date = "2023-06-30"

output_file = "time_series_plot.png"

# =========================
# Load the data
# =========================
df = pd.read_csv(file_path)

# Convert date column to datetime
df["date"] = pd.to_datetime(df["date"])

# Sort by date
df = df.sort_values("date")

# =========================
# Filter by time range
# =========================
if start_date is not None:
    start_date = pd.to_datetime(start_date)
    df = df[df["date"] >= start_date]

if end_date is not None:
    end_date = pd.to_datetime(end_date)
    df = df[df["date"] <= end_date]

if df.empty:
    raise ValueError("No data available in the selected date range.")

# =========================
# Get dominant action and confidence
# =========================
actions = df["greedy_action"]

probs = df[["prob_hold", "prob_buy", "prob_sell"]].values
entropy = df["entropy"]

# Your logic (confidence from entropy)
confidence = 1 - entropy

color_map = {0: "blue", 1: "green", 2: "red"}
colors = [color_map[a] for a in actions]

# =========================
# Plot
# =========================
plt.figure(figsize=(12, 6))

# Plot with varying transparency
for i in range(len(df)):
    plt.scatter(
        df["date"].iloc[i],
        df["price"].iloc[i],
        color=colors[i],
        #alpha=confidence.iloc[i]
        alpha=1
    )

plt.plot(df["date"], df["price"], alpha=0.3)

# Labels and title
plt.xlabel("Date")
plt.ylabel("Price")
plt.title("Time Series with Action Coloring (Confidence Weighted)")

# Legend
legend_handles = [
    mpatches.Patch(color="blue", label="Hold"),
    mpatches.Patch(color="green", label="Buy"),
    mpatches.Patch(color="red", label="Sell"),
]
plt.legend(handles=legend_handles)

plt.grid(True)
plt.tight_layout()

# Save as PNG
plt.savefig(output_file, dpi=300)

# Optional: also show it
plt.show()

print(f"Plot saved as {output_file}")
print(f"Date range used: {df['date'].min().date()} to {df['date'].max().date()}")

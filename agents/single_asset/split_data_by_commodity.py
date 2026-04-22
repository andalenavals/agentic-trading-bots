import pandas as pd
import os

# Input file
input_file = "prices_with_sentiment.csv"

# Output directory (optional)
output_dir = "commodity_outputs"
os.makedirs(output_dir, exist_ok=True)

# Read CSV
df = pd.read_csv(input_file)

# Check column name (adjust if needed)
column_name = "commodity"

# Get unique categories
categories = df[column_name].dropna().unique()

# Loop through each category and save separate CSV
for category in categories:
    filtered_df = df[df[column_name] == category]
    
    # Clean filename (remove spaces, special chars if needed)
    safe_category = str(category).replace(" ", "_").replace("/", "_")
    
    output_file = os.path.join(output_dir, f"{safe_category}.csv")
    
    filtered_df.to_csv(output_file, index=False)

print(f"Created {len(categories)} files in '{output_dir}' folder.")

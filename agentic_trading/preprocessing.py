from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path
from typing import Iterable


COMMODITY_ALIASES = {
    "aluminium": "aluminium_lme",
    "aluminum": "aluminium_lme",
    "aluminium_lme": "aluminium_lme",
    "copper": "copper_lme",
    "copper_lme": "copper_lme",
    "nickel": "nickel_lme",
    "nickel_lme": "nickel_lme",
}

POSITIVE_WORDS = {
    "boost",
    "bullish",
    "expand",
    "gain",
    "growth",
    "high",
    "improve",
    "rally",
    "rebound",
    "recovery",
    "rise",
    "strong",
    "support",
    "surge",
    "tight",
}

NEGATIVE_WORDS = {
    "bearish",
    "concern",
    "crash",
    "cut",
    "decline",
    "drop",
    "fall",
    "loss",
    "low",
    "pressure",
    "risk",
    "slump",
    "threat",
    "weak",
}


def normalize_commodity(value: str) -> str | None:
    return COMMODITY_ALIASES.get(value.strip().lower())


def day(value: str) -> str:
    return value[:10]


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: Iterable[dict[str, object]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def score_sentiment(text: str) -> dict[str, float]:
    words = {token.strip(".,;:!?()[]{}\"'").lower() for token in text.split()}
    positive_hits = len(words & POSITIVE_WORDS)
    negative_hits = len(words & NEGATIVE_WORDS)

    if not text.strip() or (positive_hits == 0 and negative_hits == 0):
        return {
            "negative": 0.0,
            "neutral": 1.0,
            "positive": 0.0,
            "sentiment_score": 0.0,
        }

    total = positive_hits + negative_hits
    positive = positive_hits / total
    negative = negative_hits / total
    neutral = max(0.0, 1.0 - min(1.0, total / 12))
    scale = 1.0 - neutral

    return {
        "negative": negative * scale,
        "neutral": neutral,
        "positive": positive * scale,
        "sentiment_score": (positive - negative) * scale,
    }


def build_prices_with_news(raw_prices: Path, raw_news: Path, output: Path) -> None:
    prices = read_csv(raw_prices)
    news = read_csv(raw_news)
    news_by_day_commodity: dict[tuple[str, str], list[str]] = defaultdict(list)

    for item in news:
        summary = item.get("summary", "").strip()
        if not summary:
            continue

        for impacted in item.get("impacted_commodity", "").split(","):
            commodity = normalize_commodity(impacted)
            if commodity:
                news_by_day_commodity[(day(item.get("date", "")), commodity)].append(summary)

    rows = []
    for price in prices:
        commodity = normalize_commodity(price.get("commodity", ""))
        if not commodity:
            continue

        summaries = news_by_day_commodity.get((day(price.get("date", "")), commodity), [])
        rows.append(
            {
                "date": price.get("date", ""),
                "commodity": commodity,
                "price": price.get("price", ""),
                "news_summary": " | ".join(summaries),
            }
        )

    write_csv(output, rows, ["date", "commodity", "price", "news_summary"])


def add_sentiment(input_csv: Path, output_csv: Path) -> None:
    rows = []
    for row in read_csv(input_csv):
        sentiment = score_sentiment(row.get("news_summary", ""))
        rows.append({**row, **sentiment})

    write_csv(
        output_csv,
        rows,
        [
            "date",
            "commodity",
            "price",
            "news_summary",
            "negative",
            "neutral",
            "positive",
            "sentiment_score",
        ],
    )


def split_by_commodity(input_csv: Path, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    rows = read_csv(input_csv)

    for row in rows:
        commodity = normalize_commodity(row.get("commodity", ""))
        if commodity:
            grouped[commodity].append(row)

    fieldnames = list(rows[0].keys()) if rows else []
    for commodity, commodity_rows in grouped.items():
        write_csv(output_dir / f"{commodity}.csv", commodity_rows, fieldnames)


def load_config(path: Path) -> dict[str, str]:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def run_all(config: dict[str, str]) -> None:
    prices_with_news = Path(config["prices_with_news"])
    prices_with_sentiment = Path(config["prices_with_sentiment"])

    build_prices_with_news(
        raw_prices=Path(config["raw_prices"]),
        raw_news=Path(config["raw_news"]),
        output=prices_with_news,
    )
    add_sentiment(prices_with_news, prices_with_sentiment)
    split_by_commodity(
        input_csv=prices_with_sentiment,
        output_dir=Path(config["commodity_training_dir"]),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate derived visualization and training data from raw CSVs.")
    parser.add_argument("command", choices=["all", "prices-with-news", "sentiment", "split"])
    parser.add_argument("--config", default="configs/preprocessing/default.json")
    args = parser.parse_args()

    config = load_config(Path(args.config))
    if args.command == "all":
        run_all(config)
    elif args.command == "prices-with-news":
        build_prices_with_news(Path(config["raw_prices"]), Path(config["raw_news"]), Path(config["prices_with_news"]))
    elif args.command == "sentiment":
        add_sentiment(Path(config["prices_with_news"]), Path(config["prices_with_sentiment"]))
    elif args.command == "split":
        split_by_commodity(Path(config["prices_with_sentiment"]), Path(config["commodity_training_dir"]))


if __name__ == "__main__":
    main()


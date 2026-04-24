from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
from collections import defaultdict
from pathlib import Path
from typing import Any

from agentic_trading.finbert_sentiment import (
    DEFAULT_FINBERT_MODEL,
    aggregate_finbert_scores,
    neutral_finbert_sentiment,
    score_finbert_events,
)
from agentic_trading.pipeline_common import (
    load_json_config,
    read_csv_rows,
    require_columns,
    require_config_keys,
    write_csv_rows,
)


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

REQUIRED_CONFIG_KEYS = {
    "raw_prices",
    "raw_news",
    "news_events",
    "prices_with_news",
    "prices_with_sentiment",
    "commodity_training_dir",
}


@dataclass(frozen=True)
class PreprocessingConfig:
    raw_prices: Path
    raw_news: Path
    news_events: Path
    finbert_event_sentiment: Path
    prices_with_news: Path
    prices_with_sentiment: Path
    commodity_training_dir: Path
    include_finbert: bool
    finbert_model: str
    finbert_batch_size: int

    @classmethod
    def from_mapping(cls, config: dict[str, Any]) -> "PreprocessingConfig":
        require_config_keys(config, REQUIRED_CONFIG_KEYS, "preprocessing config")
        return cls(
            raw_prices=Path(str(config["raw_prices"])),
            raw_news=Path(str(config["raw_news"])),
            news_events=Path(str(config["news_events"])),
            finbert_event_sentiment=Path(str(config.get("finbert_event_sentiment", "data/processed/finbert_event_sentiment.csv"))),
            prices_with_news=Path(str(config["prices_with_news"])),
            prices_with_sentiment=Path(str(config["prices_with_sentiment"])),
            commodity_training_dir=Path(str(config["commodity_training_dir"])),
            include_finbert=bool(config.get("include_finbert", True)),
            finbert_model=str(config.get("finbert_model", DEFAULT_FINBERT_MODEL)),
            finbert_batch_size=int(config.get("finbert_batch_size", 16)),
        )


def normalize_commodity(value: str) -> str | None:
    return COMMODITY_ALIASES.get(value.strip().lower())


def day(value: str) -> str:
    return value[:10]


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


def normalized_news_events(raw_news: Path) -> list[dict[str, object]]:
    news = read_csv_rows(raw_news)
    require_columns(news, {"date", "title", "url", "impacted_commodity", "summary"}, raw_news)
    events = []

    for index, item in enumerate(news, start=1):
        summary = item.get("summary", "").strip()
        if not summary:
            continue

        impacted = sorted(
            {
                commodity
                for commodity in (normalize_commodity(value) for value in item.get("impacted_commodity", "").split(","))
                if commodity
            }
        )
        if not impacted:
            continue

        events.append(
            {
                "event_id": f"news_{index:06d}",
                "date": item.get("date", ""),
                "event_day": day(item.get("date", "")),
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "impacted_commodities": ";".join(impacted),
                "summary": summary,
            }
        )

    return events


def write_news_events(raw_news: Path, output: Path) -> None:
    write_csv_rows(
        output,
        normalized_news_events(raw_news),
        ["event_id", "date", "event_day", "title", "url", "impacted_commodities", "summary"],
    )


def build_prices_with_news(
    raw_prices: Path,
    raw_news: Path,
    output: Path,
    events: list[dict[str, object]] | None = None,
) -> None:
    prices = read_csv_rows(raw_prices)
    require_columns(prices, {"date", "commodity", "price"}, raw_prices)
    news_by_day_commodity: dict[tuple[str, str], list[dict[str, object]]] = defaultdict(list)

    for event in events if events is not None else normalized_news_events(raw_news):
        for commodity in str(event["impacted_commodities"]).split(";"):
            news_by_day_commodity[(str(event["event_day"]), commodity)].append(event)

    rows = []
    for price in prices:
        commodity = normalize_commodity(price.get("commodity", ""))
        if not commodity:
            continue

        events = news_by_day_commodity.get((day(price.get("date", "")), commodity), [])
        rows.append(
            {
                "date": price.get("date", ""),
                "commodity": commodity,
                "price": price.get("price", ""),
                "news_ids": ";".join(str(event["event_id"]) for event in events),
                "news_count": len(events),
                "news_items": json.dumps(events, ensure_ascii=True, separators=(",", ":")),
                "news_summary": " | ".join(str(event["summary"]) for event in events),
            }
        )

    write_csv_rows(output, rows, ["date", "commodity", "price", "news_ids", "news_count", "news_items", "news_summary"])


def add_sentiment(
    input_csv: Path,
    output_csv: Path,
    finbert_scores_by_event: dict[str, dict[str, float | str]] | None = None,
) -> None:
    source_rows = read_csv_rows(input_csv)
    require_columns(source_rows, {"date", "commodity", "price", "news_summary"}, input_csv)
    rows = []
    for row in source_rows:
        sentiment = score_sentiment(row.get("news_summary", ""))
        event_ids = [event_id for event_id in row.get("news_ids", "").split(";") if event_id]
        finbert = (
            aggregate_finbert_scores(event_ids, finbert_scores_by_event)
            if finbert_scores_by_event is not None
            else neutral_finbert_sentiment()
        )
        rows.append({**row, **sentiment, **finbert})

    write_csv_rows(
        output_csv,
        rows,
        [
            "date",
            "commodity",
            "price",
            "news_ids",
            "news_count",
            "news_items",
            "news_summary",
            "negative",
            "neutral",
            "positive",
            "sentiment_score",
            "finbert_negative",
            "finbert_neutral",
            "finbert_positive",
            "finbert_sentiment_score",
            "finbert_label",
        ],
    )


def split_by_commodity(input_csv: Path, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    rows = read_csv_rows(input_csv)
    require_columns(rows, {"date", "commodity", "price", "sentiment_score"}, input_csv)

    for row in rows:
        commodity = normalize_commodity(row.get("commodity", ""))
        if commodity:
            grouped[commodity].append(row)

    fieldnames = list(rows[0].keys()) if rows else []
    for commodity, commodity_rows in grouped.items():
        write_csv_rows(output_dir / f"{commodity}.csv", commodity_rows, fieldnames)

def load_preprocessing_config(path: str | Path) -> PreprocessingConfig:
    return PreprocessingConfig.from_mapping(load_json_config(path))


def generate_finbert_scores(config: PreprocessingConfig, events: list[dict[str, object]]) -> dict[str, dict[str, float | str]] | None:
    if not config.include_finbert:
        return None

    return score_finbert_events(
        events=events,
        cache_path=config.finbert_event_sentiment,
        model_name=config.finbert_model,
        batch_size=config.finbert_batch_size,
    )


def run_all(config: PreprocessingConfig) -> None:
    events = normalized_news_events(config.raw_news)

    write_csv_rows(
        config.news_events,
        events,
        ["event_id", "date", "event_day", "title", "url", "impacted_commodities", "summary"],
    )
    build_prices_with_news(
        raw_prices=config.raw_prices,
        raw_news=config.raw_news,
        output=config.prices_with_news,
        events=events,
    )
    finbert_scores = generate_finbert_scores(config, events)
    add_sentiment(config.prices_with_news, config.prices_with_sentiment, finbert_scores)
    split_by_commodity(
        input_csv=config.prices_with_sentiment,
        output_dir=config.commodity_training_dir,
    )


def run_command(command: str, config: PreprocessingConfig) -> None:
    if command == "all":
        run_all(config)
        return

    if command == "prices-with-news":
        build_prices_with_news(config.raw_prices, config.raw_news, config.prices_with_news)
        return

    if command == "news-events":
        write_news_events(config.raw_news, config.news_events)
        return

    events = normalized_news_events(config.raw_news)
    if command == "finbert":
        generate_finbert_scores(config, events)
        return

    if command == "sentiment":
        add_sentiment(config.prices_with_news, config.prices_with_sentiment, generate_finbert_scores(config, events))
        return

    if command == "split":
        split_by_commodity(config.prices_with_sentiment, config.commodity_training_dir)
        return

    raise ValueError(f"Unsupported preprocessing command {command!r}.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate derived visualization and training data from raw CSVs.")
    parser.add_argument("command", choices=["all", "news-events", "prices-with-news", "finbert", "sentiment", "split"])
    parser.add_argument("--config", default="configs/preprocessing/default.json")
    args = parser.parse_args()
    run_command(args.command, load_preprocessing_config(args.config))


if __name__ == "__main__":
    main()

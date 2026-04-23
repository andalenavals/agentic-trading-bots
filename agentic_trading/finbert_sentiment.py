from __future__ import annotations

import csv
from pathlib import Path
from typing import Iterable


DEFAULT_FINBERT_MODEL = "ProsusAI/finbert"

FINBERT_FIELDNAMES = [
    "event_id",
    "finbert_negative",
    "finbert_neutral",
    "finbert_positive",
    "finbert_sentiment_score",
    "finbert_label",
]


def neutral_finbert_sentiment() -> dict[str, float | str]:
    return {
        "finbert_negative": 0.0,
        "finbert_neutral": 1.0,
        "finbert_positive": 0.0,
        "finbert_sentiment_score": 0.0,
        "finbert_label": "neutral",
    }


def load_finbert_event_scores(path: Path) -> dict[str, dict[str, float | str]]:
    if not path.exists():
        return {}

    with path.open(newline="", encoding="utf-8") as handle:
        rows = csv.DictReader(handle)
        return {
            row["event_id"]: {
                "finbert_negative": float(row.get("finbert_negative") or 0.0),
                "finbert_neutral": float(row.get("finbert_neutral") or 0.0),
                "finbert_positive": float(row.get("finbert_positive") or 0.0),
                "finbert_sentiment_score": float(row.get("finbert_sentiment_score") or 0.0),
                "finbert_label": row.get("finbert_label") or "neutral",
            }
            for row in rows
            if row.get("event_id")
        }


def write_finbert_event_scores(path: Path, scores: dict[str, dict[str, float | str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FINBERT_FIELDNAMES)
        writer.writeheader()
        for event_id in sorted(scores):
            writer.writerow({"event_id": event_id, **scores[event_id]})


def aggregate_finbert_scores(event_ids: Iterable[str], scores_by_event: dict[str, dict[str, float | str]]) -> dict[str, float | str]:
    scores = [scores_by_event[event_id] for event_id in event_ids if event_id in scores_by_event]
    if not scores:
        return neutral_finbert_sentiment()

    negative = sum(float(score["finbert_negative"]) for score in scores) / len(scores)
    neutral = sum(float(score["finbert_neutral"]) for score in scores) / len(scores)
    positive = sum(float(score["finbert_positive"]) for score in scores) / len(scores)
    sentiment_score = positive - negative
    label = max(
        [
            ("negative", negative),
            ("neutral", neutral),
            ("positive", positive),
        ],
        key=lambda item: item[1],
    )[0]

    return {
        "finbert_negative": negative,
        "finbert_neutral": neutral,
        "finbert_positive": positive,
        "finbert_sentiment_score": sentiment_score,
        "finbert_label": label,
    }


def score_finbert_events(
    events: list[dict[str, object]],
    cache_path: Path,
    model_name: str = DEFAULT_FINBERT_MODEL,
    batch_size: int = 16,
) -> dict[str, dict[str, float | str]]:
    cached = load_finbert_event_scores(cache_path)
    missing_events = [event for event in events if str(event["event_id"]) not in cached]
    if not missing_events:
        return cached

    try:
        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer
    except ImportError as error:
        raise RuntimeError(
            "FinBERT preprocessing requires the optional sentiment dependencies. "
            "Install them with `python3 -m pip install .[sentiment]`."
        ) from error

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSequenceClassification.from_pretrained(model_name, use_safetensors=False)
    model.eval()
    labels = {
        "negative": "finbert_negative",
        "neutral": "finbert_neutral",
        "positive": "finbert_positive",
    }
    scored = dict(cached)

    for start in range(0, len(missing_events), batch_size):
        batch = missing_events[start : start + batch_size]
        texts = [str(event.get("summary") or event.get("title") or "") for event in batch]
        inputs = tokenizer(texts, padding=True, truncation=True, return_tensors="pt")
        with torch.no_grad():
            probabilities_batch = torch.softmax(model(**inputs).logits, dim=-1).tolist()

        for event, probabilities_list in zip(batch, probabilities_batch, strict=True):
            probabilities = {
                "finbert_negative": 0.0,
                "finbert_neutral": 0.0,
                "finbert_positive": 0.0,
            }
            for index, probability in enumerate(probabilities_list):
                label = model.config.id2label[index].lower()
                if label in labels:
                    probabilities[labels[label]] = float(probability)

            positive = probabilities["finbert_positive"]
            negative = probabilities["finbert_negative"]
            neutral = probabilities["finbert_neutral"]
            label = max(
                [
                    ("negative", negative),
                    ("neutral", neutral),
                    ("positive", positive),
                ],
                key=lambda item: item[1],
            )[0]
            scored[str(event["event_id"])] = {
                **probabilities,
                "finbert_sentiment_score": positive - negative,
                "finbert_label": label,
            }

        write_finbert_event_scores(cache_path, scored)
        print(f"FinBERT scored {min(start + batch_size, len(missing_events))}/{len(missing_events)} missing events.")

    return scored

from __future__ import annotations

import csv
import json
import tempfile
import unittest
from pathlib import Path

from agentic_trading.prediction_baseline import generate_full_predictions
from agentic_trading.prediction_ridge_arx import generate_full_predictions as generate_ridge_predictions
from agentic_trading.preprocessing import add_sentiment, build_prices_with_news, split_by_commodity, write_news_events


class PreprocessingTest(unittest.TestCase):
    def test_pages_config_keeps_finbert_enabled(self) -> None:
        config_path = Path(__file__).resolve().parents[1] / "configs" / "preprocessing" / "pages.json"
        with config_path.open(encoding="utf-8") as handle:
            config = json.load(handle)

        self.assertTrue(config.get("include_finbert"))

    def test_pipeline_generates_visualization_and_training_files(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            prices = root / "prices.csv"
            news = root / "news.csv"
            prices_with_news = root / "processed" / "prices_with_news.csv"
            prices_with_sentiment = root / "processed" / "prices_with_sentiment.csv"
            news_events = root / "processed" / "news_events.csv"
            training_dir = root / "training"

            self.write_csv(
                prices,
                ["date", "commodity", "price"],
                [
                    {"date": "2026-01-01", "commodity": "copper", "price": "9000"},
                    {"date": "2026-01-01", "commodity": "nickel", "price": "16000"},
                ],
            )
            self.write_csv(
                news,
                ["date", "title", "url", "impacted_commodity", "summary"],
                [
                    {
                        "date": "2026-01-01T08:00:00",
                        "title": "Copper and nickel rally",
                        "url": "https://example.com/news",
                        "impacted_commodity": "copper,nickel",
                        "summary": "Copper and nickel rally on strong demand",
                    }
                ],
            )

            write_news_events(news, news_events)
            build_prices_with_news(prices, news, prices_with_news)
            add_sentiment(
                prices_with_news,
                prices_with_sentiment,
                {
                    "news_000001": {
                        "finbert_negative": 0.05,
                        "finbert_neutral": 0.15,
                        "finbert_positive": 0.80,
                        "finbert_sentiment_score": 0.75,
                        "finbert_label": "positive",
                    }
                },
            )
            split_by_commodity(prices_with_sentiment, training_dir)

            event_rows = self.read_csv(news_events)
            self.assertEqual(event_rows[0]["impacted_commodities"], "copper_lme;nickel_lme")

            rows = self.read_csv(prices_with_sentiment)
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[0]["commodity"], "copper_lme")
            self.assertEqual(rows[0]["news_count"], "1")
            self.assertTrue(rows[0]["news_ids"].startswith("news_"))
            news_items = json.loads(rows[0]["news_items"])
            self.assertEqual(len(news_items), 1)
            self.assertEqual(news_items[0]["title"], "Copper and nickel rally")
            self.assertIn("rally", rows[0]["news_summary"])
            self.assertGreater(float(rows[0]["sentiment_score"]), 0)
            self.assertEqual(rows[0]["finbert_label"], "positive")
            self.assertGreater(float(rows[0]["finbert_sentiment_score"]), 0)
            self.assertTrue((training_dir / "copper_lme.csv").exists())
            self.assertTrue((training_dir / "nickel_lme.csv").exists())

    def test_prediction_baseline_generates_test_forecasts(self) -> None:
        rows = [
            {"date": "2026-01-01", "commodity": "copper_lme", "price": "100"},
            {"date": "2026-01-02", "commodity": "copper_lme", "price": "102"},
            {"date": "2026-01-03", "commodity": "copper_lme", "price": "101"},
            {"date": "2026-01-04", "commodity": "copper_lme", "price": "103"},
            {"date": "2026-01-05", "commodity": "copper_lme", "price": "104"},
            {"date": "2026-01-06", "commodity": "copper_lme", "price": "106"},
        ]

        generated = generate_full_predictions(rows, split=1, train_end=3)

        self.assertEqual(len(generated), len(rows))
        self.assertEqual(generated[0]["phase"], "train")
        self.assertEqual(generated[3]["phase"], "test")
        self.assertEqual(generated[2]["predicted_price"], "")
        self.assertNotEqual(generated[3]["predicted_price"], "")
        self.assertNotEqual(generated[4]["error"], "")
        first_pred = float(generated[3]["predicted_price"])
        second_pred = float(generated[4]["predicted_price"])
        anchor = float(generated[4]["alpha"])
        slope = float(generated[4]["beta"])
        self.assertAlmostEqual(first_pred, anchor + slope)
        self.assertAlmostEqual(second_pred, anchor + 2 * slope)

    def test_ridge_arx_generates_pointwise_test_forecasts(self) -> None:
        rows = []
        for index in range(40):
            rows.append(
                {
                    "date": f"2026-02-{index + 1:02d}",
                    "commodity": "copper_lme",
                    "price": str(100 + index * 1.5 + (index % 3) * 0.2),
                    "news_count": str((index % 4) + 1),
                    "sentiment_score": str(0.1 if index % 2 == 0 else -0.05),
                    "finbert_sentiment_score": str(0.2 if index % 3 == 0 else -0.03),
                    "positive": "0.4",
                    "neutral": "0.4",
                    "negative": "0.2",
                    "finbert_positive": "0.5",
                    "finbert_neutral": "0.3",
                    "finbert_negative": "0.2",
                }
            )

        generated = generate_ridge_predictions(
            rows,
            split=1,
            train_end=25,
            ridge_alpha=1.0,
            evaluation_mode="observed_history",
        )
        test_rows = [row for row in generated if row["phase"] == "test" and row["predicted_price"] != ""]

        self.assertGreater(len(test_rows), 0)
        self.assertTrue(any(float(row["absolute_error"]) > 0 for row in test_rows))
        self.assertNotEqual(test_rows[0]["predicted_price"], rows[25]["price"])
        self.assertNotEqual(test_rows[0]["predicted_price"], test_rows[1]["predicted_price"])

    def test_ridge_arx_does_not_use_current_target_price(self) -> None:
        rows = []
        for index in range(40):
            rows.append(
                {
                    "date": f"2026-03-{index + 1:02d}",
                    "commodity": "copper_lme",
                    "price": str(100 + index * 2.0),
                    "news_count": str((index % 3) + 1),
                    "sentiment_score": str(0.05),
                    "finbert_sentiment_score": str(0.08),
                    "positive": "0.4",
                    "neutral": "0.4",
                    "negative": "0.2",
                    "finbert_positive": "0.5",
                    "finbert_neutral": "0.3",
                    "finbert_negative": "0.2",
                }
            )

        original = generate_ridge_predictions(
            rows,
            split=1,
            train_end=25,
            ridge_alpha=1.0,
            evaluation_mode="recursive_path",
        )
        mutated_rows = [row.copy() for row in rows]
        mutated_rows[25]["price"] = "1000"
        mutated = generate_ridge_predictions(
            mutated_rows,
            split=1,
            train_end=25,
            ridge_alpha=1.0,
            evaluation_mode="recursive_path",
        )

        original_test = [row for row in original if row["phase"] == "test" and row["predicted_price"] != ""]
        mutated_test = [row for row in mutated if row["phase"] == "test" and row["predicted_price"] != ""]

        self.assertGreaterEqual(len(original_test), 2)
        self.assertEqual(original_test[0]["predicted_price"], mutated_test[0]["predicted_price"])
        self.assertEqual(original_test[1]["predicted_price"], mutated_test[1]["predicted_price"])

    def test_ridge_arx_observed_history_uses_real_previous_test_point(self) -> None:
        rows = []
        for index in range(40):
            rows.append(
                {
                    "date": f"2026-04-{index + 1:02d}",
                    "commodity": "copper_lme",
                    "price": str(120 + index * 1.0),
                    "news_count": str((index % 3) + 1),
                    "sentiment_score": str(0.05),
                    "finbert_sentiment_score": str(0.08),
                    "positive": "0.4",
                    "neutral": "0.4",
                    "negative": "0.2",
                    "finbert_positive": "0.5",
                    "finbert_neutral": "0.3",
                    "finbert_negative": "0.2",
                }
            )

        original = generate_ridge_predictions(
            rows,
            split=1,
            train_end=25,
            ridge_alpha=1.0,
            evaluation_mode="observed_history",
        )
        mutated_rows = [row.copy() for row in rows]
        mutated_rows[25]["price"] = "1000"
        mutated = generate_ridge_predictions(
            mutated_rows,
            split=1,
            train_end=25,
            ridge_alpha=1.0,
            evaluation_mode="observed_history",
        )

        original_test = [row for row in original if row["phase"] == "test" and row["predicted_price"] != ""]
        mutated_test = [row for row in mutated if row["phase"] == "test" and row["predicted_price"] != ""]

        self.assertGreaterEqual(len(original_test), 2)
        self.assertEqual(original_test[0]["predicted_price"], mutated_test[0]["predicted_price"])
        self.assertNotEqual(original_test[1]["predicted_price"], mutated_test[1]["predicted_price"])

    def test_ridge_arx_price_only_ignores_sentiment_columns(self) -> None:
        rows = []
        for index in range(40):
            rows.append(
                {
                    "date": f"2026-05-{index + 1:02d}",
                    "commodity": "copper_lme",
                    "price": str(150 + index * 1.4 + (index % 4) * 0.3),
                    "news_count": str((index % 5) + 1),
                    "sentiment_score": str(0.15 if index % 2 == 0 else -0.12),
                    "finbert_sentiment_score": str(0.25 if index % 3 == 0 else -0.2),
                    "positive": "0.6",
                    "neutral": "0.25",
                    "negative": "0.15",
                    "finbert_positive": "0.65",
                    "finbert_neutral": "0.2",
                    "finbert_negative": "0.15",
                }
            )

        mutated_rows = [row.copy() for row in rows]
        for row in mutated_rows:
            row["news_count"] = "99"
            row["sentiment_score"] = "-0.95"
            row["finbert_sentiment_score"] = "0.92"
            row["positive"] = "0.05"
            row["neutral"] = "0.05"
            row["negative"] = "0.90"
            row["finbert_positive"] = "0.90"
            row["finbert_neutral"] = "0.05"
            row["finbert_negative"] = "0.05"

        price_only_original = generate_ridge_predictions(
            rows,
            split=1,
            train_end=25,
            ridge_alpha=1.0,
            evaluation_mode="observed_history",
            include_sentiment_features=False,
        )
        price_only_mutated = generate_ridge_predictions(
            mutated_rows,
            split=1,
            train_end=25,
            ridge_alpha=1.0,
            evaluation_mode="observed_history",
            include_sentiment_features=False,
        )
        sentiment_original = generate_ridge_predictions(
            rows,
            split=1,
            train_end=25,
            ridge_alpha=1.0,
            evaluation_mode="observed_history",
            include_sentiment_features=True,
        )
        sentiment_mutated = generate_ridge_predictions(
            mutated_rows,
            split=1,
            train_end=25,
            ridge_alpha=1.0,
            evaluation_mode="observed_history",
            include_sentiment_features=True,
        )

        price_only_pairs = [
            (original["predicted_price"], mutated["predicted_price"])
            for original, mutated in zip(price_only_original, price_only_mutated, strict=True)
            if original["phase"] == "test" and original["predicted_price"] != ""
        ]
        sentiment_pairs = [
            (original["predicted_price"], mutated["predicted_price"])
            for original, mutated in zip(sentiment_original, sentiment_mutated, strict=True)
            if original["phase"] == "test" and original["predicted_price"] != ""
        ]

        self.assertTrue(price_only_pairs)
        self.assertTrue(sentiment_pairs)
        self.assertTrue(all(original == mutated for original, mutated in price_only_pairs))
        self.assertTrue(any(original != mutated for original, mutated in sentiment_pairs))

    def test_pipeline_fails_fast_when_required_columns_are_missing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            prices = root / "prices.csv"
            news = root / "news.csv"

            self.write_csv(prices, ["date", "price"], [{"date": "2026-01-01", "price": "9000"}])
            self.write_csv(
                news,
                ["date", "title", "url", "impacted_commodity", "summary"],
                [
                    {
                        "date": "2026-01-01",
                        "title": "Copper rally",
                        "url": "https://example.com/news",
                        "impacted_commodity": "copper",
                        "summary": "Copper rally",
                    }
                ],
            )

            with self.assertRaisesRegex(ValueError, "missing required columns"):
                build_prices_with_news(prices, news, root / "out.csv")

    @staticmethod
    def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)

    @staticmethod
    def read_csv(path: Path) -> list[dict[str, str]]:
        with path.open(newline="", encoding="utf-8") as handle:
            return list(csv.DictReader(handle))


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import csv
import tempfile
import unittest
from pathlib import Path

from agentic_trading.preprocessing import add_sentiment, build_prices_with_news, split_by_commodity


class PreprocessingTest(unittest.TestCase):
    def test_pipeline_generates_visualization_and_training_files(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            prices = root / "prices.csv"
            news = root / "news.csv"
            prices_with_news = root / "processed" / "prices_with_news.csv"
            prices_with_sentiment = root / "processed" / "prices_with_sentiment.csv"
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
                ["date", "impacted_commodity", "summary"],
                [
                    {
                        "date": "2026-01-01T08:00:00",
                        "impacted_commodity": "copper,nickel",
                        "summary": "Copper and nickel rally on strong demand",
                    }
                ],
            )

            build_prices_with_news(prices, news, prices_with_news)
            add_sentiment(prices_with_news, prices_with_sentiment)
            split_by_commodity(prices_with_sentiment, training_dir)

            rows = self.read_csv(prices_with_sentiment)
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[0]["commodity"], "copper_lme")
            self.assertIn("rally", rows[0]["news_summary"])
            self.assertGreater(float(rows[0]["sentiment_score"]), 0)
            self.assertTrue((training_dir / "copper_lme.csv").exists())
            self.assertTrue((training_dir / "nickel_lme.csv").exists())

    def test_pipeline_fails_fast_when_required_columns_are_missing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            prices = root / "prices.csv"
            news = root / "news.csv"

            self.write_csv(prices, ["date", "price"], [{"date": "2026-01-01", "price": "9000"}])
            self.write_csv(
                news,
                ["date", "impacted_commodity", "summary"],
                [{"date": "2026-01-01", "impacted_commodity": "copper", "summary": "Copper rally"}],
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

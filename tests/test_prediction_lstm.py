from __future__ import annotations

import importlib.util
import unittest

from agentic_trading.prediction_lstm import generate_full_predictions


HAS_TORCH = importlib.util.find_spec("torch") is not None


@unittest.skipUnless(HAS_TORCH, "torch is not installed")
class LSTMPredictionTest(unittest.TestCase):
    def test_lstm_generates_observed_and_recursive_forecasts(self) -> None:
        rows = build_rows()
        model_params = {
            "sequence_length": 8,
            "hidden_size": 12,
            "epochs": 60,
            "learning_rate": 0.02,
            "batch_size": 8,
            "seed": 7,
        }

        observed = generate_full_predictions(
            rows,
            split=1,
            train_end=32,
            include_sentiment_features=True,
            evaluation_mode="observed_history",
            model_params=model_params,
        )
        recursive = generate_full_predictions(
            rows,
            split=1,
            train_end=32,
            include_sentiment_features=True,
            evaluation_mode="recursive_path",
            model_params=model_params,
        )

        observed_test = [row for row in observed if row["phase"] == "test" and row["predicted_price"] != ""]
        recursive_test = [row for row in recursive if row["phase"] == "test" and row["predicted_price"] != ""]

        self.assertTrue(observed_test)
        self.assertTrue(recursive_test)
        self.assertTrue(any(float(row["absolute_error"]) > 0 for row in observed_test))
        self.assertTrue(any(float(row["absolute_error"]) > 0 for row in recursive_test))
        self.assertTrue(any(left["predicted_price"] != right["predicted_price"] for left, right in zip(observed_test, recursive_test, strict=True)))

    def test_lstm_recursive_path_does_not_use_current_target_price(self) -> None:
        rows = build_rows()
        model_params = {
            "sequence_length": 8,
            "hidden_size": 12,
            "epochs": 60,
            "learning_rate": 0.02,
            "batch_size": 8,
            "seed": 7,
        }

        original = generate_full_predictions(
            rows,
            split=1,
            train_end=32,
            include_sentiment_features=True,
            evaluation_mode="recursive_path",
            model_params=model_params,
        )

        mutated_rows = [row.copy() for row in rows]
        mutated_rows[32]["price"] = "100000"
        mutated = generate_full_predictions(
            mutated_rows,
            split=1,
            train_end=32,
            include_sentiment_features=True,
            evaluation_mode="recursive_path",
            model_params=model_params,
        )

        original_test = [row for row in original if row["phase"] == "test" and row["predicted_price"] != ""]
        mutated_test = [row for row in mutated if row["phase"] == "test" and row["predicted_price"] != ""]

        self.assertGreaterEqual(len(original_test), 2)
        self.assertEqual(original_test[0]["predicted_price"], mutated_test[0]["predicted_price"])
        self.assertEqual(original_test[1]["predicted_price"], mutated_test[1]["predicted_price"])

    def test_lstm_price_only_ignores_sentiment_features(self) -> None:
        rows = build_sentiment_sensitive_rows()
        model_params = {
            "sequence_length": 8,
            "hidden_size": 12,
            "epochs": 80,
            "learning_rate": 0.02,
            "batch_size": 8,
            "seed": 7,
        }
        mutated_rows = [row.copy() for row in rows]
        for row in mutated_rows:
            row["news_count"] = "99"
            row["sentiment_score"] = "-0.95"
            row["finbert_sentiment_score"] = "0.95"
            row["positive"] = "0.05"
            row["neutral"] = "0.05"
            row["negative"] = "0.90"
            row["finbert_positive"] = "0.90"
            row["finbert_neutral"] = "0.05"
            row["finbert_negative"] = "0.05"

        price_only_original = generate_full_predictions(
            rows,
            split=1,
            train_end=32,
            include_sentiment_features=False,
            evaluation_mode="observed_history",
            model_params=model_params,
        )
        price_only_mutated = generate_full_predictions(
            mutated_rows,
            split=1,
            train_end=32,
            include_sentiment_features=False,
            evaluation_mode="observed_history",
            model_params=model_params,
        )
        sentiment_original = generate_full_predictions(
            rows,
            split=1,
            train_end=32,
            include_sentiment_features=True,
            evaluation_mode="observed_history",
            model_params=model_params,
        )
        sentiment_mutated = generate_full_predictions(
            mutated_rows,
            split=1,
            train_end=32,
            include_sentiment_features=True,
            evaluation_mode="observed_history",
            model_params=model_params,
        )

        price_only_pairs = [
            (left["predicted_price"], right["predicted_price"])
            for left, right in zip(price_only_original, price_only_mutated, strict=True)
            if left["phase"] == "test" and left["predicted_price"] != ""
        ]
        sentiment_pairs = [
            (left["predicted_price"], right["predicted_price"])
            for left, right in zip(sentiment_original, sentiment_mutated, strict=True)
            if left["phase"] == "test" and left["predicted_price"] != ""
        ]

        self.assertTrue(price_only_pairs)
        self.assertTrue(sentiment_pairs)
        self.assertTrue(all(left == right for left, right in price_only_pairs))
        self.assertTrue(any(left != right for left, right in sentiment_pairs))


def build_rows() -> list[dict[str, str]]:
    rows = []
    for index in range(56):
        price = 100 + index * 1.2 + ((index % 5) - 2) * 0.4
        rows.append(
            {
                "date": f"2026-01-{index + 1:02d}",
                "commodity": "copper_lme",
                "price": f"{price:.4f}",
                "news_count": str((index % 4) + 1),
                "sentiment_score": f"{0.2 if index % 2 == 0 else -0.1:.4f}",
                "finbert_sentiment_score": f"{0.25 if index % 3 == 0 else -0.08:.4f}",
                "positive": "0.50",
                "neutral": "0.30",
                "negative": "0.20",
                "finbert_positive": "0.55",
                "finbert_neutral": "0.25",
                "finbert_negative": "0.20",
            }
        )
    return rows


def build_sentiment_sensitive_rows() -> list[dict[str, str]]:
    rows = []
    for index in range(56):
        sentiment = 0.85 if index % 2 == 0 else -0.85
        price = 200 + index * 0.25 + sentiment * 4.0
        rows.append(
            {
                "date": f"2026-02-{index + 1:02d}",
                "commodity": "copper_lme",
                "price": f"{price:.4f}",
                "news_count": str((index % 3) + 1),
                "sentiment_score": f"{sentiment:.4f}",
                "finbert_sentiment_score": f"{(sentiment * 0.9):.4f}",
                "positive": "0.80" if sentiment > 0 else "0.10",
                "neutral": "0.10",
                "negative": "0.10" if sentiment > 0 else "0.80",
                "finbert_positive": "0.75" if sentiment > 0 else "0.12",
                "finbert_neutral": "0.15",
                "finbert_negative": "0.10" if sentiment > 0 else "0.73",
            }
        )
    return rows


if __name__ == "__main__":
    unittest.main()

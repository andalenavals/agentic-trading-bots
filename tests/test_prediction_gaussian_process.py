from __future__ import annotations

import importlib.util
import unittest

from agentic_trading.prediction_gaussian_process import generate_full_predictions


HAS_SKLEARN = importlib.util.find_spec("sklearn") is not None


@unittest.skipUnless(HAS_SKLEARN, "scikit-learn is not installed")
class GaussianProcessPredictionTest(unittest.TestCase):
    def test_gaussian_process_generates_observed_and_recursive_forecasts(self) -> None:
        rows = build_rows()
        model_params = build_model_params(max_train_samples=16)

        observed = generate_full_predictions(
            rows,
            split=1,
            train_end=48,
            include_sentiment_features=True,
            evaluation_mode="observed_history",
            model_params=model_params,
        )
        recursive = generate_full_predictions(
            rows,
            split=1,
            train_end=48,
            include_sentiment_features=True,
            evaluation_mode="recursive_path",
            model_params=model_params,
        )

        observed_test = [row for row in observed if row["phase"] == "test" and row["predicted_price"] != ""]
        recursive_test = [row for row in recursive if row["phase"] == "test" and row["predicted_price"] != ""]

        self.assertTrue(observed_test)
        self.assertTrue(recursive_test)
        self.assertEqual(float(observed_test[0]["alpha"]), 16.0)
        self.assertTrue(any(float(row["absolute_error"]) > 0 for row in observed_test))
        self.assertTrue(any(float(row["absolute_error"]) > 0 for row in recursive_test))
        self.assertIn(observed_test[0]["predicted_direction"], {"up", "down", "flat"})
        self.assertIn(observed_test[0]["actual_direction"], {"up", "down", "flat"})
        self.assertIn(observed_test[0]["direction_correct"], {0, 1})
        self.assertTrue(
            any(left["predicted_price"] != right["predicted_price"] for left, right in zip(observed_test, recursive_test, strict=True))
        )

    def test_gaussian_process_recursive_path_does_not_use_current_target_price(self) -> None:
        rows = build_rows()
        model_params = build_model_params(max_train_samples=16)

        original = generate_full_predictions(
            rows,
            split=1,
            train_end=48,
            include_sentiment_features=True,
            evaluation_mode="recursive_path",
            model_params=model_params,
        )

        mutated_rows = [row.copy() for row in rows]
        mutated_rows[48]["price"] = "100000"
        mutated = generate_full_predictions(
            mutated_rows,
            split=1,
            train_end=48,
            include_sentiment_features=True,
            evaluation_mode="recursive_path",
            model_params=model_params,
        )

        original_test = [row for row in original if row["phase"] == "test" and row["predicted_price"] != ""]
        mutated_test = [row for row in mutated if row["phase"] == "test" and row["predicted_price"] != ""]

        self.assertGreaterEqual(len(original_test), 2)
        self.assertEqual(original_test[0]["predicted_price"], mutated_test[0]["predicted_price"])
        self.assertEqual(original_test[1]["predicted_price"], mutated_test[1]["predicted_price"])

    def test_gaussian_process_price_only_ignores_sentiment_features(self) -> None:
        rows = build_sentiment_sensitive_rows()
        model_params = build_model_params(max_train_samples=18)
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
            train_end=48,
            include_sentiment_features=False,
            evaluation_mode="observed_history",
            model_params=model_params,
        )
        price_only_mutated = generate_full_predictions(
            mutated_rows,
            split=1,
            train_end=48,
            include_sentiment_features=False,
            evaluation_mode="observed_history",
            model_params=model_params,
        )
        sentiment_original = generate_full_predictions(
            rows,
            split=1,
            train_end=48,
            include_sentiment_features=True,
            evaluation_mode="observed_history",
            model_params=model_params,
        )
        sentiment_mutated = generate_full_predictions(
            mutated_rows,
            split=1,
            train_end=48,
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


def build_model_params(**overrides: float | int) -> dict[str, float | int]:
    params: dict[str, float | int] = {
        "max_train_samples": 24,
        "signal_variance": 1.0,
        "length_scale": 1.25,
        "noise_level": 0.25,
        "alpha": 0.0001,
        "n_restarts_optimizer": 0,
    }
    params.update(overrides)
    return params


def build_rows() -> list[dict[str, str]]:
    rows = []
    for index in range(72):
        sentiment = 0.35 if index % 2 == 0 else -0.18
        seasonal = ((index % 6) - 2.5) * 0.45
        price = 150 + index * 0.9 + seasonal + sentiment * 3.5
        rows.append(
            {
                "date": f"2026-03-{index + 1:02d}",
                "commodity": "copper_lme",
                "price": f"{price:.4f}",
                "news_count": str((index % 4) + 1),
                "sentiment_score": f"{sentiment:.4f}",
                "finbert_sentiment_score": f"{(sentiment * 0.9):.4f}",
                "positive": "0.60" if sentiment > 0 else "0.20",
                "neutral": "0.20",
                "negative": "0.20" if sentiment > 0 else "0.60",
                "finbert_positive": "0.58" if sentiment > 0 else "0.18",
                "finbert_neutral": "0.22",
                "finbert_negative": "0.20" if sentiment > 0 else "0.60",
            }
        )
    return rows


def build_sentiment_sensitive_rows() -> list[dict[str, str]]:
    rows = []
    for index in range(72):
        sentiment = 0.9 if index % 2 == 0 else -0.9
        price = 220 + index * 0.35 + sentiment * 4.5 + ((index % 5) - 2) * 0.2
        rows.append(
            {
                "date": f"2026-04-{index + 1:02d}",
                "commodity": "copper_lme",
                "price": f"{price:.4f}",
                "news_count": str((index % 3) + 1),
                "sentiment_score": f"{sentiment:.4f}",
                "finbert_sentiment_score": f"{(sentiment * 0.92):.4f}",
                "positive": "0.82" if sentiment > 0 else "0.08",
                "neutral": "0.10",
                "negative": "0.08" if sentiment > 0 else "0.82",
                "finbert_positive": "0.78" if sentiment > 0 else "0.09",
                "finbert_neutral": "0.13",
                "finbert_negative": "0.09" if sentiment > 0 else "0.78",
            }
        )
    return rows


if __name__ == "__main__":
    unittest.main()

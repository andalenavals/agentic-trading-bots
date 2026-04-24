from __future__ import annotations

import importlib.util
import unittest

from agentic_trading.prediction_arimax import generate_full_predictions


HAS_STATSMODELS = importlib.util.find_spec("statsmodels") is not None


@unittest.skipUnless(HAS_STATSMODELS, "statsmodels is not installed")
class ARIMAXPredictionTest(unittest.TestCase):
    def test_arimax_generates_observed_and_recursive_forecasts(self) -> None:
        rows = build_rows()
        model_params = build_model_params(max_train_samples=18)

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
        self.assertEqual(float(observed_test[0]["alpha"]), 2.0)
        self.assertEqual(float(observed_test[0]["beta"]), 1.0)
        self.assertTrue(any(float(row["absolute_error"]) > 0 for row in observed_test))
        self.assertTrue(any(float(row["absolute_error"]) > 0 for row in recursive_test))
        self.assertIn(observed_test[0]["predicted_direction"], {"up", "down", "flat"})
        self.assertIn(observed_test[0]["actual_direction"], {"up", "down", "flat"})
        self.assertIn(observed_test[0]["direction_correct"], {0, 1})
        self.assertTrue(
            any(left["predicted_price"] != right["predicted_price"] for left, right in zip(observed_test, recursive_test, strict=True))
        )
        self.assertLess(
            max(float(row["predicted_price"]) for row in recursive_test),
            max(float(row["price"]) for row in rows[48:]) * 1.6,
        )

    def test_arimax_recursive_path_does_not_use_current_target_price(self) -> None:
        rows = build_rows()
        model_params = build_model_params(max_train_samples=18)

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

    def test_arimax_price_only_ignores_sentiment_features(self) -> None:
        rows = build_sentiment_sensitive_rows()
        model_params = build_model_params(max_train_samples=20)
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


def build_model_params(**overrides: float | int | str) -> dict[str, float | int | str]:
    params: dict[str, float | int | str] = {
        "max_train_samples": 24,
        "ar_order": 2,
        "ma_order": 1,
        "maxiter": 40,
        "trend": "c",
        "center_blend": 0.9,
    }
    params.update(overrides)
    return params


def build_rows() -> list[dict[str, str]]:
    rows = []
    for index in range(72):
        sentiment = 0.32 if index % 2 == 0 else -0.16
        seasonal = ((index % 6) - 2.5) * 0.45
        price = 150 + index * 0.85 + seasonal + sentiment * 3.8
        rows.append(
            {
                "date": f"2026-05-{index + 1:02d}",
                "commodity": "copper_lme",
                "price": f"{price:.4f}",
                "news_count": str((index % 4) + 1),
                "sentiment_score": f"{sentiment:.4f}",
                "finbert_sentiment_score": f"{(sentiment * 0.9):.4f}",
                "positive": "0.60" if sentiment > 0 else "0.18",
                "neutral": "0.22",
                "negative": "0.18" if sentiment > 0 else "0.60",
                "finbert_positive": "0.58" if sentiment > 0 else "0.17",
                "finbert_neutral": "0.24",
                "finbert_negative": "0.18" if sentiment > 0 else "0.59",
            }
        )
    return rows


def build_sentiment_sensitive_rows() -> list[dict[str, str]]:
    rows = []
    for index in range(72):
        sentiment = 0.92 if index % 2 == 0 else -0.92
        price = 210 + index * 0.40 + sentiment * 4.8 + ((index % 5) - 2) * 0.2
        rows.append(
            {
                "date": f"2026-06-{index + 1:02d}",
                "commodity": "copper_lme",
                "price": f"{price:.4f}",
                "news_count": str((index % 3) + 1),
                "sentiment_score": f"{sentiment:.4f}",
                "finbert_sentiment_score": f"{(sentiment * 0.92):.4f}",
                "positive": "0.84" if sentiment > 0 else "0.07",
                "neutral": "0.09",
                "negative": "0.07" if sentiment > 0 else "0.84",
                "finbert_positive": "0.80" if sentiment > 0 else "0.08",
                "finbert_neutral": "0.12",
                "finbert_negative": "0.08" if sentiment > 0 else "0.80",
            }
        )
    return rows


if __name__ == "__main__":
    unittest.main()

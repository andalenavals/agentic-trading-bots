from __future__ import annotations

import importlib.util
import unittest

from agentic_trading.prediction_lightgbm_direct import generate_full_predictions as generate_direct_predictions
from agentic_trading.prediction_lightgbm import generate_full_predictions


HAS_LIGHTGBM = importlib.util.find_spec("lightgbm") is not None


@unittest.skipUnless(HAS_LIGHTGBM, "lightgbm is not installed")
class LightGBMPredictionTest(unittest.TestCase):
    def test_lightgbm_generates_observed_and_recursive_forecasts(self) -> None:
        rows = build_rows()

        observed = generate_full_predictions(
            rows,
            split=1,
            train_end=32,
            include_sentiment_features=True,
            evaluation_mode="observed_history",
        )
        recursive = generate_full_predictions(
            rows,
            split=1,
            train_end=32,
            include_sentiment_features=True,
            evaluation_mode="recursive_path",
        )

        observed_test = [row for row in observed if row["phase"] == "test" and row["predicted_price"] != ""]
        recursive_test = [row for row in recursive if row["phase"] == "test" and row["predicted_price"] != ""]

        self.assertTrue(observed_test)
        self.assertTrue(recursive_test)
        self.assertTrue(any(float(row["absolute_error"]) > 0 for row in observed_test))
        self.assertTrue(any(float(row["absolute_error"]) > 0 for row in recursive_test))
        self.assertTrue(any(left["predicted_price"] != right["predicted_price"] for left, right in zip(observed_test, recursive_test, strict=True)))

    def test_lightgbm_recursive_path_does_not_use_current_target_price(self) -> None:
        rows = build_rows()
        original = generate_full_predictions(
            rows,
            split=1,
            train_end=32,
            include_sentiment_features=True,
            evaluation_mode="recursive_path",
        )

        mutated_rows = [row.copy() for row in rows]
        mutated_rows[32]["price"] = "100000"
        mutated = generate_full_predictions(
            mutated_rows,
            split=1,
            train_end=32,
            include_sentiment_features=True,
            evaluation_mode="recursive_path",
        )

        original_test = [row for row in original if row["phase"] == "test" and row["predicted_price"] != ""]
        mutated_test = [row for row in mutated if row["phase"] == "test" and row["predicted_price"] != ""]

        self.assertGreaterEqual(len(original_test), 2)
        self.assertEqual(original_test[0]["predicted_price"], mutated_test[0]["predicted_price"])
        self.assertEqual(original_test[1]["predicted_price"], mutated_test[1]["predicted_price"])

    def test_lightgbm_price_only_ignores_sentiment_features(self) -> None:
        rows = build_sentiment_sensitive_rows()
        model_params = {
            "num_boost_round": 240,
            "num_leaves": 9,
            "min_data_in_leaf": 1,
            "learning_rate": 0.05,
            "feature_fraction": 1.0,
            "bagging_fraction": 1.0,
            "bagging_freq": 0,
            "lambda_l2": 0.0,
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

    def test_lightgbm_direct_generates_test_forecasts(self) -> None:
        rows = build_rows()
        generated = generate_direct_predictions(
            rows,
            split=1,
            train_end=32,
            include_sentiment_features=True,
        )

        test_rows = [row for row in generated if row["phase"] == "test"]
        predicted_rows = [row for row in test_rows if row["predicted_price"] != ""]

        self.assertTrue(predicted_rows)
        self.assertTrue(any(float(row["absolute_error"]) > 0 for row in predicted_rows))
        self.assertEqual(test_rows[0]["predicted_price"], predicted_rows[0]["predicted_price"])
        self.assertIn(predicted_rows[0]["predicted_direction"], {"up", "down", "flat"})
        self.assertIn(predicted_rows[0]["actual_direction"], {"up", "down", "flat"})
        self.assertIn(predicted_rows[0]["direction_correct"], {0, 1})

    def test_lightgbm_direct_uses_training_boundary_only(self) -> None:
        rows = build_rows()
        original = generate_direct_predictions(
            rows,
            split=1,
            train_end=32,
            include_sentiment_features=True,
        )

        mutated_rows = [row.copy() for row in rows]
        mutated_rows[32]["price"] = "100000"
        mutated = generate_direct_predictions(
            mutated_rows,
            split=1,
            train_end=32,
            include_sentiment_features=True,
        )

        original_test = [row for row in original if row["phase"] == "test"]
        mutated_test = [row for row in mutated if row["phase"] == "test"]
        comparable_pairs = [
            (left["predicted_price"], right["predicted_price"])
            for left, right in zip(original_test, mutated_test, strict=True)
            if left["predicted_price"] != "" and right["predicted_price"] != ""
        ]

        self.assertTrue(comparable_pairs)
        self.assertTrue(all(left == right for left, right in comparable_pairs))

    def test_lightgbm_direct_price_only_ignores_sentiment_features(self) -> None:
        rows = build_direct_sentiment_sensitive_rows()
        model_params = {
            "num_boost_round": 240,
            "num_leaves": 9,
            "min_data_in_leaf": 1,
            "learning_rate": 0.05,
            "feature_fraction": 1.0,
            "bagging_fraction": 1.0,
            "bagging_freq": 0,
            "lambda_l2": 0.0,
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

        price_only_original = generate_direct_predictions(
            rows,
            split=1,
            train_end=33,
            include_sentiment_features=False,
            model_params=model_params,
        )
        price_only_mutated = generate_direct_predictions(
            mutated_rows,
            split=1,
            train_end=33,
            include_sentiment_features=False,
            model_params=model_params,
        )
        sentiment_original = generate_direct_predictions(
            rows,
            split=1,
            train_end=33,
            include_sentiment_features=True,
            model_params=model_params,
        )
        sentiment_mutated = generate_direct_predictions(
            mutated_rows,
            split=1,
            train_end=33,
            include_sentiment_features=True,
            model_params=model_params,
        )

        price_only_pairs = [
            (left["predicted_price"], right["predicted_price"])
            for left, right in zip(price_only_original, price_only_mutated, strict=True)
            if left["phase"] == "test" and left["predicted_price"] != "" and right["predicted_price"] != ""
        ]
        sentiment_pairs = [
            (left["predicted_price"], right["predicted_price"])
            for left, right in zip(sentiment_original, sentiment_mutated, strict=True)
            if left["phase"] == "test" and left["predicted_price"] != "" and right["predicted_price"] != ""
        ]
        self.assertTrue(price_only_pairs)
        self.assertTrue(sentiment_pairs)
        self.assertTrue(all(left == right for left, right in price_only_pairs))
        self.assertTrue(all(left is not None and right is not None for left, right in sentiment_pairs))


def build_rows() -> list[dict[str, str]]:
    rows = []
    for index in range(56):
        rows.append(
            {
                "date": f"2026-06-{index + 1:02d}",
                "commodity": "copper_lme",
                "price": str(180 + index * 0.9 + (index % 5) * 0.35 + (index % 7) * 0.12),
                "news_count": str((index % 4) + 1),
                "sentiment_score": str(0.22 if index % 2 == 0 else -0.18),
                "finbert_sentiment_score": str(0.28 if index % 3 == 0 else -0.14),
                "positive": "0.55",
                "neutral": "0.25",
                "negative": "0.20",
                "finbert_positive": "0.60",
                "finbert_neutral": "0.22",
                "finbert_negative": "0.18",
            }
        )
    return rows


def build_sentiment_sensitive_rows() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for pair in range(40):
        signal = 0.9 if ((pair * pair + 3 * pair) % 7) in {0, 2, 5} else -0.9
        event_day = pair * 2 + 1
        rows.append(
            {
                "date": f"2026-07-{event_day:02d}",
                "commodity": "copper_lme",
                "price": "100",
                "news_count": "1",
                "sentiment_score": str(signal),
                "finbert_sentiment_score": str(signal),
                "positive": "0.70" if signal > 0 else "0.10",
                "neutral": "0.20",
                "negative": "0.10" if signal > 0 else "0.70",
                "finbert_positive": "0.75" if signal > 0 else "0.08",
                "finbert_neutral": "0.17",
                "finbert_negative": "0.08" if signal > 0 else "0.75",
            }
        )
        rows.append(
            {
                "date": f"2026-07-{event_day + 1:02d}",
                "commodity": "copper_lme",
                "price": "104" if signal > 0 else "96",
                "news_count": "1",
                "sentiment_score": "0.0",
                "finbert_sentiment_score": "0.0",
                "positive": "0.33",
                "neutral": "0.34",
                "negative": "0.33",
                "finbert_positive": "0.33",
                "finbert_neutral": "0.34",
                "finbert_negative": "0.33",
            }
        )

    return rows


def build_direct_sentiment_sensitive_rows() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    day = 1
    for block in range(30):
        signal = 0.9 if block % 2 == 0 else -0.9
        next_price = 112 if signal > 0 else 88
        rows.extend([
            {
                "date": f"2026-08-{day:02d}",
                "commodity": "copper_lme",
                "price": "100",
                "news_count": "1",
                "sentiment_score": "0.0",
                "finbert_sentiment_score": "0.0",
                "positive": "0.33",
                "neutral": "0.34",
                "negative": "0.33",
                "finbert_positive": "0.33",
                "finbert_neutral": "0.34",
                "finbert_negative": "0.33",
            },
            {
                "date": f"2026-08-{day + 1:02d}",
                "commodity": "copper_lme",
                "price": "100",
                "news_count": "1",
                "sentiment_score": str(signal),
                "finbert_sentiment_score": str(signal),
                "positive": "0.70" if signal > 0 else "0.10",
                "neutral": "0.20",
                "negative": "0.10" if signal > 0 else "0.70",
                "finbert_positive": "0.75" if signal > 0 else "0.08",
                "finbert_neutral": "0.17",
                "finbert_negative": "0.08" if signal > 0 else "0.75",
            },
            {
                "date": f"2026-08-{day + 2:02d}",
                "commodity": "copper_lme",
                "price": str(next_price),
                "news_count": "1",
                "sentiment_score": "0.0",
                "finbert_sentiment_score": "0.0",
                "positive": "0.33",
                "neutral": "0.34",
                "negative": "0.33",
                "finbert_positive": "0.33",
                "finbert_neutral": "0.34",
                "finbert_negative": "0.33",
            },
        ])
        day += 3

    return rows


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import math
import unittest

from agentic_trading.prediction_features import (
    build_feature_vector,
    feature_names,
    log_returns,
    safe_log,
)


class PredictionFeaturesTest(unittest.TestCase):
    def test_feature_names_include_new_engineered_fields(self) -> None:
        names = feature_names([1, 2], [2], include_sentiment_features=True)

        self.assertIn("time_index", names)
        self.assertIn("log_return_acceleration", names)
        self.assertIn("day_of_week_sin", names)
        self.assertIn("day_of_week_cos", names)

    def test_feature_vector_emits_time_acceleration_and_day_of_week_encoding(self) -> None:
        rows = build_rows()
        prices = [float(row["price"]) for row in rows]
        log_prices = [safe_log(price) for price in prices]
        returns = log_returns(log_prices)

        names = feature_names([1, 2], [2], include_sentiment_features=True)
        values = build_feature_vector(
            rows,
            log_prices,
            returns,
            index=4,
            lags=[1, 2],
            windows=[2],
            include_sentiment_features=True,
        )
        mapped = dict(zip(names, values, strict=True))

        expected_time_index = 4 / (len(rows) - 1)
        expected_acceleration = returns[3] - returns[2]
        angle = 2.0 * math.pi * 4 / 7.0  # 2026-01-09 is a Friday

        self.assertAlmostEqual(mapped["time_index"], expected_time_index)
        self.assertAlmostEqual(mapped["log_return_acceleration"], expected_acceleration)
        self.assertAlmostEqual(mapped["day_of_week_sin"], math.sin(angle))
        self.assertAlmostEqual(mapped["day_of_week_cos"], math.cos(angle))


def build_rows() -> list[dict[str, str]]:
    prices = [100.0, 101.5, 103.0, 105.5, 108.0, 110.5]
    rows = []
    for index, price in enumerate(prices):
        rows.append(
            {
                "date": f"2026-01-{index + 5:02d}",
                "commodity": "copper_lme",
                "price": f"{price:.4f}",
                "news_count": str((index % 3) + 1),
                "sentiment_score": "0.10",
                "finbert_sentiment_score": "0.08",
                "positive": "0.50",
                "neutral": "0.30",
                "negative": "0.20",
                "finbert_positive": "0.52",
                "finbert_neutral": "0.28",
                "finbert_negative": "0.20",
            }
        )
    return rows


if __name__ == "__main__":
    unittest.main()

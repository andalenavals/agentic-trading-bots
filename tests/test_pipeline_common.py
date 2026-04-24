from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from agentic_trading.pipeline_common import resolve_input_files, walk_forward_boundaries
from agentic_trading.prediction_baseline import run as run_baseline_predictions
from agentic_trading.prediction_ridge_arx import run as run_ridge_predictions
from agentic_trading.preprocessing import PreprocessingConfig


class PipelineCommonTest(unittest.TestCase):
    def test_resolve_input_files_supports_directory_and_glob(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "a.csv").write_text("x\n1\n", encoding="utf-8")
            (root / "b.csv").write_text("x\n2\n", encoding="utf-8")
            (root / "ignore.txt").write_text("skip", encoding="utf-8")

            from_directory = resolve_input_files(str(root))
            from_glob = resolve_input_files(str(root / "*.csv"))

            self.assertEqual([path.name for path in from_directory], ["a.csv", "b.csv"])
            self.assertEqual([path.name for path in from_glob], ["a.csv", "b.csv"])

    def test_walk_forward_boundaries_are_stable(self) -> None:
        self.assertEqual(list(walk_forward_boundaries(12, 3)), [(1, 3), (2, 6), (3, 9)])

    def test_preprocessing_config_coerces_types(self) -> None:
        config = PreprocessingConfig.from_mapping(
            {
                "raw_prices": "data/raw/prices.csv",
                "raw_news": "data/raw/news.csv",
                "news_events": "data/processed/news_events.csv",
                "prices_with_news": "data/processed/prices_with_news.csv",
                "prices_with_sentiment": "data/processed/prices_with_sentiment.csv",
                "commodity_training_dir": "data/training/commodity_outputs",
                "include_finbert": True,
                "finbert_batch_size": 32,
            }
        )

        self.assertEqual(config.raw_prices, Path("data/raw/prices.csv"))
        self.assertTrue(config.include_finbert)
        self.assertEqual(config.finbert_batch_size, 32)
        self.assertEqual(config.finbert_event_sentiment, Path("data/processed/finbert_event_sentiment.csv"))

    def test_baseline_prediction_config_fails_fast_on_missing_columns(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            input_csv = root / "commodity.csv"
            output_dir = root / "predictions"
            config_path = root / "baseline.json"

            input_csv.write_text("date,commodity\n2026-01-01,copper_lme\n", encoding="utf-8")
            config_path.write_text(
                "\n".join(
                    [
                        "{",
                        f'  "input_csv": "{input_csv}",',
                        f'  "output_dir": "{output_dir}",',
                        '  "n_splits": 1',
                        "}",
                    ]
                ),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(ValueError, "missing required columns"):
                run_baseline_predictions(str(config_path))

    def test_baseline_runner_writes_observed_and_recursive_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            input_csv = root / "commodity.csv"
            output_dir = root / "predictions"
            config_path = root / "baseline.json"

            input_csv.write_text(
                "\n".join(
                    [
                        "date,commodity,price",
                        "2026-01-01,copper_lme,100",
                        "2026-01-02,copper_lme,101",
                        "2026-01-03,copper_lme,103",
                        "2026-01-04,copper_lme,104",
                    ]
                ),
                encoding="utf-8",
            )
            config_path.write_text(
                "\n".join(
                    [
                        "{",
                        f'  "input_csv": "{input_csv}",',
                        f'  "output_dir": "{output_dir}",',
                        '  "n_splits": 1',
                        "}",
                    ]
                ),
                encoding="utf-8",
            )

            run_baseline_predictions(str(config_path))

            self.assertTrue((output_dir / "full_dataset_predictions_copper_lme_split_1.csv").exists())
            self.assertTrue((output_dir / "full_dataset_predictions_copper_lme_split_1_recursive_path.csv").exists())

    def test_ridge_prediction_config_requires_sentiment_columns_when_enabled(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            input_csv = root / "commodity.csv"
            output_dir = root / "predictions"
            config_path = root / "ridge.json"

            input_csv.write_text(
                "\n".join(
                    [
                        "date,commodity,price",
                        "2026-01-01,copper_lme,100",
                        "2026-01-02,copper_lme,101",
                        "2026-01-03,copper_lme,102",
                        "2026-01-04,copper_lme,103",
                    ]
                ),
                encoding="utf-8",
            )
            config_path.write_text(
                "\n".join(
                    [
                        "{",
                        f'  "input_csv": "{input_csv}",',
                        f'  "output_dir": "{output_dir}",',
                        '  "n_splits": 1,',
                        '  "ridge_alpha": 1.0,',
                        '  "include_sentiment_features": true',
                        "}",
                    ]
                ),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(ValueError, "missing required columns"):
                run_ridge_predictions(str(config_path))


if __name__ == "__main__":
    unittest.main()

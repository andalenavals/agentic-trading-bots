import ar1BaselineConfig from "../../configs/predictions/ar1_baseline.json";
import lightgbmDirectPriceOnlyConfig from "../../configs/predictions/lightgbm_direct_price_only.json";
import lightgbmDirectSentimentConfig from "../../configs/predictions/lightgbm_direct_sentiment.json";
import lightgbmPriceOnlyConfig from "../../configs/predictions/lightgbm_price_only.json";
import lightgbmSentimentConfig from "../../configs/predictions/lightgbm_sentiment.json";
import ridgeArxPriceOnlyConfig from "../../configs/predictions/ridge_arx_price_only.json";
import ridgeArxSentimentConfig from "../../configs/predictions/ridge_arx_sentiment.json";
import type { PredictionEvaluationMode, PredictionModelKind } from "@/lib/types";

type PredictionConfig = {
  n_splits?: number;
  ridge_alpha?: number;
  lags?: number[];
  windows?: number[];
  include_sentiment_features?: boolean;
  num_boost_round?: number;
  learning_rate?: number;
  num_leaves?: number;
  min_data_in_leaf?: number;
  feature_fraction?: number;
  bagging_fraction?: number;
  bagging_freq?: number;
  lambda_l2?: number;
  seed?: number;
};

export type PredictionHyperparameter = {
  label: string;
  value: string;
};

export type PredictionModelInfo = {
  theory: string;
  hyperparameters: PredictionHyperparameter[];
};

const MODEL_CONFIGS: Record<PredictionModelKind, PredictionConfig> = {
  ar1_baseline: ar1BaselineConfig,
  ridge_arx_price_only: ridgeArxPriceOnlyConfig,
  ridge_arx_sentiment: ridgeArxSentimentConfig,
  lightgbm_price_only: lightgbmPriceOnlyConfig,
  lightgbm_sentiment: lightgbmSentimentConfig,
  lightgbm_direct_price_only: lightgbmDirectPriceOnlyConfig,
  lightgbm_direct_sentiment: lightgbmDirectSentimentConfig,
};

export function predictionModelInfo(model: PredictionModelKind): PredictionModelInfo {
  const config = MODEL_CONFIGS[model];

  if (model === "ar1_baseline") {
    return {
      theory:
        "Train-only trend baseline. It anchors on the last train price and extends the train slope through the test window.",
      hyperparameters: [
        hyperparameter("Forecast anchor", "last train price"),
        hyperparameter("Trend fit", "linear slope"),
      ],
    };
  }

  if (model === "ridge_arx_price_only" || model === "ridge_arx_sentiment") {
    return {
      theory:
        model === "ridge_arx_sentiment"
          ? "Linear ARX model with L2 regularization on lagged price features plus sentiment and news inputs."
          : "Linear autoregressive model with L2 regularization on lagged price and rolling-return features.",
      hyperparameters: [
        hyperparameter("Ridge alpha", formatScalar(config.ridge_alpha)),
        hyperparameter("Lags", formatList(config.lags)),
        hyperparameter("Windows", formatList(config.windows)),
        hyperparameter("Sentiment inputs", formatToggle(config.include_sentiment_features)),
      ],
    };
  }

  if (model === "lightgbm_direct_price_only" || model === "lightgbm_direct_sentiment") {
    return {
      theory:
        model === "lightgbm_direct_sentiment"
          ? "Direct multi-horizon LightGBM. It learns future offsets from the split boundary using price, news, and sentiment context."
          : "Direct multi-horizon LightGBM. It learns future offsets from the split boundary using price and rolling history only.",
      hyperparameters: lightgbmHyperparameters(config),
    };
  }

  return {
    theory:
      model === "lightgbm_sentiment"
        ? "Gradient-boosted trees for one-step return forecasts with lagged prices, volatility, and sentiment inputs."
        : "Gradient-boosted trees for one-step return forecasts with lagged prices and rolling volatility features.",
    hyperparameters: lightgbmHyperparameters(config),
  };
}

export function predictionEvaluationInfo(mode: PredictionEvaluationMode) {
  if (mode === "observed_history") {
    return "Each test point uses the real history available up to t-1 before forecasting the next step.";
  }
  if (mode === "recursive_path") {
    return "After test starts, each new forecast uses previous predicted values, so the path rolls forward on its own outputs.";
  }
  return "The model predicts horizons directly from the split boundary instead of stepping one day at a time.";
}

function lightgbmHyperparameters(config: PredictionConfig): PredictionHyperparameter[] {
  return [
    hyperparameter("Boost rounds", formatScalar(config.num_boost_round)),
    hyperparameter("Learning rate", formatScalar(config.learning_rate)),
    hyperparameter("Leaves", formatScalar(config.num_leaves)),
    hyperparameter("Min leaf rows", formatScalar(config.min_data_in_leaf)),
    hyperparameter("Lags", formatList(config.lags)),
    hyperparameter("Windows", formatList(config.windows)),
    hyperparameter("Feature fraction", formatScalar(config.feature_fraction)),
    hyperparameter("Bagging", formatBagging(config)),
    hyperparameter("L2", formatScalar(config.lambda_l2)),
    hyperparameter("Sentiment inputs", formatToggle(config.include_sentiment_features)),
    hyperparameter("Seed", formatScalar(config.seed)),
  ];
}

function hyperparameter(label: string, value: string): PredictionHyperparameter {
  return { label, value };
}

function formatList(values: number[] | undefined) {
  if (!values?.length) return "n/a";
  return values.join(", ");
}

function formatScalar(value: number | undefined) {
  return value === undefined ? "n/a" : String(value);
}

function formatToggle(value: boolean | undefined) {
  return value ? "on" : "off";
}

function formatBagging(config: PredictionConfig) {
  const fraction = formatScalar(config.bagging_fraction);
  const frequency = formatScalar(config.bagging_freq);
  return `${fraction} @ ${frequency}`;
}

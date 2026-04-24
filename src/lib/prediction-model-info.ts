import ar1BaselineConfig from "../../configs/predictions/ar1_baseline.json";
import arimaxPriceOnlyConfig from "../../configs/predictions/arimax_price_only.json";
import arimaxSentimentConfig from "../../configs/predictions/arimax_sentiment.json";
import gaussianProcessPriceOnlyConfig from "../../configs/predictions/gaussian_process_price_only.json";
import gaussianProcessSentimentConfig from "../../configs/predictions/gaussian_process_sentiment.json";
import lightgbmDirectPriceOnlyConfig from "../../configs/predictions/lightgbm_direct_price_only.json";
import lightgbmDirectSentimentConfig from "../../configs/predictions/lightgbm_direct_sentiment.json";
import lightgbmPriceOnlyConfig from "../../configs/predictions/lightgbm_price_only.json";
import lightgbmSentimentConfig from "../../configs/predictions/lightgbm_sentiment.json";
import lstmPriceOnlyConfig from "../../configs/predictions/lstm_price_only.json";
import lstmSentimentConfig from "../../configs/predictions/lstm_sentiment.json";
import ridgeArxPriceOnlyConfig from "../../configs/predictions/ridge_arx_price_only.json";
import ridgeArxSentimentConfig from "../../configs/predictions/ridge_arx_sentiment.json";
import type { PredictionEvaluationMode, PredictionModelKind } from "@/lib/types";

type PredictionConfig = {
  n_splits?: number;
  ridge_alpha?: number;
  lags?: number[];
  windows?: number[];
  include_sentiment_features?: boolean;
  ar_order?: number;
  ma_order?: number;
  maxiter?: number;
  trend?: string;
  num_boost_round?: number;
  learning_rate?: number;
  num_leaves?: number;
  min_data_in_leaf?: number;
  feature_fraction?: number;
  bagging_fraction?: number;
  bagging_freq?: number;
  lambda_l2?: number;
  max_train_samples?: number;
  signal_variance?: number;
  length_scale?: number;
  noise_level?: number;
  alpha?: number;
  n_restarts_optimizer?: number;
  sequence_length?: number;
  hidden_size?: number;
  num_layers?: number;
  dropout?: number;
  epochs?: number;
  weight_decay?: number;
  batch_size?: number;
  center_blend?: number;
  seed?: number;
};

export type PredictionHyperparameter = {
  label: string;
  value: string;
};

export type PredictionModelInfo = {
  theory: string;
  features: PredictionHyperparameter[];
  hyperparameters: PredictionHyperparameter[];
};

const MODEL_CONFIGS: Record<PredictionModelKind, PredictionConfig> = {
  ar1_baseline: ar1BaselineConfig,
  arimax_price_only: arimaxPriceOnlyConfig,
  arimax_sentiment: arimaxSentimentConfig,
  gaussian_process_price_only: gaussianProcessPriceOnlyConfig,
  gaussian_process_sentiment: gaussianProcessSentimentConfig,
  lstm_price_only: lstmPriceOnlyConfig,
  lstm_sentiment: lstmSentimentConfig,
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
      features: baselineFeatures(),
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
      features: sharedTabularFeatures(config),
      hyperparameters: [
        hyperparameter("Ridge alpha", formatScalar(config.ridge_alpha)),
        hyperparameter("Lags", formatList(config.lags)),
        hyperparameter("Windows", formatList(config.windows)),
        hyperparameter("Sentiment inputs", formatToggle(config.include_sentiment_features)),
      ],
    };
  }

  if (model === "arimax_price_only" || model === "arimax_sentiment") {
    return {
      theory:
        model === "arimax_sentiment"
          ? "ARIMAX on one-step log returns with autoregressive and moving-average dynamics plus exogenous lag, rolling, sentiment, and news context."
          : "ARIMAX on one-step log returns with autoregressive and moving-average dynamics plus exogenous lag and rolling-return context.",
      features: sharedTabularFeatures(config),
      hyperparameters: arimaxHyperparameters(config),
    };
  }

  if (model === "gaussian_process_price_only" || model === "gaussian_process_sentiment") {
    return {
      theory:
        model === "gaussian_process_sentiment"
          ? "Gaussian-process regression for one-step return forecasts using lagged price states plus sentiment and news context, fit on a capped recent training window."
          : "Gaussian-process regression for one-step return forecasts using lagged price and rolling-return context, fit on a capped recent training window.",
      features: sharedTabularFeatures(config),
      hyperparameters: gaussianProcessHyperparameters(config),
    };
  }

  if (model === "lstm_price_only" || model === "lstm_sentiment") {
    return {
      theory:
        model === "lstm_sentiment"
          ? "Sequence LSTM for one-step return forecasts using lagged price states plus sentiment and news context across the recent window."
          : "Sequence LSTM for one-step return forecasts using lagged price and rolling-return context across the recent window.",
      features: lstmFeatures(config),
      hyperparameters: lstmHyperparameters(config),
    };
  }

  if (model === "lightgbm_direct_price_only" || model === "lightgbm_direct_sentiment") {
    return {
      theory:
        model === "lightgbm_direct_sentiment"
          ? "Direct multi-horizon LightGBM. It learns future offsets from the split boundary using price, news, and sentiment context."
          : "Direct multi-horizon LightGBM. It learns future offsets from the split boundary using price and rolling history only.",
      features: directLightgbmFeatures(config),
      hyperparameters: lightgbmHyperparameters(config),
    };
  }

  return {
    theory:
      model === "lightgbm_sentiment"
        ? "Gradient-boosted trees for one-step return forecasts with lagged prices, volatility, and sentiment inputs."
        : "Gradient-boosted trees for one-step return forecasts with lagged prices and rolling volatility features.",
    features: sharedTabularFeatures(config),
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

function arimaxHyperparameters(config: PredictionConfig): PredictionHyperparameter[] {
  return [
    hyperparameter("AR order", formatScalar(config.ar_order)),
    hyperparameter("MA order", formatScalar(config.ma_order)),
    hyperparameter("Train window", formatScalar(config.max_train_samples)),
    hyperparameter("Max iterations", formatScalar(config.maxiter)),
    hyperparameter("Trend", config.trend ?? "n/a"),
    hyperparameter("Recursive blend", formatScalar(config.center_blend)),
    hyperparameter("Lags", formatList(config.lags)),
    hyperparameter("Windows", formatList(config.windows)),
    hyperparameter("Sentiment inputs", formatToggle(config.include_sentiment_features)),
  ];
}

function gaussianProcessHyperparameters(config: PredictionConfig): PredictionHyperparameter[] {
  return [
    hyperparameter("Train window", formatScalar(config.max_train_samples)),
    hyperparameter("Signal variance", formatScalar(config.signal_variance)),
    hyperparameter("Length scale", formatScalar(config.length_scale)),
    hyperparameter("Noise level", formatScalar(config.noise_level)),
    hyperparameter("Alpha", formatScalar(config.alpha)),
    hyperparameter("Optimizer restarts", formatScalar(config.n_restarts_optimizer)),
    hyperparameter("Lags", formatList(config.lags)),
    hyperparameter("Windows", formatList(config.windows)),
    hyperparameter("Sentiment inputs", formatToggle(config.include_sentiment_features)),
  ];
}

function lstmHyperparameters(config: PredictionConfig): PredictionHyperparameter[] {
  return [
    hyperparameter("Sequence length", formatScalar(config.sequence_length)),
    hyperparameter("Hidden size", formatScalar(config.hidden_size)),
    hyperparameter("Layers", formatScalar(config.num_layers)),
    hyperparameter("Dropout", formatScalar(config.dropout)),
    hyperparameter("Epochs", formatScalar(config.epochs)),
    hyperparameter("Learning rate", formatScalar(config.learning_rate)),
    hyperparameter("Batch size", formatScalar(config.batch_size)),
    hyperparameter("Weight decay", formatScalar(config.weight_decay)),
    hyperparameter("Recursive blend", formatScalar(config.center_blend)),
    hyperparameter("Lags", formatList(config.lags)),
    hyperparameter("Windows", formatList(config.windows)),
    hyperparameter("Sentiment inputs", formatToggle(config.include_sentiment_features)),
    hyperparameter("Seed", formatScalar(config.seed)),
  ];
}

function baselineFeatures(): PredictionHyperparameter[] {
  return [
    hyperparameter("Training input", "historical price series"),
    hyperparameter("Anchor term", "last_train_price"),
    hyperparameter("Trend statistic", "linear slope fit on training prices"),
  ];
}

function sharedTabularFeatures(config: PredictionConfig): PredictionHyperparameter[] {
  const items = [
    hyperparameter("Lagged log prices", formatFeatureNames("lag_log_price", config.lags)),
    hyperparameter("Lagged log returns", formatFeatureNames("lag_log_return", config.lags)),
    hyperparameter("Rolling return mean", formatFeatureNames("rolling_log_return_mean", config.windows)),
    hyperparameter("Rolling return vol", formatFeatureNames("rolling_log_return_vol", config.windows)),
    hyperparameter("Time trend", "time_index"),
    hyperparameter("Acceleration", "log_return_acceleration"),
    hyperparameter("Day-of-week encoding", "day_of_week_sin, day_of_week_cos"),
  ];

  if (config.include_sentiment_features) {
    items.push(
      hyperparameter(
        "Sentiment and news",
        [
          "sentiment_score",
          "finbert_sentiment_score",
          "positive",
          "neutral",
          "negative",
          "finbert_positive",
          "finbert_neutral",
          "finbert_negative",
          "news_count",
        ].join(", "),
      ),
    );
  }

  return items;
}

function directLightgbmFeatures(config: PredictionConfig): PredictionHyperparameter[] {
  return [
    ...sharedTabularFeatures(config),
    hyperparameter(
      "Direct-horizon context",
      "forecast_horizon, forecast_horizon_ratio, forecast_horizon_log1p",
    ),
  ];
}

function lstmFeatures(config: PredictionConfig): PredictionHyperparameter[] {
  return [
    hyperparameter(
      "Temporal window",
      `last ${formatScalar(config.sequence_length)} timesteps of the feature set below`,
    ),
    ...sharedTabularFeatures(config),
  ];
}

function hyperparameter(label: string, value: string): PredictionHyperparameter {
  return { label, value };
}

function formatFeatureNames(prefix: string, values: number[] | undefined) {
  if (!values?.length) return "n/a";
  return values.map((value) => `${prefix}_${value}`).join(", ");
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

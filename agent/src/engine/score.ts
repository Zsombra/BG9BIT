/* Per-coin directional scoring: features -> direction, confidence, expected move, EV. */
import type { EngineConfig } from "../core/config.js";
import type { CoinFeatures } from "../ta/features.js";
import { clamp, tanh } from "../ta/indicators.js";
import type { GamePreset, RegimeSnapshot } from "../mcp/tools.js";

export interface ScoringParams {
  changeMultiplier: number;
  captainMultiplier: number;
  wrongPenaltyMultiplier: number;
  captainWrongPenaltyMultiplier: number;
}

export function scoringParamsFromPreset(p: Pick<GamePreset, "changeMultiplier" | "captainMultiplier" | "wrongPenaltyMultiplier" | "captainWrongPenaltyMultiplier">): ScoringParams {
  return {
    changeMultiplier: p.changeMultiplier ?? 100,
    captainMultiplier: p.captainMultiplier ?? 2,
    wrongPenaltyMultiplier: p.wrongPenaltyMultiplier ?? 100,
    captainWrongPenaltyMultiplier: p.captainWrongPenaltyMultiplier ?? 2,
  };
}

export interface Contribution {
  momentum: number;
  rsiTrend: number;
  macd: number;
  trend: number;
  meanReversion: number;
  relStrength: number;
  regime: number;
}

export interface CoinScore {
  ticker: string;
  direction: "UP" | "DOWN";
  edge: number; // net directional edge in [-1, 1] (sign = direction)
  confidence: number; // P(correct direction), 0.5..ceil
  expectedMovePct: number; // E[|move%|] over the session horizon
  evRegular: number; // expected game points if this is a non-captain pick
  evCaptain: number; // expected game points if this is the captain
  contributions: Contribution;
}

function regimeDirection(r: RegimeSnapshot | null): number {
  if (!r || !r.regime) return 0;
  if (r.regime.startsWith("bull")) return 1;
  if (r.regime.startsWith("bear")) return -1;
  return 0; // contraction / volatile => no directional prior
}

const TF_MIN: Record<string, number> = {
  "1m": 1, "3m": 3, "5m": 5, "15m": 15, "30m": 30,
  "1h": 60, "2h": 120, "4h": 240, "8h": 480, "12h": 720, "1d": 1440,
};

export function horizonBars(sessionTimeRangeKey: string | undefined, candleInterval: string): number {
  const sMin = TF_MIN[(sessionTimeRangeKey ?? "1H").toLowerCase()] ?? 60;
  const cMin = TF_MIN[candleInterval.toLowerCase()] ?? 60;
  return Math.max(1, Math.round(sMin / cMin));
}

export function scoreCoin(
  f: CoinFeatures,
  cfg: EngineConfig,
  regime: RegimeSnapshot | null,
  hBars: number,
  params: ScoringParams,
): CoinScore {
  const w = cfg.analysis.weights;
  const atrPct = f.atrPct ?? f.realizedAbsRetPct ?? 0.5;

  // --- sub-signals, each mapped to [-1, 1] (positive = bullish) ---
  const momentum = tanh(f.ret3 / (2 * (f.realizedAbsRetPct || 0.5)));
  const rsiTrend = f.rsi != null ? clamp((f.rsi - 50) / 25, -1, 1) : 0;
  const macdSig = f.macdHist != null ? tanh(f.macdHist / 20) : 0;
  const trend =
    f.emaSpreadPct != null && f.smaSlopePct != null
      ? tanh((f.emaSpreadPct + f.smaSlopePct) / (atrPct + 1e-6))
      : 0;
  // mean-reversion only fires at oscillator extremes, opposing the trend
  let meanReversion = 0;
  if (f.rsi != null) {
    if (f.rsi < 30) meanReversion = clamp((30 - f.rsi) / 20, 0, 1);
    else if (f.rsi > 70) meanReversion = -clamp((f.rsi - 70) / 20, 0, 1);
  }
  const relStrength = f.relStrength != null ? tanh(f.relStrength) : 0;
  const regimeDir = regimeDirection(regime) * cfg.regime.biasTilt;

  const contributions: Contribution = {
    momentum,
    rsiTrend,
    macd: macdSig,
    trend,
    meanReversion,
    relStrength,
    regime: regimeDir,
  };

  const weighted =
    w.momentum * momentum +
    w.rsi * rsiTrend +
    w.macd * macdSig +
    w.trend * trend +
    w.meanReversion * meanReversion +
    w.relStrength * relStrength +
    w.regimeAlign * regimeDir;
  const wsum =
    w.momentum + w.rsi + w.macd + w.trend + w.meanReversion + w.relStrength + w.regimeAlign;
  const edge = clamp(weighted / (wsum || 1), -1, 1);

  const direction: "UP" | "DOWN" = edge >= 0 ? "UP" : "DOWN";
  const confidence = clamp(
    0.5 + 0.5 * tanh(cfg.scoring.edgeToConfK * Math.abs(edge)),
    0.5,
    cfg.scoring.confidenceCeil,
  );

  // expected |move%| over the horizon: blend ATR% and realized abs-return, scaled by sqrt(bars)
  const wA = cfg.scoring.expectedMoveAtrWeight;
  const perBar = wA * atrPct + (1 - wA) * (f.realizedAbsRetPct || atrPct);
  const expectedMovePct = perBar * Math.sqrt(hBars);

  // expected game points
  const ptsCorrect = expectedMovePct * params.changeMultiplier;
  const ptsWrong = expectedMovePct * params.wrongPenaltyMultiplier;
  const evRegular = confidence * ptsCorrect - (1 - confidence) * ptsWrong;
  const evCaptain =
    confidence * ptsCorrect * params.captainMultiplier -
    (1 - confidence) * ptsWrong * params.captainWrongPenaltyMultiplier;

  return { ticker: f.ticker, direction, edge, confidence, expectedMovePct, evRegular, evCaptain, contributions };
}

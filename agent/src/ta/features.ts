/* Derive a compact per-coin feature set from a candle series. */
import type { Candle } from "../mcp/tools.js";
import { atr, ema, macd, mean, returns, rsi, sma, stdev } from "./indicators.js";

export interface CoinFeatures {
  ticker: string;
  lastClose: number;
  // momentum
  ret1: number; // last-bar % return
  ret3: number; // sum of last 3 bar % returns
  emaFast: number | null;
  emaSlow: number | null;
  emaSpreadPct: number | null; // (fast-slow)/price * 100
  // oscillators
  rsi: number | null;
  macdHist: number | null; // normalized by price (bps)
  // trend / volatility
  smaSlopePct: number | null; // short SMA slope, % per bar
  atrPct: number | null; // ATR as % of price
  realizedAbsRetPct: number; // avg |bar return| %, recent window
  // relative strength (filled by caller across the pool)
  relStrength?: number; // this coin's ret vs pool median, in stdevs
  bars: number;
}

export function computeFeatures(ticker: string, candles: Candle[]): CoinFeatures | null {
  // Use only fully-closed candles to avoid the forming bar skewing signals.
  const cs = candles.slice();
  if (cs.length < 30) return null;
  const closes = cs.map((c) => c.close);
  const highs = cs.map((c) => c.high);
  const lows = cs.map((c) => c.low);
  const last = closes[closes.length - 1]!;

  const rets = returns(closes);
  const ret1 = (rets[rets.length - 1] ?? 0) * 100;
  const ret3 = (rets.slice(-3).reduce((a, b) => a + b, 0)) * 100;

  const emaF = ema(closes, 5);
  const emaS = ema(closes, 20);
  const emaSpreadPct = emaF != null && emaS != null ? ((emaF - emaS) / last) * 100 : null;

  const smaNow = sma(closes, 10);
  const smaPrev = sma(closes.slice(0, -3), 10);
  const smaSlopePct = smaNow != null && smaPrev != null ? ((smaNow - smaPrev) / last) * 100 : null;

  const a = atr(highs, lows, closes, 14);
  const atrPct = a != null ? (a / last) * 100 : null;

  const m = macd(closes, 12, 26, 9);
  const macdHist = m ? (m.hist / last) * 10000 : null; // in bps of price

  const recentAbs = rets.slice(-14).map((r) => Math.abs(r) * 100);
  const realizedAbsRetPct = mean(recentAbs);

  return {
    ticker,
    lastClose: last,
    ret1,
    ret3,
    emaFast: emaF,
    emaSlow: emaS,
    emaSpreadPct,
    rsi: rsi(closes, 14),
    macdHist,
    smaSlopePct,
    atrPct,
    realizedAbsRetPct,
    bars: cs.length,
  };
}

/** Populate relStrength for a pool of coins (z-score of ret3 vs the pool). */
export function attachRelativeStrength(feats: CoinFeatures[]): void {
  const rs = feats.map((f) => f.ret3);
  const mu = mean(rs);
  const sd = stdev(rs) || 1;
  for (const f of feats) f.relStrength = (f.ret3 - mu) / sd;
}

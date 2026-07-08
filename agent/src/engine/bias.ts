/* Turn per-coin scores into a directional trade-bias signal for your own trades. */
import type { EngineConfig } from "../core/config.js";
import type { CoinFeatures } from "../ta/features.js";
import type { RegimeSnapshot } from "../mcp/tools.js";
import type { CoinScore } from "./score.js";

export interface CoinBias {
  ticker: string;
  bias: "LONG" | "SHORT";
  strength: number; // |edge| in 0..1
  confidence: number;
  expectedMovePct: number;
  atrPct: number | null;
  suggestedStopPct: number; // distance from entry, %
  suggestedTargetPct: number;
  rr: number; // reward:risk
  regimeAlignment: "with" | "against" | "neutral";
}

export interface MarketBias {
  generatedAt: string;
  referenceRegime: {
    coin: string;
    timeframe: string;
    regime: string;
    conviction: string;
  } | null;
  netBias: number; // -1 (short) .. +1 (long), breadth-weighted by strength
  breadthLongPct: number; // share of coins biased long
  coins: CoinBias[];
}

function regimeSign(r: RegimeSnapshot | null): number {
  if (!r?.regime) return 0;
  if (r.regime.startsWith("bull")) return 1;
  if (r.regime.startsWith("bear")) return -1;
  return 0;
}

export function buildBias(
  scores: CoinScore[],
  featByTicker: Map<string, CoinFeatures>,
  cfg: EngineConfig,
  regime: RegimeSnapshot | null,
  nowIso: string,
): MarketBias {
  const rSign = regimeSign(regime);
  const coins: CoinBias[] = scores.map((s) => {
    const atrPct = featByTicker.get(s.ticker)?.atrPct ?? null;
    const base = atrPct ?? s.expectedMovePct;
    const stop = base * cfg.bias.stopAtrMult;
    const target = base * cfg.bias.targetAtrMult;
    const dirSign = s.direction === "UP" ? 1 : -1;
    const alignment: CoinBias["regimeAlignment"] =
      rSign === 0 ? "neutral" : dirSign === rSign ? "with" : "against";
    return {
      ticker: s.ticker,
      bias: s.direction === "UP" ? "LONG" : "SHORT",
      strength: Number(Math.abs(s.edge).toFixed(3)),
      confidence: Number(s.confidence.toFixed(3)),
      expectedMovePct: Number(s.expectedMovePct.toFixed(3)),
      atrPct: atrPct != null ? Number(atrPct.toFixed(3)) : null,
      suggestedStopPct: Number(stop.toFixed(3)),
      suggestedTargetPct: Number(target.toFixed(3)),
      rr: Number((cfg.bias.targetAtrMult / cfg.bias.stopAtrMult).toFixed(2)),
      regimeAlignment: alignment,
    };
  });

  const weighted = scores.reduce((a, s) => a + (s.direction === "UP" ? 1 : -1) * Math.abs(s.edge), 0);
  const wsum = scores.reduce((a, s) => a + Math.abs(s.edge), 0) || 1;
  const netBias = Number((weighted / wsum).toFixed(3));
  const breadthLongPct = Number(
    ((coins.filter((c) => c.bias === "LONG").length / (coins.length || 1)) * 100).toFixed(1),
  );

  return {
    generatedAt: nowIso,
    referenceRegime: regime
      ? {
          coin: cfg.regime.referenceCoin,
          timeframe: cfg.regime.timeframe,
          regime: regime.regime,
          conviction: regime.conviction,
        }
      : null,
    netBias,
    breadthLongPct,
    coins: coins.sort((a, b) => b.strength - a.strength),
  };
}

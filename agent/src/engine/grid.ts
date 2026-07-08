/* Build an EV-optimal grid from per-coin scores, choose a captain, calibrate confidence. */
import type { EngineConfig } from "../core/config.js";
import type { GridCell, PickReasoning, RegimeSnapshot } from "../mcp/tools.js";
import { clamp } from "../ta/indicators.js";
import type { CoinScore } from "./score.js";

export interface BuiltGrid {
  gridSize: number;
  cells: GridCell[]; // ordered: captain is position 0
  picks: CoinScore[]; // the chosen scores, captain first
  captain: CoinScore;
  captainPolicy: string;
  confidenceScore: number; // 0..1, gates submission
  submitThreshold: number;
  wouldSubmit: boolean;
  chopGated: boolean;
  notes: string[];
}

/**
 * Select the `gridSize` coins with the highest expected value, then pick the
 * captain per policy, then order cells with the captain at position 0.
 */
export function buildGrid(
  scores: CoinScore[],
  gridSize: number,
  cfg: EngineConfig,
  regime: RegimeSnapshot | null,
): BuiltGrid {
  const notes: string[] = [];
  if (scores.length < gridSize) {
    throw new Error(`Only ${scores.length} scored coins but gridSize is ${gridSize}.`);
  }

  // Top-N by expected non-captain value (each coin scored on its own predicted side).
  const picks = [...scores].sort((a, b) => b.evRegular - a.evRegular).slice(0, gridSize);

  const captain = pickCaptain(picks, cfg, notes);

  // Order: captain at position 0, remaining by evRegular desc.
  const rest = picks.filter((p) => p.ticker !== captain.ticker).sort((a, b) => b.evRegular - a.evRegular);
  const ordered = [captain, ...rest];
  const cells: GridCell[] = ordered.map((p, i) => ({
    position: i,
    coinId: p.ticker,
    prediction: p.direction,
    isCaptain: i === 0,
  }));

  // Overall confidence: how far the pool's mean confidence sits above a coin-flip.
  const meanConf = picks.reduce((a, p) => a + p.confidence, 0) / picks.length;
  let confidenceScore = clamp((meanConf - 0.5) / (cfg.scoring.confidenceCeil - 0.5), 0, 1);

  // Chop gate: in contraction/volatile regimes, dampen confidence and raise the bar.
  const chop = !!regime && (regime.regime === "contraction" || regime.regime === "volatile");
  let submitThreshold = cfg.confidence.submitThreshold;
  let chopGated = false;
  if (chop && cfg.regime.gateInChop) {
    confidenceScore *= 0.85;
    submitThreshold = Math.max(submitThreshold, cfg.regime.chopMinConfidence);
    chopGated = true;
    notes.push(
      `Regime is ${regime!.regime} (chop) — confidence damped and submit threshold raised to ${submitThreshold.toFixed(2)}.`,
    );
  }

  confidenceScore = Number(confidenceScore.toFixed(4));
  const wouldSubmit = confidenceScore >= submitThreshold;

  return {
    gridSize,
    cells,
    picks: ordered,
    captain,
    captainPolicy: cfg.grid.captainPolicy,
    confidenceScore,
    submitThreshold,
    wouldSubmit,
    chopGated,
    notes,
  };
}

function pickCaptain(picks: CoinScore[], cfg: EngineConfig, notes: string[]): CoinScore {
  const minConf = cfg.grid.captainMinConfidence;
  const qualified = picks.filter((p) => p.confidence >= minConf);
  const pool = qualified.length > 0 ? qualified : picks;
  if (qualified.length === 0) {
    notes.push(
      `No pick clears captainMinConfidence ${minConf.toFixed(2)}; captaining the safest available pick and lowering conviction.`,
    );
  }

  let cap: CoinScore;
  switch (cfg.grid.captainPolicy) {
    case "max_vol":
      // biggest expected mover among confident picks — jackpot / War-Bond hunting
      cap = [...pool].sort((a, b) => b.expectedMovePct - a.expectedMovePct)[0]!;
      break;
    case "safe":
      cap = [...pool].sort((a, b) => b.confidence - a.confidence)[0]!;
      break;
    case "balanced":
      cap = [...pool]
        .sort(
          (a, b) =>
            b.evRegular * Math.pow(b.expectedMovePct, cfg.grid.volGamma) -
            a.evRegular * Math.pow(a.expectedMovePct, cfg.grid.volGamma),
        )[0]!;
      break;
    case "max_ev":
    default:
      // doubling only ever helps a positive-EV pick; argmax evCaptain == argmax marginal gain
      cap = [...pool].sort((a, b) => b.evCaptain - a.evCaptain)[0]!;
      break;
  }
  return cap;
}

/** Validate a grid against BattleGrid's submission rules. Returns problems (empty = OK). */
export function validateGrid(cells: GridCell[], gridSize: number, poolIds: Set<string>): string[] {
  const problems: string[] = [];
  if (cells.length !== gridSize) problems.push(`grid has ${cells.length} cells, expected ${gridSize}`);
  const captains = cells.filter((c) => c.isCaptain);
  if (captains.length !== 1) problems.push(`exactly one captain required, found ${captains.length}`);
  if (captains[0] && captains[0].position !== 0) problems.push("captain must be at position 0");
  const seen = new Set<string>();
  for (const c of cells) {
    if (seen.has(c.coinId)) problems.push(`duplicate coin ${c.coinId}`);
    seen.add(c.coinId);
    if (!poolIds.has(c.coinId)) problems.push(`coin ${c.coinId} not in session pool`);
    if (c.prediction !== "UP" && c.prediction !== "DOWN") problems.push(`bad prediction for ${c.coinId}`);
  }
  const positions = cells.map((c) => c.position).sort((a, b) => a - b);
  for (let i = 0; i < positions.length; i++) {
    if (positions[i] !== i) {
      problems.push("positions must be sequential 0..n-1");
      break;
    }
  }
  return problems;
}

export function buildPickReasoning(g: BuiltGrid): PickReasoning[] {
  return g.picks.map((p) => ({
    coinId: p.ticker,
    reasoning: describeCoin(p),
    confidence: Number(p.confidence.toFixed(3)),
  }));
}

export function describeCoin(p: CoinScore): string {
  const c = p.contributions;
  const drivers = Object.entries(c)
    .filter(([, v]) => Math.abs(v) > 0.15)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 3)
    .map(([k, v]) => `${k} ${v >= 0 ? "+" : ""}${v.toFixed(2)}`)
    .join(", ");
  return `${p.direction} @ conf ${(p.confidence * 100).toFixed(0)}% — exp move ~${p.expectedMovePct.toFixed(
    2,
  )}%, EV ${p.evRegular.toFixed(0)}pts. Drivers: ${drivers || "mixed/neutral"}.`;
}

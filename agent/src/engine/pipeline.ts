/* Reusable prediction pipeline shared by `predict`, `submit`, and the paper loop. */
import type { EngineConfig } from "../core/config.js";
import type { McpClient } from "../mcp/client.js";
import { api, type GridSession, type RegimeSnapshot } from "../mcp/tools.js";
import { computeFeatures, attachRelativeStrength, type CoinFeatures } from "../ta/features.js";
import { horizonBars, scoreCoin, scoringParamsFromPreset, type CoinScore, type ScoringParams } from "./score.js";
import { buildGrid, buildPickReasoning, validateGrid, type BuiltGrid } from "./grid.js";
import { buildReasoning } from "./reasoning.js";

export async function scorePool(
  client: McpClient,
  engine: EngineConfig,
  tickers: string[],
  sessionTimeRangeKey: string | undefined,
  params: ScoringParams,
): Promise<{ scores: CoinScore[]; feats: Map<string, CoinFeatures>; regime: RegimeSnapshot | null }> {
  const regime = await api
    .regimeSnapshot(client, engine.regime.referenceCoin, engine.regime.timeframe)
    .catch(() => null);
  const interval = engine.analysis.candleInterval;
  const limit = engine.analysis.candleLimit;

  const featList: CoinFeatures[] = [];
  await mapLimit(tickers, 5, async (t) => {
    try {
      const { candles } = await api.candles(client, t, interval, limit);
      const f = computeFeatures(t, candles ?? []);
      if (f) featList.push(f);
    } catch {
      /* skip coins without data */
    }
  });
  attachRelativeStrength(featList);

  const hBars = horizonBars(sessionTimeRangeKey, interval);
  const scores = featList.map((f) => scoreCoin(f, engine, regime, hBars, params));
  const feats = new Map(featList.map((f) => [f.ticker, f]));
  return { scores, feats, regime };
}

export async function loadSessionForEngine(client: McpClient, sessionId: string) {
  const session = await api.session(client, sessionId);
  const preset =
    (await api.gamePresets(client).catch(() => [] as any[])).find((p: any) => p.id === session.gamePresetId) ?? null;
  const params = scoringParamsFromPreset(preset ?? (session as any));
  return { session, preset, params };
}

export interface EnrichedPick {
  coinId: string;
  position: number;
  prediction: "UP" | "DOWN";
  isCaptain: boolean;
  confidence: number;
  expectedMovePct: number;
  edge: number;
  evRegular: number;
}

export interface PredictionResult {
  session: GridSession;
  params: ScoringParams;
  regime: RegimeSnapshot | null;
  scores: CoinScore[];
  grid: BuiltGrid;
  problems: string[];
  submission: {
    sessionId: string;
    grid: BuiltGrid["cells"];
    reasoning: string;
    confidenceScore: number;
    modelName: string;
    pickReasoning: ReturnType<typeof buildPickReasoning>;
  };
  picks: EnrichedPick[];
}

export const MODEL_NAME = "bg9bit-quant-v1";

export async function runPrediction(
  client: McpClient,
  engine: EngineConfig,
  sessionId: string,
): Promise<PredictionResult> {
  const { session, params } = await loadSessionForEngine(client, sessionId);
  const tickers = session.coinPool.map((c) => c.ticker ?? c.id);
  const poolIds = new Set(tickers);
  const { scores, regime } = await scorePool(client, engine, tickers, session.timeRangeKey, params);
  const grid = buildGrid(scores, session.gridSize, engine, regime);
  const problems = validateGrid(grid.cells, session.gridSize, poolIds);
  const reasoning = buildReasoning(grid, session.displayName, regime);
  const pickReasoning = buildPickReasoning(grid);

  const scoreByTicker = new Map(scores.map((s) => [s.ticker, s]));
  const picks: EnrichedPick[] = grid.cells.map((c) => {
    const s = scoreByTicker.get(c.coinId)!;
    return {
      coinId: c.coinId,
      position: c.position,
      prediction: c.prediction,
      isCaptain: c.isCaptain,
      confidence: Number(s.confidence.toFixed(4)),
      expectedMovePct: Number(s.expectedMovePct.toFixed(4)),
      edge: Number(s.edge.toFixed(4)),
      evRegular: Number(s.evRegular.toFixed(2)),
    };
  });

  return {
    session,
    params,
    regime,
    scores,
    grid,
    problems,
    submission: { sessionId, grid: grid.cells, reasoning, confidenceScore: grid.confidenceScore, modelName: MODEL_NAME, pickReasoning },
    picks,
  };
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const cur = idx++;
      out[cur] = await fn(items[cur]!, cur);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

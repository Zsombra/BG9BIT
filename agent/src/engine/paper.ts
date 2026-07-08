/* Paper-trading loop: record predictions, grade them at settlement, report edge.
   Never wagers — uses live results only to score our hypothetical grids. */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EngineConfig } from "../core/config.js";
import type { McpClient } from "../mcp/client.js";
import { api } from "../mcp/tools.js";
import { runPrediction, type EnrichedPick, type PredictionResult, MODEL_NAME } from "./pipeline.js";
import type { ScoringParams } from "./score.js";

export interface PaperRecord {
  sessionId: string;
  displayName: string;
  timeRangeKey?: string;
  capturedAt: string;
  lockAt: string;
  settleAt: string;
  status: "pending" | "settled" | "cancelled";
  gridSize: number;
  captainCoinId: string;
  confidenceScore: number;
  submitThreshold: number;
  wouldSubmit: boolean;
  entryFee: number;
  scoringParams: ScoringParams;
  modelName: string;
  reasoning: string;
  picks: EnrichedPick[];
  graded?: LedgerRow;
}

export interface PerPickResult {
  coinId: string;
  prediction: "UP" | "DOWN";
  isCaptain: boolean;
  actualChangePct: number | null;
  correct: boolean;
  points: number;
}

export interface LedgerRow {
  sessionId: string;
  displayName: string;
  capturedAt: string;
  settledAt: string;
  gridSize: number;
  ourConfidence: number;
  wouldSubmit: boolean;
  correctCount: number;
  accuracyPct: number;
  ourScore: number;
  maxPossibleScore: number;
  captureEfficiencyPct: number;
  captain: {
    coinId: string;
    prediction: "UP" | "DOWN";
    correct: boolean;
    changePct: number | null;
    wasBestInGrid: boolean;
  };
  perPick: PerPickResult[];
}

function paths(outDir: string) {
  const predDir = resolve(outDir, "predictions");
  const ledger = resolve(outDir, "ledger.jsonl");
  mkdirSync(predDir, { recursive: true });
  return { predDir, ledger };
}

function recordPath(outDir: string, sessionId: string) {
  return resolve(paths(outDir).predDir, `${sessionId}.json`);
}

export function readRecord(outDir: string, sessionId: string): PaperRecord | null {
  const p = recordPath(outDir, sessionId);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as PaperRecord;
  } catch {
    return null;
  }
}

function writeRecord(outDir: string, rec: PaperRecord) {
  writeFileSync(recordPath(outDir, rec.sessionId), JSON.stringify(rec, null, 2));
}

/** Build + persist a pending PaperRecord from a prediction result. */
export function savePredictionRecord(outDir: string, r: PredictionResult): PaperRecord {
  const existing = readRecord(outDir, r.session.id);
  const captain = r.picks.find((p) => p.isCaptain)!;
  const rec: PaperRecord = {
    sessionId: r.session.id,
    displayName: r.session.displayName,
    timeRangeKey: r.session.timeRangeKey,
    // keep the first capture time so a re-run doesn't reset it (unless already settled)
    capturedAt: existing && existing.status !== "settled" ? existing.capturedAt : new Date().toISOString(),
    lockAt: r.session.lockAt,
    settleAt: r.session.settleAt,
    status: "pending",
    gridSize: r.session.gridSize,
    captainCoinId: captain.coinId,
    confidenceScore: r.grid.confidenceScore,
    submitThreshold: r.grid.submitThreshold,
    wouldSubmit: r.grid.wouldSubmit,
    entryFee: r.session.entryFee ?? 0,
    scoringParams: r.params,
    modelName: MODEL_NAME,
    reasoning: r.submission.reasoning,
    picks: r.picks,
  };
  writeRecord(outDir, rec);
  return rec;
}

function listRecords(outDir: string): PaperRecord[] {
  const { predDir } = paths(outDir);
  return readdirSync(predDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(resolve(predDir, f), "utf8")) as PaperRecord;
      } catch {
        return null;
      }
    })
    .filter((r): r is PaperRecord => !!r);
}

/** Record predictions for all PENDING sessions we haven't captured yet. */
export async function recordPending(
  client: McpClient,
  engine: EngineConfig,
  outDir: string,
): Promise<{ recorded: string[]; skipped: string[] }> {
  const sessions = await api.listSessions(client, "PENDING");
  const recorded: string[] = [];
  const skipped: string[] = [];
  for (const s of sessions) {
    if (readRecord(outDir, s.sessionId)) {
      skipped.push(s.sessionId);
      continue;
    }
    try {
      const r = await runPrediction(client, engine, s.sessionId);
      savePredictionRecord(outDir, r);
      recorded.push(s.sessionId);
    } catch {
      skipped.push(s.sessionId);
    }
  }
  return { recorded, skipped };
}

function resolutionsMap(results: any): Map<string, { change: number; rank: number | null }> {
  const map = new Map<string, { change: number; rank: number | null }>();
  const src: any[] = results?.resolutions ?? results?.settledMarketData ?? [];
  for (const r of src) {
    const id = r.coinId ?? r.symbol ?? r.sym;
    const change = Number(r.changePercent ?? r.change ?? NaN);
    if (id != null && Number.isFinite(change)) {
      map.set(String(id), { change, rank: r.marketRank ?? r.rank ?? null });
    }
  }
  return map;
}

export function gradeRecord(rec: PaperRecord, results: any, settledAt: string): LedgerRow {
  const moves = resolutionsMap(results);
  const p = rec.scoringParams;
  let ourScore = 0;
  let maxPossibleScore = 0;
  let correctCount = 0;

  // captain-best-in-grid uses only our own picks
  let bestAbs = -Infinity;
  let bestCoin = "";
  for (const pick of rec.picks) {
    const abs = Math.abs(moves.get(pick.coinId)?.change ?? 0);
    if (abs > bestAbs) {
      bestAbs = abs;
      bestCoin = pick.coinId;
    }
  }

  const perPick: PerPickResult[] = rec.picks.map((pick) => {
    const m = moves.get(pick.coinId);
    const change = m ? m.change : null;
    const correct = change != null && ((pick.prediction === "UP" && change > 0) || (pick.prediction === "DOWN" && change < 0));
    const absMove = change != null ? Math.abs(change) : 0;
    // BattleGrid rounds each cell's base points to an integer, then the captain
    // adds an equal-magnitude bonus (doubling). Mirror that for exact parity.
    const baseMag = Math.round(absMove * (correct ? p.changeMultiplier : p.wrongPenaltyMultiplier));
    const base = correct ? baseMag : -baseMag;
    const capBonus = pick.isCaptain
      ? base * ((correct ? p.captainMultiplier : p.captainWrongPenaltyMultiplier) - 1)
      : 0;
    const points = base + capBonus;
    if (correct) correctCount++;
    ourScore += points;
    maxPossibleScore += Math.round(absMove * p.changeMultiplier) * (pick.isCaptain ? p.captainMultiplier : 1);
    return { coinId: pick.coinId, prediction: pick.prediction, isCaptain: pick.isCaptain, actualChangePct: change, correct, points };
  });

  const captainPick = rec.picks.find((x) => x.isCaptain)!;
  const capMove = moves.get(captainPick.coinId)?.change ?? null;
  const captainCorrect = capMove != null && ((captainPick.prediction === "UP" && capMove > 0) || (captainPick.prediction === "DOWN" && capMove < 0));

  return {
    sessionId: rec.sessionId,
    displayName: rec.displayName,
    capturedAt: rec.capturedAt,
    settledAt,
    gridSize: rec.gridSize,
    ourConfidence: rec.confidenceScore,
    wouldSubmit: rec.wouldSubmit,
    correctCount,
    accuracyPct: Number(((correctCount / rec.gridSize) * 100).toFixed(2)),
    ourScore: Number(ourScore.toFixed(2)),
    maxPossibleScore: Number(maxPossibleScore.toFixed(2)),
    captureEfficiencyPct: maxPossibleScore > 0 ? Number(((ourScore / maxPossibleScore) * 100).toFixed(2)) : 0,
    captain: {
      coinId: captainPick.coinId,
      prediction: captainPick.prediction,
      correct: captainCorrect,
      changePct: capMove,
      wasBestInGrid: bestCoin === captainPick.coinId,
    },
    perPick,
  };
}

/**
 * A results payload is gradeable only if it's a real object reporting SETTLED
 * status with a non-empty per-coin resolution set. Anything else (an error
 * string like "results not available yet", a still-PENDING session, empty
 * resolutions) is NOT gradeable — grading it would fabricate a 0/0 row.
 */
export function isGradeableResults(results: unknown): results is { session?: { status?: string; settledAt?: string }; resolutions?: unknown[]; settledMarketData?: unknown[] } {
  if (!results || typeof results !== "object") return false;
  const r = results as any;
  if (r.session?.status && r.session.status !== "SETTLED") return false;
  const rows = r.resolutions ?? r.settledMarketData;
  return Array.isArray(rows) && rows.length > 0;
}

/** Grade every pending record whose session has settled; append to the ledger.
 *  Fails CLOSED — a session is graded only when we can positively confirm it
 *  settled with real market data. Transient/unavailable reads are skipped. */
export async function settleReady(client: McpClient, outDir: string): Promise<LedgerRow[]> {
  const { ledger } = paths(outDir);
  const graded: LedgerRow[] = [];
  for (const rec of listRecords(outDir)) {
    if (rec.status === "settled") continue;

    // Must positively confirm SETTLED status; if we can't read it, skip this cycle.
    let status: string | undefined;
    try {
      status = (await api.session(client, rec.sessionId)).status;
    } catch {
      continue;
    }
    // Terminal-but-ungradeable: sessions cancelled (e.g. below the player minimum)
    // never produce results. Mark them so they don't linger as "pending" forever.
    if (status === "CANCELLED") {
      rec.status = "cancelled";
      writeRecord(outDir, rec);
      continue;
    }
    if (status !== "SETTLED") continue;

    let results: unknown;
    try {
      results = await api.gridResults(client, rec.sessionId);
    } catch {
      continue;
    }
    if (!isGradeableResults(results)) continue;

    const settledAt = (results as any).session?.settledAt ?? rec.settleAt;
    const row = gradeRecord(rec, results, settledAt);
    rec.graded = row;
    rec.status = "settled";
    writeRecord(outDir, rec);
    appendFileSync(ledger, JSON.stringify(row) + "\n");
    graded.push(row);
  }
  return graded;
}

export interface PaperReport {
  gradedSessions: number;
  pendingSessions: number;
  cancelledSessions: number;
  meanAccuracyPct: number;
  meanScore: number;
  meanCaptureEfficiencyPct: number;
  captainHitRatePct: number;
  captainBestInGridRatePct: number;
  wouldSubmitRatePct: number;
  meanConfidence: number;
  // calibration: mean predicted confidence vs realized accuracy on submitted-quality grids
  calibrationGapPct: number;
  rows: LedgerRow[];
}

export function buildReport(outDir: string): PaperReport {
  const recs = listRecords(outDir);
  const rows = recs.filter((r) => r.status === "settled" && r.graded).map((r) => r.graded!) as LedgerRow[];
  const pending = recs.filter((r) => r.status === "pending").length;
  const cancelled = recs.filter((r) => r.status === "cancelled").length;
  const n = rows.length || 1;
  const meanAccuracy = rows.reduce((a, r) => a + r.accuracyPct, 0) / n;
  const meanScore = rows.reduce((a, r) => a + r.ourScore, 0) / n;
  const meanCapture = rows.reduce((a, r) => a + r.captureEfficiencyPct, 0) / n;
  const capHit = (rows.filter((r) => r.captain.correct).length / n) * 100;
  const capBest = (rows.filter((r) => r.captain.wasBestInGrid).length / n) * 100;
  const wouldSubmit = (rows.filter((r) => r.wouldSubmit).length / n) * 100;
  const meanConf = rows.reduce((a, r) => a + r.ourConfidence, 0) / n;
  // predicted confidence is on a 0..1 "edge" scale; compare to realized accuracy fraction
  const calibrationGap = (meanConf - meanAccuracy / 100) * 100;
  return {
    gradedSessions: rows.length,
    pendingSessions: pending,
    cancelledSessions: cancelled,
    meanAccuracyPct: Number(meanAccuracy.toFixed(2)),
    meanScore: Number(meanScore.toFixed(1)),
    meanCaptureEfficiencyPct: Number(meanCapture.toFixed(2)),
    captainHitRatePct: Number(capHit.toFixed(1)),
    captainBestInGridRatePct: Number(capBest.toFixed(1)),
    wouldSubmitRatePct: Number(wouldSubmit.toFixed(1)),
    meanConfidence: Number(meanConf.toFixed(3)),
    calibrationGapPct: Number(calibrationGap.toFixed(2)),
    rows: rows.sort((a, b) => (a.settledAt < b.settledAt ? 1 : -1)),
  };
}

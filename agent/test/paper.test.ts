import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeRecord, isGradeableResults, type PaperRecord } from "../src/engine/paper.js";

const params = { changeMultiplier: 100, captainMultiplier: 2, wrongPenaltyMultiplier: 100, captainWrongPenaltyMultiplier: 2 };

function rec(): PaperRecord {
  return {
    sessionId: "s1",
    displayName: "TEST",
    capturedAt: "2026-01-01T00:00:00Z",
    lockAt: "2026-01-01T00:00:00Z",
    settleAt: "2026-01-01T01:00:00Z",
    status: "pending",
    gridSize: 3,
    captainCoinId: "AAA",
    confidenceScore: 0.7,
    submitThreshold: 0.6,
    wouldSubmit: true,
    entryFee: 10,
    scoringParams: params,
    modelName: "test",
    reasoning: "",
    picks: [
      { coinId: "AAA", position: 0, prediction: "UP", isCaptain: true, confidence: 0.8, expectedMovePct: 3, edge: 0.6, evRegular: 200 },
      { coinId: "BBB", position: 1, prediction: "DOWN", isCaptain: false, confidence: 0.7, expectedMovePct: 2, edge: -0.4, evRegular: 100 },
      { coinId: "CCC", position: 2, prediction: "UP", isCaptain: false, confidence: 0.65, expectedMovePct: 1, edge: 0.3, evRegular: 50 },
    ],
  };
}

test("gradeRecord scores captain 2x, penalizes wrong picks, matches the game formula", () => {
  const results = {
    resolutions: [
      { coinId: "AAA", changePercent: 4, marketRank: 1 }, // UP, captain correct → +4*100*2 = 800
      { coinId: "BBB", changePercent: -2, marketRank: 3 }, // DOWN correct → +2*100 = 200
      { coinId: "CCC", changePercent: -1, marketRank: 4 }, // predicted UP, went down → -1*100 = -100
    ],
  };
  const row = gradeRecord(rec(), results, "2026-01-01T01:00:00Z");
  assert.equal(row.ourScore, 800 + 200 - 100);
  assert.equal(row.correctCount, 2);
  assert.equal(row.accuracyPct, 66.67);
  assert.equal(row.maxPossibleScore, 800 + 200 + 100);
  assert.equal(row.captain.correct, true);
  assert.equal(row.captain.wasBestInGrid, true); // |4| is the biggest move among our picks
});

test("gradeRecord applies the 2x captain penalty when the captain is wrong", () => {
  const r = rec();
  const results = {
    resolutions: [
      { coinId: "AAA", changePercent: -5, marketRank: 1 }, // captain predicted UP, went down → -5*100*2 = -1000
      { coinId: "BBB", changePercent: -2, marketRank: 3 }, // correct → +200
      { coinId: "CCC", changePercent: 1, marketRank: 4 }, // correct → +100
    ],
  };
  const row = gradeRecord(r, results, "2026-01-01T01:00:00Z");
  assert.equal(row.ourScore, -1000 + 200 + 100);
  assert.equal(row.captain.correct, false);
  assert.equal(row.captain.wasBestInGrid, true);
});

test("isGradeableResults fails closed on unavailable / pending / empty results", () => {
  // the exact error string the MCP returns for a not-yet-settled session
  assert.equal(isGradeableResults("Results are not available yet. Session is PENDING."), false);
  assert.equal(isGradeableResults(null), false);
  assert.equal(isGradeableResults({ session: { status: "PENDING" }, resolutions: [] }), false);
  assert.equal(isGradeableResults({ session: { status: "SETTLED" }, resolutions: [] }), false);
  assert.equal(isGradeableResults({ session: { status: "SETTLED" }, resolutions: [{ coinId: "BTC", changePercent: 1 }] }), true);
  // settledMarketData fallback also counts
  assert.equal(isGradeableResults({ settledMarketData: [{ coinId: "BTC", changePercent: 1 }] }), true);
});

test("gradeRecord tolerates a coin missing from resolutions (no move → wrong, 0 points)", () => {
  const results = { resolutions: [{ coinId: "AAA", changePercent: 3, marketRank: 1 }, { coinId: "BBB", changePercent: -2, marketRank: 2 }] };
  const row = gradeRecord(rec(), results, "2026-01-01T01:00:00Z");
  // CCC absent → actualChangePct null, counts as wrong with 0 magnitude
  const ccc = row.perPick.find((p) => p.coinId === "CCC")!;
  assert.equal(ccc.actualChangePct, null);
  assert.equal(ccc.correct, false);
  assert.equal(ccc.points, 0);
});

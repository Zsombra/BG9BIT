import { test } from "node:test";
import assert from "node:assert/strict";
import { EngineConfigSchema } from "../src/core/config.js";
import { buildGrid, validateGrid } from "../src/engine/grid.js";
import type { CoinScore } from "../src/engine/score.js";

const cfg = EngineConfigSchema.parse({});

function mkScore(ticker: string, evRegular: number, confidence: number, expMove: number, dir: "UP" | "DOWN" = "UP"): CoinScore {
  return {
    ticker,
    direction: dir,
    edge: dir === "UP" ? 0.5 : -0.5,
    confidence,
    expectedMovePct: expMove,
    evRegular,
    evCaptain: evRegular * 2,
    contributions: { momentum: 0.5, rsiTrend: 0.2, macd: 0.1, trend: 0.4, meanReversion: 0, relStrength: 0.1, regime: 0.05 },
  };
}

test("buildGrid selects the top-N by EV and places captain at position 0", () => {
  const scores: CoinScore[] = [];
  for (let i = 0; i < 12; i++) scores.push(mkScore(`C${i}`, 100 - i * 5, 0.7, 3));
  const g = buildGrid(scores, 9, cfg, null);
  assert.equal(g.cells.length, 9);
  assert.equal(g.cells.filter((c) => c.isCaptain).length, 1);
  assert.equal(g.cells[0]!.isCaptain, true);
  assert.equal(g.cells[0]!.position, 0);
  // lowest-EV coins (C9..C11) must be excluded
  const picked = new Set(g.cells.map((c) => c.coinId));
  assert.ok(!picked.has("C11"));
});

test("max_ev captain = highest-EV pick that clears the confidence guard", () => {
  const scores = [
    mkScore("HIGHEV", 200, 0.8, 2),
    mkScore("BIGMOVE", 150, 0.55, 9),
    ...Array.from({ length: 9 }, (_, i) => mkScore(`F${i}`, 50 - i, 0.65, 3)),
  ];
  const g = buildGrid(scores, 9, EngineConfigSchema.parse({ grid: { captainPolicy: "max_ev", captainMinConfidence: 0.6 } }), null);
  assert.equal(g.captain.ticker, "HIGHEV");
});

test("max_vol captain = biggest expected mover among confident picks", () => {
  const scores = [
    mkScore("HIGHEV", 200, 0.8, 2),
    mkScore("BIGMOVE", 150, 0.75, 9),
    ...Array.from({ length: 9 }, (_, i) => mkScore(`F${i}`, 50 - i, 0.65, 3)),
  ];
  const g = buildGrid(scores, 9, EngineConfigSchema.parse({ grid: { captainPolicy: "max_vol", captainMinConfidence: 0.6 } }), null);
  assert.equal(g.captain.ticker, "BIGMOVE");
});

test("captain guard skips a big-but-unconfident mover", () => {
  const scores = [
    mkScore("STEADY", 120, 0.7, 3),
    mkScore("WILD", 80, 0.52, 15), // huge move but coin-flip → must not be captain
    ...Array.from({ length: 9 }, (_, i) => mkScore(`F${i}`, 40 - i, 0.66, 3)),
  ];
  const g = buildGrid(scores, 9, EngineConfigSchema.parse({ grid: { captainPolicy: "max_vol", captainMinConfidence: 0.6 } }), null);
  assert.notEqual(g.captain.ticker, "WILD");
});

test("chop regime dampens confidence and raises the submit bar", () => {
  const scores = Array.from({ length: 10 }, (_, i) => mkScore(`C${i}`, 100, 0.75, 3));
  const clear = buildGrid(scores, 9, cfg, { regime: "bull_expansion", conviction: "high" } as any);
  const chop = buildGrid(scores, 9, cfg, { regime: "contraction", conviction: "low" } as any);
  assert.ok(chop.confidenceScore < clear.confidenceScore);
  assert.ok(chop.submitThreshold >= clear.submitThreshold);
  assert.equal(chop.chopGated, true);
});

test("validateGrid catches structural problems", () => {
  const pool = new Set(["A", "B", "C"]);
  const ok = [
    { position: 0, coinId: "A", prediction: "UP" as const, isCaptain: true },
    { position: 1, coinId: "B", prediction: "DOWN" as const, isCaptain: false },
    { position: 2, coinId: "C", prediction: "UP" as const, isCaptain: false },
  ];
  assert.equal(validateGrid(ok, 3, pool).length, 0);

  const twoCaptains = ok.map((c, i) => ({ ...c, isCaptain: i < 2 }));
  assert.ok(validateGrid(twoCaptains, 3, pool).some((p) => /one captain/.test(p)));

  const badPool = [{ position: 0, coinId: "Z", prediction: "UP" as const, isCaptain: true }, ok[1]!, ok[2]!];
  assert.ok(validateGrid(badPool, 3, pool).some((p) => /not in session pool/.test(p)));
});

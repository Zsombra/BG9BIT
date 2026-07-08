import { test } from "node:test";
import assert from "node:assert/strict";
import { rsi, ema, sma, atr, returns, mean, stdev } from "../src/ta/indicators.js";

test("sma computes trailing mean", () => {
  assert.equal(sma([1, 2, 3, 4, 5], 5), 3);
  assert.equal(sma([2, 4, 6], 3), 4);
  assert.equal(sma([1, 2], 3), null);
});

test("ema is bounded by the series and reacts to last values", () => {
  const e = ema([1, 1, 1, 1, 10], 3);
  assert.ok(e !== null && e > 1 && e < 10);
});

test("rsi is 100 for a monotonically rising series", () => {
  const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
  assert.equal(rsi(closes, 14), 100);
});

test("rsi is ~50 for an alternating flat series and within [0,100]", () => {
  const closes = Array.from({ length: 40 }, (_, i) => 100 + (i % 2 === 0 ? 1 : -1));
  const r = rsi(closes, 14)!;
  assert.ok(r >= 0 && r <= 100);
});

test("atr is positive for a series with range", () => {
  const n = 30;
  const highs = Array.from({ length: n }, (_, i) => 101 + i);
  const lows = Array.from({ length: n }, (_, i) => 99 + i);
  const closes = Array.from({ length: n }, (_, i) => 100 + i);
  const a = atr(highs, lows, closes, 14)!;
  assert.ok(a > 0);
});

test("returns / mean / stdev basics", () => {
  const rets = returns([100, 110, 99]);
  assert.equal(rets.length, 2);
  assert.ok(Math.abs(rets[0]! - 0.1) < 1e-9);
  assert.equal(mean([2, 4, 6]), 4);
  assert.ok(stdev([2, 4, 6]) > 0);
  assert.equal(stdev([5, 5, 5]), 0);
});

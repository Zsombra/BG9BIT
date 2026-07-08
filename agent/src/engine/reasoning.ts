/* Compose the grid-level `reasoning` string submitted with a prediction. */
import type { RegimeSnapshot } from "../mcp/tools.js";
import type { BuiltGrid } from "./grid.js";

export function buildReasoning(
  g: BuiltGrid,
  sessionName: string,
  regime: RegimeSnapshot | null,
): string {
  const ups = g.picks.filter((p) => p.direction === "UP").length;
  const downs = g.picks.length - ups;
  const cap = g.captain;
  const regimeStr = regime
    ? `${regime.regime} (${regime.conviction} conviction)`
    : "unavailable";

  const lines = [
    `Session: ${sessionName}. Reference regime: ${regimeStr}.`,
    `Grid: ${ups} UP / ${downs} DOWN, selected by expected value (E[|move%|] × calibrated edge).`,
    `Captain: ${cap.ticker} ${cap.direction} — policy=${g.captainPolicy}, conf ${(cap.confidence * 100).toFixed(
      0,
    )}%, exp move ~${cap.expectedMovePct.toFixed(2)}% (captain 2× reward and 2× penalty).`,
    `Overall confidence ${(g.confidenceScore * 100).toFixed(0)}% vs submit threshold ${(
      g.submitThreshold * 100
    ).toFixed(0)}% → ${g.wouldSubmit ? "would submit" : "would hold"}.`,
  ];
  if (g.notes.length) lines.push(`Notes: ${g.notes.join(" ")}`);
  // Keep within the 5000-char server limit.
  return lines.join("\n").slice(0, 4900);
}

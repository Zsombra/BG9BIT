/* Tiny logger with a dry-run banner and colorless, greppable output. */
let jsonMode = false;
export function setJsonMode(v: boolean) {
  jsonMode = v;
}
export const log = {
  info: (...a: unknown[]) => {
    if (!jsonMode) console.log(...a);
  },
  warn: (...a: unknown[]) => console.error("⚠ ", ...a),
  err: (...a: unknown[]) => console.error("✖ ", ...a),
  json: (obj: unknown) => console.log(JSON.stringify(obj, null, 2)),
  banner: (mode: "DRY-RUN" | "LIVE") => {
    if (jsonMode) return;
    const line = "─".repeat(52);
    console.log(line);
    console.log(
      mode === "DRY-RUN"
        ? "  DRY-RUN — no writes, no wagers. Use --live to apply."
        : "  LIVE — this run may mutate your account.",
    );
    console.log(line);
  },
};

export function fmtUsd(n: number | string | undefined | null): string {
  const v = typeof n === "string" ? Number(n) : n ?? 0;
  return `$${Number(v).toFixed(2)}`;
}

export function pct(n: number, digits = 2): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

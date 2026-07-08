import { readFileSync } from "node:fs";
import { z } from "zod";
import { parseJsonc } from "./jsonc.js";

/* ------------------------------------------------------------------ *
 * Connection
 * ------------------------------------------------------------------ */
const Connection = z.object({
  baseUrl: z.string().default("https://mcp.battlegrid.trade/mcp"),
  apiKeyEnv: z.string().default("BATTLEGRID_API_KEY"),
});

/* ------------------------------------------------------------------ *
 * Engine config (Phase 1 — external prediction + bias)
 * ------------------------------------------------------------------ */
export const EngineConfigSchema = z.object({
  connection: Connection.default({}),
  analysis: z
    .object({
      candleInterval: z.string().default("1h"),
      candleLimit: z.number().int().min(30).max(100).default(100),
      rsiPeriod: z.number().int().default(14),
      macd: z.tuple([z.number(), z.number(), z.number()]).default([12, 26, 9]),
      atrPeriod: z.number().int().default(14),
      emaFast: z.number().int().default(5),
      emaSlow: z.number().int().default(20),
      // weights blended into the per-coin directional score (any sign-agnostic scale)
      weights: z
        .object({
          momentum: z.number().default(1.0),
          rsi: z.number().default(0.7),
          macd: z.number().default(0.9),
          trend: z.number().default(1.0),
          meanReversion: z.number().default(0.4),
          relStrength: z.number().default(0.7),
          regimeAlign: z.number().default(0.8),
        })
        .default({}),
    })
    .default({}),
  scoring: z
    .object({
      // maps directional edge (0..1) -> calibrated confidence via 0.5 + 0.5*tanh(k*edge)
      edgeToConfK: z.number().default(2.2),
      confidenceCeil: z.number().min(0.5).max(1).default(0.92),
      // expected |move%| over the session horizon = blend of ATR% and realized abs-return
      expectedMoveAtrWeight: z.number().min(0).max(1).default(0.6),
    })
    .default({}),
  grid: z
    .object({
      captainPolicy: z.enum(["max_ev", "max_vol", "balanced", "safe"]).default("max_ev"),
      captainMinConfidence: z.number().min(0).max(1).default(0.6),
      volGamma: z.number().default(1.0),
    })
    .default({}),
  regime: z
    .object({
      referenceCoin: z.string().default("BTC"),
      timeframe: z.string().default("4h"),
      biasTilt: z.number().min(0).max(1).default(0.15), // directional prior strength from regime
      gateInChop: z.boolean().default(true),
      chopMinConfidence: z.number().min(0).max(1).default(0.7),
    })
    .default({}),
  confidence: z
    .object({
      submitThreshold: z.number().min(0).max(1).default(0.6),
    })
    .default({}),
  bias: z
    .object({
      stopAtrMult: z.number().default(1.5),
      targetAtrMult: z.number().default(3.0),
    })
    .default({}),
  execution: z
    .object({
      // Master money switch. Paper-only when false — submit is refused regardless of flags.
      live: z.boolean().default(false),
      maxEntryFeeUsd: z.number().default(0),
      requireYes: z.boolean().default(true),
    })
    .default({}),
});
export type EngineConfig = z.infer<typeof EngineConfigSchema>;

/* ------------------------------------------------------------------ *
 * Native agent config (Phase 2 — config-as-code for the BattleGrid agent)
 * ------------------------------------------------------------------ */
const StrategyPreset = z.enum([
  "DUNKIRK", "LENINGRAD", "LONDON", "TOBRUK", "MIDWAY", "EL_ALAMEIN",
  "BASTOGNE", "KURSK", "NORMANDY", "STALINGRAD", "BERLIN", "IWO_JIMA", "CUSTOM",
]);
const BrainPreset = z.enum([
  "MONTGOMERY", "KESSELRING", "CHUIKOV", "EISENHOWER", "ZHUKOV",
  "NIMITZ", "BRADLEY", "ROMMEL", "PATTON", "YAMAMOTO", "CUSTOM",
]);

const Condition = z.union([
  z.object({
    kind: z.literal("regime"),
    regimes: z.array(
      z.enum(["bull_expansion", "bear_expansion", "bull_ranging", "bear_ranging", "contraction", "volatile"]),
    ),
    minConviction: z.enum(["maximum", "high", "medium", "low", "uncertain"]).optional(),
  }),
  z.object({
    kind: z.literal("time_window"),
    fromHour: z.number().int().min(0).max(23),
    toHour: z.number().int().min(1).max(24),
    days: z.array(z.number().int().min(0).max(6)),
  }),
]);

const Slot = z.object({
  isDefault: z.boolean(),
  priority: z.number().int().positive().nullable(),
  minConfidence: z.number().min(0).max(1),
  conditions: z.array(Condition).max(2).default([]),
});

export const AgentConfigSchema = z.object({
  connection: Connection.default({}),
  agent: z.object({
    agentId: z.string().uuid().optional(),
    displayName: z.string().optional(), // fallback lookup if agentId omitted
    desired: z
      .object({
        strategyPreset: StrategyPreset.optional(),
        brainPreset: BrainPreset.optional(),
        modelId: z.string().optional(),
        overlayText: z.string().optional(),
        behavior: z
          .object({
            risk: z.enum(["CONSERVATIVE", "MODERATE", "AGGRESSIVE"]),
            outlook: z.enum(["OPTIMIST", "REALIST", "PESSIMIST"]),
            conviction: z.enum(["CAUTIOUS", "MODERATE", "BOLD"]),
          })
          .optional(),
        contextSources: z.record(z.boolean()).optional(),
      })
      .default({}),
    signalRules: z
      .array(
        z.object({
          signalId: z.string(),
          allocation: z.number().int().min(0).max(3),
          params: z.record(z.any()).default({}),
        }),
      )
      .default([]),
    // Trading config is money-adjacent; left unmanaged unless explicitly enabled.
    tradingConfig: z
      .object({ manage: z.boolean().default(false) })
      .passthrough()
      .default({ manage: false }),
  }),
  deployment: z
    .object({
      manage: z.boolean().default(false),
      presetId: z.string().uuid().optional(),
      regimeReferenceCoinId: z.string().optional(),
      regimeTimeframe: z.string().optional(),
      slots: z.array(Slot).default([]),
    })
    .default({ manage: false }),
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/* ------------------------------------------------------------------ */
export function loadEngineConfig(path: string): EngineConfig {
  const raw = parseJsonc(readFileSync(path, "utf8"));
  return EngineConfigSchema.parse(raw);
}
export function loadAgentConfig(path: string): AgentConfig {
  const raw = parseJsonc(readFileSync(path, "utf8"));
  return AgentConfigSchema.parse(raw);
}

export function resolveApiKey(envName: string): string {
  const key = process.env[envName];
  if (!key) {
    throw new Error(
      `Missing API key. Set ${envName} (e.g. export ${envName}=bg_live_...) — see agent/.env.example`,
    );
  }
  return key;
}

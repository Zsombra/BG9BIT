/* Regime-aware deployment policy: build slots, preview resolution, apply (gated). */
import type { AgentConfig } from "../core/config.js";
import type { McpClient } from "../mcp/client.js";
import { api, type DeploymentSlot } from "../mcp/tools.js";

const REGIMES = [
  "bull_expansion",
  "bear_expansion",
  "bull_ranging",
  "bear_ranging",
  "contraction",
  "volatile",
] as const;

/** Materialize config slots into API slots by binding the agentId to each. */
export function buildSlots(cfg: AgentConfig, agentId: string): DeploymentSlot[] {
  const slots = cfg.deployment.slots.map((s) => ({
    agentId,
    minConfidence: s.minConfidence,
    priority: s.priority,
    isDefault: s.isDefault,
    conditions: s.conditions,
  }));
  validateSlots(slots);
  return slots;
}

export function validateSlots(slots: DeploymentSlot[]): void {
  const defaults = slots.filter((s) => s.isDefault);
  if (defaults.length !== 1) {
    throw new Error(`Deployment policy needs exactly one default slot, found ${defaults.length}.`);
  }
  if (defaults[0]!.conditions.length !== 0 || defaults[0]!.priority !== null) {
    throw new Error("The default slot must have priority:null and conditions:[].");
  }
  const priorities = slots.filter((s) => !s.isDefault).map((s) => s.priority);
  if (new Set(priorities).size !== priorities.length) {
    throw new Error("Rule slot priorities must be unique.");
  }
  for (const s of slots.filter((x) => !x.isDefault)) {
    if (s.priority == null || s.priority <= 0) throw new Error("Rule slots need a unique positive priority.");
    if (s.conditions.length === 0) throw new Error("Rule slots need at least one condition.");
  }
}

export interface DeployArgs {
  presetId: string;
  slots: DeploymentSlot[];
  regimeReferenceCoinId?: string;
  regimeTimeframe?: string;
}

export function deployArgs(cfg: AgentConfig, agentId: string): DeployArgs {
  if (!cfg.deployment.presetId) throw new Error("deployment.presetId is required.");
  const args: DeployArgs = {
    presetId: cfg.deployment.presetId,
    slots: buildSlots(cfg, agentId),
  };
  if (cfg.deployment.regimeReferenceCoinId) args.regimeReferenceCoinId = cfg.deployment.regimeReferenceCoinId;
  if (cfg.deployment.regimeTimeframe) args.regimeTimeframe = cfg.deployment.regimeTimeframe;
  return args;
}

/** Dry-run: which slot resolves now, and under each simulated regime. No writes, no wager. */
export async function previewResolution(
  client: McpClient,
  args: DeployArgs,
): Promise<{ now: unknown; byRegime: Record<string, unknown> }> {
  const now = await api.previewDeployment(client, { ...args });
  const byRegime: Record<string, unknown> = {};
  for (const r of REGIMES) {
    byRegime[r] = await api.previewDeployment(client, { ...args, simulatedRegime: r });
  }
  return { now, byRegime };
}

/** Apply the deployment policy (WRITE — enables real-money auto-play). Gated in CLI. */
export async function applyDeployment(client: McpClient, args: DeployArgs): Promise<unknown> {
  return api.upsertDeployment(client, { ...args });
}

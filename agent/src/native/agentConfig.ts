/* Config-as-code for a BattleGrid Intelligence Agent: resolve, diff (plan), apply. */
import type { AgentConfig } from "../core/config.js";
import type { McpClient } from "../mcp/client.js";
import { api, type IntelligenceAgent } from "../mcp/tools.js";

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface AgentPlan {
  agentId: string;
  revision: number;
  changes: FieldChange[];
  updateArgs: Record<string, unknown>;
}

export async function resolveAgentId(client: McpClient, cfg: AgentConfig): Promise<string> {
  if (cfg.agent.agentId) return cfg.agent.agentId;
  const { agents } = await api.listAgents(client);
  const name = cfg.agent.displayName;
  const found = name
    ? agents.find((a) => a.displayName.toLowerCase() === name.toLowerCase())
    : agents[0];
  if (!found) {
    throw new Error(
      `Could not resolve agent (agentId/displayName not set or not found). Agents: ${agents
        .map((a) => a.displayName)
        .join(", ") || "none"}`,
    );
  }
  return found.id;
}

function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Compute the changes needed to move `current` toward the desired config. No writes. */
export function planAgent(current: IntelligenceAgent, cfg: AgentConfig): AgentPlan {
  const d = cfg.agent.desired;
  const changes: FieldChange[] = [];
  const updateArgs: Record<string, unknown> = {
    agentId: current.id,
    expectedRevision: current.revision,
  };

  const consider = (field: string, cur: unknown, next: unknown | undefined) => {
    if (next === undefined) return;
    if (!eq(cur, next)) {
      changes.push({ field, from: cur, to: next });
      updateArgs[field] = next;
    }
  };

  consider("strategyPreset", current.strategyPreset, d.strategyPreset);
  consider("brainPreset", current.brainPreset, d.brainPreset);
  consider("modelId", current.modelId, d.modelId);
  consider("overlayText", current.overlayText, d.overlayText);
  consider("behavior", current.behavior, d.behavior);

  if (d.contextSources) {
    const merged = { ...current.contextSources, ...d.contextSources };
    if (!eq(current.contextSources, merged)) {
      // report only the flipped keys for readability
      const flips: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(d.contextSources)) {
        if (current.contextSources[k] !== v) flips[k] = v;
      }
      changes.push({ field: "contextSources", from: "(current)", to: flips });
      updateArgs["contextSources"] = merged;
    }
  }

  // tradingConfig is money-adjacent: only include if explicitly managed.
  if (cfg.agent.tradingConfig?.manage) {
    const { manage, ...tc } = cfg.agent.tradingConfig as Record<string, unknown>;
    if (Object.keys(tc).length > 0 && !eq(current.tradingConfig, tc)) {
      changes.push({ field: "tradingConfig", from: current.tradingConfig, to: tc });
      updateArgs["tradingConfig"] = tc;
    }
  }

  return { agentId: current.id, revision: current.revision, changes, updateArgs };
}

/** Apply an agent plan (WRITE). Only call behind --live gating. */
export async function applyAgent(client: McpClient, plan: AgentPlan): Promise<unknown> {
  if (plan.changes.length === 0) return { noop: true };
  return api.updateAgent(client, plan.updateArgs);
}

// ---------- Signal rules ----------
export interface SignalRuleChange {
  signalId: string;
  fromAllocation: number | undefined;
  toAllocation: number;
  params: Record<string, unknown>;
}

export function planSignalRules(currentRulesResp: any, cfg: AgentConfig): SignalRuleChange[] {
  const desired = cfg.agent.signalRules ?? [];
  if (desired.length === 0) return [];
  const rules: any[] = currentRulesResp?.rules ?? [];
  const byId = new Map<string, any>(rules.map((r) => [r.signalId, r]));
  const changes: SignalRuleChange[] = [];
  for (const d of desired) {
    const cur = byId.get(d.signalId);
    const curAlloc = cur?.effective?.allocation;
    const curParams = cur?.effective?.params ?? {};
    if (curAlloc !== d.allocation || JSON.stringify(curParams) !== JSON.stringify(d.params)) {
      changes.push({
        signalId: d.signalId,
        fromAllocation: curAlloc,
        toAllocation: d.allocation,
        params: d.params,
      });
    }
  }
  return changes;
}

export async function applySignalRules(
  client: McpClient,
  agentId: string,
  changes: SignalRuleChange[],
): Promise<void> {
  for (const c of changes) {
    await api.updateSignalRule(client, {
      agentId,
      signalId: c.signalId,
      allocation: c.toAllocation,
      params: c.params,
    });
  }
}

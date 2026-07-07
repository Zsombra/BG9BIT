/* Typed, thin wrappers over the BattleGrid MCP tools this project uses. */
import type { McpClient } from "./client.js";

// ---------- Domain types (only the fields we rely on) ----------
export interface Coin {
  id: string;
  name: string;
  ticker: string;
  category?: string;
  maxLeverage?: number;
}

export interface GamePreset {
  id: string;
  displayName: string;
  gameType: string;
  timeRangeKey: string;
  gridSize: number;
  gridRows: number;
  gridCols: number;
  changeMultiplier: number;
  captainMultiplier: number;
  wrongPenaltyMultiplier: number;
  captainWrongPenaltyMultiplier: number;
  entryFee: number;
  jackpotEnabled?: boolean;
  regimeReferenceCoinId?: string;
  regimeReferenceTimeframe?: string;
  coinIds?: string[];
}

export interface GridSession {
  id: string;
  gamePresetId: string;
  displayName: string;
  status: "PENDING" | "LIVE" | "SETTLING" | "SETTLED" | "CANCELLED";
  timeRangeKey?: string;
  gridSize: number;
  gridRows?: number;
  gridCols?: number;
  lockAt: string;
  settleAt: string;
  entryFee?: number;
  regimeReferenceTicker?: string;
  regimeReferenceTimeframe?: string;
  coinPool: Coin[];
}

export interface SessionSummary {
  sessionId: string;
  gamePresetId: string;
  displayName: string;
  status: string;
  timeRangeKey?: string;
  entryFee?: number;
  lockAt?: string;
  playerCount?: number;
}

export interface Candle {
  symbol: string;
  timeframe: string;
  openTime: string;
  closeTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface RegimeSnapshot {
  regime:
    | "bull_expansion"
    | "bear_expansion"
    | "bull_ranging"
    | "bear_ranging"
    | "contraction"
    | "volatile"
    | string;
  conviction: "maximum" | "high" | "medium" | "low" | "uncertain" | string;
  regimeRunLengthBars?: number;
  context?: {
    trend?: string;
    volatility?: string;
    momentum?: string;
    structuralBias?: string;
    pricePosition?: string[];
  };
  notice?: string;
}

export interface AccountState {
  username: string;
  balance: { usdc: string; totalBalance: string; hasAccount: boolean };
  stats: Record<string, unknown>;
  agentSlots: { limit: number; used: number; remaining: number };
  mcpWagerEnabled: boolean;
  tradingWalletProvisioned: boolean;
}

export interface IntelligenceAgent {
  id: string;
  displayName: string;
  status: string;
  revision: number;
  behavior: { risk: string; outlook: string; conviction: string };
  contextSources: Record<string, boolean>;
  overlayText: string;
  modelId: string;
  strategyPreset?: string;
  brainPreset?: string;
  tradingConfig?: Record<string, unknown>;
}

export interface DeploymentCondition {
  kind: "regime" | "time_window";
  regimes?: string[];
  minConviction?: string;
  fromHour?: number;
  toHour?: number;
  days?: number[];
}
export interface DeploymentSlot {
  agentId: string;
  minConfidence: number;
  priority: number | null;
  isDefault: boolean;
  conditions: DeploymentCondition[];
}

export type Prediction = "UP" | "DOWN";
export interface GridCell {
  position: number;
  coinId: string;
  prediction: Prediction;
  isCaptain: boolean;
}
export interface PickReasoning {
  coinId: string;
  reasoning: string;
  confidence: number;
}

// ---------- Wrappers ----------
export const api = {
  accountState: (c: McpClient) => c.callTool<AccountState>("get_account_state"),

  listSessions: (c: McpClient, status = "PENDING", limit?: number) =>
    c.callTool<SessionSummary[]>("list_market_grid_sessions", limit ? { status, limit } : { status }),

  session: (c: McpClient, sessionId: string) =>
    c.callTool<GridSession>("get_market_grid_session", { sessionId }),

  gamePresets: (c: McpClient) => c.callTool<GamePreset[]>("list_game_presets"),

  marketContext: (c: McpClient, args: { sessionId?: string; primaryTimeframe?: string; modules?: string[] }) =>
    c.callTool<any>("get_market_context", args),

  candles: (c: McpClient, ticker: string, interval: string, limit = 200) =>
    c.callTool<{ candles: Candle[] }>("get_coin_candles", { ticker, interval, limit }),

  topRanked: (c: McpClient, metric: string, interval: string, limit = 20) =>
    c.callTool<Array<{ ticker: string; rank: number; latestMetricValue: number }>>("get_top_ranked_coins", {
      metric,
      interval,
      limit,
    }),

  regimeSnapshot: (c: McpClient, symbol = "BTC", timeframe = "4h") =>
    c.callTool<RegimeSnapshot>("get_regime_snapshot", { symbol, timeframe }),

  regimeHistory: (c: McpClient, symbol = "BTC", timeframe = "4h", bars = 60) =>
    c.callTool<any>("get_regime_history", { symbol, timeframe, bars }),

  gridResults: (c: McpClient, sessionId: string) =>
    c.callTool<any>("get_market_grid_results", { sessionId }),

  checkSubmission: (c: McpClient, sessionId: string) =>
    c.callTool<any>("check_market_grid_submission", { sessionId }),

  // ----- native agent -----
  listAgents: (c: McpClient) => c.callTool<{ agents: IntelligenceAgent[] }>("list_intelligence_agents"),
  getAgent: (c: McpClient, agentId: string) =>
    c.callTool<{ agent: IntelligenceAgent }>("get_intelligence_agent", { agentId }),
  signalRules: (c: McpClient, agentId: string) => c.callTool<any>("get_agent_signal_rules", { agentId }),
  automationStatus: (c: McpClient, agentId: string) =>
    c.callTool<any>("get_agent_automation_status", { agentId }),
  deploymentPolicy: (c: McpClient, presetId: string) =>
    c.callTool<any>("get_deployment_policy", { presetId }),
  strategyCatalog: (c: McpClient) => c.callTool<any>("get_strategy_preset_catalog"),
  tradingCatalog: (c: McpClient) => c.callTool<any>("get_trading_config_catalog"),
  approvedModels: (c: McpClient) => c.callTool<any>("list_approved_models"),

  // ----- WRITE tools (only invoked behind --live gating in the CLI) -----
  updateAgent: (c: McpClient, args: Record<string, unknown>) =>
    c.callTool<any>("update_intelligence_agent", args),
  updateSignalRule: (c: McpClient, args: Record<string, unknown>) =>
    c.callTool<any>("update_agent_signal_rule", args),
  previewDeployment: (c: McpClient, args: Record<string, unknown>) =>
    c.callTool<any>("preview_deployment_resolution", args),
  testDeploymentGrid: (c: McpClient, args: Record<string, unknown>) =>
    c.callTool<any>("test_generate_deployment_grid", args),
  upsertDeployment: (c: McpClient, args: Record<string, unknown>) =>
    c.callTool<any>("upsert_deployment_policy", args),
  submitGrid: (c: McpClient, args: Record<string, unknown>) => c.callTool<any>("submit_market_grid", args),
};

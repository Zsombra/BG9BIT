#!/usr/bin/env -S npx tsx
/* BattleGrid agent CLI — dry-run/preview by default; money paths are hard-gated. */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { McpClient } from "./mcp/client.js";
import { api } from "./mcp/tools.js";
import {
  loadAgentConfig,
  loadEngineConfig,
  resolveApiKey,
  type AgentConfig,
  type EngineConfig,
} from "./core/config.js";
import { log, setJsonMode, fmtUsd, pct } from "./core/logger.js";
import { scoringParamsFromPreset } from "./engine/score.js";
import { buildBias } from "./engine/bias.js";
import { runPrediction, scorePool, loadSessionForEngine } from "./engine/pipeline.js";
import {
  recordPending,
  settleReady,
  buildReport,
  savePredictionRecord,
  readRecord,
  type LedgerRow,
} from "./engine/paper.js";
import { planAgent, planSignalRules, applyAgent, applySignalRules, resolveAgentId } from "./native/agentConfig.js";
import { buildSlots, deployArgs, previewResolution, applyDeployment } from "./native/deployment.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT = resolve(ROOT, "out");
const DEFAULT_ENGINE_CFG = resolve(ROOT, "config/engine.config.jsonc");
const DEFAULT_AGENT_CFG = resolve(ROOT, "config/agent.config.jsonc");

// ---------------- arg parsing ----------------
interface Args {
  cmd: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}
function parseArgs(argv: string[]): Args {
  const [cmd = "help", ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else flags[key] = true;
    } else positional.push(a);
  }
  return { cmd, positional, flags };
}

function makeClient(cfg: { connection: { baseUrl: string; apiKeyEnv: string } }): McpClient {
  const url = (process.env.BATTLEGRID_MCP_URL as string) || cfg.connection.baseUrl;
  const apiKey = resolveApiKey(cfg.connection.apiKeyEnv);
  return new McpClient({ url, apiKey });
}

// ---------------- commands ----------------
async function cmdAccount(client: McpClient, json: boolean) {
  const a = await api.accountState(client);
  if (json) return log.json(a);
  log.info(`Account: ${a.username}`);
  log.info(`  balance: total ${fmtUsd(a.balance.totalBalance)}, free USDC ${fmtUsd(a.balance.usdc)}`);
  log.info(`  agent slots: ${a.agentSlots.used}/${a.agentSlots.limit} used`);
  log.info(`  wagering enabled: ${a.mcpWagerEnabled}  |  trading wallet: ${a.tradingWalletProvisioned}`);
}

async function cmdSessions(client: McpClient, json: boolean) {
  const s = await api.listSessions(client, "PENDING");
  if (json) return log.json(s);
  if (!s.length) return log.info("No PENDING sessions.");
  for (const x of s) {
    log.info(`${x.sessionId}  ${x.displayName}  [${x.timeRangeKey ?? "?"}]  fee ${fmtUsd(x.entryFee)}  lock ${x.lockAt ?? "?"}`);
  }
}

async function cmdRegime(client: McpClient, engine: EngineConfig, flags: Args["flags"], json: boolean) {
  const coin = (flags.coin as string) || engine.regime.referenceCoin;
  const tf = (flags.tf as string) || engine.regime.timeframe;
  const r = await api.regimeSnapshot(client, coin, tf);
  if (json) return log.json(r);
  log.info(`Regime ${coin} @ ${tf}: ${r.regime} (${r.conviction}), held ${r.regimeRunLengthBars ?? "?"} bars`);
  if (r.context) log.info(`  trend=${r.context.trend} vol=${r.context.volatility} momentum=${r.context.momentum} structBias=${r.context.structuralBias}`);
  if (r.notice) log.info(`  notice: ${r.notice}`);
}

async function cmdAnalyze(client: McpClient, engine: EngineConfig, sessionId: string, json: boolean) {
  const { session, params } = await loadSessionForEngine(client, sessionId);
  const tickers = session.coinPool.map((c) => c.ticker ?? c.id);
  const { scores, regime } = await scorePool(client, engine, tickers, session.timeRangeKey, params);
  scores.sort((a, b) => b.evRegular - a.evRegular);
  if (json) return log.json({ sessionId, regime, scores });
  log.info(`Analyze ${session.displayName} (${tickers.length} coins, grid ${session.gridSize})`);
  log.info(`Regime ${engine.regime.referenceCoin}@${engine.regime.timeframe}: ${regime?.regime ?? "n/a"} (${regime?.conviction ?? "-"})`);
  log.info("rank  coin        dir   conf   expMove   EV(pts)   edge");
  scores.forEach((s, i) => {
    log.info(
      `${String(i + 1).padStart(2)}.  ${s.ticker.padEnd(10)} ${s.direction.padEnd(4)} ${(s.confidence * 100).toFixed(0).padStart(3)}%  ${pct(s.expectedMovePct).padStart(7)}  ${s.evRegular.toFixed(0).padStart(6)}   ${s.edge.toFixed(2).padStart(5)}`,
    );
  });
}

async function cmdPredict(client: McpClient, engine: EngineConfig, sessionId: string, json: boolean) {
  const r = await runPrediction(client, engine, sessionId);
  savePredictionRecord(OUT, r); // persist for later paper-scoring (not submitted)
  const { grid, regime, problems } = r;

  if (json) return log.json({ ...r.submission, validation: problems, wouldSubmit: grid.wouldSubmit });
  log.info(`Predict ${r.session.displayName} — grid ${r.session.gridSize}, captain policy ${grid.captainPolicy}`);
  log.info(`Regime: ${regime?.regime ?? "n/a"} (${regime?.conviction ?? "-"})`);
  grid.cells.forEach((c) => {
    const p = grid.picks.find((x) => x.ticker === c.coinId)!;
    log.info(`  ${c.isCaptain ? "★" : " "} #${c.position} ${c.coinId.padEnd(10)} ${c.prediction.padEnd(4)} conf ${(p.confidence * 100).toFixed(0)}%  exp ${pct(p.expectedMovePct)}  EV ${p.evRegular.toFixed(0)}`);
  });
  log.info(`Overall confidence ${(grid.confidenceScore * 100).toFixed(0)}% (submit threshold ${(grid.submitThreshold * 100).toFixed(0)}%) → ${grid.wouldSubmit ? "WOULD SUBMIT" : "HOLD"}`);
  if (problems.length) log.warn("validation:", problems.join("; "));
  grid.notes.forEach((n) => log.info(`  note: ${n}`));
  log.info(`Saved submission to out/predictions/${sessionId}.json (not submitted — dry run).`);
}

async function cmdBias(client: McpClient, engine: EngineConfig, flags: Args["flags"], json: boolean) {
  let tickers: string[];
  let timeRangeKey: string | undefined;
  let params = scoringParamsFromPreset({ changeMultiplier: 100, captainMultiplier: 2, wrongPenaltyMultiplier: 100, captainWrongPenaltyMultiplier: 2 } as any);
  if (flags.session) {
    const loaded = await loadSessionForEngine(client, flags.session as string);
    tickers = loaded.session.coinPool.map((c) => c.ticker ?? c.id);
    timeRangeKey = loaded.session.timeRangeKey;
    params = loaded.params;
  } else if (flags.coins) {
    tickers = String(flags.coins).split(",").map((s) => s.trim()).filter(Boolean);
  } else {
    // default: BTC + a few majors
    tickers = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE"];
  }
  const { scores, feats, regime } = await scorePool(client, engine, tickers, timeRangeKey, params);
  const bias = buildBias(scores, feats, engine, regime, new Date().toISOString());
  if (json) return log.json(bias);
  log.info(`Trade bias — regime ${bias.referenceRegime?.regime ?? "n/a"} (${bias.referenceRegime?.conviction ?? "-"})`);
  log.info(`Net bias ${bias.netBias >= 0 ? "LONG" : "SHORT"} ${bias.netBias.toFixed(2)} | breadth ${bias.breadthLongPct}% long`);
  log.info("coin        bias   strength  conf   expMove  stop%   target%  R:R   regime");
  bias.coins.forEach((c) => {
    log.info(`${c.ticker.padEnd(10)} ${c.bias.padEnd(5)} ${c.strength.toFixed(2).padStart(6)}  ${(c.confidence * 100).toFixed(0).padStart(3)}%  ${pct(c.expectedMovePct).padStart(6)}  ${c.suggestedStopPct.toFixed(2).padStart(5)}  ${c.suggestedTargetPct.toFixed(2).padStart(6)}  ${String(c.rr).padStart(4)}  ${c.regimeAlignment}`);
  });
}

function printLedgerRow(r: LedgerRow) {
  log.info(`${r.displayName} [${r.sessionId.slice(0, 8)}] — acc ${r.accuracyPct}% (${r.correctCount}/${r.gridSize}), score ${r.ourScore} / max ${r.maxPossibleScore} (capture ${r.captureEfficiencyPct}%)`);
  log.info(`  captain ${r.captain.coinId} ${r.captain.prediction} ${r.captain.correct ? "✓" : "✗"} move ${r.captain.changePct == null ? "?" : pct(r.captain.changePct)}${r.captain.wasBestInGrid ? " (best mover ★)" : ""} | ourConf ${(r.ourConfidence * 100).toFixed(0)}% wouldSubmit ${r.wouldSubmit}`);
}

async function cmdGrade(client: McpClient, sessionId: string, json: boolean) {
  const rec = readRecord(OUT, sessionId);
  if (!rec) throw new Error(`No saved prediction for ${sessionId}. Run 'predict' (or 'paper:predict') before the session locks.`);
  if (rec.status !== "settled") await settleReady(client, OUT);
  const updated = readRecord(OUT, sessionId);
  if (json) return log.json(updated?.graded ?? { status: updated?.status ?? "unknown" });
  if (!updated?.graded) {
    log.info(`Session ${sessionId} not settled yet (record status: ${updated?.status ?? "unknown"}).`);
    return;
  }
  printLedgerRow(updated.graded);
}

async function cmdPaperPredict(client: McpClient, engine: EngineConfig, json: boolean) {
  const res = await recordPending(client, engine, OUT);
  if (json) return log.json(res);
  log.info(`paper:predict — recorded ${res.recorded.length} new prediction(s), skipped ${res.skipped.length} (already captured / no data).`);
  res.recorded.forEach((s) => log.info(`  + ${s}`));
}

async function cmdPaperSettle(client: McpClient, json: boolean) {
  const graded = await settleReady(client, OUT);
  if (json) return log.json(graded);
  if (!graded.length) return log.info("paper:settle — nothing newly settled.");
  log.info(`paper:settle — graded ${graded.length} session(s):`);
  graded.forEach(printLedgerRow);
}

async function cmdPaperRun(client: McpClient, engine: EngineConfig, json: boolean) {
  const recorded = await recordPending(client, engine, OUT);
  const graded = await settleReady(client, OUT);
  if (json) return log.json({ recorded, graded });
  log.info(`paper:run — recorded ${recorded.recorded.length} new, graded ${graded.length} settled.`);
  graded.forEach(printLedgerRow);
}

function cmdPaperReport(json: boolean) {
  const rep = buildReport(OUT);
  if (json) return log.json(rep);
  log.info(`Paper report — ${rep.gradedSessions} graded, ${rep.pendingSessions} pending`);
  if (rep.gradedSessions === 0) {
    log.info("  No graded sessions yet. Run 'paper:predict' before sessions lock, then 'paper:settle' after they settle.");
    return;
  }
  log.info(`  mean accuracy      ${rep.meanAccuracyPct}%`);
  log.info(`  mean score         ${rep.meanScore} pts   (capture efficiency ${rep.meanCaptureEfficiencyPct}%)`);
  log.info(`  captain hit rate   ${rep.captainHitRatePct}%   best-in-grid ${rep.captainBestInGridRatePct}%`);
  log.info(`  would-submit rate  ${rep.wouldSubmitRatePct}%`);
  log.info(`  mean confidence    ${(rep.meanConfidence * 100).toFixed(0)}%   (calibration gap ${rep.calibrationGapPct >= 0 ? "+" : ""}${rep.calibrationGapPct}pp = conf − accuracy)`);
  log.info("  recent:");
  rep.rows.slice(0, 10).forEach(printLedgerRow);
}

// ---- Phase 2: native agent ----
async function cmdAgentShow(client: McpClient, agentCfg: AgentConfig, json: boolean) {
  const agentId = await resolveAgentId(client, agentCfg);
  const { agent } = await api.getAgent(client, agentId);
  if (json) return log.json(agent);
  log.info(`Agent ${agent.displayName} (${agent.id}) rev ${agent.revision} — status ${agent.status}`);
  log.info(`  model ${agent.modelId} | strategy ${agent.strategyPreset} | brain ${agent.brainPreset}`);
  log.info(`  behavior ${agent.behavior.risk}/${agent.behavior.outlook}/${agent.behavior.conviction}`);
  const tc = agent.tradingConfig as any;
  if (tc) log.info(`  trading: mode ${tc.tradingMode} preset ${tc.tradingConfigPreset} maxLev ${tc.maxLeverage} maxDaily ${tc.maxDailyTrades}`);
}

async function cmdAgentPlan(client: McpClient, agentCfg: AgentConfig, json: boolean) {
  const agentId = await resolveAgentId(client, agentCfg);
  const { agent } = await api.getAgent(client, agentId);
  const plan = planAgent(agent, agentCfg);
  const rules = await api.signalRules(client, agentId).catch(() => ({ rules: [] }));
  const ruleChanges = planSignalRules(rules, agentCfg);
  if (json) return log.json({ plan, ruleChanges });
  log.info(`agent:plan for ${agent.displayName} (rev ${agent.revision})`);
  if (plan.changes.length === 0) log.info("  no agent config changes.");
  for (const c of plan.changes) log.info(`  ~ ${c.field}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`);
  if (ruleChanges.length) {
    log.info("  signal rule changes:");
    for (const r of ruleChanges) log.info(`    ~ ${r.signalId}: alloc ${r.fromAllocation ?? "?"} → ${r.toAllocation} params ${JSON.stringify(r.params)}`);
  }
  log.info("Run 'agent:apply --live' to apply.");
}

async function cmdAgentApply(client: McpClient, agentCfg: AgentConfig, live: boolean) {
  const agentId = await resolveAgentId(client, agentCfg);
  const { agent } = await api.getAgent(client, agentId);
  const plan = planAgent(agent, agentCfg);
  const rules = await api.signalRules(client, agentId).catch(() => ({ rules: [] }));
  const ruleChanges = planSignalRules(rules, agentCfg);
  log.info(`agent:apply — ${plan.changes.length} config change(s), ${ruleChanges.length} signal rule change(s).`);
  if (!live) {
    log.banner("DRY-RUN");
    plan.changes.forEach((c) => log.info(`  would set ${c.field}`));
    ruleChanges.forEach((r) => log.info(`  would set signal ${r.signalId} → alloc ${r.toAllocation}`));
    log.info("Re-run with --live to apply.");
    return;
  }
  log.banner("LIVE");
  const res = await applyAgent(client, plan);
  await applySignalRules(client, agentId, ruleChanges);
  log.info("Applied. Result:");
  log.json(res);
}

async function cmdDeployShow(client: McpClient, agentCfg: AgentConfig, json: boolean) {
  const agentId = await resolveAgentId(client, agentCfg);
  const status = await api.automationStatus(client, agentId);
  const presetId = agentCfg.deployment.presetId;
  const policy = presetId ? await api.deploymentPolicy(client, presetId).catch(() => null) : null;
  if (json) return log.json({ status, policy });
  log.json({ automation: status, currentPolicy: policy });
}

async function cmdDeployPlan(client: McpClient, agentCfg: AgentConfig, json: boolean) {
  const agentId = await resolveAgentId(client, agentCfg);
  const args = deployArgs(agentCfg, agentId);
  buildSlots(agentCfg, agentId); // validates
  const preview = await previewResolution(client, args);
  if (json) return log.json({ args, preview });
  log.info(`deploy:plan for preset ${args.presetId} — ${args.slots.length} slot(s), agent ${agentId}`);
  args.slots.forEach((s) => {
    const cond = s.isDefault ? "DEFAULT" : s.conditions.map((c) => (c.kind === "regime" ? `regime∈{${c.regimes?.join(",")}}` : `time`)).join(" & ");
    log.info(`  [prio ${s.priority ?? "—"}] minConf ${s.minConfidence} :: ${cond}`);
  });
  log.info("Resolution now:");
  log.json(preview.now);
  log.info("Resolution by simulated regime: (see --json for full detail)");
  for (const [r, v] of Object.entries(preview.byRegime)) {
    const slot = (v as any)?.resolvedSlot ?? (v as any)?.slot ?? (v as any);
    log.info(`  ${r}: ${JSON.stringify(slot)?.slice(0, 160)}`);
  }
  log.info("This is a dry run (no writes, no wager). 'deploy:apply --live --confirm-wager' commits it.");
}

async function cmdDeployApply(client: McpClient, agentCfg: AgentConfig, flags: Args["flags"]) {
  const agentId = await resolveAgentId(client, agentCfg);
  const args = deployArgs(agentCfg, agentId);
  const live = flags.live === true;
  const confirmed = flags["confirm-wager"] === true;
  log.info(`deploy:apply for preset ${args.presetId} (agent ${agentId}).`);
  if (!live || !confirmed) {
    log.banner("DRY-RUN");
    log.warn(
      "Committing a deployment policy enables REAL-MONEY auto-play of paid sessions.",
    );
    log.info("To proceed you must pass BOTH --live and --confirm-wager.");
    return;
  }
  log.banner("LIVE");
  const res = await applyDeployment(client, args);
  log.info("Deployment policy upserted:");
  log.json(res);
}

function usage() {
  log.info(`bg9bit-agent — BattleGrid trading agent CLI

Global flags: --json (machine output)   --live (allow writes)   --config <path>   --agent-config <path>

Read / research:
  account                         Show account state (balance, slots, wager status)
  sessions                        List PENDING Market Grid sessions
  regime [--coin BTC --tf 4h]     Show market-regime snapshot

Phase 1 — external prediction + bias (dry-run; never submits):
  analyze <sessionId>             Per-coin direction / confidence / expected-move / EV table
  predict <sessionId>             Build the EV-optimal 9-grid + captain + confidence (saved, not submitted)
  bias [--session <id> | --coins BTC,SOL,...]   Directional trade-bias signal for your own trades
  grade <sessionId>               Compare a saved prediction against settled results (paper score)
  submit <sessionId>              HARD-GATED: refused unless execution.live=true in config + --live + --yes

Paper-trading loop (no wagers — records predictions, grades them at settlement):
  paper:predict                   Record predictions for all PENDING sessions not yet captured
  paper:settle                    Grade every captured prediction whose session has settled
  paper:run                       predict + settle in one pass (schedule this on an interval)
  paper:report                    Rolling accuracy / score / captain / calibration stats

Phase 2 — native agent config-as-code:
  agent:show                      Current Intelligence Agent config
  agent:plan                      Diff current agent vs agent.config.jsonc (no writes)
  agent:apply [--live]            Apply agent + signal-rule changes (requires --live)
  deploy:show                     Current automation + deployment policy
  deploy:plan                     Build regime slots, preview resolution now + per-regime (no writes/wager)
  deploy:apply --live --confirm-wager   Commit deployment policy (REAL-MONEY auto-play)
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const json = args.flags.json === true;
  setJsonMode(json);
  const live = args.flags.live === true;
  const enginePath = (args.flags.config as string) || DEFAULT_ENGINE_CFG;
  const agentPath = (args.flags["agent-config"] as string) || DEFAULT_AGENT_CFG;

  // Commands that only need engine connection settings can load the engine config.
  const needsAgentCfg = args.cmd.startsWith("agent:") || args.cmd.startsWith("deploy:");
  const engine = existsSync(enginePath) ? loadEngineConfig(enginePath) : loadEngineConfig(DEFAULT_ENGINE_CFG);
  const client = makeClient(engine);

  try {
    switch (args.cmd) {
      case "help":
      case undefined:
        return usage();
      case "account":
        return await cmdAccount(client, json);
      case "sessions":
        return await cmdSessions(client, json);
      case "regime":
        return await cmdRegime(client, engine, args.flags, json);
      case "analyze":
        return await cmdAnalyze(client, engine, requirePositional(args, "sessionId"), json);
      case "predict":
        return await cmdPredict(client, engine, requirePositional(args, "sessionId"), json);
      case "bias":
        return await cmdBias(client, engine, args.flags, json);
      case "grade":
        return await cmdGrade(client, requirePositional(args, "sessionId"), json);
      case "submit":
        return await cmdSubmit(client, engine, args, live);
      case "paper:predict":
        return await cmdPaperPredict(client, engine, json);
      case "paper:settle":
        return await cmdPaperSettle(client, json);
      case "paper:run":
        return await cmdPaperRun(client, engine, json);
      case "paper:report":
        return cmdPaperReport(json);
      case "agent:show":
        return await cmdAgentShow(client, loadAgentConfig(agentPath), json);
      case "agent:plan":
        return await cmdAgentPlan(client, loadAgentConfig(agentPath), json);
      case "agent:apply":
        return await cmdAgentApply(client, loadAgentConfig(agentPath), live);
      case "deploy:show":
        return await cmdDeployShow(client, loadAgentConfig(agentPath), json);
      case "deploy:plan":
        return await cmdDeployPlan(client, loadAgentConfig(agentPath), json);
      case "deploy:apply":
        return await cmdDeployApply(client, loadAgentConfig(agentPath), args.flags);
      default:
        log.err(`Unknown command: ${args.cmd}`);
        usage();
        process.exitCode = 1;
    }
  } catch (e) {
    log.err((e as Error).message);
    process.exitCode = 1;
  }
  void needsAgentCfg;
}

function requirePositional(args: Args, name: string): string {
  const v = args.positional[0];
  if (!v) throw new Error(`Missing required <${name}>.`);
  return v;
}

async function cmdSubmit(client: McpClient, engine: EngineConfig, args: Args, live: boolean) {
  const sessionId = requirePositional(args, "sessionId");
  const r = await runPrediction(client, engine, sessionId);
  const { session, grid, problems } = r;

  // ---- HARD MONEY GATE ----
  const feeOk = (session.entryFee ?? 0) <= engine.execution.maxEntryFeeUsd;
  const yes = args.flags.yes === true;
  const reasons: string[] = [];
  if (!engine.execution.live) reasons.push("config execution.live=false (paper mode)");
  if (!live) reasons.push("missing --live");
  if (engine.execution.requireYes && !yes) reasons.push("missing --yes");
  if (!feeOk) reasons.push(`entry fee ${fmtUsd(session.entryFee)} exceeds cap ${fmtUsd(engine.execution.maxEntryFeeUsd)}`);
  if (!grid.wouldSubmit) reasons.push(`confidence ${(grid.confidenceScore * 100).toFixed(0)}% below threshold ${(grid.submitThreshold * 100).toFixed(0)}%`);
  if (problems.length) reasons.push(`invalid grid: ${problems.join("; ")}`);

  if (reasons.length) {
    log.banner("DRY-RUN");
    log.warn("submit refused — real USDC would be spent. Blockers:");
    reasons.forEach((x) => log.info(`  • ${x}`));
    log.info("Grid that WOULD be submitted:");
    log.json({ sessionId, grid: grid.cells, confidenceScore: grid.confidenceScore });
    return;
  }

  log.banner("LIVE");
  const res = await api.submitGrid(client, r.submission as any);
  log.info("Submitted:");
  log.json(res);
}

main();

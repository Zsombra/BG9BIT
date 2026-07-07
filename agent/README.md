# BG9BIT — BattleGrid trading agent

A config-driven agent for [BattleGrid](https://battlegrid.trade) (crypto **Market Grid**
prediction game + Hyperliquid trading), built on the official BattleGrid MCP
(`https://mcp.battlegrid.trade/mcp`, 86 tools). It is separate from the PixiJS
visualization in the repo root — this lives entirely under `agent/`.

Two capabilities:

- **Phase 2 — native agent config-as-code.** Manage your BattleGrid *Intelligence
  Agent* (strategy/brain/context/signal rules) and a **regime-aware deployment
  policy** declaratively. Plans and previews by default; every mutation is gated.
- **Phase 1 — external prediction + trade-bias engine.** Our own "brain": pulls
  candles + regime, scores every coin, builds the **EV-optimal 9-grid + captain +
  calibrated confidence**, and emits a **directional trade-bias signal** for your
  own trades. Never submits unless you explicitly turn money on.

> **Safety model:** everything is **dry-run / paper by default**. No write and no
> wager happens without explicit flags. `submit` is refused entirely while
> `execution.live=false`. Committing a deployment policy (real-money auto-play)
> requires **both** `--live` and `--confirm-wager`.

## How BattleGrid scoring drives the design

Per the game preset (authoritative, read at runtime):

```
score(pick)   = |Δprice%| × changeMultiplier            (if direction correct)
              = −|Δprice%| × wrongPenaltyMultiplier      (if wrong)
captain       = ×captainMultiplier / ×captainWrongPenaltyMultiplier   (2× / 2×)
```

So the **expected points** of a pick are `E[|move%|] × (mult·p − penalty·(1−p))`,
where `p` is our confidence in the direction. With the symmetric 100/100 default
this is `E[|move%|] × 100 × (2p − 1)`. The engine therefore:

1. scores each coin's **direction** + **confidence `p`** + **expected move**,
2. drafts the `gridSize` (9) coins with the **highest expected value**,
3. picks the **captain** to maximize captain EV (doubling only ever helps a
   positive-EV pick), with a hard **confidence guard** so a big-but-coin-flip mover
   never gets the 2× penalty,
4. calibrates an **overall confidence** that gates submission, damped in
   `contraction`/`volatile` regimes.

## Setup

```bash
cd agent
npm install
cp .env.example .env    # then edit, or just export the key:
export BATTLEGRID_API_KEY=bg_live_xxx    # battlegrid.trade → Profile → MCP tab
```

Requires Node ≥ 20 (uses built-in `fetch`). Run commands with `npx tsx src/cli.ts <cmd>`
(or `npm run bg -- <cmd>`).

## Commands

Global flags: `--json` (machine output), `--live` (allow writes),
`--config <path>`, `--agent-config <path>`.

### Read / research
| Command | What it does |
|---|---|
| `account` | Balance, agent slots, wager status |
| `sessions` | List PENDING Market Grid sessions |
| `regime [--coin BTC --tf 4h]` | Market-regime snapshot |

### Phase 1 — prediction + bias (dry-run; never submits)
| Command | What it does |
|---|---|
| `analyze <sessionId>` | Per-coin direction / confidence / expected-move / EV table |
| `predict <sessionId>` | Build the EV-optimal 9-grid + captain + confidence (saved to `out/`, **not** submitted) |
| `bias [--session <id> \| --coins BTC,SOL,…]` | Directional trade-bias signal (per-coin stop/target/RR + market breadth) |
| `grade <sessionId>` | Grade one saved prediction against settled results (paper score) |
| `submit <sessionId>` | **Hard-gated**: refused unless `execution.live=true` **and** `--live --yes` **and** fee ≤ cap |

### Paper-trading loop (no wagers — validates edge before risking money)
| Command | What it does |
|---|---|
| `paper:predict` | Record predictions for every PENDING session not yet captured (to `out/predictions/`) |
| `paper:settle` | Grade every captured prediction whose session has settled; append to `out/ledger.jsonl` |
| `paper:run` | `predict` + `settle` in one pass — the loop step you schedule |
| `paper:report` | Rolling accuracy / score / capture-efficiency / captain-hit / **calibration gap** (confidence − realized accuracy) |

The grader reproduces BattleGrid's scoring **exactly** — verified to the point against
real settled games (`finalScore` parity across multiple players). Because it only reads
public results, it never spends money.

**Scheduling** (each session is 15m/1h/4h, so run the loop a few times an hour):

```bash
# cron: capture + grade every 5 minutes
*/5 * * * * cd /path/to/agent && BATTLEGRID_API_KEY=bg_live_xxx npx tsx src/cli.ts paper:run >> out/paper.log 2>&1
```

`paper:predict` must run **before a session locks** (that's when the read is captured);
`paper:settle` can run any time after it settles. After a day or two, `paper:report`
tells you whether the engine has real edge and whether its confidence is calibrated —
the evidence to justify (or reject) turning `execution.live` on or tuning the native agent.

### Phase 2 — native agent config-as-code
| Command | What it does |
|---|---|
| `agent:show` | Current Intelligence Agent config |
| `agent:plan` | Diff current agent vs `config/agent.config.jsonc` (read-only) |
| `agent:apply [--live]` | Apply agent + signal-rule changes (writes only with `--live`) |
| `deploy:show` | Current automation + deployment policy |
| `deploy:plan` | Build regime slots, preview which slot resolves now + per simulated regime (read-only, no wager) |
| `deploy:apply --live --confirm-wager` | Commit the deployment policy — **enables real-money auto-play** |

## Configuration

- `config/engine.config.jsonc` — the prediction/bias engine (indicator weights,
  confidence calibration, captain policy, regime gating, and the `execution`
  money switch). JSONC: comments and trailing commas allowed.
- `config/agent.config.jsonc` — the native agent's desired state + the regime-aware
  deployment slots. Only fields that differ from the live agent are applied.

Key engine knobs:

- `grid.captainPolicy`: `max_ev` (default), `max_vol` (jackpot / War-Bond hunting),
  `balanced`, `safe`. `grid.captainMinConfidence` guards the 2× downside.
- `regime.biasTilt` / `regime.gateInChop`: how the BTC 4h regime tilts direction and
  tightens confidence in chop.
- `execution.live` / `maxEntryFeeUsd` / `requireYes`: the money gate for `submit`.

## Trade-bias output (example)

```
Net bias LONG 0.92 | breadth 75% long   (regime bull_expansion, medium)
coin   bias   strength  conf   expMove  stop%  target%  R:R  regime
BTC    LONG    0.56     92%    +0.64%   1.07   2.15     2    with
...
```

`--json` emits the same as a machine-readable object you can pipe into your own
trade automation.

## Tests

```bash
npm test        # unit tests: indicators + EV/captain/grid validation
npm run typecheck
```

## Notes & safety

- The engine reads scoring multipliers from the live game preset, so it adapts if a
  session disables the wrong-prediction penalty or changes the captain multiplier.
- `predict`/`bias`/`analyze`/`*:plan`/`*:show` are all read-only.
- Your existing agent may run `tradingMode: FULL_EXECUTION`; this tool leaves
  `tradingConfig` unmanaged (`manage:false`) and never changes trading mode or
  leverage unless you opt in explicitly in the config.

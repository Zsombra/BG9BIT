# Paper-trade store (durable)

This directory is **tracked in git on purpose**. It's where the paper-trading loop keeps
state that must survive an ephemeral container recycle or a fresh clone:

- `predictions/<sessionId>.json` — a captured prediction for one session (status
  `pending` → `settled`), written by `paper:predict` / `predict`.
- `ledger.jsonl` — one graded row per settled session, appended by `paper:settle`.

Do not hand-edit these. `scripts/persist-paper-data.sh` commits and pushes changes here
after each `paper:run` so accumulated results are never lost. The engine reads this
directory to compute `paper:report`.

#!/usr/bin/env bash
# Persist the paper-trade store (agent/data/) to the repo so accumulated
# predictions + graded ledger survive an ephemeral container recycle / fresh clone.
# Safe to run every cycle: it no-ops when nothing under agent/data/ changed.
set -euo pipefail

REPO_ROOT="$(git -C "$(dirname "$0")/../.." rev-parse --show-toplevel)"
cd "$REPO_ROOT"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# Nothing to do if the paper store is unchanged.
if [ -z "$(git status --porcelain agent/data)" ]; then
  exit 0
fi

git add agent/data
git -c user.name="bg9bit-paperbot" -c user.email="paperbot@bg9bit.local" \
  commit -q -m "chore(paper): update paper-trade ledger

Automated paper-trade store snapshot (no wagers). Working-tree data only.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QPKt6kaTFW5gjRfC4xCG6t"

# Rebase on remote (append-only ledger rarely conflicts) then push with backoff.
for i in 1 2 3 4; do
  if git pull --rebase --autostash origin "$BRANCH" >/dev/null 2>&1 && \
     git push origin "$BRANCH" >/dev/null 2>&1; then
    echo "persisted paper data to $BRANCH"
    exit 0
  fi
  sleep $((2 ** i))
done

echo "persist-paper-data: push failed after retries" >&2
exit 1

---
# Who does the work is agents/implementer.md — its role keys and its instructions. This file is the step's wiring.
agent: implementer
# `npm run build` regenerates the web app's route tree, and runs every round. `npm run e2e` visits every page in both themes,
# and runs once, on the merged tree, in ship's check, where no WF_BASE_REF is set: a round's check, which the run gives
# WF_BASE_REF, runs no e2e (3-4 minutes of every round, which seldom changes a review's verdict).
check: npm test && npm run typecheck && npm run lint && npm run build && if [ -n "${WF_BASE_REF:-}" ]; then echo "wf check: no e2e in a round's check; it runs once, on the merged tree, where no WF_BASE_REF is set"; else npm run e2e; fi
---

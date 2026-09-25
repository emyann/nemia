---
# Who does the work is agents/ui-implementer.md — its role keys, its instructions and its schema. This file is the step's wiring.
agent: ui-implementer
# `npm run build` regenerates the web app's route tree, and runs every round. `npm run e2e` serves the web app against a
# seeded store and visits every page in headless Chromium in a light and a dark theme: a round's check, which the run gives
# WF_BASE_REF, runs none of it (3-4 minutes of every round). The screenshots review reads are the implementer's own run of
# the e2e into $WF_ARTIFACTS, which its brief asks for. The check's e2e runs once, on the merged tree, where the ship runs
# this line in the shipper's hands with no WF_BASE_REF set.
check: npm test && npm run typecheck && npm run build && if [ -n "${WF_BASE_REF:-}" ]; then echo "wf check: no e2e in a round's check; it runs once, on the merged tree, where no WF_BASE_REF is set"; else npm run e2e; fi
---

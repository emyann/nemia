---
# Who does the work is agents/ui-implementer.md — its role keys, its instructions and its schema. This file is the step's wiring.
agent: ui-implementer
# `npm run e2e` builds the web app, serves it against a seeded store, visits every page in headless
# Chromium in a light and a dark theme, and screenshots each into $WF_ARTIFACTS — the directory the run
# made for this step — where review reads them.
check: npm test && npm run typecheck && npm run build && npm run e2e
---

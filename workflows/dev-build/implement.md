---
# Who does the work is agents/implementer.md — its role keys and its instructions. This file is the step's wiring.
agent: implementer
# `npm run build` regenerates the web app's route tree, and `npm run e2e` visits every page in both themes.
check: npm test && npm run typecheck && npm run build && npm run e2e
---

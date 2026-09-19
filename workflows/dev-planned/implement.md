---
after: plan
# The plan reaches this step as data, under `## From plan`: what plan declared in its closeout, and never its summary.
input: plan
# Who does the work is agents/implementer.md — its role keys and its instructions. This file is the step's wiring.
agent: implementer
check: npm test && npm run typecheck
---

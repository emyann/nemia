---
place: git
# Who does the work is agents/implementer.md. This file is the step's wiring.
agent: implementer
check: npm test && npm run typecheck && npm run lint
---

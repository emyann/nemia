---
after: review
# The repository's own checkout, where the base branch is.
workspace: main
agent: shipper
# Nothing of this step is filed until a person approves it.
gate: true
check: npm test && npm run typecheck && npm run lint
---
Stage the merge of this run's result onto the base branch, and sign off with the message to commit it with.

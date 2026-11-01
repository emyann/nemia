---
after: review
place: git
# The repository's own checkout, where the base branch is.
workspace: base
agent: shipper
# Nothing of this step is filed until a person approves it.
gate: true
check: npm test && npm run typecheck && npm run lint
---
Stage the merge of this run's result onto the base branch, and sign off with the message to commit it with.

# What is already measured about Jev on this project's records (2026-09-18, model pinned jev-1.13.0)

> The packages were renamed on 2026-09-23: `agent-engine` is now `packages/agent-runtime`, and `agent-workflows` `packages/agent-orchestrator`. This document is history, and keeps the names it was written with.

Do not redo these; build on them. Raw files are in ../jev/ (dataset.json, probe-result.json, fates-raw.json, fates.json, probe.mjs, score.py).

- Latency (median): 181 ms at 434 input tokens, 309 ms at 9k, 616 ms at 31k. A request carrying 77 questions (~25k tokens) took ~420 ms.
- Billing: the state is billed once per request, not once per question (1 question 1,371 tokens; 77 questions 24.8k). $0.042 per million input tokens, output free. 3,465 judgments cost $0.047.
- Consistency: not deterministic. Over 3 identical askings of 1,155 pairs: mean sd 0.0016; 0 pairs crossed 0.5 or 0.8; 1 crossed 0.9. On a genuinely ambiguous synthetic question P ranged 0.62–0.72 over 8 askings while the chosen label never changed.
- Irrelevant state inflates confidence: the same ambiguous question went from P 0.67 (confidence 0.50) to 0.99 (0.98) when 8k tokens of unrelated, reassuring filler were added to the state. Filter state in code; a threshold holds only for one shape of state.
- Probe "does this brief ask for this review finding to be fixed?" (15 briefs x 77 open findings, 22 hand-labelled positives): at P>=0.8 precision 1.00 recall 0.86; at 0.5 precision 0.92 recall 1.00. A plain-code baseline (shared backticked symbols + file named) at the same recall: precision 0.15. 0 of 3,420 exact negatives scored >=0.8.
- Literal reading worked in its favour: a brief that mentions a finding and says "leave it" scored 0.05.
- It corrected the hand labels: two confident "false positives" were a leftovers brief nobody had identified.
- SDK: @typesafe-ai/sdk 0.6.0, no runtime dependencies, Node 20+. `new TypeSafeClient()` reads TYPESAFE_API_KEY. `client.systemOne({ model, state, questions }, { timeout })` -> `{ model, answers, usage }`. A question is `{ type: 'noul', instructions, criteria: { true, false } }`, or built with `choice()`, `score()`, `noul()`. Answers: noul -> `.noul`; choice -> `.choice`, `.probabilities`, `.confidence`; score -> `.score`, `.probabilities`, `.confidence`.

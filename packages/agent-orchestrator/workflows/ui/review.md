---
after: implement
# implement's `screenshots` and `pages`, as data — nothing else of its closeout — so the pages are looked at beside
# the diff. Each round is handed that round's.
input: implement
# Who does the work is agents/ui-reviewer.md — its role keys and its instructions. This file is the step's wiring.
agent: ui-reviewer
# Dollars the step's tries may cost together, over every round (`budget:`). A review of this repository has cost $3.7 for one
# try and $10.5 over three rounds (measured 2026-09-15, W7's own run); $20 is above any review seen. On `claude` the step is a
# job, which its harness ends at the cap, a little past it where a call is under way; past it the run files no more of this step
# until a person raises it.
budget: 20
# The review travels as this step's closeout — `findings` and `again`, in the shape review.schema.json declares. A
# finding names where it is: a file and a line, or a page and a theme. The schema is this folder's, beside this file, and
# not agents/review.schema.json, which names no page: the step's own key, which wins over the agent's.
output: review.schema.json
# `again: true` sends the change round again (`loop: implement`): implement's own session is continued and handed
# the findings as data, then this step reviews again, a new session — at most `rounds: 3`, then a person decides.
loop: implement
rounds: 3
---

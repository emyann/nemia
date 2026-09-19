---
after: implement
# Who does the work is agents/reviewer.md — its role keys, its instructions and its schema. This file is the step's wiring.
agent: reviewer
# Dollars the step's tries may cost together, over every round (`budget:`). A review of this repository has cost $3.7 for one
# try and $10.5 over three rounds (measured 2026-09-15, W7's own run); $20 is above any review seen. On `claude` the cap bounds
# further spend — a session is not stopped mid-flight — so past it the run files no more of this step until a person raises it.
budget: 20
# `again: true` sends the change round again (`loop: implement`): implement's own session is continued and handed
# the findings as data, then this step reviews again, a new session — at most `rounds: 3`, then a person decides.
loop: implement
rounds: 3
---

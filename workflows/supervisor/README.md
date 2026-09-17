# supervisor

One session that watches this repository's runs and brings what needs a person to the person: a run at its
result, a plan waiting for an answer, a session that has stalled. It decides nothing itself — it prepares
the decision, asks by signing off `blocked`, and acts on the answer.

```
supervise        (one step, and it does not end)
```

`supervise` runs on Claude (opus) in the repository's own checkout (`workspace: main`), not in a worktree:
what it reads is the store and the runs' own branches, and the little it writes is bookkeeping — a trap in
`CLAUDE.md`, a section in `packages/agent-workflows/docs/features.md`. It carries implement's denies and no
`check:`: there is nothing to verify, because it produces nothing but questions and approvals.

`slot: none` keeps its run out of the cap on runs in flight (`WF_MAX_RUNS`). The cap holds the work this
machine does at once; a supervisor behind it would be held by the very runs it exists to answer.

**It does take a session slot, and it holds one nearly all the time.** `WF_MAX_CONCURRENT` is 2 unless you
set it, counted per harness pool, and this step is on `claude` — the same pool as every `dev` folder's
implement, review and ship. A supervisor that is watching is a session at work, so at the default it leaves
**one** slot for the work it is watching; it frees its own only in the gap between signing off and being
answered. Raise the ceiling before you start it — `WF_MAX_CONCURRENT=3 wf up`, or higher — or accept that
the board halves.

`remote: true` bridges its sessions to claude.ai, so the person it asks can answer from a phone —
which is the point of it: the moments it exists for are the ones where somebody is not at their desk.

**Its questions are gates on its own run.** It signs off `blocked` with the brief in `summary` and the
question in `needs`; `wf ls` says `→ waiting on you`, and the board shows the closeout with the answer box.
The answer continues the same session, so it keeps what it knows:

```bash
wf start "supervise this repository" --workflows workflows/supervisor   # once, and leave it running
wf ls                                                                   # → waiting on you: supervise
wf decide <run>                                                         # its brief and its question
wf retry <run> supervise --message "Merge it."                          # the answer; the session carries on
```

There is no cap on the number of answers: each is a try, and each try continues the session before it. What
ends the run is a person — `wf cancel <run>`.

When nothing needs a person it waits and reads again — a foreground wait that ends by itself, never a
background loop, which is how a session was once held for seventy-seven minutes with nothing running in it.
Signing off is how it asks, so it signs off only when it has something to ask.

**It never types git for a run.** A run's result is merged by that run's own ending step (`ship.md` in the
`dev*` folders), which a person approves; the supervisor's yes is `wf approve <run> <step>`, and the folder
does the rest.

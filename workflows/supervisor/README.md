# supervisor

One session that watches this repository's runs and brings what needs a person to the person: a run at its
result, a plan waiting for an answer, a session that has stalled. It decides nothing itself — it prepares
the decision, asks by signing off `blocked`, and acts on the answer.

```
supervise        (one step, and it does not end)
```

`supervise` runs on Claude (opus) in the repository's own checkout (`workspace: main`), not in a worktree:
what it reads is the store and the runs' own branches, and the little it writes is bookkeeping — a trap in
`CLAUDE.md`, a section in `packages/agent-orchestrator/docs/features.md`. It carries implement's denies and no
`check:`: there is nothing to verify, because it produces nothing but questions and approvals.

**Its `disallowedTools:` denies git by name.** "Never type git for a run" is a sentence in `supervise.md`, and prose
is not a constraint. `.claude/settings.json` denies no git: a person's own session in this checkout may be
asked to push, and the settings could not refuse `git merge` anyway, because `ship.md` runs in the same
checkout and merging is its whole job. So the step's own fence is where the refusal lives. `git branch -D`
needs no line of it: in `dontAsk`, no allow reaches it. It denies `git merge` and `git pull` — the merge a run's ending step owns, in both its spellings —
and `git checkout`, `git switch`, `git restore`, `git rebase`, `git reset`, `git stash`, `git cherry-pick`,
`git revert`, `git clean` and `git push`, the ordinary commands that move a person's checkout or throw away
what is in it. It is a named list, not a complete one. What its bookkeeping needs is untouched:
`git add <path>`, `git commit <path>`, `git status`, `git log`, `git diff`. It is a prefix fence and not a
sandbox — `git -C <dir> merge` is not `git merge` — so it stops the command a session should not have typed,
not a session that means to get round it.

**It is the one background session among the shipped steps** (`background: true`). Every other shipped step runs as
a job — `claude -p`, which runs its brief, exits, and asks nobody in any mode — and this one runs as `claude --bg`, which
outlives each brief, is listed in `claude agents`, and can be attached to, said words to and bridged. So it is fenced as
the planner and the reviewer are: `permissionMode: dontAsk` with an `allowedTools:` list of what its prose asks of it — the `wf`
verbs, `claude agents`, `ae ls`, `ps` and `kill` to diagnose a stall, `sleep` to wait, the git it reads and the `git add` and
`git commit` its bookkeeping needs, `Read`, `Grep` and `Glob` anywhere (the store and the runs' worktrees are outside this
checkout), the look skill, and `Edit` of `CLAUDE.md` and the `docs/` folders only. A background session in a mode that
asks would wait on a prompt nobody is there to answer; in `dontAsk` a call it was not given is denied and it carries on.
A job's denials are read and put on `wf ls`; a background session's are not (agent-runtime's open issue 28), so a command
it needs and was not given shows as a stall, and the fix is a line in its `allowedTools:`. It keeps no `budget:`: a background
session has no spend cap to keep, and the parser refuses one beside `background: true`.

`slot: none` keeps its run out of the cap on runs in flight (`WF_MAX_RUNS`). The cap holds the work this
machine does at once; a supervisor behind it would be held by the very runs it exists to answer.

**It does take a session slot, and it holds one nearly all the time.** `WF_MAX_CONCURRENT` is 2 unless you
set it, counted per harness pool, and this step is on `claude` — the same pool as every `dev` folder's
implement, review and ship. A supervisor that is watching is a session at work, so at the default it leaves
**one** slot for the work it is watching; it frees its own only in the gap between signing off and being
answered. Raise the ceiling before you start it — `WF_MAX_CONCURRENT=3 wf up`, or higher — or accept that
the board halves.

`remote: true` bridges its sessions to claude.ai — which only a background session can be — so the person it asks can answer from a phone —
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

**Its session is capped at 200k tokens of context** (`context: 200k`), because it is the one session here that never
ends: every answer continues it, and it grows for as long as it lives. Past about 173k it compacts — summarises what it
has read and carries on — and every answer continues it on the same window. A turn whose reads refill the window within
three turns of a compaction, three times in a row, trips Claude Code's guard instead: the step reads `blocked`, and
`wf logs <run> supervise` ends on *"Autocompact is thrashing: the context refilled to the limit within 3 turns of the
previous compact…"* (agent-runtime's open issue 26 measured it at 100k with 22k-token reads; at 200k the same reads
compacted and signed off). Answer it with `wf retry <run> supervise --message "Read in smaller chunks."` and it carries
on, or change the window: a run keeps the window it froze at `wf start`, so raise `context:` in `supervise.md` (up to
`1000k`), `wf cancel <run>`, and start a fresh supervisor — which starts with an empty context too.

When nothing needs a person it waits and reads again — a foreground wait that ends by itself, never a
background loop, which is how a session was once held for seventy-seven minutes with nothing running in it.
Signing off is how it asks, so it signs off only when it has something to ask.

**It never types git for a run.** A run's result is merged by that run's own ending step (`ship.md` in the
`dev*` folders), which a person approves; the supervisor's yes is `wf approve <run> <step>`, and the folder
does the rest.

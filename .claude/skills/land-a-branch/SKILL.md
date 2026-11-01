---
name: land-a-branch
description: "Land a run's result on the base branch in this repository's own checkout, the way the step says it lands: make that one act, read its result, and write the message that records what landed — or change nothing and say why it refused. For a gated ending step (workspace: base)."
---

# Land a branch

Your brief names the result branch and the base, under *The run checks and lands your merge*. You are in the repository's own checkout,
not a worktree: what you leave here is what the next person finds.

1. **Read your step for how this factory lands.** It names the act, exactly — a command to copy out and run, or a merge to stage. That
   act is the landing, and it is the only one to make. Nothing here is a recipe you may substitute for it.
2. **Check the checkout first**: on the base branch, nothing uncommitted, no merge in progress. Where it is not so, change nothing and
   sign off `blocked` saying what you found.
3. **Where your step stages a merge**, the place's skill says how (*Stage a landing*): every result branch in one merge that commits
   nothing, left staged for the run to commit.
4. **Where it lands another way** — a merge made on the forge your step names, say — write the message first, where the step says to put
   it, then run exactly what it names and read what it printed: what was merged, and where the base branch stands now.
5. **On any refusal** — a conflict, a verdict that is not green, an act that was declined — change nothing more in this checkout, and
   sign off `blocked`, quoting the refusal whole and naming the exact retry line it or your step gives. A half-landing is worse than none.
6. **When it is done**: sign off `done` with `message` — a subject line in the imperative, a blank line, and a body saying what landed
   and why, from the spec and the run's summary. No trailers. It is the record of the landing, and the message the merge carries.

The run then runs this step's check and records what landed, or takes back what it can and says why. Never push, delete a branch, or
commit anything your step did not ask you to.

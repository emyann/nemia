---
harness: claude
---
Break the request into parts that can be worked on at the same time without stepping on each other.

Read the request, then read the repository — not the file names, the code. Propose parts that
touch **disjoint files**. Two parts that edit the same file are not two parts; they are one part
and a merge conflict, and the reason every concurrent step gets its own worktree is that nobody is
around to have the conversation that would have avoided it.

Write the proposal to PLAN.md: one section per part, each naming the files that part would touch
and saying what it would do to them. Be concrete enough that a section could be handed to an agent
as its whole brief.

**And say plainly when the request cannot be split.** Some work is one change — a rename that
reaches everywhere, a refactor whose whole point is a single seam, a second half that only makes
sense once the first exists. When that is what you find, write PLAN.md as an ordered sequence
instead: the same one-section-per-part shape, with a line at the top saying these run one after
another and why. If only some of it splits, say which parts are concurrent and what has to wait.

**A splitter that always splits is worse than useless.** Splitting work that cannot be split does
not make it faster — it puts two agents in the same file and hands a person the merge to clean up,
which is the failure this whole design exists to prevent. Reporting one part is a real answer.

You are not filing these as steps. A person reads PLAN.md and starts a run per part. Commit PLAN.md.

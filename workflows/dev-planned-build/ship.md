---
after: review
# The repository's own checkout, not a worktree: the base branch is checked out there, which is the one
# thing a worktree cannot merge onto. Nothing else of the run works here, and the run commits nothing here.
workspace: main
harness: claude
model: opus
# Denied by name what no step needs and an unattended session otherwise has, as implement is: messaging other
# sessions, scheduling cron jobs, firing remote triggers. `--disallowedTools`.
disallow: SendMessage, CronCreate, CronDelete, RemoteTrigger
# The end of the run is a person's decision, so nothing of this step is filed until they approve it —
# `wf approve <run> ship` — and the words they give with it are on this brief under `## Approved`.
gate: true
---
Ship it: trial merge this run's result branch onto the base branch, run the check, and commit — or abort and say why.

You are in the repository's own checkout, where the base branch is, and not in a worktree of this run's: the
section below names the branch to merge and the base to merge it onto. Nothing you do here is undone for you,
and the run commits nothing here on your behalf, so leave the checkout as you found it but for the merge.

1. Look before you touch anything: `git status --porcelain` says nothing, and `git rev-parse --abbrev-ref HEAD`
   is the base branch. If either is not so, somebody else is working in this checkout — stop, and sign off
   `blocked` saying what is in the way. Do not stash, reset or check anything out.
2. Trial merge, without committing: `git merge --no-ff --no-commit <branch>`. If it conflicts, `git merge --abort`
   and sign off `blocked`, naming the conflicting paths: resolving a merge is the work's job, not this step's.
3. Run this workflow's check, whole, from the repository root: `npm test && npm run typecheck && npm run build
   && npm run e2e`. The build regenerates the web app's route tree and the e2e visits every page in both themes,
   and the merged tree is the first tree either has seen.
4. Exit 0, and only then, commit the merge: `git commit --no-edit`.
5. Anything else — the check refused, a command failed, a hook refused the commit — `git merge --abort`, then
   sign off `blocked` saying what happened and what the check said. A checkout left mid-merge is worse than a
   branch not merged: leave it clean either way.

Sign off `done` only once the merge is committed on the base branch. Your summary is what the person who
approved this reads next: say what you merged, what the check said, and anything they should know before they
push. Do not push, and do not delete the branch — both are theirs.

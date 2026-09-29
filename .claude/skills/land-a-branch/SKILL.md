---
name: land-a-branch
description: "Land a run's result on the base branch in this repository's own checkout: check the checkout is clean, stage the merge of the result branch without committing, and write the commit message — or abort and say which files conflict. For a gated ending step (workspace: main)."
---

# Land a branch

Your brief names the result branch and the base, under *The run checks and lands your merge*. You are in the repository's own checkout,
not a worktree: what you leave here is what the next person finds.

1. **Check the checkout**: on the base branch, nothing uncommitted, no merge in progress (`git status`). If it is not so, change nothing
   and sign off `blocked` saying what you found.
2. **Stage the merge**: `git merge --no-ff --no-commit <result branch>`.
3. **When it conflicts**: `git merge --abort`, then sign off `blocked` with the conflicting files (`git diff --name-only --diff-filter=U`
   before the abort). Never resolve a conflict: the work goes back to be merged with the base by its engineer.
4. **When it is clean**: leave it staged, and sign off `done` with `message` — a subject line in the imperative, a blank line, and a body
   saying what changed and why, from the spec and the run's summary. No trailers.

The run then runs the check on the merged tree and commits with your message, or aborts the merge and says why. Never commit, push, or
delete a branch yourself.

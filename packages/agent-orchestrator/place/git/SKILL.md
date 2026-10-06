---
name: git
description: The git place — a run's steps work in a git repository, each in a worktree on a branch of its own. How to keep your work in it, and the scripts Nemia runs to read and act on the repository for you. For a step whose workflow says it works in a git repository.
---

# Git

Your workspace is a git worktree on a branch the run made for your step. What you commit there is your step's result: the steps after
you start from it, and a person decides whether it ships.

## Commit as you go

- Commit your work on your branch in small commits with plain messages, as you make it: a short imperative subject, and a body saying
  why when it is not plain.
- Never push, never merge into the base branch, never delete a branch: a person does, or the run's ending step when they approve it.
- What you leave uncommitted is committed for you when your step ends, in one commit under your step's name. That is a net, not a way to
  work: a reviewer reads your commits.

## Stage a landing

When your step lands the run's result on its base, in the repository's own checkout, you stage the merge and the run commits it:

1. **Check the checkout**: on the base branch, nothing uncommitted, no merge in progress (`git status`). If it is not so, change nothing
   and stop, saying what you found.
2. **Stage the merge**: every result branch in one `git merge --no-ff --no-commit <branch>...`, as your brief says it.
3. **When it conflicts**: list the conflicting files (`git diff --name-only --diff-filter=U`), then `git merge --abort`, and stop with
   the list. Never resolve a conflict: the work goes back to be merged with its base by whoever made it.
4. **When it is clean**: leave it staged. The run checks the merged tree, then commits the merge or takes it back; `git commit` and
   `git merge --continue` are denied you, and a merge without `--no-commit` would commit it all the same.

## The scripts

`place.json` declares what this place answers, and `scripts/` holds one script per verb. The run executes them itself, from the copy it
froze when it started; you need not run them. Each reads one JSON request on stdin, carrying `"v": 1`, and prints one JSON answer:

- `open` — the repository a run starts in: `{ "root" }` answers `{ "repo", "baseRef", "branch", "staged" }`, `staged` the file that is
  there while a merge is staged in that checkout, which the run reads with no process.
- `handoff` — commit what a step left uncommitted: `{ "workspace", "step", "why" }` answers `{ "commit" }`, null when the tree is clean.
- `status` — the merge staged in a checkout: `{ "checkout", "tips" }` answers `{ "merging", "conflicted", "missing", "head" }`.
- `trial` — whether branches merge, by a merge made in git's object store alone, which touches no checkout, index or ref:
  `{ "repo", "trials": [{ "onto", "branch" }] }` answers `{ "at", "trials" }`, the commit each `onto` names now and each trial in the
  order asked, `{ "clean": true }`, `{ "clean": false, "conflicts" }` or `{ "unknown" }` with git's words.
- `land` — commit the staged merge, or take it back: `{ "checkout", "act": "commit", "message" }` answers `{ "commit" }`, and
  `{ "checkout", "act": "abort" }` answers `{ "aborted": true }`.
- `export` — a tag's tree written into an empty folder, from git's object store, never a working tree, for `nemia upgrade`:
  `{ "repo", "tag", "into" }` answers `{ "commit" }`. The tree gets an empty repository of its own, nothing committed, so its checks can
  list its files.
- `seal` — that empty repository taken away once the checks passed: `{ "tree" }` answers `{ "removed" }`.

A script that will not act prints `{ "refused": "<why>" }`. To see what one says, run it yourself:

```
echo '{"v":1,"checkout":"<your checkout>","tips":{}}' | node <this skill's folder>/scripts/status.ts
```

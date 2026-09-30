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

## The scripts

`place.json` declares what this place answers, and `scripts/` holds one script per verb. The run executes them itself, from the copy it
froze when it started; you need not run them. Each reads one JSON request on stdin, carrying `"v": 1`, and prints one JSON answer:

- `open` — the repository a run starts in: `{ "root" }` answers `{ "repo", "baseRef", "branch" }`.
- `handoff` — commit what a step left uncommitted: `{ "workspace", "step", "why" }` answers `{ "commit" }`, null when the tree is clean.
- `status` — the merge staged in a checkout: `{ "checkout", "tips" }` answers `{ "merging", "conflicted", "missing", "head" }`.
- `land` — commit the staged merge, or take it back: `{ "checkout", "act": "commit", "message" }` answers `{ "commit" }`, and
  `{ "checkout", "act": "abort" }` answers `{ "aborted": true }`.

A script that will not act prints `{ "refused": "<why>" }`. To see what one says, run it yourself:

```
echo '{"v":1,"checkout":"<your checkout>","tips":{}}' | node <this skill's folder>/scripts/status.ts
```

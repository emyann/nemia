---
name: git
description: The git place — a run's steps work in a git repository, each in a worktree on a branch of its own. How to keep your work in it, read what changed, merge its base when a person asks, and the scripts Nemia runs to read and act on the repository for you. For a step whose workflow says it works in a git repository.
---

# Git

Your workspace is a git worktree on a branch the run made for your step. What you commit there is your step's result: the steps after
you start from it, and a person decides whether it lands.

## Commit as you go

This section is a step's that writes the repository; a read-only step works from *Read what changed* instead.

- Commit your work on your branch in small commits with plain messages, as you make it: a short imperative subject, and a body saying
  why when it is not plain.
- What you leave uncommitted is committed for you when your step ends, in one commit under your step's name. That is a net, not a way to
  work: a reviewer reads your commits.

## Read what changed

Your brief names the commit the run started from, its base. When it does not give you the commands, read the work this way:

- **In your workspace**, what the steps before you did: `git diff <base>` for the change against the base, committed or not, and
  `git status` for what is not committed yet.
- **On a result branch**, from the base's checkout: `git log --oneline <base>..<branch>` for its commits and `git diff <base>...<branch>`
  for its change, as the branch made it, whatever the base did since.
- **A commit, a file in it and who wrote a line**: `git show <commit>` for a commit whole and `git show <commit>:<path>` for a file as
  that commit has it, `git blame -L <from>,<to> <path>` for the commit each line came from.
- **A search of a commit**: `git grep <pattern> <commit>`, which searches a revision rather than the working tree, where your harness's
  own search reads the files as they are now. `git ls-files <path>` lists what git tracks.
- **Whether one commit is within another**: `git merge-base --is-ancestor <commit> <commit>`, answered by its exit code alone, so ask it
  with nothing after it; `git branch --contains <commit>` answers in words. `git worktree list` says which workspaces the repository has.

Each of these reads and writes nothing, so a read-only step may ask any of them.

The run reads the same without you, from git's object store, through this place's `report` verb (`verbs/report.ts`): what each result
branch changed against the base, file by file.

## Merge the base when a person asks

This section is a step's that writes the repository; a read-only step works from *Read what changed* instead.

A person can send a loop's work back to merge its base branch (`nemia refresh <run> [<step>] --base`), when the base moved and the work no longer lands.
Your brief names the commit the person's trial merge read: merge that commit, never the base as it stands now, which may have moved again.

- **A textual merge**: the work does not merge onto the base as text. `git merge <commit>`, resolve each conflict, keeping both meanings
  (what this change does, and what the base changed), and commit the merge.
- **A semantic merge**: it merges as text, but the landing's check refused the merged tree. `git merge --no-ff --no-commit <commit>`, fix
  what broke inside the merge before you commit it, so `git show --remerge-diff` of the merge commit shows the fix.

Where both meanings cannot hold, change nothing more, and sign off blocked naming the choice. The step that reads the merge after you
finds it with `git log --merges -1`.

## Stage a landing

This section is a step's that lands the run's result; a read-only step works from *Read what changed* instead.

When your step lands the run's result on its base, in the repository's own checkout, you stage the merge and the run commits it:

1. **Check the checkout**: on the base branch, nothing uncommitted, no merge in progress (`git status`). If it is not so, change nothing
   and stop, saying what you found.
2. **Stage the merge**: every result branch in one `git merge --no-ff --no-commit <branch>...`, as your brief says it.
3. **When it conflicts**: list the conflicting files (`git diff --name-only --diff-filter=U`), then `git merge --abort`, and stop with
   the list. Never resolve a conflict: the work goes back to be merged with its base by whoever made it.
4. **When it is clean**: leave it staged. The run checks the merged tree, then commits the merge or takes it back; `git commit` and
   `git merge --continue` are denied you, and a merge without `--no-commit` would commit it all the same.

## What the run asks of this place

The run asks this place itself, in code beside this file (`place.ts`, `verbs/`): each question is a call that runs git, with no script
and no process between, and you need not ask any of them. What each takes and answers:

- `open` — the repository a run starts in: `{ "root", "isolate" }` answers `{ "repo", "baseRef", "branch", "staged" }`, `staged` the
  file that is there while a merge is staged in that checkout, which the run reads with no process. With `isolate`, it refuses a
  `.worktreeinclude` that is no file or has a line outside the repository, the repository itself or `.git`.
- `make` — a step's worktree: `{ "repo", "at", "name", "from", "also" }` cuts one at `at` on a new branch `name` from `from`, or takes up
  the one already there on `name`, merges each branch of `also`, and copies in what `.worktreeinclude` lists and git ignores; it answers
  `{ "workspace", "branch", "conflicts", "notes" }`, `conflicts` the paths a merge left unmerged.
- `handoff` — commit what a step left uncommitted: `{ "workspace", "step", "why" }` answers `{ "commit" }`, null when the tree is clean.
- `status` — the merge staged in a checkout: `{ "checkout", "tips" }` answers `{ "merging", "conflicted", "missing", "head" }`.
- `report` — what each result branch changed against a run's base, from git's object store: `{ "repo", "baseRef", "onto", "branches",
  "diffOf", "present", "atBase" }` answers `{ "at", "files", "diffs", "present", "atBase" }`.
- `standing` — where result branches stand against the base they land on, in one listing of the repository's branches:
  `{ "repo", "branches": [{ "branch", "tip", "baseRef" }], "base" }` answers `{ "heads", "branches" }`, every branch and its commit, and
  for each asked its tip (null once git no longer has it), whether it is within `base` (`onBase`: yes, no or unknown), whether it holds
  work past its `baseRef` (`pastBase`), and how many commits it is ahead of `base`.
  A branch may carry `"known": { "tip", "pastBase" }`, what was last read of it: its `baseRef` is then left out of the listing, and its
  `pastBase` is believed only while its commit is still that `tip`, else asked of git.
- `trial` — whether branches merge, by a merge made in git's object store alone, which touches no checkout, index or ref:
  `{ "repo", "trials": [{ "onto", "branch" }] }` answers `{ "at", "trials" }`, the commit each `onto` names now and each trial in the
  order asked, `{ "clean": true }`, `{ "clean": false, "conflicts" }` or `{ "unknown" }` with git's words.
- `land` — commit the staged merge, or take it back: `{ "checkout", "act": "commit", "message" }` answers `{ "commit" }`, and
  `{ "checkout", "act": "abort" }` answers `{ "aborted": true }`.
- `inventory` — what a run left, read and touched not at all: `{ "repo", "under", "prefix", "base" }` answers `{ "workspaces",
  "branches" }`, each worktree git lists inside `under` with its HEAD, branch, lock, whether it is clean and what it holds uncommitted, and
  each branch under `refs/heads/<prefix>` with whether it is merged into `base`. A `repo` that is no directory answers both empty.
- `remove` — take it away: `{ "repo", "workspaces", "branches" }` removes each worktree, never forced, prunes git's list, and deletes each
  branch; it answers `{ "removed", "left", "deleted", "kept" }`, what git would not remove or delete in its words.
- `export` — a tag's tree written into an empty folder, from git's object store, never a working tree, for `nemia upgrade`:
  `{ "repo", "tag", "into" }` answers `{ "commit" }`. The tree gets an empty repository of its own, nothing committed, so its checks can
  list its files.
- `root` — the repository a folder is in, asked when a folder joins a factory: `{ "dir" }` answers `{ "root" }`, the main checkout's
  root from that root, a folder inside it or a linked worktree alike, and `null` for a folder in no repository.
- `seal` — that empty repository taken away once the checks passed: `{ "tree" }` answers `{ "removed" }`.

A verb that will not act answers `{ "refused": "<why>" }`; one git did not answer within its deadline, or that failed before it
answered, is not heard, and the run asks again on its next pass.

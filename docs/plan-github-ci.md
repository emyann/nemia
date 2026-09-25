# Moving to GitHub, with CI

2026-09-25. A plan, not yet started: the first step waits on a name.

## Why now

A day of running the factory on one laptop showed how much of its work is CI's:

- **Checks compete with the person at the machine.** Several runs' checks at once (turbo across five packages, the web build,
  the e2e's software-rendered Chromium) froze the owner's Windows desktop. It took `nice`, a concurrency cap, and two
  `.wslconfig` changes to calm it.
- **A shared machine leaks into the checks.** After a WSL restart, `systemd-tmpfiles` emptied `/tmp` under a running e2e, and
  every run read as removed. A restart also cut a ship off mid-merge and left main's checkout half merged.
- **Branches chase main.** Five runs on 2026-09-24/25 spent a review round only to merge main again, because another run had
  merged first. One (the test-leak fix) did so three times.
- **A ship babysits a ten-minute check from inside a session that cannot wait.** A `claude -p` job cannot end a turn to wait
  for a background process, and one Bash call is capped at ten minutes, so a slow check forced a ship to sign off mid-check
  (card `the-ship-s-check-on-the-merg-zhv5` fixes that locally in the meantime).

A hosted CI with a merge queue answers each of these: checks run on clean runners off the laptop, and the queue tests each change
on top of main and the changes ahead of it, then merges. Nothing chases main.

## The order

1. **Choose the project's new name.** Everything below waits on it.
2. **Rename the project in the repository.** The packages were renamed on 2026-09-23 (`agent-runtime`, `agent-orchestrator`); the
   project itself is still `hkb-v2`: the README's title, the root `package.json`'s `name`, the board's title and the docs that
   call it that. What people type and what is on disk keeps its name, as with the package rename: the `wf` and `ae` commands,
   `~/.agent-workflows` and `~/.agent-engine`. Dated writing keeps its words.
3. **Settle what the history exposes** (below), before anything is pushed.
4. **Put it on GitHub** by renaming the existing repository and replacing its code, keeping the old code reachable.
5. **CI**: an Actions workflow, branch protection and a merge queue.
6. **The factory ships through pull requests.** `ship` becomes "open the PR and let the queue merge it".
7. **Other repositories** (`docs/plan-multi-repo.md`) follow mostly as configuration once 4 to 6 hold.

## 3. What the history exposes

The repository `emyann/harness-kanban-board` is **public**, so everything in this history becomes public: every doc, night
log, evaluation and experiment, and every commit's metadata. Audited on 2026-09-25 over all 1,333 commits:

- **Secrets: none found.** `.env` (with `TYPESAFE_API_KEY`) was ignored from the first commit and never committed, and the key's
  actual value appears nowhere in the history. Patterns searched for, with no hit: Anthropic (`sk-ant-`), OpenAI-style `sk-`,
  GitHub tokens (`ghp_`, `gho_`, `github_pat_`), AWS (`AKIA`), Slack (`xox?-`), Google (`AIza`), JWTs, private-key blocks, and
  quoted `api_key`/`secret`/`token`/`password` values. No dedicated scanner (gitleaks, trufflehog) was installed; running one in
  CI on every push is part of step 5.
- **A personal email on 11 commits.** The first eleven, all 2026-09-12, are authored `renaudin.yann@gmail.com`; the other 1,311
  use the GitHub no-reply address, and 11 more are `wf <wf@local>` (the run's own hand-off commits). *Decision:* leave them, or
  rewrite the authors (`git filter-repo --mailmap`) before the first push. Rewriting changes every commit's hash after them, which
  is all of main, and the store's past runs judge "shipped" by whether their result branch is an ancestor of main, so every
  finished run would read as not shipped, and every `--after` chain on one would wait for ever. Rewrite only with the store
  emptied of the runs that matter, or not at all.
- **Local paths.** 28 files at HEAD name `/home/yrnd1` or `/mnt/c/Users/renau` (the evaluation reports, `plan-hold-the-bar.md`,
  the Jev experiments' scripts and datasets, one judge test). Harmless, but a username; they can be generalised in the rename.
- **Recorded agent output.** The Jev experiments under `docs/pivot-2026-09-18/experiments/` keep real closeouts, needs and
  judgements from this repository's runs (`e5-closeouts.json`, `judge-runs-2026-09-19.json`, the design dataset, 0.6 MB). They
  describe this repository only. *Decision:* publish, or move them out of the tree before the push.
- **Nothing large.** The biggest blob is 0.6 MB; the only tracked images are the shadcn skill's two PNGs.

## 4. GitHub

The repository already exists and is public. GitHub renames a repository in place: issues, stars, settings and history stay, and
the old URL and remote keep redirecting to the new name unless a new repository later takes the old name.

1. **Keep the old code.** Tag its current main `v1-final` and push a branch `legacy/v1` from it.
2. **Rename:** `gh repo rename <new-name> -R emyann/harness-kanban-board`, and update the description.
3. **Replace main.** Add the remote here and push this history as `main`. That is a force-push over the old main, done once, by
   the owner. Nothing in the factory pushes today, and `.claude/settings.json` refuses `git push`.
4. **Protect main** before anything else lands: pull requests only, required checks, no force-push, linear history off (the
   ship's `--no-ff` merges are the record), a merge queue.
5. **CODEOWNERS** on what a branch could use to weaken its own check: `.github/`, `.claude/settings.json`, `workflows/`,
   `package.json` scripts. That is "No command from a checkout" in CI's terms: a pull request that edits the workflow that
   checks it needs the owner's review.

## 5. CI

Being public, standard Actions runners cost nothing (a private repository would get 2,000 minutes a month, which about twenty
runs a day at several checks each would exhaust).

One workflow, on `pull_request` and `merge_group`:

- `npm ci`, `npm test`, `npm run typecheck`, `npm run build`, then `npx playwright install --with-deps chromium` (cached) and
  `npm run e2e`, uploading `.e2e/*.png` as an artifact so a reviewer can read the pictures.
- The tests need no live harness: the api's tests put a fake `claude` first on `PATH` (`apps/api/test/harness.ts`), and the live
  tests run only under `AE_LIVE=1`, which CI never sets.
- A secret scan (gitleaks) on every push.
- `concurrency` per pull request, cancelling a superseded run.

About 6 to 8 minutes on a standard runner, off the laptop, one per PR plus one in the queue.

## 6. The factory ships through pull requests

What changes:

- **Pushing.** A run pushes its own result branch (`wf/<run>/…`), never main. CLAUDE.md's "Never push" becomes "push only your
  run's branch"; branch protection, not `settings.json`, is what refuses a push to main.
- **The ship step** opens the PR (`gh pr create`, the body from the run's closeouts) and enables auto-merge into the queue. The
  gate stays where it is: the owner approves the ship at its gate, or approves the PR, and only then does it enter the queue.
- **The run reads CI.** A ship's step waits on the PR's checks and the queue's result, read with `gh`, level-triggered like
  everything else: merged, failed with the failing job's log, or still waiting. A runtime harness that "runs" a CI check, or the
  ship reading the PR's status on each tick; the plan for that step chooses.
- **Round checks.** Stay local and fast (tests, typecheck, build, no e2e, since 2026-09-25), or move to CI on each push of the
  run's branch. The second takes the load off the laptop entirely, at the cost of a push per round.
- **What goes away.** The shipper's trial merge and hand-run check, the chasing of main, and the tick's clean-up of a merge left
  on main.

CLAUDE.md sections to rewrite then: *Git* (push, merge, the ship's exception), *Rules the code keeps* ("No command from a
checkout" as CODEOWNERS), and every lesson about the ship's check.

## Decisions for the owner

1. The project's new name.
2. The 11 commits with the personal email: leave, or rewrite before the first push (and what that does to the store's past runs).
3. The Jev experiments' recorded run data: publish, or move out first.
4. Round checks: local (as now) or in CI on each push.

## Cards, once the name is chosen

1. Rename the project in the repository (the name, the README, the root package, the board's title, the docs), with the names
   test taught the old project name the way it knows the old package names.
2. Generalise local paths in the files that name them; move the experiments' data out if so decided.
3. The owner, by hand: tag and branch the old main, rename the repository, push, protect main, CODEOWNERS.
4. The Actions workflow with the e2e and the secret scan, proven on a first PR.
5. The ship through a pull request and the merge queue, with the run reading CI's result.
6. Round checks in CI, if so decided.

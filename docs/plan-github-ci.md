# Moving to GitHub, with CI

2026-09-25, and still the one document to open to learn where the GitHub move stands. Steps 1 to 3 are done; step 5, CI, is being
built now under the intent `the-ci-is-the-check-nemia-s-j94s` (signed 2026-10-19, twenty-six decisions, six cards), which also decided
what of Nemia's own checks CI takes over. Step 6 is a named follow-on intent, not this one.

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

1. ~~**Choose the project's new name.**~~ Done: Nemia, chosen by the owner on 2026-09-29.
2. ~~**Rename the project in the repository.**~~ Done: the project was `hkb-v2` until it was named Nemia on 2026-09-29.
   The README's title, the root `package.json`'s `name`, the board's title and the docs that called it that say Nemia, and so
   do the machinery's names (a step's plugin, the api's MCP client, the board's storage keys); the names test refuses the old
   name outside history and paths. What people type and what is on disk kept its name, as with the package rename: the `wf`
   and `ae` commands, `~/.agent-workflows` and `~/.agent-engine`, and the checkout's folder. Dated writing keeps its words.
3. ~~**Settle what the history exposes**~~ (below). Done: audited over all 1,333 commits, and the three decisions on it taken.
4. **Put it on GitHub** by renaming the existing repository and replacing its code, keeping the old code reachable.
5. **CI**: an Actions workflow and branch protection. Under way; the merge queue moved to step 6 with the pull-request landing.
6. **The factory ships through pull requests**, with the merge queue. A named follow-on intent's, not this one's.
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
  use the GitHub no-reply address, and 11 more are `wf <wf@local>` (the run's own hand-off commits). **Decided 2026-09-25: left
  as they are; the history is not rewritten.** Rewriting the authors (`git filter-repo --mailmap`) would change every commit's hash
  after them, which is all of main, and the store's past runs judge "shipped" by whether their result branch is an ancestor of
  main: every finished run would read as not shipped, and every `--after` chain on one would wait for ever.
- **Local paths.** 28 files at HEAD named `/home/<user>` or `/mnt/c/Users/<user>` with the owner's username (the evaluation
  reports, `plan-hold-the-bar.md`, the Jev experiments' scripts and datasets, one judge test). Harmless, but a username. With the
  Jev experiments out of the tree (below), 16 were left, the cost scripts' transcript globs and one test among them. **Generalised at
  HEAD on 2026-09-29** (`~/…`, `<repo>/…`, `<user>`); the history is not rewritten, and
  `packages/agent-orchestrator/test/local-paths.test.ts` refuses a new one.
- **Recorded agent output.** The Jev experiments under `docs/pivot-2026-09-18/experiments/` keep real closeouts, needs and
  judgements from this repository's runs (`e5-closeouts.json`, `judge-runs-2026-09-19.json`, the design dataset, 0.6 MB). They
  describe this repository only. **Decided 2026-09-25: moved out of the tree** — `jev/`, `jev-design/` and `jev-split/` are kept
  outside the repository since then, and the docs that cite them keep the results' words. The history is not rewritten, so the
  commits before then still hold them. `cost/` stays.
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

One workflow, `.github/workflows/ci.yml`, on three events: `push` to `main`, `pull_request`, and `workflow_dispatch` so the owner can
fire it by hand. Never the trigger that runs a fork's code against a writable token; `permissions: contents: read`; `concurrency` per
ref, cancelling a superseded run of a branch but never one of `main`, since a cancelled job is read as a failure and a landing's verdict
must be its own. GitHub's own actions by major tag, and a third party's taken as a pinned download in a `run` step instead. No tag
trigger: `nemia upgrade`'s own trial build is a release's gate.

What it runs, all of it reporting **one required context, `ci`**, from a single gate job that `needs` every other job with `always()`, so
branch protection is configured once and never touched as the job list grows. All but gitleaks are built; that comes with card 3, and the
gate's `needs` clause is what refuses adding a job and forgetting to wire it in:

- **Ten test legs**: one per workspace, on node 24.16.0 — the floor `engines.node` claims — and 24, each leg running its package's suite
  twice, under `TZ=UTC` and `TZ=America/New_York`. Both runs pass `--force`: `turbo.json` hashes no environment, so without it the second
  run replays the first from the cache and the second timezone is never tested.

  The floor was 22.18.0, where type stripping became unflagged, and rose to 24.16.0 when CI first ran the suite on it. Two things it
  cannot do: libuv 1.51.0 truncates a millisecond time set through `utimes` — 496 of 1,000 such times read back changed, which the
  runtime's capture cache and its quiescence compare with `===` — and Node's test runner takes `--test-isolation` only from 24.13.1,
  which `workflows/build/mutants.ts` passes. The first is what sets the floor: libuv 1.52.1 keeps the millisecond, no Node 22 release
  ships it (22.23.3, the line's latest, carries 1.51.0), and 24.16.0 is the first 24.x that does — 24.15.0 still carries 1.51.0. So the
  floor is the first release the suite passes on, not a round number.
- **`npm run lint` and `npm run typecheck`**, whole, on the floor.
- **The whole e2e in four shards**, each leg running `npm run e2e -- --shard ${{ matrix.shard }} --of ${{ strategy.job-total }}`: the
  runner deals the pages itself from the pages that exist (`shardOf`, `apps/web/test/e2e/pages.ts`), so the shard count is written once,
  in the matrix, and a new e2e page is still its file and its line in `apps/web/test/e2e/pages/NAMES` and nothing else. Each shard
  uploads its page times, and an `e2e-bound` job sums every shard's against `PAGES_BOUND_MS` — the bound that is the whole run's and
  additive, which a shard silences inside a run exactly as `--pages` does — through `node apps/web/test/e2e/pages-bound.ts`, whose
  refusal names the slowest pages, or the shard that wrote nothing. Playwright's browsers are cached, keyed on the lockfile; only a
  failing page's pictures are uploaded. npm itself is never cached: the lockfile's own install is part of what is tested.
- **A build job** that runs `npm run build` and `npm run theme:generate` and then refuses a stale generated file by name, over
  `apps/web/src/routeTree.gen.ts` and `apps/web/theme/`. Both generators were run twice on the committed tree before the job was
  written, and write the same bytes: the job's verdict rests on that.
- **gitleaks** (card 3) over the incoming commits, as a pinned binary with a two-line allowlist, and `CODEOWNERS` over what a branch
  could edit to weaken its own check.

The tests need no live harness, and nothing a clean `ubuntu-latest` lacks: the api's tests put a fake `claude` first on `PATH`
(`apps/api/test/harness.ts`), the one docker-shaped test stubs `docker`, every `fetch` is loopback, and the live tests run only under
`AE_LIVE=1`, which CI never sets.

**Prose is not what holds the workflow to the repository.** `packages/agent-orchestrator/test/ci-workflow.test.ts` refuses, each by its
own sentence naming the fix: a workspace with a suite and no leg, a leg that does not filter to its own workspace, a node floor adrift
from `engines.node`, one of the two jobs that run whole on the floor pinned off it — or unpinned, or gone — a node version left
unquoted (YAML reads `24.16` as a number and setup-node installs another release), a timezone
the leg does not run its suite under and a run of it that drops `--force`, a `cancel-in-progress` that would cancel a run of `main`, a
job outside the gate's `needs`, a gate without `always()`, a gate step not given the results through its environment or interpolating an
expression into its shell, an action that is not GitHub's own by major tag, and the trigger that would run a fork's code against a
writable token. Card 2 added three clauses of its own: an `e2e` matrix that is not 1..n in order or a run of the e2e that does not take
its shard off the leg (`--shard ${{ matrix.shard }}`) and its count off the matrix (`--of ${{ strategy.job-total }}`), with more shards
than `pages/NAMES` has pages; an `e2e-bound` job missing, not needing the shards, or not running `pages-bound.ts`, which is the one
place `PAGES_BOUND_MS` is applied and the reason no copy of the number is in the YAML; and a `build` job that does not run a generator,
or whose staleness step forgets one of the generated paths — those paths being read from one list, which is itself refused when it names
a path this repository does not have. What the gate's script decides is not read but run, in
`packages/agent-orchestrator/test/ci-gate.boundary.test.ts`, and the build job's staleness step likewise in
`packages/agent-orchestrator/test/ci-build.boundary.test.ts`, whose last test runs a step that lists the stale files and forgets to fail,
to show that a text match over the step would have passed it:
against every result GitHub can hand it and three it cannot, because a list of the words that mean failure and a check that every result
means success read alike to a pattern and differ exactly on the result nobody foresaw. There is no shard list anywhere to drift from `NAMES`: the runner deals the
pages, and coverage — every page in exactly one shard, in the pages' order — is proved in `apps/web/test/e2e-pages.test.ts` over the pages
that exist. So the file cannot quietly test less than it claims.

**The owner pushes `main` by hand after each landing**, and reads the verdict off GitHub's own notification or the Actions tab. Nothing in
Nemia reads CI today, and `push: main` fires after the landing has already committed: CI reports on a landing and never gates one, so a
red `main` is a normal state to be fixed, not a blocked one. One push after each landing is also what makes one CI run name one landing,
and the verdict attributable.

## 6. The factory ships through pull requests

A named follow-on intent's work, not this one's: the pull-request landing, the merge queue, `merge_group`, and Nemia reading CI's verdict
through a place's `checks` verb, with `checks:` and several named checks as its first card. What changes there:

- **Pushing.** A run pushes its own result branch (`wf/<run>/…`), never main. CLAUDE.md's "Never push" becomes "push only your
  run's branch"; branch protection, not `settings.json`, is what refuses a push to main.
- **The ship step** opens the PR (`gh pr create`, the body from the run's closeouts) and enables auto-merge into the queue. The
  gate stays where it is: the owner approves the ship at its gate, or approves the PR, and only then does it enter the queue.
- **The run reads CI.** A ship's step waits on the PR's checks and the queue's result, read with `gh`, level-triggered like
  everything else: merged, failed with the failing job's log, or still waiting. A runtime harness that "runs" a CI check, or the
  ship reading the PR's status on each tick; the plan for that step chooses.
- **Round checks.** Settled by the CI intent, not here: they stay local, and narrow to what the change touched. A round proves the
  bound, the pictures, the probes, the mutants, the types and the lint whole, and the tests of the packages whose turbo inputs cover the
  diff; the whole forced suite and the whole e2e become CI's, and the laptop stops paying for them.
- **What goes away.** The shipper's trial merge and hand-run check, the chasing of main, and the tick's clean-up of a merge left
  on main.

CLAUDE.md sections to rewrite then: *Git* (push, merge, the ship's exception), *Rules the code keeps* ("No command from a
checkout" as CODEOWNERS), and every lesson about the ship's check.

## Decisions for the owner

1. ~~The project's new name~~ — decided 2026-09-29: Nemia.
2. ~~The 11 commits with the personal email~~ — decided: left as they are, no history rewrite.
3. ~~The Jev experiments' recorded run data~~ — decided: moved out of the tree, history kept.
4. ~~Round checks: local (as now) or in CI on each push~~ — decided 2026-10-19 with the CI intent: **local, and narrowed to what the
   change touched**. The whole forced suite and the whole e2e are CI's; a round keeps only what a clean runner cannot do sooner, and the
   landing proves the merge's own diff on the merged tree.

## Cards, once the name is chosen

1. ~~Rename the project in the repository (the name, the README, the root package, the board's title, the docs), with the names
   test taught the old project name the way it knows the old package names.~~ Done, 2026-09-29.
2. ~~Generalise local paths in the files that name them (the experiments' data is already out).~~ Done, 2026-09-29.
3. The owner, by hand: tag and branch the old main, rename the repository, push, protect main, enforce CODEOWNERS.
4. Steps 5 and 6 above are now the intent `the-ci-is-the-check-nemia-s-j94s` and its follow-on, cut into six cards: the workflow file
   with its guard test, this document and the README badge; the e2e shards with the build job and the generated-file guard; gitleaks,
   `CODEOWNERS` and the two `private` lines; then the three that narrow Nemia's own checks — the diff-to-packages mapping, the round's
   narrowing, and the landing's narrowing with its inside-or-outside label. The ship through a pull request and the merge queue are the
   follow-on's.

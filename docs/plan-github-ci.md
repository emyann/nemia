# Moving to GitHub, with CI

2026-09-25, and still the one document to open to learn where the GitHub move stands. Steps 1 to 3 are done, and so is step 5, CI: it was
built under the intent `the-ci-is-the-check-nemia-s-j94s` (signed 2026-10-19, twenty-six decisions, six cards), which also decided
what of Nemia's own checks CI takes over; a run's round has been judged by `ci` on its pull request since `bcba88e51` (2026-10-19). Step 6 is a named follow-on intent, not this one.

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
  quoted `api_key`/`secret`/`token`/`password` values. Audited again on 2026-10-19, with gitleaks v8.30.1 over all 4,021 commits
  of the history: no secret found, and the only findings are the three deliberate stub secrets the runtime's
  `test/remote-agent.test.ts` writes to prove a secret reaches the harness and is written nowhere else. That run is the baseline,
  and the history is not scanned again: the scanner now runs in CI over each push's or pull request's own new commits, at that
  pinned version, under the `ci` gate.
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
5. **Enforce CODEOWNERS** in branch protection. The file itself is written (`.github/CODEOWNERS`, card 3): `/.github/`,
   `/.claude/settings.json`, `/workflows/` and `package.json`. That last pattern alone carries no leading slash, so it reaches
   every workspace's manifest and not the root's — CI's legs run each workspace's own `test` script, so a package's manifest
   weakens the check as surely as the workflow does. That is "No command from a checkout" in CI's terms: a pull request that
   edits the workflow that checks it needs the owner's review. Until protection requires a code owner's review the file is
   prose to GitHub, which is what makes this a hand step and not card 3's work.

## 5. CI

Being public, standard Actions runners cost nothing (a private repository would get 2,000 minutes a month, which about twenty
runs a day at several checks each would exhaust).

One workflow, `.github/workflows/ci.yml`, on three events: `push` to `main`, `pull_request`, and `workflow_dispatch` so the owner can
fire it by hand. Never the trigger that runs a fork's code against a writable token; `permissions: contents: read`; `concurrency` per
ref, cancelling a superseded run of a branch but never one of `main`, since a cancelled job is read as a failure and a landing's verdict
must be its own. GitHub's own actions by major tag, and a third party's taken as a pinned download in a `run` step instead. No tag
trigger: `nemia upgrade`'s own trial build is a release's gate.

What it runs, all of it reporting **one required context, `ci`**, from a single gate job that `needs` every other job with `always()`, so
branch protection is configured once and never touched as the job list grows. The gate's `needs` clause is what refuses adding a job
and forgetting to wire it in:

- **Twelve test legs**: one per workspace, on node 24.16.0 — the floor `engines.node` claims — and 24, the orchestrator in two shards
  on each node, so four legs of its own. Each leg runs its package's suite once, under `TZ=UTC`; the web's leg alone runs it a second
  time under `TZ=America/New_York`, conditioned with `if: matrix.workspace == 'web'`. Both runs pass `--force`: `turbo.json` hashes no
  environment, so without it the second run replays the first from the cache and the second timezone is never tested.

  The second zone was every leg's until the card of 2026-10-21 measured what it bought. Local time is read in `apps/web/src/lib` (8
  files) and nowhere else: the orchestrator, the runtime and the api read none, and the runtime's one hit formats a number. In 54 `ci`
  runs the New York pass never failed on its own — each of the 8 failures had already failed under UTC. The web's pass is 47 s, so its
  second zone is cheap; the shape measured then had ten legs, and the second zone of the eight that are not the web's came to about 21
  runner-minutes a push for a zone no code of theirs can read. A workspace that grows a local-time read needs its second zone back in
  the file: nothing scans for one, and the risk is named here rather than held.

  The orchestrator's leg was the longest job of the run, 766 s for its two passes against one pass of 364 s, so its suite runs in two
  halves with Node's `--test-shard=<i>/2`. Its four legs arrive through `matrix.include` rather than a `shard` axis: a matrix cannot
  split one combination, and GitHub makes a leg of its own of an `include` entry whose value for an axis the axis does not hold — so
  `agent-orchestrator` is off `matrix.workspace` and named by four entries, two nodes by two halves. A `shard` axis would instead need
  nine `exclude` entries, and a forgotten exclusion would run a workspace's whole suite beside its halves.

  The fraction reaches `node --test` through a hole in the orchestrator's own `test` script,
  `${WF_TEST_SHARD:+--test-shard=$WF_TEST_SHARD}`, written after `--test` and before the script's globs, with the leg passing
  `WF_TEST_SHARD: ${{ matrix.shard }}` in the run step's env. Not as a turbo `-- --test-shard=1/2`: turbo appends that after the
  script's own arguments, where node has stopped parsing options and reads it as a file pattern instead (`options.globPatterns` is
  argv past the first positional). And not through `NODE_OPTIONS`, which every node child the suite spawns would inherit. Unset — a
  person's `npm test`, a run's check — the hole expands to nothing and the suite runs whole. Node deals the files to the shards
  round-robin by index, not by duration, so the halves are as even as that parity makes them; the job costs the slower one.

  The floor was 22.18.0, where type stripping became unflagged, and rose to 24.16.0 when CI first ran the suite on it. Two things it
  cannot do: libuv 1.51.0 truncates a millisecond time set through `utimes` — 496 of 1,000 such times read back changed, which the
  runtime's capture cache and its quiescence compare with `===` — and Node's test runner takes `--test-isolation` only from 24.13.1,
  which the mutant runner passed before it was removed. The first is what sets the floor: libuv 1.52.1 keeps the millisecond, no Node 22 release
  ships it (22.23.3, the line's latest, carries 1.51.0), and 24.16.0 is the first 24.x that does — 24.15.0 still carries 1.51.0. So the
  floor is the first release the suite passes on, not a round number.
- **`npm run lint` and `npm run typecheck`**, whole, on the floor. So are the e2e shards, their bound and the build: every job but the
  legs runs this repository's code on the one version it claims to run on, and `pinDrift` refuses a pin that is not the floor wherever
  it is, so a job a later card adds is held the day it is written.
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
- **A gitleaks job** over the push's or the pull request's own new commits — never the history, whose audit above is the baseline. The
  binary is a pinned download in a `run` step, v8.30.1 checked against its release's sha256, so no third party's code runs with this
  job's token. It scans with `--redact`, this repository and its logs being public, and with `--exit-code 2`, since gitleaks exits 1
  both for a secret found and for a range it could not resolve and a job that calls the second a leak says the wrong thing to whoever
  reads it. `.gitleaks.toml` allows the three stub secrets of `packages/agent-runtime/test/remote-agent.test.ts`, by shape and by that
  one path, as a `[[rules.allowlists]]` under `[[rules]] id = "generic-api-key"` — never a top-level `[[allowlists]]`, whose `paths`
  entry skips the whole file whatever its `condition` and so allows every secret in it. That scoping is the one thing the file's own
  text cannot say, so a step of the job proves it on every run: it writes a fixture — the stub shapes read out of the file they belong
  to, two controls of other shapes generated beside them, and a stub shape at a second path — scans it with the config and without,
  and refuses unless the stubs are allowed at their one path and nothing else is. Beside the job, `.github/CODEOWNERS` over what a
  branch could edit to weaken its own check, and `"private": true` on both packages, so an `npm publish -w` is refused by npm itself
  rather than by a fence a checkout could edit.

The tests need no live harness, and nothing a clean `ubuntu-latest` lacks: the api's tests put a fake `claude` first on `PATH`
(`apps/api/test/harness.ts`), the one docker-shaped test stubs `docker`, every `fetch` is loopback, and the live tests run only under
`AE_LIVE=1`, which CI never sets.

**Prose is not what holds the workflow to the repository.** `tools/guards/test/ci-workflow.test.ts` refuses, each by its
own sentence naming the fix: a workspace with a suite and no leg, a leg that does not filter to its own workspace, a node floor adrift
from `engines.node`, a job that pins its node by hand and pins it off that floor — or pins none at all — a hidden path uploaded
without `include-hidden-files`, a node version left unquoted (YAML reads `24.16` as a number and setup-node installs another
release), a timezone
the legs do not run their suites under — `UTC` unconditioned, and `America/New_York` conditioned on the web and no other leg — a third
zone nothing here accounts for, a run of a suite that drops `--force`, an `include` entry that would be merged into an existing leg
rather than making one (a workspace the axis already names, or an entry with no workspace or no node), a workspace that arrived through
`include` and lost a node the axis names, a set of shards that does not tile 1/n … n/n or a shard written in a form
`--test-shard` does not take, a leg beside the shards with no shard of its own, a sharded workspace whose `test` script has no hole for
the fraction or holds it after its globs, a suite run not given `WF_TEST_SHARD: ${{ matrix.shard }}` or given a literal in its place, a
leg name that does not name its shard, a `cancel-in-progress` that would cancel a run of `main`, a
job outside the gate's `needs`, a gate without `always()`, a gate step not given the results through its environment or interpolating an
expression into its shell, an action that is not GitHub's own by major tag, and the trigger that would run a fork's code against a
writable token. Card 2 added three clauses of its own: an `e2e` matrix that is not 1..n in order or a run of the e2e that does not take
its shard off the leg (`--shard ${{ matrix.shard }}`) and its count off the matrix (`--of ${{ strategy.job-total }}`), with more shards
than `pages/NAMES` has pages; an `e2e-bound` job missing, not needing the shards, or not running `pages-bound.ts`, which is the one
place `PAGES_BOUND_MS` is applied and the reason no copy of the number is in the YAML; and a `build` job that does not run a generator,
or whose staleness step forgets one of the generated paths — those paths being read from one list, which is itself refused when it names
a path this repository does not have. Card 3 added its own: no scan job, a download whose URL is not pinned by `${VERSION}` or whose
bytes are not checked against a sha256, a scan missing `--log-opts`, `--redact`, `--exit-code 2` or its `--config`, a shallow checkout,
and the self-check step dropped from the job; and, over `.gitleaks.toml` itself, a top-level `[[allowlists]]`, an allowlist not nested
under one `[[rules]]` block carrying `id = "generic-api-key"`, a `[[rules]]` block carrying any other key — which replaces the default
rule rather than extending it, leaving a rule that detects nothing — a `paths` scope wider than the one file, a regex anchored at
neither end, and a stub secret that file writes which no regex there matches. `tools/guards/test/repo-guards.test.ts`
holds the two things that are not the workflow: a path of `CODEOWNERS` left out, given to somebody else or to nobody, the manifest line
written `/package.json` and so owning the root's alone, and a package without its `private` line. What the gate's script decides is not
read but run, in `tools/guards/test/ci-gate.boundary.test.ts`, the build job's staleness step likewise in
`tools/guards/test/ci-build.boundary.test.ts`, and the scan job's two shell steps in
`tools/guards/test/ci-scan.boundary.test.ts` — the ranges it resolves on a pull request, a push, a branch's first push and
a dispatch, the flags that reach the binary, its three verdicts, and each refusal of the self-check, over a `gitleaks` stub. Each of the
three ends on a step that reads right and decides wrong: the staleness step that lists the stale files and forgets to fail, the scan step
that calls every exit 1 a secret found, and the gate run
against every result GitHub can hand it and three it cannot, because a list of the words that mean failure and a check that every result
means success read alike to a pattern and differ exactly on the result nobody foresaw. There is no shard list anywhere to drift from `NAMES`: the runner deals the
pages, and coverage — every page in exactly one shard, in the pages' order — is proved in `apps/web/test/e2e-pages.test.ts` over the pages
that exist. So the file cannot quietly test less than it claims.

~~**The owner pushes `main` by hand after each landing**~~ — no longer so since the intent `a-run-s-change-is-a-pull-req-t452`
(2026-10-19): a run pushes its own branch and opens its pull request (`workflows/build/pull-request.ts`), its round check waits on the
`ci` context of that head, and the landing merges the pull request on GitHub and fast-forwards `main` in the owner's checkout
(`workflows/build/landing.ts`). CI now gates a landing rather than reporting on one: `ci` is required on the head the review read, and
a red or missing one is the landing's refusal. Nothing is pushed by hand, and one pull request names one landing.

## 6. The factory ships through pull requests

**Done, 2026-10-19/20, by the intent `a-run-s-change-is-a-pull-req-t452`** — all but the merge queue. The factory now merges through
pull requests end to end: a run pushes only its own branch, opens the pull request its round check waits on, and lands by merging that
pull request with `--merge` at the sha the review read, then fast-forwarding the checkout. The frozen scripts carry both acts, and every
agent's fence refuses `gh` and `git push` whole.

**The next follow-on: a merge queue.** Not a card, and not scheduled. The landing's check is a receipt now, so nothing re-runs the suite
on the merged tree; a base that moves between `ci` and the merge is covered by GitHub's own `mergeable` and the required-context rule on
a linear fast-forward, and by this factory landing one run at a time with a person at the gate. A merge queue (`merge_group`) would
cover it properly, and would be the moment to add Nemia reading CI's verdict through a place's `checks` verb with `checks:` and several
named checks. What was planned here, for the record:

- ~~**Pushing.**~~ Done: a run pushes its own result branch (`wf/<run>/…`), never main, through the frozen script; the agents' fences
  refuse `git push` whole, and branch protection refuses a push to main.
- ~~**The ship step** opens the PR~~ Done, by implement rather than the ending: the pull request is opened once a round, so `ci` judges
  every round. The gate stays where it was — the owner approves the landing at its gate, having read `ci` green — and auto-merge is not
  used: the landing session merges, so a refusal is a `blocked` sign-off a person reads.
- **The run reads CI.** Done for the one `ci` context, read by the frozen script: the round's check waits on it and the landing refuses
  anything but `SUCCESS` at the head. Reading a queue's result, and several named checks through a place's `checks` verb, is the merge
  queue's.
- **Round checks.** Settled by the CI intent, not here: they stay local, and narrow to what the change touched. A round proves the
  bound, the pictures, the probes, the types and the lint whole, and the tests of the packages whose turbo inputs cover the
  diff; the whole forced suite and the whole e2e become CI's, and the laptop stops paying for them.
- **What went away.** The landing's whole-suite check on the merged tree, and the hand push of main. The trial merge at the gate stays
  as advice a person reads, and `landingDue` and the git place are untouched: the tick still takes back a merge left staged on main.

CLAUDE.md sections to rewrite then: *Git* (push, merge, the ship's exception), *Rules the code keeps* ("No command from a
checkout" as CODEOWNERS), and every lesson about the ship's check.

## Decisions for the owner

1. ~~The project's new name~~ — decided 2026-09-29: Nemia.
2. ~~The 11 commits with the personal email~~ — decided: left as they are, no history rewrite.
3. ~~The Jev experiments' recorded run data~~ — decided: moved out of the tree, history kept.
4. ~~Round checks: local (as now) or in CI on each push~~ — decided 2026-10-19 with the CI intent: **local, and narrowed to what the
   change touched**. The whole forced suite and the whole e2e are CI's; a round keeps only what a clean runner cannot do sooner, and the
   landing proves the merge's own diff on the merged tree. That last clause was overtaken the next day by
   `a-run-s-change-is-a-pull-req-t452`: the landing's check is a receipt and proves nothing of the tree, `ci` on the pull request's head
   being the whole of it. The decision's first half — local round checks, narrowed — stands.

## Cards, once the name is chosen

1. ~~Rename the project in the repository (the name, the README, the root package, the board's title, the docs), with the names
   test taught the old project name the way it knows the old package names.~~ Done, 2026-09-29.
2. ~~Generalise local paths in the files that name them (the experiments' data is already out).~~ Done, 2026-09-29.
3. The owner, by hand: tag and branch the old main, rename the repository, push, protect main, enforce CODEOWNERS.
4. Steps 5 and 6 above are now the intent `the-ci-is-the-check-nemia-s-j94s` and its follow-on, cut into six cards: the workflow file
   with its guard test, this document and the README badge; the e2e shards with the build job and the generated-file guard; gitleaks,
   `CODEOWNERS` and the two `private` lines; then the three that narrow Nemia's own checks — the diff-to-packages mapping, the round's
   narrowing, and the landing's narrowing with its inside-or-outside label. The ship through a pull request was the follow-on
   `a-run-s-change-is-a-pull-req-t452`, landed 2026-10-19/20 in two cards: the pull request opens, and the landing merges it. A merge
   queue is named in §6 and scheduled as nothing.

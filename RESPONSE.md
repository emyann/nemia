# The suite on a clean runner: what was measured, and the floor it sets

Against GitHub Actions run 39336719053 (`emyann/nemia`, main `15afedc`), which was red in 21 tests on three legs.

## Cause 1 — git's default branch, on every Node

`packages/agent-orchestrator/test/screens-git.boundary.test.ts` made each scratch repository with a bare `git init -q` and then
asserted the literal `master` twelve times, so it passed where `init.defaultBranch` is unset and failed on the runner, whose
"Give the runner a git identity" step sets `main`.

The fixture now names its own branch, and inits under a default of `main` on purpose, so the branch can only come from the `-b`:

```
git('init', '-q', '-b', 'master')      // with -c init.defaultBranch=main
```

Reproduced and verified, each from `packages/agent-orchestrator` as its `test` script loads the file
(`node --import ./test/ambient.ts --test test/screens-git.boundary.test.ts`):

| `GIT_CONFIG_GLOBAL` sets | before | after |
| --- | --- | --- |
| `init.defaultBranch main` | 1 pass, 6 fail — the six of `ci-orch-24-failing.txt` | 7 pass, 0 fail |
| `init.defaultBranch master` | 7 pass | 7 pass, 0 fail |
| unset (the owner's machine) | 7 pass | 7 pass, 0 fail |

Dropping the `-b master` now fails the file **wherever it runs** — 6 failures on this machine, whose default is unset — rather than
only where the machine disagrees. That is mutant #1.

**The sweep for others.** Only this file named `master` anywhere in the repository's TypeScript. Of the tests that make a repository
with a bare `git init`, none other asserts a branch by name (`rm-walk.boundary.test.ts:42`'s `branch: 'main'` is a synthetic run
record, not a repository's branch). The decisive check: the whole suite, forced, under a CI-like global git config — green under
`init.defaultBranch` of **both** `main` and `master` (below).

## Causes 2 and 3 — the Node floor

Measured on the official nodejs.org binaries already in the owner's node cache under `~/.cache/`
(`node-v22.18.0-linux-x64`, `node-v22.23.3-linux-x64`, `node-v24.16.0-linux-x64`), not read from a changelog:

| Node | libuv | `--test-isolation=none` | millisecond times changed through `utimes` |
| --- | --- | --- | --- |
| 22.18.0 | 1.51.0 | `bad option` | **496 / 1,000** |
| 22.23.3 (the 22 line's latest) | 1.51.0 | `bad option` | **496 / 1,000** |
| 24.16.0 | 1.52.1 | accepted | 0 / 1,000 |
| 24.20.0 (the owner's) | 1.52.1 | accepted | 0 / 1,000 |

**Cause 2** is `workflows/build/mutants.ts:129` passing `--test-isolation=none`, which Node's runner takes unprefixed only from
24.13.1. No Node 22 release accepts it — 22.23.3, the line's latest, still refuses it.

**Cause 3** is one bug, not two halves: libuv 1.51.0 truncates a millisecond time set through `utimes` (`1767323045678` kept,
`1767323045677.999` read), and `src/harness/detached/said.ts` writes a kept capture's time that way (:143) and then compares what it
reads back with `!==` (:83, :141, :257). The two `said.test.ts` failures compare the time directly; the four quiescence failures in
`shell.test.ts` and `unsigned.test.ts` are downstream — the capture the quiescence reads is discarded on every look, so a quiet
session never settles. Reproduced on 22.18.0 here: 5 of the 6 failed on one run, the hit being probabilistic at ~50% per value.

**The first release where each works is 24.16.0,** and the binding constraint is libuv, not `--test-isolation`. Read from each
release's own headers (`node-vX-headers.tar.gz`, `include/node/uv/version.h`):

| Node | 24.0.0 | 24.10.0 | 24.13.1 | 24.14.0 | 24.14.1 | **24.15.0** | **24.16.0** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| libuv | 1.50.0 | 1.51.0 | 1.51.0 | 1.51.0 | 1.51.0 | **1.51.0** | **1.52.1** |

So 24.16.0 is the first 24.x carrying libuv 1.52.1, and no Node 22 carries it at all. The floor is the first release the suite
passes on, not a round number.

**What the choice costs.** Anyone on Node 22 can no longer run Nemia; `npm ci` answers `EBADENGINE`, which names the fix. The
alternative — keeping 22.18.0 — would have meant a tolerance on every exact comparison of a file time in the capture cache, for a
Node line with no user here, and a version branch in `mutants.ts`. The code is therefore **unchanged**: nothing rounds, and nothing
compares a file time with a tolerance. Those comparisons are written down as issue 38 in
`packages/agent-runtime/docs/open-issues.md`, against the day the floor moves.

## Where the floor is named

`package.json` `engines.node` (`>=24.16.0`) and its `package-lock.json` mirror, written by `npm install`; `.github/workflows/ci.yml`
— the matrix's floor leg and its comment, and the `lint` and `typecheck` pins, all four per the owner's answer, so CI is coherent
with `engines.node` on its first run; `README.md`, `docs/plan-github-ci.md` (with why it rose), `docs/plan-multi-repo.md`, and the
provisioning line of `docs/design-2026-10-13-mcp-port-and-seats.md`. `@types/node` stays at `^22.20.2`, as the owner chose — a card
of its own. Nothing else in `ci.yml` was touched: the e2e shards, the build job and the gate's `needs` are card
`ci-2-of-6-the-120-page-e2e-r-mg42`'s.

One correction to the spec: it said every REFUSED fixture in `ci-workflow.test.ts` passes its floor in as an argument and so stays
valid at any real floor. The `unquoted` fixture (:316) is handed the **real** `engines.node`, so its second expected sentence moves
with the floor; it now reads `24.16.0`. Nothing was loosened — the clause itself is untouched, and the real-file assertion at :253
is what holds the claim and the matrix together.

## The suite

Whole and forced (`npx turbo run test --force --continue`), 7,318 tests, 0 failures in every case:

| Node | global git `init.defaultBranch` | verdict |
| --- | --- | --- |
| 24.20.0 (the machine's) | unset | **0 failures** |
| 24.16.0 (the floor) | unset | **0 failures** |
| 24.16.0 (the floor) | `main`, with a CI-like identity | **0 failures** |
| 24.16.0 (the floor) | `master`, with a CI-like identity | **0 failures** |

`npm run typecheck`, `npm run lint` and `npm run build` exit 0. The three mutants below are killed, 0 refused.

**After merging the base** (`5ac2215`, "Serve a holder's own sessions over A2A, and dial the follow" — 23 files of agent-runtime,
merged with no conflict), the whole suite was run forced again on 24.16.0 under `init.defaultBranch main`: 7,340 tests, 0 failures,
with typecheck and lint at 0. That merged code had never run on the floor's binary before; it does. The mutants were tried again on
the merged result, and all three are still killed.

**What this does not prove:** the next CI run on main is the owner's to push after the landing, on runners this step cannot execute.
The closest proof is the table above — the floor's own binary, under the runner's own git default.

# Response to the review

## 1. Cancellation misses a check orphaned by a crash (`runner.ts:347`) — Fixed

You're right, and it breaks the level-triggered rule in exactly the case the rule exists for.
Adoption happened only at filing time, and a cancelled run files nothing. A check filed by a pass that
died before `writeRun` was therefore never adopted. `inFlight` never saw it, and neither the verb nor
any later tick stopped it. The suite ran on to its 600 s deadline. Because the record still named no
check, the step also stayed eligible for hand-off, so whatever the suite left behind could be
committed under the step's name.

**What changed.** `adoptChecks` in `runner.ts` runs straight after the engine is read, in both
`advance` and `wf cancel`. For every step whose check is due and unrecorded (`stepStatus` says
`checking` and there is no `steps[name].check`), it views the derived `<run>-<step>-check` and puts it
on the record when the engine has it. `advance` writes the record. `cancel` holds it in memory only,
so the one-writer rule stands. The lookup at filing time stays as a guard against journalling an id
twice.

**Test.** `a check filed by a pass that died, on a run then cancelled, is found and stopped — by the
verb, and by every pass` in `store.test.ts`. It refuses with the adoption removed from `advance`, and
again with it removed from `cancel`.

**One existing assertion changed.** The older adoption test asserted that the adopting pass reported
`checked: ['implement']`. The check is now adopted before the pass assesses anything, so that pass
files nothing and reports `[]`. `checked` means "filed by this pass", and the old value described an
adoption as a filing. The test still asserts exactly one filing and the check named on the record.

## 2. An unchecked predecessor keeps handing off a later step's workspace (`run.ts:212`) — Fixed

Right. `handOffDue` looked at each step on its own. A workspace is shared by an inheriting follower,
and by every step of a `--no-worktree` run, so an unchecked predecessor stayed due on every pass.
While the follower ran, it committed the follower's work in progress under its own name. While the
follower's check ran, it committed the check's litter. The second is the rule I wrote, broken. The
first predates the check, but it is the same bug, and the same fix closes it.

**What changed.** `handOffDue(steps, run, phaseOf)` no longer hands off a step once any step
downstream of it has been filed in the same workspace. The predecessor is still handed off once, in
the pass that files its follower, because hand-off runs before filing.

**Tests.**

- A pure test in `run.test.ts` covers four cases. With nothing after it, the step is due. It is not
  due while the follower works there, nor while the follower's check runs there. It is due again when
  the follower has a worktree of its own.
- A test at shipped defaults in `store.test.ts` uses a real git checkout: an unchecked `implement`,
  then a checked `review` in the same workspace. Review's work in progress stays uncommitted until
  review hands it off. `coverage.out`, written while review's check runs, stays untracked, and
  `implement` is handed off exactly once.

Both tests refuse with the workspace clause removed. The store test gets its shared workspace from
`--no-worktree`. An isolated inherit shares its worktree path the same way and goes through the same
comparison.

## 3. `read-only` on review has no compatible handoff (`workflows/review.md:7`) — Needs a decision

The finding is right about what happens once B lands. It is the conflict I flagged in review.md's
frontmatter and in my closeout. I did not resolve it: the resolution is a design choice the brief did
not make, and the brief explicitly asked for `permissionMode: read-only` on review.md. Choosing one
option here would be me deciding it for the person who asked.

**The choice, and what each option costs.**

- **The run writes the review for the reviewer.** The review travels in the closeout (a field, or the
  summary), and the run commits it as `REVIEW.md`.
  - *Keeps:* the reviewer cannot edit the code it judges, which is the point of REPORT G2.
  - *Costs:* either a change to `CLOSEOUT_SCHEMA` for every step or a per-step output of some kind.
    It also makes the run write agent-authored text into the branch, and ends "the summary goes to
    the decider and nowhere else".
- **review keeps `workspace-write`.** Drop the line.
  - *Keeps:* REVIEW.md works as it does today.
  - *Costs:* the reviewer can still edit what it reviews, and hand-off commits that under `review:`.
    That is exactly what G2 set out to stop.
- **Wait for `tools:` (plan §4 I).** It narrows the reviewer to a tool list. `--tools` alone cannot
  express "may write REVIEW.md and nothing else", though, so this most likely still ends in one of
  the two options above.

**What I did so the decision cannot be skipped.** I added a test to `check.test.ts`. It asks the
engine's `codex` spec which `-s` it emits for `read-only`. It refuses when that answer is `read-only`,
`review.md` is read-only on codex, and review and respond still hand `REVIEW.md` on as a file. Its
failure message names the options above. The comment in `review.md` points at the test.

**The decision is closer than I thought.** B is not on `main`, and on this branch codex still runs
`read-only` as `workspace-write`. But the first version of the test imported `codex` from
`agent-engine`, and it failed here. Two facts explain it:

- In this worktree, `node_modules` is a link into the main checkout at
  `/home/yrnd1/projects/hkb-v2`.
- That checkout is on `main` with plan B's engine changes staged and uncommitted, `sandboxOf`
  included, which does run codex read-only. It looks like B's trial merge in progress.

So the test was reading that engine, and it was right about it: any `wf` run started from that
checkout today would give the reviewer a read-only sandbox. My script committed on through the red
test (it lacked `set -e`), so that commit (`7baf8ff`) is red on its own. The commit after it fixes the
test.

The test now imports the engine beside the package in the same tree, by path. It answers for the tree
it ships in:

- green on this branch;
- red at the trial merge that brings B's commit 1 in, which is the point;
- it refuses when the answer is forced to `read-only`;
- it refuses when pointed back at the main checkout's engine.

**For whoever merges.** The same link means every `agent-engine` import in the workflows tests, and
`apps/api`'s `agent-workflows` import, load the main checkout's packages when the suite runs in a
worktree. They do not load the branch's. It is worth a line in CLAUDE.md.

# What the review's fourth round changed

Six findings on the ending step (`packages/agent-workflows/docs/features.md`, *Shipped: the end of a run is a
step of its workflow*), one commit each. Everything is in `packages/agent-workflows` and nothing outside it.

1. **One checkout, one ending step.** Two approved `workspace: main` steps filed in one pass both read `git
   status --porcelain` clean, both trial merged, and the loser's `git merge --abort` threw away the winner's
   staged merge. Now, while a `workspace: main` task of any run on the same repository is unsettled, another is
   not filed: `heldCheckouts` (pure) over claims `checkoutHold` reads from the store and the engine on the pass
   that asks — including what that pass has already filed — with the oldest approval taking a free checkout.
   `assess` drops it from `ready`, `listing` says `waiting on the checkout (<run>'s ship has it)`, `decision`
   names it as what the run is still running for, and `wf decide` prints the line. Two store tests in
   `ship.test.ts`, the second run's approval written *older* than the first's so the order is the rule's and
   not the fixture's.
2. **An ending step's brief carries one way of handing a file over, not two.** Its workspace is the person's
   checkout, which `handOffDue` skips, so nothing it leaves there is collected or committed — and a file left
   lying makes the next run's `ship` read the checkout as dirty and sign off blocked. `artifactsContract` has a
   `main` form: the artifacts directory, and that what it leaves in the checkout reaches nobody.
3. **A send-back with no words at an ending's gate names the step at that gate.** `wf retry <run> review` said
   *review is awaiting approval* and offered `wf approve <run> review`, which `wf approve` refuses. It now says
   ship is at its gate, that the send-back goes to the work, and names the two commands that are honoured. The
   test that pinned it used an alternation that passed whatever the sentence said; the sentence is pinned now,
   and refused again at the store on `err.message`.
4. **`gateLines` takes the same `unheld` adjustment `assess` and `listing` take.** Between a send-back and the
   pass that files it, `wf decide`'s gate line offered the approval `wf approve` was refusing at that same
   moment. A test reads `wf ls`, `wf decide`, `gateLines` and `wf approve` in that window. `decision`'s
   `statusOf` took the adjustment too at first; round 2 of the review showed nothing can reach it — a try due
   makes the run `running`, and `decision` returns before that map is read — so it is gone rather than kept
   untestable.
5. **`wf retry <run> ship` at the gate** no longer ends at *there is nothing to try again*: nothing of it has
   run, so there is no try to replace — `wf approve <run> ship`, or the send-back `sendBackTo` computes.
6. **`wf round <run> review` at an ending's gate** no longer says *What waits on it has been filed*: nothing
   has been. It names the gate, the approval and the send-back. Refused at the store on `err.message`, on a
   real `implement ⇄ review → ship` folder.

**Still open, and outside what this step owns:** the board's `commandsOf` (`apps/api/src/app.ts:1260`) offers
`git merge --no-ff` and `git branch -D` for every finished run with a branch, where `wf decide` prints them only
for a folder with no ending step (`merges`) — a folder that says what shipping is does not also tell a person to
type it. Recorded under *What it leaves* in features.md.

## What the review's second round changed

Four findings, one commit each, all in `packages/agent-workflows`.

1. **A try of an ending step waits for the checkout too** — the finding was right, and it is the collision item
   1 exists to stop. `checkoutHold` gave up as soon as the run's own ending had a task, and `assess` held only
   `ready`, so `wf retry <run> ship` on an ending that ended blocked filed a second session into a checkout
   another run's ship was merging in. Every run is now read the same way — `mainClaim` — which answers *in the
   checkout* while the engine holds its task in flight, and *waiting for it* on the word that would file it: the
   approval of an ending that has not run, or the ask for a try (`endingAsked`). `assess` holds `retry` as well
   as `ready` (`heldByCheckout`), `wf ls` says it beside the try, and `wf decide` says it on either screen.
2. **A cancelled run holds the checkout until its session has stopped** — also right: `wf cancel` only asks the
   engine to stop, and the agent is still mid merge until it has. `mainClaim` reads the task's phase before it
   gives up on a cancelled run.
3. **The word is one the board can name** — `waiting on the checkout (…)`, not `waiting for …`: `stepState`
   takes `waiting`, `waiting on …` and `pending` for a step with nothing filed, so the old word drew a working
   chip for a step with no session. A test pins the prefix and says why.
4. **The `decision` half of the `unheld` adjustment is gone** — the finding is right that nothing can reach it:
   a try or a round due makes `assess` call the run `running`, and `decision` returns before that map is read.
   Kept untestable it would be a claim the suite does not hold, so it is deleted; `gateLines`'s half, which is
   where the window actually showed, stays and is pinned.

Measured from the root with `npx turbo run test --force`: agent-workflows 586 (585 passed, 1 skipped), from
575; api 202, web 248, agent-engine 340 (331 passed, 9 skipped), untouched. `npm run typecheck` clean in all
four.

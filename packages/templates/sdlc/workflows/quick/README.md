# quick

Build a change a card settles, on main, with no spec: Grace plans and builds it in one session, Agora reads it as a second
engineer would, and Otto lands it once that review passes. Nobody is asked to approve the landing — the review is what stands between
the work and the base branch.

```
implement → review → land
```

## What goes through quick, and what through build

A card goes through `quick` when **the card settles it**: it says what to change and leaves no decision — no taste call, no name, no
choice between behaviours — so it needs no design. Implement signs off `blocked` on a decision the card does not give, and never makes
it. Its size bounds nothing: the review reads every file and every line, tests and docs among them, and any part of the repository may
be touched.

Everything else goes through [`build`](../build/README.md): a change that needs a design, or one a review is likely to send back twice.
A card says which with `workflow: quick` or `workflow: build`, and an intake run says which by its ending: intake's condition
`next` routes an intent that needs no design here, its node `to-quick` filing the card with `from:` the intake run, once the person
approves the route ([intake](../intake/README.md)).

## Two ways to judge and land: in this checkout, or on GitHub

The factory's `github` parameter, set when the template is applied, picks one, as in [`build`](../build/README.md): the implement and land
steps' checks are each one shell `if` on the rendered value, and the notes of implement, review and land each open with the answer and
hold a part for each.

- **`github: false`, the default: in this checkout.** The implement step's check runs `change.ts size`, `probe.ts`, `parts.ts`, the factory's
  own check, its `implementCheck` parameter, and the local check, in that order, and nothing else: the local check is the factory's `localCheck` parameter (the repository's lint, typecheck and test, where it
  has them, by default), on the round's tree. Nothing is pushed and no pull request is opened. Land stages every result branch in one
  `git merge --no-ff --no-commit`, as the git place's skill says (*Stage a landing*); its check runs `localCheck` again, on the merged
  tree, and the run commits the merge on its exit 0 and takes it back otherwise.
- **`github: true`: on GitHub** (`--set github=true`). What the rest of this README says of the check and the landing, a pull request
  judged by CI and merged on GitHub, is this way's.

## The implement step's check

On GitHub, the check is the cheap set, and CI: it runs `change.ts size`, `probe.ts`, `parts.ts`, the factory's own check, its
`implementCheck` parameter, `pull-request.ts push` and `pull-request.ts wait --check <name>`, in that order, and nothing else.
Each script is read from the run's frozen workflow files (`node "$WF_WORKFLOW_FILES/<script>.ts"`, the copy of this folder the run
took when it began), never from the tree it judges; where `WF_WORKFLOW_FILES` is not set, the check says so on stderr and fails. The
run copies this folder alone, so it carries `build`'s `probe.ts`, `parts.ts`, `pull-request.ts` and `landing.ts` as copies of its own, equal to
`build`'s byte for byte: an edit to one is made to both.

1. `change.ts size`, first: the net change from the base the branch holds to `HEAD` (`git diff --numstat -M`, so a line added then
   removed counts for nothing and a rename is one file). It says the files and the lines, a generated file (`package-lock.json`,
   `GENERATED` in `change.ts`, and each file the repository marks `linguist-generated` in its `.gitattributes`) left out, and refuses
   nothing by them. Its `nemia size:` line is the review's measure of the change; the `touched` list is the place's report, and may
   count a rename as two. Its only refusals are of the run's environment or the check line, never of the work, so each ends with
   `nemia change: not the work:` (below).
2. `build`'s `probe.ts`, quick's copy of it: no probe is left live.
3. `build`'s `parts.ts`, quick's copy of it: every other branch of the run (`wf/<run>/<part>`) is held by the branch, by patch,
   or was declared replaced (`parts.ts replaced <part>`, which removes it and keeps its tip under `refs/backup/`), so the landing
   finds no result branch left out.
4. The factory's own check, its `implementCheck` parameter, either way: a command of the factory's own (a script it keeps in
   both workflows' folders is read as `node "$WF_WORKFLOW_FILES/<script>.ts"`), so a factory adds a check by setting it rather than
   by editing the check line or these sentences. A non-zero exit refuses the round before anything is pushed or the local check runs;
   `true`, the default, checks nothing.
5. `build`'s `pull-request.ts`, quick's copy of it: `push` pushes the branch and refuses unless the one open, non-draft
   pull request of it is at the commit the check judges, and labels that pull request from the run's labels by the factory's
   `pullRequestLabels` rules (`<key>=<value>:<label>`; empty, the default, labels nothing), as `build`'s README says, and as
   the implement step's `open` already did when it created the pull request; `wait` polls the CI context the factory names (its `ciCheck`
   parameter, `ci` by default) on that head, reading only the latest run of each check, and refuses a red, cancelled or missing one with the Actions URL, the failing jobs and a tail of their log, once it has re-run the failed jobs of a red one once (only a workflow run on its first attempt, within the same bound) and named each job re-run and how it ended the second time; where the context is red on the base branch too, at the commit of it the head holds, the refusal says so and names the base's jobs that did not pass, and stays the try's.

When the implement step's check refuses, at any clause and either way, the run tries implement again on its own, up to twice a round
(`retries: 2`), continuing its session, each try under the step's `budget:`, and hands the try the check's verdict as data: the command,
its exit and the last lines of what it printed, on GitHub the failing jobs and the lines that failed each. A refusal no change to the
branch can answer ends with a line `<tag>: not the work: <why>` — every refusal of `change.ts`, and of `pull-request.ts` those
`build`'s README names — and the implement step's note tells the try to change nothing and sign off `blocked` on it, quoting it, as on a failure
it finds is not its change's. A step over its budget, a call denied under `denials: fail`, a check that did not finish and a blocked
sign-off spend no try and wait on a person at once, and so does a refusal after the second try.

On GitHub, no typecheck, no lint and no test on this machine: nothing here runs Grace's tests for her before the review. Her session runs the
tests of what she changed, the types and the lint, as the repository's instructions say of a session's checks; CI runs the
repository's suite on the commit the check pushed, and the check waits on it. Land then merges that same pull request through
`build`'s `landing.ts` (quick's copy) and fast-forwards the checkout, and its check is the receipt that the merge happened —
`build`'s land step to the letter but its `after:` and its gate (note, check, fence and budget). Main has one guard, whatever the
workflow: the required CI context on the head the review read, and a merge that refuses anything but this run's own green pull
request. Where the factory's `landingWaitsOnCi` is true (the default), the receipt then waits on the CI context at the merge commit on
the base branch, as `build`'s README says: a merge that turned the base red fails the land step though the merge stands, unless the
base's tip holds it and is green there; set it false (`--set landingWaitsOnCi=false`) where CI does not run on pushes to the base.

## The review

`review.md` is `build`'s review with what quick says of itself: Agora's, read-only, closing the implement step's loop, with the same fence,
skills and tally, and no `input:` — a quick run has no spec, so what
was asked is the card. Its note names quick's own check clauses in each way, and says on GitHub that nothing ran the typecheck, the lint or
a test on this machine, so the reviewer runs the types and the lint itself, and in this checkout that the local check judged the round; and it says that its pass files the
landing, so `again: true` is the only way back and it names no step.

No design runs in quick, so no page outside the repository is handed to the review: a claim the change rests on, on a page the
reviewer's fence refuses, signs the review off `blocked`, which holds the ungated land until a person answers it with `nemia retry
<run> review --message "<what the page says>"`.

`rounds: 2`, where build's review has 3: a card that a review has to send back twice is a card that wanted `build`, and the
second objection leaves the step `exhausted` with the run waiting on a person, who types `nemia retry <run> review --round` for a third or
`nemia approve <run> review --message "<why>"` to take the work as it stands. `budget: 12`, where build's has 16: there is no spec to read, and the review reads
one step's closeout rather than two. What review tries cost, per workflow, is `nemia stats --workflow
<workflow> --by step`. A long mechanical diff costs reading, not judgement; a review that runs out on one says so in the run's
figures, and the budget is a quick card then.

**A finding sends the work back** to implement, on the same branch, with the findings in its brief — the workflow routes that, not the
reviewer. A person sends it back only through the review: at the review's stop, `nemia retry <run> review --round` for another round or
`nemia approve <run> review --message "<why>"` to take it as it stands; once land has stopped, `nemia retry <run> review --message "<objection>"`, which
files the review again with the objection. `nemia retry <run> implement` is refused once implement is verified and the review filed.

## The landing, and what a person still does

Land has no gate: the pass that ends the review files it on the next tick, and there is nothing to approve — `nemia approve <run> land`
is refused for a quick run, "land has no gate: what waits on it is filed once it has passed its check, with nobody's approval, so there
is nothing to approve." The landing lands as `build`'s does — on GitHub, it merges this run's own green pull request and
fast-forwards the checkout; in this checkout, it stages the merge, which the run commits once `localCheck` passes on it — and the run
records the commit on its check's exit 0.

A person who wants to read the change themselves before it lands puts the gate back for that run: `nemia start "<the card>"
--workflows quick --gate land`, or `gate: land` on the inbox card. A run's own gates are read wherever a step's are (`hasGate`), so the
landing then waits for `nemia approve <run> land` exactly as build's does.

**A landing that refuses**: nothing is merged and the checkout is untouched. In this checkout, a merge that conflicts is aborted by
land, and one whose `localCheck` fails is taken back by the run: `nemia retry <run> review --message "<what failed>"` sends the work
round the review's loop. On GitHub, where the pull request is red or unmergeable, the work goes
back through the review's loop with what refused it (`nemia decide <run>` prints the land step's `blocked`): `nemia retry <run> review
--message "<what failed>"` files the review again with those words, and it sends the work round implement or passes it, which files
land again. Where it was the fast-forward that was declined, or anything else that was not the work, a person brings the checkout onto
`origin/<base>` and lands again as it stands, `nemia retry <run> land`, the line the refusal printed. Whoever operates the factory sends it back, by instruction (`NEMIA.md`): no step is filed by
itself — but an ending its review routes is filed by the tick, with no person in between.

## The closeouts

Implement declares a field of its own (`implement.schema.json`), where `build`'s steps declare none: `plan`, what changes, where
and what proves it, written before the work. The review reads it, and its own closeout is
Agora's: `findings` and `again`. `nemia decide <run>` and the run's page show them. The board does not show the change itself: read it
in a terminal, `git diff main...<the run's branch>`, until it does.

## Start one

`nemia start "<the card>" --workflows quick --factory <factory>`, or a card of the inbox with `workflow: quick`. The factory lists
the workflow once it is attached: `nemia factory attach <factory> quick`.

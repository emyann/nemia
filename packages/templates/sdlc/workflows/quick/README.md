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
A card says which with `workflow: quick` or `workflow: build`.

## The implement step's check

The check is the cheap set, and CI: it runs `change.ts size`, `probe.ts`, `pull-request.ts push` and
`pull-request.ts wait --check <name>`, in that order, and nothing else.
Each script is read from the run's frozen workflow files (`node "$WF_WORKFLOW_FILES/<script>.ts"`, the copy of this folder the run
took when it began), never from the tree it judges; where `WF_WORKFLOW_FILES` is not set, the check says so on stderr and fails. The
run copies this folder alone, so it carries `build`'s `probe.ts`, `pull-request.ts` and `landing.ts` as copies of its own, equal to
`build`'s byte for byte: an edit to one is made to both.

1. `change.ts size`, first: the net change from the base the branch holds to `HEAD` (`git diff --numstat -M`, so a line added then
   removed counts for nothing and a rename is one file). It says the files and the lines, a generated file (`package-lock.json`,
   `GENERATED` in `change.ts`, and each file the repository marks `linguist-generated` in its `.gitattributes`) left out, and refuses
   nothing by them. Its `nemia size:` line is the review's measure of the change; the `touched` list is the place's report, and may
   count a rename as two. The step has no `retries:`: a refusal of any clause waits on a person.
2. `build`'s `probe.ts`, quick's copy of it: no probe is left live.
3. `build`'s `pull-request.ts`, quick's copy of it: `push` pushes the branch and refuses unless the one open, non-draft
   pull request of it is at the commit the check judges; `wait` polls the CI context the factory names (its `ciCheck` parameter, `ci`
   by default) on that head and refuses a red, cancelled or missing one with the Actions URL, the failing jobs and a tail of their log.

No typecheck, no lint and no test on this machine: nothing here runs Grace's tests for her before the review. Her session runs the
tests of what she changed, the types and the lint, as the repository's instructions say of a session's checks; CI runs the
repository's suite on the commit the check pushed, and the check waits on it. Land then merges that same pull request through
`build`'s `landing.ts` (quick's copy) and fast-forwards the checkout, and its check is the receipt that the merge happened —
`build`'s land step to the letter but its `after:` and its gate (note, check, fence and budget). Main has one guard, whatever the
workflow: the required CI context on the head the review read, and a merge that refuses anything but this run's own green pull
request.

## The review

`review.md` is `build`'s review with what quick says of itself: Agora's, read-only, closing the implement step's loop, with the same fence,
skills and tally, and no `input:` — a quick run has no spec, so what
was asked is the card. Its note names quick's own four check clauses and says that nothing ran the typecheck, the lint or a test on this
machine, so the reviewer runs the types and the lint itself; and it says that its pass files the
landing, so `again: true` is the only way back and it names no step.

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
is nothing to approve." The landing merges this run's own green pull request and fast-forwards the checkout, as `build`'s does, and the
run records the commit on its check's exit 0.

A person who wants to read the change themselves before it lands puts the gate back for that run: `nemia start "<the card>"
--workflows quick --gate land`, or `gate: land` on the inbox card. A run's own gates are read wherever a step's are (`hasGate`), so the
landing then waits for `nemia approve <run> land` exactly as build's does.

**A landing that refuses**: nothing is merged and the checkout is untouched. Where the pull request is red or unmergeable, the work goes
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

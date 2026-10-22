# quick

Build a small change a card settles, on main, with no spec: Ada plans and builds it in one session, Agora reads it as a second
engineer would, and Otto lands it once that review passes. Nobody is asked to approve the landing — the review is what stands between
the work and the base branch.

```
implement → review → land
```

## What goes through quick, and what through build

A card goes through `quick` when both hold:

- **The card settles it.** It says what to change and leaves no decision: no taste call, no name, no choice between behaviours.
  Implement signs off `blocked` on a decision the card does not give, and never makes it.
- **It is within the bound**: at most **300 lines** changed, added plus removed. Tests and docs count: the review
  reads them, and a test changed to pass is what the review must catch. Generated files do not
  (`package-lock.json`, `apps/web/theme/`, `apps/web/src/routeTree.gen.ts`). Any part of the repository may be touched.

Everything else goes through [`build`](../build/README.md): a change that needs a design, one past the bound, one a review is likely
to send back twice. A card says which with `workflow: quick` or `workflow: build`.

The number is `LINES` in `change.ts`, with `GENERATED`; how many files the lines are in is not bounded, since the review reads
every file. Changing either is a quick card: the script, this file and the
step's note, which `packages/agent-orchestrator/test/quick-check.boundary.test.ts` holds to the same number.

## Implement's check

The check is the cheap set, and CI: it runs `change.ts size`, `pictures.ts`, `probe.ts`, `pull-request.ts push` and
`pull-request.ts wait`, in that order, and nothing else.
Each script is read from the run's base (`git show "$WF_BASE_REF:…"`), never from the tree it judges:

1. `change.ts size`, first: the net change from the base the branch holds to `HEAD` (`git diff --numstat -M`, so a line added then
   removed counts for nothing and a rename is one file). Past `LINES` lines it refuses, however many files they are in, and says what
   to do next: `nemia cancel <run>`, then start the card with `build`. The step has no `retries:`, so the refusal waits on a person and no try trims the work to fit.
   Its `wf size:` line is the bound's own count; the `touched` list is the place's report, and may count a rename as two.
2. `build`'s `pictures.ts` and `probe.ts`, where they are in `workflows/build/`: a change under `apps/web/src` owes a picture, and
   no probe is left live.
3. `build`'s `pull-request.ts`, where it is in `workflows/build/`: `push` pushes the branch and refuses unless the one open, non-draft
   pull request of it is at the commit the check judges; `wait` polls the `ci` context of that head and refuses a red, cancelled or
   missing one with the Actions URL, the failing jobs and a tail of their log.

No typecheck, no lint, no test of a package and no e2e page on this machine: nothing here runs Ada's tests for her before the review.
Her session runs the tests of what she changed, the types, the lint and the e2e pages a change to the board touches, as `CLAUDE.md`,
*Check your work*, says of a step's session; CI's `ci` context runs the suite, the types, the lint and the whole e2e on the commit the
check pushed, and the check waits on it. Land then merges that same pull request through `build`'s `landing.ts` and fast-forwards the
checkout, and its check is the receipt that the merge happened — `build`'s land step to the letter but its `after:` and its gate
(`agent-fences.test.ts` holds the two equal in everything else), note, check, fence and budget. Main has one guard, whatever the
workflow: GitHub's required `ci` context on the head the review read, and a merge that refuses anything but this run's own green pull
request.

## The review

`review.md` is `build`'s review with what quick says of itself: Agora's, read-only, closing implement's loop, with the same fence,
skills, mcp servers and tally (`agent-fences.test.ts` holds the two equal there), and no `input:` — a quick run has no spec, so what
was asked is the card. Its note names quick's own five check scripts and says that nothing ran the typecheck, the lint or a package's
tests on this machine, so the reviewer runs the types and the lint itself; it names the bound, and it says that its pass files the
landing, so `again: true` is the only way back and it names no step.

`rounds: 2`, where build's review has 3: a card that a review has to send back twice is a card the bound was wrong about, and the
second objection leaves the step `exhausted` with the run waiting on a person, who types `nemia round <run> review` for a third or
`nemia accept <run> review` to take the work as it stands. `budget: 12`, where build's has 16: the diff is at most 300 lines, there is
no spec to read, and the review reads one step's closeout rather than two.

**A finding sends the work back** to implement, on the same branch, with the findings in its brief — the workflow routes that, not the
reviewer. A person sends it back only through the review: at the review's stop, `nemia round <run> review` for another round or
`nemia accept <run> review` to take it as it stands; once land has stopped, `nemia retry <run> review --message "<objection>"`, which
files the review again with the objection. `nemia retry <run> implement` is refused once implement is verified and the review filed.

## The landing, and what a person still does

Land has no gate: the pass that ends the review files it on the next tick, and there is nothing to approve — `nemia approve <run> land`
is refused for a quick run, "land has no gate: what waits on it is filed once it has passed its check, with nobody's approval, so there
is nothing to approve." The landing merges this run's own green pull request and fast-forwards the checkout, as `build`'s does, and the
run records the commit on its check's exit 0.

A person who wants to read the change themselves before it lands puts the gate back for that run: `nemia start "<the card>"
--workflows quick --gate land`, or `gate: land` on the inbox card. A run's own gates are read wherever a step's are (`hasGate`), so the
landing then waits for `nemia approve <run> land` exactly as build's does. Nothing refuses a quick card that owes pictures without
one: the review reads implement's pictures in light and dark, and a page or a state with no picture of it is a finding of its own.

**A landing that refuses**: nothing is merged and the checkout is untouched. Where the pull request is red or unmergeable, the work goes
back through the review's loop with what refused it (`nemia decide <run>` prints the land step's `blocked`): `nemia retry <run> review
--message "<what failed>"` files the review again with those words, and it sends the work round implement or passes it, which files
land again. Where it was the fast-forward that was declined, or anything else that was not the work, a person brings the checkout onto
`origin/<base>` and ships again as it stands, `nemia retry <run> land`, the line the refusal printed. Whoever operates the factory sends it back, by instruction (`NEMIA.md`): no step is filed by
itself — but an ending its review routes is filed by the tick, with no person in between.

## The closeouts

Implement declares two fields of its own (`implement.schema.json`), where `build`'s steps declare none: `plan`, what changes, where
and what proves it, written before the work; and `pages`, the e2e pages she ran. The review reads both, and its own closeout is
Agora's: `findings` and `again`. `nemia decide <run>` and the run's page show them. The board does not show the change itself: read it
in a terminal, `git diff main...wf/<run>/run`, until it does.

## Start one

`nemia start "<the card>" --workflows quick --factory nemia`, or a card of the inbox with `workflow: quick`. The factory lists the
workflow once it is attached, a step by hand after this folder lands: `nemia factory attach nemia quick`.

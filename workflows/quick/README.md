# quick

Build a small change a card settles, on main, with no spec and no review: Ada plans and builds it in one session, and Otto lands it
once a person approves the landing. The landing's gate is the review.

```
implement → land
```

## What goes through quick, and what through build

A card goes through `quick` when both hold:

- **The card settles it.** It says what to change and leaves no decision: no taste call, no name, no choice between behaviours.
  Implement signs off `blocked` on a decision the card does not give, and never makes it.
- **It is within the bound**: at most **10 files** and **300 lines** changed, added plus removed. Tests and docs count: with no
  review, the person at the gate reads them, and a test changed to pass is what the gate must catch. Generated files do not
  (`package-lock.json`, `apps/web/theme/`, `apps/web/src/routeTree.gen.ts`). Any part of the repository may be touched.

Everything else goes through [`build`](../build/README.md): a change that needs a design, one a second engineer should read, one past
the bound. A card says which with `workflow: quick` or `workflow: build`.

The numbers are `FILES` and `LINES` in `change.ts`, with `GENERATED`. Changing one is a quick card: the script, this file and the
step's note, which `packages/agent-orchestrator/test/quick-check.boundary.test.ts` holds to the same numbers.

## Implement's check

The check is the cheap set, and CI: it runs `change.ts size`, `pictures.ts`, `probe.ts`, `mutants.ts`, `pull-request.ts push` and
`pull-request.ts wait`, in that order, and nothing else.
Each script is read from the run's base (`git show "$WF_BASE_REF:…"`), never from the tree it judges:

1. `change.ts size`, first: the net change from the base the branch holds to `HEAD` (`git diff --numstat -M`, so a line added then
   removed counts for nothing and a rename is one file). Past either number it refuses and says what to do next: `nemia cancel <run>`,
   then start the card with `build`. The step has no `retries:`, so the refusal waits on a person and no try trims the work to fit.
   Its `wf size:` line is the bound's own count; the `touched` list at the gate is the place's report, and may count a rename as two.
2. `build`'s `pictures.ts`, `probe.ts` and `mutants.ts`, where they are in `workflows/build/`: a change under `apps/web/src` owes a
   picture, no probe is left live, and a rule the change adds is proven by a mutant (a removal names none, and says why in
   `noMutants`).
3. `build`'s `pull-request.ts`, where it is in `workflows/build/`: `push` pushes the branch and refuses unless the one open, non-draft
   pull request of it is at the commit the check judges; `wait` polls the `ci` context of that head and refuses a red, cancelled or
   missing one with the Actions URL, the failing jobs and a tail of their log.

No typecheck, no lint, no test of a package and no e2e page on this machine: nothing here runs Ada's tests for her before the gate. Her
session runs the tests of what she changed, the types, the lint and the e2e pages a change to the board touches, as `CLAUDE.md`,
*Check your work*, says of a step's session; CI's `ci` context runs the suite, the types, the lint and the whole e2e on the commit the
check pushed, and the check waits on it. Land then merges that same pull request through `build`'s `landing.ts` and fast-forwards the
checkout, and its check is the receipt that the merge happened — `build`'s land step to the letter (`agent-fences.test.ts` holds the two
equal but their `after:`), note, check, fence and budget. Main has one guard, whatever the workflow: GitHub's required `ci` context on
the head the review read, and a merge that refuses anything but this run's own green pull request.

**A landing that refuses**: nothing is merged and the checkout is untouched. Where the pull request is red or unmergeable, the work goes
back to implement with what refused it (`nemia decide <run>` prints the land step's `blocked`): `nemia retry <run> implement --message
"<what failed>"`. Then it comes to the gate again, since an approval is for one try. Where it was the fast-forward that was declined, a
person brings the checkout onto `origin/<base>` and retries land itself, the line the refusal printed. Whoever operates the factory
sends it back, by instruction (`NEMIA.md`): no step is filed by itself.

## The closeout, and the gate

Implement's closeout is `build`'s with two fields more (`implement.schema.json`): `plan`, what changes, where and what proves it,
written before the work; and `pages`, the e2e pages she ran, which nothing reads but the person. At land's gate a person is shown the
plan, the pages, the mutants, the pictures and how many files and lines the branch touched (`nemia decide <run>`, and the run's page); the check's
`wf size:` line is handed to the landing step. The board does not show the change itself at a gate: read it in a
terminal, `git diff main...wf/<run>/run`, until it does.

A person approves the landing, `nemia approve <run> land`, or sends the work back to implement, the one step there is to send it to:
`nemia retry <run> implement --message "<objection>"`.

## Start one

`nemia start "<the card>" --workflows quick --factory nemia`, or a card of the inbox with `workflow: quick`. The factory lists the
workflow once it is attached, a step by hand after this folder lands: `nemia factory attach nemia quick`.

# Which large file should be split, and how — asked of Jev (2026-09-22)

> The packages were renamed on 2026-09-23: `agent-engine` is now `packages/agent-runtime`, and `agent-workflows` `packages/agent-orchestrator`. This document is history, and keeps the names it was written with.

The owner's question: of this repository's files over 1,000 lines, which should be broken into modules? Three rounds,
all on `jev-1.13.0`, about 600k input tokens in 43 requests (about 2.5 cents), main at `576df48`. No source code was
sent: each file went as its outline — every top-level declaration's name, kind, size, whether it is exported and the
first sentence of its doc comment (a test file: each top-level test's title and size), what it imports from the
workspace, how many workspace files import it, and, for the files `CLAUDE.md` constrains, those rules. Declaration
names, doc sentences and test titles of this private repository did go to TypeSafe, whose retention terms are still
unread (`docs/pivot-2026-09-18.md` §8).

Run from the repository root with the key in `.env` (`TYPESAFE_API_KEY`): `node split.mjs states` writes the outlines to
`states.json` (461 KB, left out here: rebuilt in a second), `node split.mjs record` asks, `node split.mjs show` prints;
`compare.mjs` reads `states.json`; `group.mjs record|show`.

## Round 1 — one file at a time (`split.mjs`, `answers.json`)

The 27 tracked `.ts`/`.tsx` files of 600 lines or more, and three small files as controls (`domain.ts`, `deps.ts`,
`check.ts`). Three questions over each outline: a Noul *would breaking it into modules make one change easier*, a Score
*how many separate purposes*, a Score *how hard to find what one change needs*.

- **The Noul does not discriminate.** Every file read 0.51–0.84, the 228-line control `deps.ts` 0.75. Asked about one
  file, Jev leans yes — as it leaned yes on *plan first* for any long brief (`docs/pivot-2026-09-18.md` P5).
- **`navigate` tracks the number of declarations** (from 0.05 for a 4-test page to 2.55 for `run.ts`'s 273): code can
  compute it.
- **`purposes` is the semantic signal**: highest for `agent-workflows/src/runner.ts` (2.77 of 3) and the engine's
  `runner.ts` (2.59, every harness in one file), lowest for the vendored `ui/sidebar.tsx` (1.39).

## Round 2 — one Choice over every source file at once (`compare.mjs`, `compare.json`)

Asked twice, same state: `run.ts` 0.79 and 0.83, then `runner.ts` 0.12 / 0.10, `app.ts` 0.04, `web/src/lib/api.ts`
0.04 / 0.02, `workflow.ts` 0.01, every control 0.00. Comparing cures the lean; the ranking is sharp and stable, and it is
close to the files' order by size (one inversion: `workflow.ts` below the smaller `web/src/lib/api.ts`).

## Round 3 — where each of `run.ts`'s declarations belongs (`group.mjs`, `group.json`)

Code offers the candidates, Jev selects: one Choice per declaration (273, 25 per request, 11 requests) over the file's
own 17 section headings and "the run record and assess" for the unmarked top. Each declaration also carries which
`run.ts` declarations it uses and which use it. The section it sits in today is not sent; it is what the answers are
scored against.

- **Agreement 171/273 (63%), 66% of the lines**; mean confidence 0.90 agreeing, 0.70 disagreeing.
- **Coherent sections, ready to be modules**: *where the time went* 18/18 (176 lines), *the closeout* 12/12, *files for
  the steps after it* 7/7, *trying again* 24/27, *going round again* 22/25.
- **Grab bags**: *what `wf ls` says* 3/35 (740 lines) — its `retrySection`, `roundSection`, `gateLines`, `saidSection`
  compose briefs and words for features, and Jev sends each back to its feature; *a cap on runs in flight* 10/29 — it holds
  most of the `--after` code (`waitsOf`, `Wait`, `waitAdvice`, `afterRefusal`, `neverShips`, confidence 0.87–1.00),
  while *waiting on a run* is 7 lines.
- **Checked by reading the code**: right on `waitsOf` (line 934, under the cap, about the runs this one waits on),
  `gateRefusal` (under *one checkout*, refuses `--gate`), `retrySection` (under `wf ls`, writes the retry brief); arguably
  wrong on `checkLogsOf` (it serves `wf rm`) and ambiguous on `inFlight` (the cap and cancelling both use it).
- **The limit**: Jev selects only among the candidates it is given. With no "briefs" module on offer, the brief-writing
  functions went to their features; another candidate list gives another split. Trust the misfits it names, not the
  exact partition.

## What followed

A card to move *where the time went* out of `run.ts` into a pure module of its own — the cleanest section, 18/18.
Then, in order: the closeout; retries and rounds; the `wf ls` section split into briefs and listing; the `--after` code
gathered out of the cap section.

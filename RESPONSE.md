# The end of a run is a step of its workflow — what shipped, and the judgement calls

features.md §8's package half, in five commits. `docs/features.md`'s *Shipped: the end of a run is a step of
its workflow* is the full account; the README's *The end of a run is a step* is how a person reads it.

## The one thing §8 left open, and the reading taken

§8 says two things about a gated last step that cannot both be true of one mechanism:

- of `ship`: "`gate: true` on that last step stops the run **before it runs** … Approve with words **runs** the step";
- of a research run: "its last step, the study, is gated; **approving it is the acceptance**" — which is §6's
  shipped gate, where the step runs and its *handoff* waits.

Both are kept, and what tells them apart is what the step does: **a gate holds what its approval decides.**
Where steps follow, that is the handoff, and the step runs first — a person reads what it produced. An ending
step in the repository's own checkout (`workspace: main`) produces nothing to read: it acts, on the base
branch, where nothing can be taken back, so the approval is of the act and is given before the step is filed
(`approvedFirst`, `waitsAtGate`). §6's gate is untouched, and a gated research study still runs and then waits.

Two consequences worth reading as decisions, not details:

- **A send-back at an ending's gate goes to the work**, `wf retry <run> review --message "<objection>"`, since
  the ending has nothing of its own to object to. `wf ls`, `wf decide` and `gateLines` name that step.
- **A run's result is the work the ending acts on** (`resultSteps`), never the ending's own `main`: read as the
  result, the base branch answers *has it shipped* with yes for ever.

## Outside the package, which the brief reserved

A new key in `STEP_KEYS` is not only the package's: `apps/api/src/builder.ts`'s `KINDS` does not typecheck
without a row for it, and `WorkflowStepSpec`/`specOf` (`apps/api/src/workflows.ts`) read a step through a typed
literal, so a key they do not name never reaches the board at all. Both are one line each; four more lines are
in api tests that pin this repository's `dev` folders, which now have a `ship` step. Nothing else in `apps/`,
and nothing in `packages/agent-engine`.

`apps/web`'s own mirror of that spec does not name `workspace` either, so the board can neither show it nor set
it on a step drawn there (`UNSET` in `apps/web/src/lib/builder.ts`). It does not lose it: the builder spreads
the spec it was given, so a `dev` folder saved from the board keeps `workspace: main`. The board run adds the
key to the mirror; until then the gap is *cannot edit*, not *drops*.

## For CLAUDE.md, if the merger agrees

A trap worth the file, which cost a round here: **a key added to `STEP_KEYS` has three obligations outside the
package** — `KINDS` in `apps/api/src/builder.ts` (or api typecheck fails), `WorkflowStepSpec` and `specOf` in
`apps/api/src/workflows.ts` (or the key never reaches the board), and `apps/web/src/lib/api.ts`'s mirror with
`UNSET` beside it (or the board can read the key on a folder that has it, and never set it on one that does
not).

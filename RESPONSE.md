# Response to REVIEW.md

## 1. `retries: 0` is accepted where §4 A says "positive" — **Needs a decision**

`packages/agent-workflows/src/workflow.ts:112`, `packages/agent-workflows/test/workflow.test.ts:197-206`

You're right about the code and right about the letter of the plan. §4 A asks for "a positive
finite integer" for `deadlineSeconds`, `maxAttempts` and `retries`, and the branch accepts
`retries: 0` on purpose. The bc21085 commit message says so rather than slipping it in. I have
not changed it, because I still think 0 is the right answer for this key. But the plan is the
operator's. Only its author can say whether "positive" was meant for `retries`, or was shorthand
for three counts listed together. We would both be guessing.

**Why this count is different from the other two.**

- `maxAttempts: 0` and `deadlineSeconds: 0` break the step, so refusing 0 prevents a real
  failure, and the branch refuses it.
  - `maxAttempts: 0`: `agent-engine/src/domain.ts:271` settles a task as failed once
    `attempts.length >= maxAttempts`, so the step fails before any attempt starts.
  - `deadlineSeconds: 0`: `domain.ts:259-263` stops an attempt once it has run longer than
    `deadlineSeconds * 1000` ms, so the step is stopped on its first tick.
- `retries: 0` breaks nothing. The report the plan came from gives the key's default as 0
  (`REPORT.md:176`) and bounds tries at `tries.length ≤ 1 + retries` (`:222`). So 0 is inside the
  rule: one try, no re-filing, exactly what leaving the key out means.
- Writing 0 out has a use. A step that must not run twice, like a deploy or a migration, can say
  `retries: 0` in its own file. That stays true even if a run-wide default for retries ever
  appears; an absent key would inherit that default.
- The plan's sentence names its target: "(`5m` is the case that shipped)", a non-finite value.
  REPORT §3.1 only asks the run to refuse non-finite values for these keys. "Positive" is the
  plan's tightening: right for the two engine counts, and I think carried over to `retries`
  because the three sit in one list.

**What each choice costs.**

- **Keep 0 (the branch as it is).** The merge carries a deliberate gap from the written
  definition of done. The merger has to accept it, or amend §4 A to "`retries` a whole number,
  zero or more".
- **Require at least 1 (the review).** `retries: 0` is refused with "delete the line", so there is
  one spelling for "no retries". Authors lose the in-file "never retry this". The change is small:
  - in `workflow.ts:112`, set `least: 1` for `retries`;
  - in the test, move `'0'` from the accepted assertion into the refused list, and change the
    `zero or more` regex to `above zero`.

**Either choice is free to reverse until package F ships `retries:`.** No workflow, example or
source file in this repository writes the key today, and package C does not read it. Once F lands,
tightening would refuse files that already say `retries: 0`, so this is cheapest to settle at A's
merge.

**Recommendation:** keep 0 and amend the plan's sentence. If the operator holds the letter, the
change above is all it takes, and I'll make it without further argument.

---

No code changed in this response. `npm test` (109 engine · 85 workflows · 3 api) and
`npm run typecheck` (4/4) are green from the repository root on this branch.

---
name: review-a-change
description: "Review a change in this repository as a second engineer would: against its intent and spec, by reading the diff and running the suite, with findings that name the file, the line and what goes wrong. For a read-only step that decides whether the work goes round again."
---

# Review a change

1. **Know what was asked**: the spec handed to you, its goal and constraints. Review the change against that, not against a change you
   would have made.
2. **Read the whole diff** against the base (`git diff <base>...HEAD`, the base as your brief names it), and the tests beside it.
3. **Run the suite yourself**: `npx turbo run test --force --continue` and `npm run typecheck`. A claim you did not run is not a finding.
4. **Judge the mutants, do not run them**: implement's check applied each mutant the engineer's closeout names and refused the step if
   one survived (its log). Judge whether the list covers every rule the change adds, and whether each mutant breaks the rule rather than
   the file's syntax: a rule with no mutant, or a mutant that only stops the file loading, is a finding.
5. **Look for what the author could not see**: a rule claimed with no test that makes it refuse; a test that passes for nothing; a
   caller that rebuilds a returned type field by field and drops the new one; a layer crossed; a limit raised; a behaviour change the spec
   did not ask for. When the change touches `apps/web`, read its pictures in both themes with `look`.
6. **Write each finding so the engineer can act on it alone**: the file, the line, the input or case, and the wrong result. No finding
   invented to look thorough, none about taste.
7. **Decide the round**: `again` true only when a finding is worth another round of work. From the second round, read the engineer's
   replies first: a finding answered `won't fix` with a sound reason is closed.

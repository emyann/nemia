---
name: implement-a-change
description: "Build a change from its spec in this repository: tests first where a rule is claimed, small commits, the suite green for the right reason, and each review finding answered in the next round. For a step that writes the code."
---

# Implement a change

1. **Read the spec** (handed to you under *From design*) and the `CLAUDE.md` of each package it touches. If main moved since your branch
   was cut, merge it in first. Build each change where the spec places it (its `where`); one that cannot live there is a wrong spec.
2. **Prove before you build** where the spec claims a rule: write the test that makes it refuse, see it fail, then make it pass.
3. **Name your mutants** in the closeout: one per rule or guard the change adds, each a `file`, the text `from` it holds exactly once in
   your committed result, what it becomes `to` (valid code that breaks the rule, never a syntax error), the `test` file that must fail,
   and the exact `name` of one test in it (its whole name, never a part of it: only that test runs) or null. Implement's check applies
   each to a copy of your result and refuses the step when its test still passes, when `from` does not apply, or when the test fails or
   runs nothing unmutated. Try them first: `node workflows/build/mutants.ts <closeout.json>` after you commit. Name none only for a
   change that adds no rule, saying why in `noMutants`.
4. **Work in small commits** with plain messages, as you go; the run commits only what you leave, in one commit under your step's name.
5. **Check as the run will**: `npx turbo run test --force --continue`, `npm run typecheck`, `npm run lint`; and when `apps/web` changes,
   `npm run build` and `npm run e2e -- --pages <the pages the change touches>`, with `--photos` when pictures are due, which visits
   only those; never the whole suite but to measure it: implement's round check and the landing's run every page, in workers, outside
   your session. Green is the floor, not the bar.
   You run as a job, and a turn you end is your last: run each long command in the foreground, where one call may take 10 minutes
   (`run_in_background` runs it there too), or start it with a shell `&` and wait on it with a blocking call
   (`timeout 580 bash -c "while kill -0 <pid>; do sleep 5; done"`).
   Never sign off while a check you started is still running. Stop only what you started: bound it with `timeout`, or keep the pid of
   what you start in the background (`$!`) and `kill <pid>`. Never `pkill` or `killall`: other runs share this machine, and your fence
   refuses them.
6. **Never make it pass by weakening it**: a test loosened, a ceiling raised in `.oxlintrc.json`, a check skipped. Cut the function; lower
   the ceiling of a file you shrank.
7. **Answer the review**, from the second round: for each finding, fix it, or say in `replies` why not (`won't fix`, and the reason). A
   finding you cannot answer honestly is a reason to sign off `blocked`, saying what you need.

When the spec is wrong — it names what is not there, or asks what a rule refuses — do not build around it: sign off `blocked` and say so.

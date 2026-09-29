---
name: implement-a-change
description: "Build a change from its spec in this repository: tests first where a rule is claimed, small commits, the suite green for the right reason, and each review finding answered in the next round. For a step that writes the code."
---

# Implement a change

1. **Read the spec** (handed to you under *From design*) and the `CLAUDE.md` of each package it touches. If main moved since your branch
   was cut, merge it in first.
2. **Prove before you build** where the spec claims a rule: write the test that makes it refuse, see it fail, then make it pass.
3. **Work in small commits** with plain messages, as you go; the run commits only what you leave, in one commit under your step's name.
4. **Check as the run will**: `npx turbo run test --force --continue`, `npm run typecheck`, `npm run lint`; and when `apps/web` changes,
   `npm run build` and `npm run e2e`, then read the pictures it writes with the `look` skill. Green is the floor, not the bar.
5. **Never make it pass by weakening it**: a test loosened, a ceiling raised in `.oxlintrc.json`, a check skipped. Cut the function; lower
   the ceiling of a file you shrank.
6. **Answer the review**, from the second round: for each finding, fix it, or say in `replies` why not (`won't fix`, and the reason). A
   finding you cannot answer honestly is a reason to sign off `blocked`, saying what you need.

When the spec is wrong — it names what is not there, or asks what a rule refuses — do not build around it: sign off `blocked` and say so.

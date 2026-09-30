---
name: write-a-spec
description: "Turn an accepted intent into a spec an engineer can build from in this repository: the goal restated, the approach and why, every path it touches, the steps, the tests that prove it, the risks, and what is still open. For a step that designs a change before anyone builds it."
---

# Write a spec

The intent says what should be true; the spec says how this repository gets there. The engineer and the reviewer read the spec, not the
intent, so restate the intent's goal and constraints in it.

1. **Read the intent**, under *From run* in your brief, then the code it touches. Facts are yours to find: read, grep, run the suite, or
   dispatch a sub-agent for a wide search. Never ask the person for what you can look up.
2. **Read the rules the change meets**: the root `CLAUDE.md` and the `CLAUDE.md` of each package it touches — the layers, one writer per
   file, level-triggered ticks, the size limits (a limit is met by cutting, never by raising a ceiling), how to test.
3. **Choose the approach**, and say why this way rather than the obvious other. Challenge any mechanism the intent asserts: read the
   code that would carry it.
4. **List every change by path**, the **steps in order**, and the **tests**: for each rule the change adds, the fixture that makes it
   refuse, and the check that it fails without the rule.
5. **Size it.** One spec is one run of work under its budget. When it is more, say so and propose how to cut it into intents.
6. **Ask what is the person's.** A choice the intent leaves open, a trade-off only they can weigh: ask it in a round, numbered, each with
   your recommended answer. Record each answer, and who gave it, in `decisions`.

Run each check bare, as your fence allows it — `npx turbo run test --force --continue`, `npm run typecheck`, `npm run lint` — one
command per call: never wrapped in `timeout` or `( … )`, piped to `tail` or `grep`, or redirected; paths from the workspace root, never
`cd`, `git -C`, `VAR=` or `for`. Anything else is refused.

A spec that reads well and names a function that does not exist is worse than none: name only what you read.

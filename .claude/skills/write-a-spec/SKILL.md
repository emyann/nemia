---
name: write-a-spec
description: "Turn an accepted intent into a spec an engineer can build from in this repository: the goal restated, the approach and why, every path it touches, the steps, the tests that prove it, the risks, and what is still open. For a step that designs a change before anyone builds it."
---

# Write a spec

The intent says what should be true; the spec says how this repository gets there. The engineer and the reviewer read the spec, not the
intent, so restate the intent's goal and constraints in it.

1. **Read the intent**, under *From run* in your brief, then the code it touches. Facts are yours to find: read, search, run the suite, or
   dispatch a sub-agent for a wide search. Never ask the person for what you can look up.
2. **Read the rules the change meets**: the repository's instruction files (`CLAUDE.md` at the root and in each folder the change
   touches) and every architecture or design document they name — its boundaries and what each owns, its size limits (a limit is met
   by cutting, never by raising a ceiling), how to test.
3. **Choose the approach**, and say why this way rather than the obvious other. Challenge any mechanism the intent asserts: read the
   code that would carry it.
4. **Place each change** by the boundaries the repository's own rules define, in their terms. Each change says `where` it lives and
   `why` there and not in the neighbouring place, citing the rule. The `placement` table gives each concept the change adds or moves:
   where it lives, the rule that puts it there, and the alternative rejected. A placement the rules do not settle is the person's:
   ask it in a round.
5. **List every change by path**, the **steps in order**, and the **tests**: for each rule the change adds, the fixture that makes it
   refuse, and the check that it fails without the rule.
6. **Size it.** One spec is one run of work under its budget. When it is more, say so and propose how to cut it into intents.
7. **Ask what is the person's.** A choice the intent leaves open, a trade-off only they can weigh: ask it in a round, numbered, each with
   your recommended answer. Record each answer, and who gave it, in `decisions`.

Read a file with Read, list a folder with Glob and search with Grep; never `grep` or a pipe in
Bash. `cat`, `head`, `tail`, `wc`, `cut` and `ls` read a file or a folder inside the workspace, and your fence refuses each one a path outside it; never `sed`, `awk`, `find`, `sort`, `uniq` or `tee`, which can write a file or run a program, nor `wc --files0-from`, which reads the paths a file lists. Otherwise Bash runs the checks below and git's read-only questions — `git diff`, `git log`, `git show`, `git status`, `git blame`,
`git grep <pattern> <rev>`, `git ls-files`, `git rev-parse`, `git merge-base` and the rest of the read-only set your fence allows — each
bare and one per call, and never a write. Read, Grep and Glob reach this workspace, by paths from its root, and each folder your brief says you
may read, under its own path; never another run's folder, the store (`~/.agent-workflows`), `~/.claude`, `~/.cache` or a system path:
your fence refuses them without asking. What your brief quotes from outside them is all you have of it: ask in a round for anything more.

Run each check your step names bare, one command per call: never wrapped in `timeout` or `( … )`, piped to `tail` or `grep`, or
redirected; paths from the workspace root, never `cd`, `git -C`, `VAR=` or `for`. Anything else is refused.

A spec that reads well and names a function that does not exist is worse than none: name only what you read.

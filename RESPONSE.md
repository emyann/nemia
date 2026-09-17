# Four leftovers in agent-workflows

Four commits on `wf/four-leftovers-in-agent-work-3uyy/implement`, one per item, plus a fifth for the
measured counts and this closeout. `packages/agent-workflows` only — `src/`, `test/`, `README.md`,
`docs/features.md`. Nothing in `apps/`, nothing in `packages/agent-engine`.

`npm test && npm run typecheck` from the root: green on the tree as committed. Counted with
`npx turbo run test --force`: agent-workflows 593 (591 passed, 2 skipped), from 587; api 202, web 248
and agent-engine 340 (331 passed, 9 skipped) unchanged. Round 2 of review added a commit each for its
two findings — the last section but one says what they were.

## 1. `wf inbox queue` keeps the card file's modified time

`src/runner.ts`, `queueInInbox`. A card has no filing time of its own but its file's mtime, which the
board's Inbox page orders the cards by (`filedAt`, `apps/api/src/inbox.ts`). The card is written whole
through a hidden file renamed over it, so a queue at the command line gave the card the queue's time
and moved it to the top of the list. The time is read before the rename and set back after; a failure
to set it back is not a failure of the queue, and the card is queued all the same.

The api's own `utimesSync` around the call now sets the same time a second time. It is `apps/api`'s,
and this run owns the package only, so it was left where it is — it is redundant, not wrong.

The store test (`test/queue-store.test.ts`): a card filed at 08:00, queued and taken back, keeps 08:00
across both writes, while `wf inbox add` still writes a card at the time it is filed. Without the two
lines the test fails.

## 2. Git's stderr is no longer the daemon's

`src/runner.ts`, the `git` helper. `execFileSync` handed no `stdio` captures the child's stderr *and*
writes it to this process's own. A queued card whose `repo:` is a directory with no git in it is tried
on every pass — a failure is no verdict on the card — so `wf up` printed git's `fatal: not a git
repository` every four seconds, beside the one line it says about the card. The helper passes
`['ignore', 'pipe', 'pipe']` now; the words are still on the error `execFileSync` throws, which is
where every failure is read from (`failedWords`, `startQueued`).

The store test: a pass over such a card writes nothing at all to `process.stderr`, while `queueLine`
still says `no-git-a1b2 not started: Command failed: git rev-parse HEAD / fatal: not a git
repository…`. Without the `stdio`, the test fails.

## 3. A `wf up` says what the queue is stuck on, once, and it is the daemon that counts

`src/cli.ts`, the `up` loop. A start that fails without a refusal is tried on every pass and said
once: the tick writes the failure down, and `wf up` held its tongue while the next pass failed the
same way on the same repository. But `again` is a fact about the store, not about this daemon — the
pass that said it may have been another `wf up`, or a `wf tick`, and its line is on a terminal that is
gone. A person restarting the daemon to find out why cards stopped starting was met with the runs
advancing and nothing about the card. The loop keeps the last failure it printed itself and says
anything else; `again` is not read there. `wf tick` is unchanged: it says every pass it is asked for.

The test that pinned the silence changed, with the reason in a comment above it: over two passes of
`wf up` it now reads exactly one line, matched whole, and said on every pass fails it. Beside it, a
test at a cap of 1 (round 2, below): a daemon whose first pass reads no queue at all names the card on
its second.

## 4. `writeWorkflow`: a rename by case, and a step's file that is a link

`src/runner.ts`, `writeWorkflow`.

**The rename.** The write put each step's `<name>.md` down and then removed the `.md` of every step
the folder no longer has. Where the filesystem does not tell case apart, `Plan.md` and `plan.md` are
one file, so a step renamed by case was written and then removed under its old name, and the folder
lost the step. The removals go first now. That is the fix rather than case-folding the comparison:
folding would leave a stray `Plan.md` on a case-sensitive filesystem, where `loadWorkflows` reads it
as a second step.

**The link.** A `.md` in the folder that is a link was written *through*, into whatever it points at,
outside the folder — and a stale one was left behind, since `readdirSync`'s entry for a link is not
`isFile()` and the removal takes only files. Such a link is refused by name now, with the folder as it
was, before anything is written. A linked README is refused only when a `readme` is given, which is
when it would be written; left alone, it is left alone.

Three tests in `test/write-workflow.test.ts`. The order of the removals and the writes, read off `fs`
itself, so the rule is held wherever the suite runs — that matters, because the rename test skips
here. The rename by case, skipped where the filesystem tells `implement.md` from `Implement.md` apart
and saying so; it skips on Linux, and what it asserts (`Implement.md` alone beside the README and the
schema, read back as one step) is what a case-insensitive filesystem gives. And the refusal in its
words: a link a step would be written through, a link whose step is gone, a linked README with a
README given — each with what the link points at untouched — beside a linked README with none given,
which the write does not touch. Writing before removing fails the first; the refusal dropped fails the
third.

## Round 2 of review: two findings, both fixed

**The first pass was the wrong thing to key on** (`src/cli.ts`). Review was right, and about the very
case item 3 is for: `tick` calls `startQueued` only while a run slot is free, so a pass at a full cap
reads no queue at all and prints nothing about it — and my flag was spent on it all the same. With
`WF_MAX_RUNS=1` and a run in flight, a daemon restarted after a card's start failed said nothing on
its first pass, and by the time the slot freed the failure matched the try the last daemon wrote, so
`again` silenced it for good.

The loop keeps the last failure it printed itself now — the card, the repository it was tried on, and
why — and says anything else. `again` is not read there any more: it is a fact about the store, and
what is wanted is a fact about this terminal. Nothing is decided on the variable; it only says what
has been shown. A test at a cap of 1 pins it: the daemon's first pass files a run and reads no queue,
its second sees the run finish and names the card. That test fails on the first-pass flag, and the
existing two-pass test fails if the failure is said on every pass — the silence is still held.

**The order test read `readdirSync`'s order** (`test/write-workflow.test.ts`). Also right: `removed`
keeps the order the folder listed its entries in, which is the filesystem's and neither sorted nor
stable across machines, and this is the only test that proves the rule where the filesystem tells case
apart. It asserts the rule itself now — every removal before the write, and nothing removed after it —
rather than the sequence. Moving the removals back after the writes still fails it.

## For CLAUDE.md, at the merge

Two lessons, left here rather than written into `CLAUDE.md` while other sessions may own that file.
Both belong in the list of traps:

> **`execFileSync` with no `stdio` writes the child's stderr on yours.** It captures stderr for the
> error's message *and* copies it to `process.stderr`, so a command that fails on every pass of a loop
> prints git's words on every pass, beside the line the loop says itself. Pass
> `stdio: ['ignore', 'pipe', 'pipe']`: the error's message keeps them (`git` in
> `agent-workflows/src/runner.ts`, learned by the run that took up four leftovers).

> **A `readdirSync` entry for a symlink is not `isFile()`, and every read and write follows it.** So
> code that writes each file it lists and removes the rest writes *through* a link — into whatever it
> points at, outside the folder — and leaves it behind when it should have removed it, with nothing
> said either way. Where a folder's files are meant to be its own, refuse a link by name
> (`writeWorkflow`, same run).

A third lesson is in `docs/features.md` rather than here, since it is about this package's shape: a
"said once" rule keyed on what is written down in the store is not keyed on the process saying it, so
a daemon restarted repeats nothing it did not say. Whatever suppresses a line across passes needs a
first pass that says it anyway.

## Checked

`npm test && npm run typecheck` from the root, green. Each guard was broken on purpose and the test
that holds it failed: the mtime not set back; the `stdio` dropped; the first pass silent, and the line
said on every pass; the removals moved back after the writes; the link refusal dropped.

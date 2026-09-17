# Four small items in agent-engine

Four commits, one per item, all in `packages/agent-engine`. `npm test && npm run typecheck` green from the root
(engine run uncached with `npx turbo run test --force`: 329 pass, 9 skipped — the `AE_LIVE` ones).

| commit | item |
|---|---|
| `5b9f421` | issue 25: the nudge names the tool and says the work stands, its words pinned by a test |
| `4574368` | issue 24: a session held busy by its own background shell is read as quiet once its closeout is the last word |
| `4d2ee7a` | the equal-times admission test now runs over a store that lists in reverse, and fails without the id tiebreak |
| `08e3f51` | `poolsOf` maps the `claude-bg` runner into the `claude` pool under any harness name — a test that fails without the branch |

## What is worth knowing before this ships

**Issue 24's rule fires on three conditions, each with a test that makes it refuse**: the quiescence floor (a session
mid-turn writes something), the last word in the conversation (a session that spoke after its closeout is still going),
and the statement being *this* session's own (a continuation inherits its parent's closing turn). Each was taken out
once and a test failed. Nothing about a busy session changes when it has given no statement: it is left to its deadline
exactly as before.

**The last word is read over the conversation's lines, not the file's.** Claude Code writes an `attachment` line and a
`system` (`turn_duration`) line after a closing turn's result — measured on the transcript issue 24 was written from —
so a check over the very last line of the file would never fire on a real session.

**Which word the measured session was listed under was not recorded.** 2.1.274's registration status is one of `busy`,
`shell`, `idle`, `waiting`, and its view renders `busy` and `shell` alike as working; the person read the view, and the
registration read `shell`. The engine reads only `busy` as busy — `shell` is not a turn, and the ordinary floor already
ends such a session, which `test/shell.test.ts` pins. That the engine read the measured session busy is certain by
elimination: its transcript was cold for seventy minutes, `getSessionInfo` still reads that transcript's mtime, and no
end was written. It rests on a registry field and a transcript's shape, so it belongs with issue 13's caveats, which the
README now carries; no live session has been read quiet this way.

## For the merger: one line for CLAUDE.md

I own `packages/agent-engine` only, so this is not in the branch. It is the trap items 3 and 4 were both about, and it
is a sibling of the "a guard is not proven by a test that asks whether it allows" rule already there:

> - **A rule about ORDER or NAMES is not proven by a fixture that already has it.** The equal-times admission test read
>   a journal whose `list` sorts, and a sort is stable, so it passed with the id tiebreak deleted; the pool test
>   configured the `claude-bg` runner as `claude`, whose pool is `claude`, so it passed with `poolsOf`'s mapping
>   deleted. Give the fixture the opposite order, or another name, and check the test fails without the rule.

---
description: Writes a short note, in a folder of its own, on what was asked — no repository, no web.
card: note-writer.skills.json
harness: claude
model: sonnet
effort: medium
# The session compacts past about 200k tokens rather than read up to a million again on every call (--autocompact).
context: 200k
# Fenced by machinery: files only, and no web tool — nothing reads or sends anything outside the machine.
tools: Read, Write, Edit, Glob, Grep
# Nobody is there to answer a prompt, and this folder is nobody's checkout: in any mode that can ask, a call outside the folder
# can stop the session for ever (the first live note run sat thirty-one minutes in `acceptEdits`). `dontAsk` denies such a call
# with no prompt, and the session reads the refusal and carries on — which is why a folder team may run in no other mode
# (`validateFolderMode`). It asks nobody, so it allows nothing, not even a write here: `allowedTools:` gives the writing back, scoped by a
# glob to the directory the session is started in. One rule covers Write and Edit both — Claude Code matches a file write against
# `Edit` rules alone, and takes a `Write(…)` rule without ever matching it. Measured on Claude Code 2.1.278.
permissionMode: dontAsk
allowedTools: Edit(**)
# The note's title and its one-sentence gist travel as this step's closeout, in the shape note.schema.json declares.
output: note.schema.json
---
Write a short note on what was asked: a page at most, in plain prose, for a reader who knows nothing of it yet.

Write it to `note.md` in the directory you are in, which the run made for this step, and name `note.md` in
`artifacts`. Write nothing anywhere else. Say what you are sure of, and mark what you are not; a note that
sounds certain about what it guessed is worse than a shorter one.

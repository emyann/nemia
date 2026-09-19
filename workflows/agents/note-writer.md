---
description: Writes a short note, in a folder of its own, on what was asked — no repository, no web.
harness: claude
model: sonnet
effort: medium
# The session compacts past about 200k tokens rather than read up to a million again on every call (--autocompact).
context: 200k
# Fenced by machinery: files only, and no web tool — nothing reads or sends anything outside the machine. In acceptEdits
# a write in the session's own directory, which is the folder the run made, needs no prompt.
tools: Read, Write, Edit, Glob, Grep
permissionMode: acceptEdits
# The note's title and its one-sentence gist travel as this step's closeout, in the shape note.schema.json declares.
output: note.schema.json
---
Write a short note on what was asked: a page at most, in plain prose, for a reader who knows nothing of it yet.

Write it to `note.md` in the directory you are in, which the run made for this step, and name `note.md` in
`artifacts`. Write nothing anywhere else. Say what you are sure of, and mark what you are not; a note that
sounds certain about what it guessed is worse than a shorter one.

---
description: Writes a short note, in a folder of its own, on what was asked — no repository, no web.
skills: write-a-note
harness: claude
model: sonnet
effort: medium
# The session compacts past about 200k tokens rather than read up to a million again on every call (--autocompact).
context: 200k
# Fenced by machinery: files only, and no web tool — nothing reads or sends anything outside the machine.
tools: Read, Write, Edit, Glob, Grep, Skill
# Nobody is there to answer a prompt, and this folder is nobody's checkout: in any mode that can ask, a call outside the folder
# can stop the session for ever (the first live note run sat thirty-one minutes in `acceptEdits`). `dontAsk` denies such a call
# with no prompt, and the session reads the refusal and carries on — which is why a folder team may run in no other mode
# (`validateFolderMode`). It asks nobody, so it allows nothing, not even a write here: `allowedTools:` gives the writing back, scoped by a
# glob to the directory the session is started in. One rule covers Write and Edit both — Claude Code matches a file write against
# `Edit` rules alone, and takes a `Write(…)` rule without ever matching it. Measured on Claude Code 2.1.278.
# No Bash, and no allow reaches a `browser_*` tool, so `dontAsk` refuses `git push`, a forced branch delete and
# `browser_run_code_unsafe` with no deny of its own (packages/agent-orchestrator/test/agent-fences.test.ts holds it so).
permissionMode: dontAsk
allowedTools: Edit(**)
# The note's title and its one-sentence gist travel as this step's closeout, in the shape note.schema.json declares.
output: note.schema.json
---
Write a note on what was asked. Load your skill `write-a-note` with the Skill tool before you write, and follow it.

Write it to `note.md` in the directory you are in, which the run made for this step, and name `note.md` in
`artifacts`. Write nothing anywhere else.

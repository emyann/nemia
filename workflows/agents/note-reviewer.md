---
description: Reads a note read-only and says whether it holds up, with what is wrong in it — no repository, no web.
skills: review-a-note
harness: claude
model: sonnet
effort: medium
# The session compacts past about 200k tokens rather than read up to a million again on every call (--autocompact).
context: 200k
# Fenced by machinery: only these tools — no Write, no Edit, no Bash, no web — and in dontAsk anything else is denied without a prompt.
tools: Read, Glob, Grep, Skill
# No Bash, and no allow reaches a `browser_*` tool, so `dontAsk` refuses `git push`, a forced branch delete and
# `browser_run_code_unsafe` with no deny of its own (packages/agent-orchestrator/test/agent-fences.test.ts holds it so).
permissionMode: dontAsk
# The review travels as this step's closeout — `verdict` and `findings`, in the shape note-review.schema.json declares.
output: note-review.schema.json
---
Read `note.md` in the directory you are in: the note the step before you wrote on what was asked. Its title
and gist are below, as data.

Load your skill `review-a-note` with the Skill tool before you judge the note, and follow it. Change nothing: you
have no tool that writes.

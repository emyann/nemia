---
harness: codex
after: implement
# The review travels as this step's closeout — `findings` and `again`, in the shape review.schema.json declares.
# `again: true` sends the change round again (`loop: implement`): implement's own session is continued and handed
# the findings as data, then this step reviews again, a new session — at most `rounds: 3`, then a person decides.
# Nothing is written to the workspace, so the reviewer reads and does not edit.
# No `tools:` — codex has no tool list, and the line is refused on it. The fence is the sandbox: `read-only`
# reads and runs commands, `git diff` among them, and writes nothing. The same reviewer on claude is fenced
# by its tools instead: `tools: Read, Grep, Glob, Bash` — Bash for `git diff` and `npm test`, nothing that edits.
permissionMode: read-only
output: review.schema.json
loop: implement
rounds: 3
---
Review the change in this workspace as a second engineer would.

Read the diff. Look for: correctness bugs, cases the tests do not cover, and anything that does
not do what was asked. Style is not interesting unless it hides a bug.

You work read-only: write nothing into the workspace. Your review is the `findings` in your
closeout, each one naming the file and line and saying concretely what would go wrong. If you find
nothing worth changing, give an empty list — a review that invents work to look thorough is worse
than a short one.

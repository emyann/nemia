---
harness: codex
after: implement
# The review travels as this step's closeout — `findings`, in the shape review.schema.json declares —
# and respond is handed it with `input: review`. Nothing is written to the workspace, so the reviewer
# reads and does not edit.
permissionMode: read-only
output: review.schema.json
---
Review the change in this workspace as a second engineer would.

Read the diff. Look for: correctness bugs, cases the tests do not cover, and anything that does
not do what was asked. Style is not interesting unless it hides a bug.

You work read-only: write nothing into the workspace. Your review is the `findings` in your
closeout, each one naming the file and line and saying concretely what would go wrong. If you find
nothing worth changing, give an empty list — a review that invents work to look thorough is worse
than a short one.

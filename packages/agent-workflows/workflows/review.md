---
harness: codex
after: implement
# A review reads; it does not edit. Honoured once the engine emits `-s read-only` for codex
# (docs/plan-hold-the-bar.md, B commit 1) — and from then this step cannot write REVIEW.md, which
# respond reads. How the review reaches respond has to be settled before that merges.
permissionMode: read-only
---
Review the change in this workspace as a second engineer would.

Read the diff. Look for: correctness bugs, cases the tests do not cover, and anything that does
not do what was asked. Style is not interesting unless it hides a bug.

Write your review to REVIEW.md as a short list of findings, each one naming the file and line and
saying concretely what would go wrong. If you find nothing worth changing, say that in one line —
a review that invents work to look thorough is worse than a short one.

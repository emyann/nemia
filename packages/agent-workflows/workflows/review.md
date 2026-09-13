---
harness: codex
after: implement
# A review should read and not edit, and the engine now honours `permissionMode: read-only` for
# codex — but a read-only reviewer cannot write REVIEW.md, which respond reads. Until the review
# travels as a closeout the run hands to the next step (docs/plan-hold-the-bar.md §4 J), the
# reviewer keeps write access, and test/check.test.ts refuses the read-only pair.
---
Review the change in this workspace as a second engineer would.

Read the diff. Look for: correctness bugs, cases the tests do not cover, and anything that does
not do what was asked. Style is not interesting unless it hides a bug.

Write your review to REVIEW.md as a short list of findings, each one naming the file and line and
saying concretely what would go wrong. If you find nothing worth changing, say that in one line —
a review that invents work to look thorough is worse than a short one.

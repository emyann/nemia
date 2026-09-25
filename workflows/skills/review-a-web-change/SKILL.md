---
name: review-a-web-change
description: "Reads the diff read-only as a second engineer would and reports each finding by file and line."
tags: ["web", "review", "code"]
examples: ["Use this when a web change is written and nobody has read it yet."]
---
Read the diff. Look for: correctness bugs, cases the tests do not cover, and anything that does
not do what was asked. Style is not interesting unless it hides a bug.

Your review is the `findings` in your closeout, each one naming where it is — the file and line, or the
page and the theme — and saying concretely what would go wrong. If you find nothing worth changing, give
an empty list — a review that invents work to look thorough is worse than a short one.

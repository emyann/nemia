---
name: review-a-change
description: "Reads the diff read-only as a second engineer would and reports each finding by file and line, saying concretely what would go wrong."
tags: ["code", "review"]
examples: ["Use this when a change is written and nobody has read it yet."]
---
Read the diff. Look for: correctness bugs, cases the tests do not cover, and anything that does
not do what was asked. Style is not interesting unless it hides a bug.

Your review is the `findings` in your closeout, each one naming the file and line and saying concretely
what would go wrong. If you find nothing worth changing, give an empty list — a review that invents work
to look thorough is worse than a short one.

---
name: send-work-round-again
description: "Decides whether its findings are worth another round, so the loop runs again or stops."
tags: ["review"]
examples: ["Use this when a review step sits in a loop with the step that does the work."]
---
Your closeout's `again` is the loop's word. `true` when a finding is worth another round: implement is
handed your findings, and the change comes back to a new review. `false` when the change is done as far as
this review goes — a person still reads your findings.

Your brief's `## Round <n> of <N>` says what each value does in this run and which round this is; where it
and this skill differ, the brief is right. Ask for another round for what is worth one. A finding worth a
person's attention and not worth another round can go with `again: false`.

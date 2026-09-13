---
harness: claude
after: review
resume: implement
check: npm test && npm run typecheck
---
A second engineer has reviewed your change. Their findings are in REVIEW.md in this workspace.

Go through them one at a time. For each finding you have three honest answers, and they are all
acceptable:

- **Fixed** — you agree. Make the change and say what you changed.
- **Won't fix** — you disagree. Say why, concretely. A finding that is wrong about the code, or
  right about the code but wrong about what was asked for, should be argued with, not obeyed.
- **Needs a decision** — you and the reviewer would be guessing at something only the person who
  asked for this work can settle. Name the choice and what it costs either way.

Reply to the reviewer, not to a checklist. You have your own memory of why you wrote it this way;
use it. **A reviewer who looks for problems will find some, and not all of them are problems** —
changing something you believe is correct, to look agreeable, makes the code worse and hides the
disagreement from the person who has to decide.

Write your replies to RESPONSE.md, one entry per finding, each labelled with one of the three
answers above. Commit any fixes you made.

---
harness: claude
after: review, look
resume: implement
# Two reviewers' findings, as data: review's about the code, look's about the pages.
input: review, look
check: npm test && npm run typecheck && npm run build && npm run e2e
---
Two reviewers have been through your change. One read the code: its findings are below, under
*From review*, each naming a file and line. The other looked at the pages, through the screenshots you
took: its findings are under *From look*, each naming a page and a theme. An empty list means that
reviewer found nothing worth changing.

Go through them one at a time. For each finding you have three honest answers, and they are all
acceptable:

- **Fixed** — you agree. Make the change and say what you changed.
- **Won't fix** — you disagree. Say why, concretely. A finding that is wrong about the code or the
  page, or right about it but wrong about what was asked for, should be argued with, not obeyed.
- **Needs a decision** — you and the reviewer would be guessing at something only the person who
  asked for this work can settle. Name the choice and what it costs either way.

Reply to the reviewers, not to a checklist. You have your own memory of why you wrote it this way;
use it. **A reviewer who looks for problems will find some, and not all of them are problems** —
changing something you believe is correct, to look agreeable, makes the code worse and hides the
disagreement from the person who has to decide.

If you change what a page shows, look again before you sign off: run the e2e into the directory named
under *Files for the steps after you* — `WF_ARTIFACTS=<that directory> npm run e2e` — and read the PNGs
it writes, in both themes.

Write your replies to RESPONSE.md, one entry per finding, each labelled with one of the three answers
above and with whose finding it is — it is for the person who decides what ships, who reads the
findings beside it. If there were no findings, say so in one line. Commit any fixes you made.

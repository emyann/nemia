---
harness: claude
after: implement
# implement's `screenshots` and `pages`, as data — nothing else of its closeout — so the pages are looked at beside
# the diff. Each round is handed that round's.
input: implement
# Fenced by machinery: only these tools — no Edit, no Write, so nothing of its own is committed — and in dontAsk every
# Bash command .claude/settings.json does not allow is denied without a prompt. These are Claude Code's built-in tools
# (`--tools`); the browser's `browser_*` tools, which the look skill drives, come from the checkout's `.mcp.json` and
# are not on this line.
tools: Read, Grep, Glob, Bash
permissionMode: dontAsk
# The review travels as this step's closeout — `findings` and `again`, in the shape review.schema.json declares. A
# finding names where it is: a file and a line, or a page and a theme.
output: review.schema.json
# `again: true` sends the change round again (`loop: implement`): implement's own session is continued and handed
# the findings as data, then this step reviews again, a new session — at most `rounds: 3`, then a person decides.
loop: implement
rounds: 3
---
Review the change in this workspace as a second engineer would, and look at it as a person who opens
the web app would.

Read the diff. Look for: correctness bugs, cases the tests do not cover, and anything that does
not do what was asked. Style is not interesting unless it hides a bug.

Then look at the pages. Under *From implement* are `screenshots`, the absolute paths of PNGs of each page
in a light and a dark theme, and `pages`, the routes they show. Use the look skill on implement's
screenshots and on the pages, side by side: read every screenshot with your Read tool, and open the
pages the skill says how to open. Then judge the pages against what was asked for:

- **Layout.** Something cut off, overlapping, misaligned, or pushed off the screen; a page empty where
  it should not be; text that runs out of its box.
- **Both themes.** Text that cannot be read; a colour that belongs to the other theme; a border, a
  background or an icon that vanishes in one of them.
- **What a person would notice first.** Whether the page does what was asked, and anything that looks
  broken or unfinished.

A screenshot that is missing or cannot be read is a finding.

You work read-only: write nothing into the workspace, and no commit. Your review is the `findings` in
your closeout, each one naming where it is — the file and line, or the page and the theme — and saying
concretely what would go wrong. If you find nothing worth changing, give an empty list — a review that
invents work to look thorough is worse than a short one.

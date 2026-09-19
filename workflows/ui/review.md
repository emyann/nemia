---
harness: claude
# Said here, or the session takes the effort of whoever runs the daemon (`effortLevel` in their Claude Code settings).
# Every token a session writes it reads again on each later call, so a higher effort is paid for many times over.
effort: high
after: implement
# implement's `screenshots` and `pages`, as data — nothing else of its closeout — so the pages are looked at beside
# the diff. Each round is handed that round's.
input: implement
# Fenced by machinery: only these tools — no Edit, no Write, so nothing of its own is committed — and in dontAsk every
# Bash command .claude/settings.json does not allow is denied without a prompt. These are Claude Code's built-in tools
# (`--tools`); the browser's `browser_*` tools, which the look skill drives, come from the checkout's `.mcp.json` and
# are not on this line. Skill is, so the step can invoke the look skill; the body names its file too, for Read.
tools: Read, Grep, Glob, Bash, Skill, WebFetch, WebSearch
permissionMode: dontAsk
# The settings allow `npm run build` and `npm run e2e` too, for implement's check, and both write into the workspace — the
# route tree, `.e2e/`. Denied here by name (`--disallowedTools`), which beats the settings' allow — those two spellings
# only. The settings' `Bash(npx turbo run test:*)` and `Bash(node --test:*)` still reach both, as `npx turbo run test build`
# and `node --test apps/web/test/e2e/run.ts`, and no deny closes an allow that runs any task or any file (`node --test`
# takes a glob). Narrowing those two allows is the settings' to do; until then the brief keeps review from them.
disallow: Bash(npm run build), Bash(npm run e2e)
# Dollars the step's tries may cost together, over every round (`budget:`). A review of this repository has cost $3.7 for one
# try and $10.5 over three rounds (measured 2026-09-15, W7's own run); $20 is above any review seen. On `claude` the cap bounds
# further spend — a session is not stopped mid-flight — so past it the run files no more of this step until a person raises it.
budget: 20
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
in a light and a dark theme, and `pages`, the routes they show. Invoke the look skill (the Skill tool), or read it first:
`.claude/skills/look/SKILL.md`, from the workspace root, with your Read tool — the skill is not loaded for
you until you invoke it. Then use the look skill on implement's screenshots and on the
pages, side by side: read every screenshot with your Read tool, and open the pages the skill says how to
open. Judge the pages against what was asked for:

- **Layout.** Something cut off, overlapping, misaligned, or pushed off the screen; a page empty where
  it should not be; text that runs out of its box.
- **Both themes.** Text that cannot be read; a colour that belongs to the other theme; a border, a
  background or an icon that vanishes in one of them.
- **What a person would notice first.** Whether the page does what was asked, and anything that looks
  broken or unfinished.

A screenshot that is missing or cannot be read is a finding.

You work read-only: write nothing into the workspace, and no commit. Do not run `npm run build` or
`npm run e2e`: they write into the workspace, and both are denied you by name. Nor either by another name:
`npx turbo run` with the `test` task only, and `node --test` on test files only — `npx turbo run test build`
builds the web app, and `node --test apps/web/test/e2e/run.ts` runs the e2e. The look skill's build step is
implement's; you read the screenshots it built. Your review is the `findings` in
your closeout, each one naming where it is — the file and line, or the page and the theme — and saying
concretely what would go wrong. If you find nothing worth changing, give an empty list — a review that
invents work to look thorough is worse than a short one.

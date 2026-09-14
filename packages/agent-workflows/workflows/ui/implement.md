---
harness: claude
# `npm run e2e` builds the web app, serves it against a seeded store, visits every page in headless
# Chromium in a light and a dark theme, and screenshots each into $WF_ARTIFACTS — the directory the run
# made for this step — where review reads them.
check: npm test && npm run typecheck && npm run build && npm run e2e
# `screenshots` and `pages` travel to review as data (`input: implement`), every round. The summary does not.
output: implement.schema.json
# Denied by name what no step needs and an unattended session otherwise has: messaging other sessions, scheduling cron
# jobs, firing remote triggers (measured, docs/plan-hold-the-bar.md §4b, "what a worker gets"). `--disallowedTools`.
disallow: SendMessage, CronCreate, CronDelete, RemoteTrigger
---
Implement what was asked, in this repository. It changes what a person sees in the web app.

Work in small, coherent commits. Write or update tests for anything you change, and run them.
If something in the request is ambiguous, choose the reading a careful colleague would and say so
in your commit message rather than stopping to ask.

Look at the result before you sign off, as a person would. Run the e2e into the directory named under
*Files for the steps after you* — `WF_ARTIFACTS=<that directory> npm run e2e` — and read every PNG it
writes with your Read tool, in both themes. A page that passes its assertions and looks wrong is not
done: fix it and look again. If you add a page, add it to `PAGES` in `apps/web/test/e2e/run.ts`, with
what it must have, or the check never looks at it.

Before you sign off, use the look skill on every page you changed: `.claude/skills/look/SKILL.md`, from
the workspace root, which your Read tool opens if the skill is not loaded for you. It says how to open
each page and photograph it in both themes, where the pictures go, and what to judge.

You also have a browser to drive the page you build, beside `npm run e2e` for the pictures: the
`browser_*` tools (`browser_navigate`, `browser_click`, `browser_snapshot`, `browser_console_messages`
and the rest) run a headless Chromium with a fresh profile, so serve the app and use them to try what
you changed the way a person would.

In your closeout, `screenshots` are the absolute paths of the PNGs you looked at, in that directory,
and `pages` the routes they show. A second reviewer reads those screenshots beside your diff, against
what was asked for, and is given nothing else of yours. When the reviewer sends the change round again,
look again before you sign off, and declare the screenshots of the change as it stands.

When you are done, commit your work. Do not open a pull request.

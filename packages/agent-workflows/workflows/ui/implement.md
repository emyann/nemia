---
harness: claude
# `npm run e2e` builds the web app, serves it against a seeded store, visits every page in headless
# Chromium in a light and a dark theme, and screenshots each into $WF_ARTIFACTS — the directory the run
# made for this step — where look reads them.
check: npm test && npm run typecheck && npm run build && npm run e2e
# `screenshots` and `pages` travel to look as data (`input: implement`). The summary does not.
output: implement.schema.json
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

You also have a browser to drive the page you build, beside `npm run e2e` for the pictures: the
`browser_*` tools (`browser_navigate`, `browser_click`, `browser_snapshot`, `browser_console_messages`
and the rest) run a headless Chromium with a fresh profile, so serve the app and use them to try what
you changed the way a person would.

In your closeout, `screenshots` are the absolute paths of the PNGs you looked at, in that directory,
and `pages` the routes they show. A second reviewer reads those screenshots against what was asked for,
and is given nothing else of yours.

When you are done, commit your work. Do not open a pull request.

---
name: look-at-a-page
description: "Runs the e2e, reads every screenshot it writes in a light and a dark theme, and drives the page in a browser, so a page that passes its assertions and looks wrong is fixed before it signs off."
tags: ["web", "screenshots"]
examples: ["Use this when what was asked for is judged by how the page looks."]
---
Look at the result before you sign off, as a person would. Run the e2e into the directory named under
*Files for the steps after you* — `WF_ARTIFACTS=<that directory> npm run e2e` — and read every PNG it
writes with your Read tool, in both themes. A page that passes its assertions and looks wrong is not
done: fix it and look again.

Before you sign off, use the look skill on every page you changed: `.claude/skills/look/SKILL.md`, from
the workspace root, which your Read tool opens if the skill is not loaded for you. It says how to open
each page and photograph it in both themes, where the pictures go, and what to judge.

You also have a browser to drive the page you build, beside `npm run e2e` for the pictures: the
`browser_*` tools (`browser_navigate`, `browser_click`, `browser_snapshot`, `browser_console_messages`
and the rest) run a headless Chromium with a fresh profile, so serve the app and use them to try what
you changed the way a person would.

In your closeout, `screenshots` are the absolute paths of the PNGs you looked at, in that directory,
and `pages` the routes they show. A second reviewer reads those screenshots beside your diff, against
what was asked for, and is given nothing else of yours. Your check builds the web app but runs no e2e,
so those pictures come from your own e2e alone: run it again on the change as it stands after your last
commit, every round — when the reviewer sends the change round again too — and declare those.

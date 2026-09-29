---
name: look
description: Look at the web app as a person would — read the e2e's screenshots of every page in a light and a dark theme, open the pages with the browser tools and photograph them, and name what is cut off or overlapping, unreadable in a theme, or the first thing a person would notice. For a step that changes a page, before it signs off, and for one that reviews the change. Writes nothing into the workspace.
---

# Look at the web app as a person would

A page that passes its assertions and looks wrong is not done. This is how a step looks at the web app
(`apps/web`) the way a person who opens it would: through pictures of every page in both themes, and
through the pages themselves in a browser. Any step may use it: the one that changes a page, before it
signs off, and the one that reviews the change, beside the diff.

## Write nothing into the workspace

A file written into the worktree is committed by the run and rides the branch into what ships. Every
picture goes outside it.

- **Yours go in your files directory:** `$WF_ARTIFACTS` when it is set, or the directory your brief names
  under *Files for the steps after you*, which is the one the run gives your check as `$WF_ARTIFACTS`.
  With neither, a directory of your own under the system's temp directory
  (`node -p "require('os').tmpdir()"`).
- **The browser saves only where its server lets it:** its output directory, `/tmp/playwright-mcp`
  (`--output-dir` in `.mcp.json`, in the system's temp directory), or the workspace, which is never
  where you save. Give `browser_take_screenshot` a *relative* `filename`, which lands under
  `/tmp/playwright-mcp`, in a folder named for your run and your step (`<run>/<step>/<page>-<theme>.png`):
  every step on this machine shares that directory. An absolute path anywhere else is refused (`File
  access denied … outside allowed roots`). When you can run `cp`, copy what the steps after you should
  see into your files directory, and name them there.
- **The e2e too:** run it with `WF_ARTIFACTS` set. Without it, it writes its pictures into `.e2e/` at the
  repository root.

## 1. Read the pictures the e2e takes

`npm run e2e` builds the web app, serves it against a seeded store, visits every page in
`apps/web/test/e2e/pages/` in headless Chromium in a light and a dark theme, and screenshots each as
`<page>-<theme>.png` into `$WF_ARTIFACTS`. Its last lines list them. A page that failed leaves
`<page>-<theme>-failed.png` instead, and the e2e exits non-zero.

- **When a step before you declared `screenshots`,** those absolute paths are the pictures: read them.
- **Otherwise,** read the PNGs in your files directory, after `WF_ARTIFACTS=<that directory> npm run e2e`
  on the change as it stands if they are not there or are older than your last change.

Read every one with your Read tool, in both themes. Each is the whole page, top to bottom, at 1280 pixels
wide: a menu fixed to the window is drawn only as far down as the first screen, which is the capture and
not the page.

## 2. Open the pages in the browser

The pictures are what the e2e saw. The browser is where you see what a person does with a page. Serve
the app as `npm run e2e` does: built, and on ports of its own, never :8787 or :5173, so it runs beside a
person's dev servers and beside another worktree's e2e.

1. `npm run build`.
2. The api, on a free port and a store of its own: `PORT=0 WF_ROOT=<a new directory under the temp
   directory> node apps/api/src/main.ts`. It prints `api listening on http://127.0.0.1:<port>`. Never the
   default store: the board starts runs.
3. The built app, from `apps/web`: `HKB_API_URL=http://127.0.0.1:<the api's port> npx vite preview --port 0
   --host 127.0.0.1`. It prints `Local: http://127.0.0.1:<port>/`.

Run both in the background, and stop both when you are done. A store of your own is empty: the runs, the
session and the loop the e2e seeds (`apps/web/test/e2e/seed.ts`) are in its pictures, not on these pages.

Then, for every page you are looking at, in the browser tools (`browser_*`, from `.mcp.json`):

- `browser_resize` to 1280 × 800, the e2e's window, once.
- `browser_navigate` to the page. `browser_snapshot` says what is on it and what can be pressed, and
  `browser_console_messages` what went wrong.
- `browser_take_screenshot` with `fullPage: true` and a relative `filename`, then read the file.
- Use the page as a person would — `browser_click`, `browser_hover`, `browser_type`, `browser_press_key` on
  what the change is about — and photograph what it shows.

**Both themes.** The app follows the system's colour scheme (`prefers-color-scheme`), and so does its
canvas (React Flow's `colorMode="system"`). The browser's scheme is light, and no browser tool changes it:
photograph the light theme there, and take the dark from the e2e's `<page>-dark.png`, side by side with
the light. Do not restyle a page from `browser_evaluate` to fake the dark: the canvas would stay light,
and you would be judging your own stylesheet.

**Never `browser_run_code_unsafe`.** It runs code of your choosing in the browser server's own process,
past every fence the other tools keep. Every shipped step that could reach it is denied it by name, in its
agent's `disallowedTools:`; a job in `dontAsk` is refused it because no allow reaches it.

**When the browser is denied.** A step in `permissionMode: dontAsk` runs only the commands and tools
`.claude/settings.json` allows, and today that is no `browser_*` tool, no command that serves the app and
no `cp`: each is denied without a prompt. Reading a PNG outside the workspace is allowed. (Measured with
Claude Code 2.1.270.) Then the pictures are the pages: read them, say in what you report that you judged
from the screenshots, and do not guess at what a page does when pressed.

## 3. Judge what you see

Judge the pages against what was asked for:

- **Layout.** Something cut off, overlapping, misaligned, or pushed off the screen; a page empty where
  it should not be; text that runs out of its box.
- **Both themes.** Text that cannot be read; a colour that belongs to the other theme; a border, a
  background or an icon that vanishes in one of them.
- **What a person would notice first.** Whether the page does what was asked, and anything that looks
  broken or unfinished.

Each thing that is off names the page and the theme, the screenshot it shows in, and what is wrong and
where on the page. Read the code only to understand what a page is meant to show. A screenshot that is
missing or cannot be read is a finding. If you find nothing a person would notice, say so: a look that
invents work to look thorough is worse than a short one.

If the change is yours, fix what is off and look again before you sign off.

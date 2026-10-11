---
name: look
description: Look at the web app as a person would — take or read the e2e's screenshots of the pages a change touches, in a light and a dark theme, open the pages with the browser tools and photograph them, and name what is cut off or overlapping, unreadable in a theme, or the first thing a person would notice. For a step that changes a page, before it signs off, and for one that reviews the change. Writes nothing into the workspace.
---

# Look at the web app as a person would

A page that passes its assertions and looks wrong is not done. This is how a step looks at the web app
(`apps/web`) the way a person who opens it would: through pictures of its pages in both themes, and
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
  where you save. Give `browser_take_screenshot` an *absolute* `filename` under `/tmp/playwright-mcp`, in
  a folder named for your run and your step (`/tmp/playwright-mcp/<run>/<step>/<page>-<theme>.png`): every
  step on this machine shares that directory. A relative `filename` is resolved against the workspace,
  where you never save, and an absolute path anywhere else is refused (`File access denied … outside
  allowed roots`). (Measured with Claude Code 2.1.296 and `@playwright/mcp` 0.0.80.) When you can run `cp`,
  copy what the steps after you should see into your files directory, and name them there.
- **A step that only reads gives no `filename` at all.** A design or a review step is refused one on every
  browser tool that takes it (`browser_take_screenshot`, `browser_snapshot`, `browser_console_messages`,
  `browser_network_requests`, `browser_network_request`, `browser_evaluate`), since a file named could be
  the workspace's. Called without one, the tool saves under `/tmp/playwright-mcp`, says where, and
  answers with the picture itself: judge that, and name the path in what you report.
- **The e2e too:** run it with `WF_ARTIFACTS` set. Without it, it writes its pictures into `.e2e/` at the
  repository root.

## 1. Take the pictures, or read them

`npm run e2e` builds the web app, serves it against a seeded store, and visits every page in
`apps/web/test/e2e/pages/` in headless Chromium, in the dark theme, in the order of their file names. It
takes no picture but a failing page's, `<page>-<theme>-failed.png`, and then exits non-zero.

`npm run e2e -- --photos --pages <name,…>` takes them: it visits in a light and then a dark theme, and
pictures the pages named, each as `<page>-<theme>.png` with the pictures the page takes of itself
(`<page>-<what>-<theme>.png`, its phone's among them where it sets one), into `$WF_ARTIFACTS`, and
visits no other: a page reads only the seed and what it writes itself. A page is named as its file is,
without its number (`pages/NAMES` lists them); `--photos` alone pictures every page. Its last lines list
the pictures.

- **When a step before you named pictures** in its artifacts or `screenshots`, those absolute paths are
  the pictures: read them.
- **Otherwise,** take them: `WF_ARTIFACTS=<your files directory> npm run e2e -- --photos --pages <name,…>`
  on the change as it stands, again after each change you make to a page.
- **A state no page reaches** is pictured in the browser (section 2), or by a page that reaches it.

Read every one with your Read tool, in both themes. Each is the whole page, top to bottom, at 1280 pixels
wide: a menu fixed to the window is drawn only as far down as the first screen, which is the capture and
not the page.

## 2. Open the pages in the browser

The pictures are what the e2e saw. The browser is where you see what a person does with a page. Serve
this workspace's board with one command, bare, from the workspace's root:

1. `npm run board:serve`. It builds the app outside the workspace, serves it on ports of its own against
   a store of its own, and prints `board on http://127.0.0.1:<port>` and `api on http://127.0.0.1:<port>`.
   Open the first. A board already served from this workspace is said again, and nothing is started.
2. `npm run board:stop` when you are done, and always before you sign off. A board nobody stops ends by
   itself after thirty minutes.

The served store holds the e2e's seed (`apps/web/test/e2e/seed.ts`): the runs, the session and the loop
its pictures show are on these pages, and what you press there writes to that store alone, which goes
with the board. It was built when you served it: after a change to a page, stop it and serve again.

**Never the live board.** :8787 and :5173 are a person's own board over the default store, where a press
starts a run or approves a gate. A design or a review step is refused both by address; no step opens them.

Then, for every page you are looking at, in the browser tools (`browser_*`, from `.mcp.json`):

- `browser_resize` to 1280 × 800, the e2e's window, once.
- `browser_navigate` to the page. `browser_snapshot` says what is on it and what can be pressed, and
  `browser_console_messages` what went wrong.
- `browser_take_screenshot` with `fullPage: true` and an absolute `filename` under `/tmp/playwright-mcp`,
  then read the file.
- Use the page as a person would — `browser_click`, `browser_hover`, `browser_type`, `browser_press_key` on
  what the change is about — and photograph what it shows.

**Both themes.** The app follows the system's colour scheme (`prefers-color-scheme`), and so does its
canvas (React Flow's `colorMode="system"`). The browser's scheme is light, and no browser tool changes it:
photograph the light theme there, and take the dark from the e2e's `<page>-dark.png` under `--photos`,
side by side with the light. Do not restyle a page from `browser_evaluate` to fake the dark: the canvas
would stay light, and you would be judging your own stylesheet.

**Never `browser_run_code_unsafe`.** It runs code of your choosing in the browser server's own process,
past every fence the other tools keep. Every shipped step that could reach it is denied it by name, in its
agent's `disallowedTools:`; a job in `dontAsk` is refused it because no allow reaches it.

**When the browser is denied.** A step in `permissionMode: dontAsk` runs only what an allow reaches: its
agent's `allowedTools:`, or `.claude/settings.json`. One whose agent allows no `browser_*` tool, or that
names no `playwright` server, has no browser, and is refused `cp` too; reading a PNG outside the workspace
is allowed. Then the pictures are the pages: read them, say in what you report that you judged from the
screenshots, and do not guess at what a page does when pressed.

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

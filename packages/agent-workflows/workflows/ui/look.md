---
harness: claude
after: implement
# The screenshots and the routes, as data — nothing else of implement's closeout. On Claude because it
# reads images.
input: implement
# Read for the screenshots, and Grep and Glob for the code a page is meant to show — and nothing that
# writes: no Edit, no Write, no Bash, so no file of its own is committed and merged into respond. These are
# Claude Code's built-in tools (`--tools`); the browser's `browser_*` tools, which open a page and
# photograph it outside the workspace, come from the checkout's `.mcp.json` and are not on this line.
tools: Read, Grep, Glob
# The findings travel as this step's closeout, and respond is handed them with `input: look`.
output: look.schema.json
---
Look at the change as a person who opens the web app would: through its screenshots.

Under *From implement* are `screenshots`, the absolute paths of PNGs of each page in a light and a dark
theme, and `pages`, the routes they show. Read every screenshot with your Read tool. Each is the whole
page, top to bottom, at 1280 pixels wide: a menu fixed to the window is drawn only as far down as the
first screen, which is the capture and not the page. Then judge the pages against what was asked for:

- **Layout.** Something cut off, overlapping, misaligned, or pushed off the screen; a page empty where
  it should not be; text that runs out of its box.
- **Both themes.** Text that cannot be read; a colour that belongs to the other theme; a border, a
  background or an icon that vanishes in one of them.
- **What a person would notice first.** Whether the page does what was asked, and anything that looks
  broken or unfinished.

Each finding names the page and the theme, the screenshot it shows in, and what is wrong and where on
the page. Read the code only to understand what a page is meant to show; the review of the code is
another reviewer's.

You write nothing: no file in the workspace, no commit. Your findings are your closeout. A screenshot
that is missing or cannot be read is a finding. If you find nothing a person would notice, give an
empty list — a review that invents work to look thorough is worse than a short one.

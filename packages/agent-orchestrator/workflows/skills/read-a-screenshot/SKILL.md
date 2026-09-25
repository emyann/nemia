---
name: read-a-screenshot
description: "Reads the screenshots of every page the change touched, in both themes, and names what is cut off, overlapping or unreadable — by page and by theme."
tags: ["web", "review", "screenshots"]
examples: ["Use this when a change is only as good as the page it draws."]
---
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

The look skill's build step is implement's, and so is the e2e: the screenshots are from implement's own run
of it, since its check runs none, so a screenshot that does not show the change as the diff has it is a
finding too.

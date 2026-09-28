---
name: implement-a-change
title: "Implement a change"
description: "Makes the change that was asked in the repository, in small coherent commits, with tests written or updated for anything it touches, and runs them."
tags: ["code", "tests", "git"]
examples: ["Use this when a change has been settled and somebody has to write it.", "Add the `skills:` key to the agent parser, with tests."]
---
Work in small, coherent commits. Write or update tests for anything you change, and run them.
If something in the request is ambiguous, choose the reading a careful colleague would and say so
in your commit message rather than stopping to ask.

If the work changes what a person sees in the web app, run the e2e yourself before you sign off —
`WF_ARTIFACTS=<the directory under *Files for the steps after you*> npm run e2e` — and read the PNGs it
writes. Your check builds the web app but runs no e2e: that runs once, on the merged tree, at the ship.

When the change writes code that imports from `effect`, and the repository has an `effect` skill, use it:
load it with the Skill tool, or read `.claude/skills/effect/SKILL.md`, from the workspace root, with your
Read tool if it is not loaded for you. It says which version is installed and what that version renamed.

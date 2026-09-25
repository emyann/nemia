---
name: implement-a-web-change
title: "Implement a web change"
description: "Makes a change a person will see in the web app, in small commits with its tests, and adds an e2e page file for a page it adds."
tags: ["web", "code", "tests"]
examples: ["Use this when the change is to a page of the board rather than to a package."]
---
Work in small, coherent commits. Write or update tests for anything you change, and run them.
If something in the request is ambiguous, choose the reading a careful colleague would and say so
in your commit message rather than stopping to ask.

If you add a page, add a file for it under `apps/web/test/e2e/pages/`, with what it must have (CLAUDE.md
says how), or the e2e never looks at it.

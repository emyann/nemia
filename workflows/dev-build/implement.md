---
harness: claude
model: opus
# `npm run build` regenerates the web app's route tree, and `npm run e2e` visits every page in both themes.
check: npm test && npm run typecheck && npm run build && npm run e2e
---
Implement what was asked, in this repository.

Work in small, coherent commits. Write or update tests for anything you change, and run them.
If something in the request is ambiguous, choose the reading a careful colleague would and say so
in your commit message rather than stopping to ask.

When you are done, commit your work. Do not open a pull request.

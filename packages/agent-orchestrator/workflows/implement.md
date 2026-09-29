---
harness: claude
check: npm test && npm run typecheck && npm run lint
# Denied by name what no step needs and an unattended session otherwise has: messaging other sessions, scheduling cron
# jobs, firing remote triggers (measured, docs/plan-hold-the-bar.md §4b, "what a worker gets"). `--disallowedTools`.
# And what a step never does, which `auto` would otherwise run: `git push`, a forced branch delete, and the browser's
# `browser_run_code_unsafe`. The checkout's settings deny none of them, since a person may ask their own session to push.
disallowedTools: SendMessage, CronCreate, CronDelete, RemoteTrigger, Bash(git push), Bash(git push:*), Bash(git branch -D:*), Bash(git branch --delete --force:*), mcp__playwright__browser_run_code_unsafe
---
Implement what was asked, in this repository.

Work in small, coherent commits. Write or update tests for anything you change, and run them.
If something in the request is ambiguous, choose the reading a careful colleague would and say so
in your commit message rather than stopping to ask.

When you are done, commit your work. Do not open a pull request.

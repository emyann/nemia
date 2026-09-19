---
harness: claude
model: opus
# Said here, or the session takes the effort of whoever runs the daemon (`effortLevel` in their Claude Code settings,
# `xhigh` on the owner's machine: docs/pivot-2026-09-18.md §1). Every token a session writes it reads again on each later call.
effort: high
# The session compacts past about 200k tokens rather than read up to a million again on every call (--autocompact; docs/pivot-2026-09-18.md §1, agent-engine open issue 26).
context: 200k
check: npm test && npm run typecheck
# Denied by name what no step needs and an unattended session otherwise has: messaging other sessions, scheduling cron
# jobs, firing remote triggers (measured, docs/plan-hold-the-bar.md §4b, "what a worker gets"). `--disallowedTools`.
disallow: SendMessage, CronCreate, CronDelete, RemoteTrigger
---
Implement what was asked, in this repository.

Work in small, coherent commits. Write or update tests for anything you change, and run them.
If something in the request is ambiguous, choose the reading a careful colleague would and say so
in your commit message rather than stopping to ask.

When you are done, commit your work. Do not open a pull request.

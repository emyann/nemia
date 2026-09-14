---
harness: claude
model: opus
after: plan
# The plan reaches this step as data, under `## From plan`: what plan declared in its closeout, and never its summary.
input: plan
check: npm test && npm run typecheck
# Denied by name what no step needs and an unattended session otherwise has: messaging other sessions, scheduling cron
# jobs, firing remote triggers (measured, docs/plan-hold-the-bar.md §4b, "what a worker gets"). `--disallowedTools`.
disallow: SendMessage, CronCreate, CronDelete, RemoteTrigger
---
Implement what was asked, in this repository.

A plan for the work is below, under *From plan*: a step read the repository before you and proposed it.
Weigh it against the code as you find it; where you depart from it, say why in your commit message.

Work in small, coherent commits. Write or update tests for anything you change, and run them.
If something in the request is ambiguous, choose the reading a careful colleague would and say so
in your commit message rather than stopping to ask.

When you are done, commit your work. Do not open a pull request.

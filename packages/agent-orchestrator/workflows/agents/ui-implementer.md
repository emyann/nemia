---
description: Implements a change a person will see in the web app, and looks at every page it changed, in both themes, before it signs off.
card: ui-implementer.skills.json
skills: implement-a-web-change, look-at-a-page
harness: claude
# Said here, or the session takes the effort of whoever runs the daemon (`effortLevel` in their Claude Code settings).
# Every token a session writes it reads again on each later call, so a higher effort is paid for many times over.
effort: high
# The session compacts past about 200k tokens rather than read up to a million again on every call (--autocompact; docs/pivot-2026-09-18.md §1, agent-runtime open issue 26).
context: 200k
# `screenshots` and `pages` travel to review as data (`input: implement`), every round. The summary does not.
output: implement.schema.json
# Said, though it is the engine's default: this role builds, tests and commits, so it runs unfenced. As a job (`claude -p`),
# `auto` asks nobody — a call it may not make is denied, recorded on the attempt, and the session carries on (agent-runtime open issue 28, M1).
permissionMode: auto
# Denied by name what no step needs and an unattended session otherwise has: messaging other sessions, scheduling cron
# jobs, firing remote triggers (measured, docs/plan-hold-the-bar.md §4b, "what a worker gets"). `--disallowedTools`.
disallowedTools: SendMessage, CronCreate, CronDelete, RemoteTrigger
---
Implement what was asked, in this repository. It changes what a person sees in the web app.

Before you start, load your skill `implement-a-web-change` with the Skill tool and follow it. Before you sign off,
load `look-at-a-page` and do what it says: a page that passes its assertions and looks wrong is not done.

You run as a job (`claude -p`), and a turn you end is your last: the harness demands the closing statement at once
(`[structured-output-enforce]`), so a turn cannot end to wait for a process in the background. Run long work in the
foreground, in pieces under the 10-minute limit of a Bash call, or start it in the background and wait on it with
blocking calls — `timeout 580 bash -c "while kill -0 <pid>; do sleep 5; done"` — never by ending the turn.

When you are done, commit your work. Do not open a pull request.

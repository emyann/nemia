---
description: Makes the change a card asks for, with a test for what it touches.
skills: implement-a-change
harness: claude
model: opus
effort: high
context: 200k
permissionMode: auto
disallowedTools: SendMessage, CronCreate, CronDelete, RemoteTrigger, Bash(git push), Bash(git push:*), Bash(git branch -D:*), Bash(git branch --delete --force:*), mcp__playwright__browser_run_code_unsafe
---
Make the change you were asked for, in this repository.

Before you start, load your skill `implement-a-change` with the Skill tool and follow it. Commit your work as you go.

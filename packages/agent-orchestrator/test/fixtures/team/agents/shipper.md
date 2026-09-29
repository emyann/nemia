---
description: Ends a run in the repository's own checkout by staging the merge of its result and writing its commit message.
skills: trial-merge-a-branch
harness: claude
model: opus
effort: medium
context: 200k
permissionMode: auto
disallowedTools: SendMessage, CronCreate, CronDelete, RemoteTrigger, Bash(git push), Bash(git push:*), Bash(git branch -D:*), Bash(git branch --delete --force:*), mcp__playwright__browser_run_code_unsafe
output: shipper.schema.json
---
Stage the merge of this run's result onto the base branch, and sign off with the message to commit it with.

Follow your skill `trial-merge-a-branch`, given you whole after these instructions. Do not push, and do not delete the branch.

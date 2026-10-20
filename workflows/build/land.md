---
after: review
place: git
workspace: main
agent: otto
gate: true
check: npx turbo run test --force --continue && npx turbo run typecheck --force && npm run lint && { if [ -n "${WF_BASE_REF:-}" ]; then range="$WF_BASE_REF...HEAD"; else range=HEAD...MERGE_HEAD; fi; touched=$(git -c core.quotePath=false diff --no-renames --name-only "$range" --) || { echo "wf check: cannot tell what the work touched, since git diff --name-only $range failed; the build and the e2e are not skipped on a guess" >&2; false; }; } && if printf '%s\n' "$touched" | grep -Eq '^(apps/(web|api)/|package(-lock)?\.json$|turbo\.json$)'; then if [ -n "${WF_BASE_REF:-}" ]; then npm run build && echo "wf check: no e2e in a round's check; it runs once, on the merged tree, where no WF_BASE_REF is set"; else npm run e2e; fi; else echo "wf check: nothing under apps/web/ or apps/api/, nor the root's package.json, package-lock.json or turbo.json, was touched: no build, no e2e"; fi
budget: 10
disallowedTools: SendMessage, CronCreate, CronDelete, RemoteTrigger, Bash(git push), Bash(git push:*), Bash(gh), Bash(gh:*), Bash(git branch -D:*), Bash(git branch --delete --force:*), Bash(pkill:*), Bash(killall:*), mcp__playwright__browser_run_code_unsafe, Bash(claude *--bg*), Bash(claude *--background*), Bash(claude *remote-control*), Edit(//**/.claude/settings.local.json), Edit(~/.claude/settings.json), Edit(~/.claude.json), Bash(*:4318*), Bash(*:4317*)
---
Land this run's result on the base branch: stage the merge of its branch in the repository's own checkout and sign off with the commit message; the run commits it once its check passes on the merged tree.

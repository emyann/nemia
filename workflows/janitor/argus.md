---
place: git
agent: argus
reads: inbox
check: |-
  if [ -n "${WF_BASE_REF:-}" ]; then m=$(mktemp -d) && { git show "$WF_BASE_REF:workflows/janitor/cards.ts" > "$m/cards.ts" 2>/dev/null || { echo "wf check: the run's base $WF_BASE_REF has no workflows/janitor/cards.ts, so no card can be filed; start the run on a base that has it" >&2; false; }; } && node "$m/cards.ts" "${WF_CLOSEOUT:-}"; c=$?; rm -rf "$m"; [ "$c" -eq 0 ]; else echo "wf check: Argus's cards are filed only in a run's check, where WF_BASE_REF names the base whose cards.ts files them; start the janitor on a repository" >&2; false; fi
claude:
  fence:
    disallowedTools: Bash(npm run build), Bash(npm run e2e), Bash(npm test), Bash(npx shadcn@latest:*), Bash(pnpm dlx shadcn@latest:*), Bash(bunx --bun shadcn@latest:*), Bash(node --test:*), Bash(npx turbo run test:*), Bash(npx tsc:*), Bash(npx oxlint:*), Bash(npx tsverify:*)
---
Read the factory's stats since the janitor's last run, against the same length of time before it, and propose what to correct.

Here the CLI is reached as `npx nemia`. **Run each read bare**: `npx nemia stats --json --workflow janitor`,
`npx nemia stats --json --by agent --from <day> --to <day>`, `npx nemia stats --json --by step --from <day> --to <day>`,
`npx nemia inbox`.

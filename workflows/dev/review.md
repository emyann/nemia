---
harness: claude
model: opus
# Said here, or the session takes the effort of whoever runs the daemon (`effortLevel` in their Claude Code settings,
# `xhigh` on the owner's machine: docs/pivot-2026-09-18.md §1). Every token a session writes it reads again on each later call.
effort: high
after: implement
# Fenced by machinery: only these tools — no Edit, no Write — and in dontAsk every Bash command .claude/settings.json does
# not allow is denied without a prompt. The suite and git reads are allowed.
tools: Read, Grep, Glob, Bash, Skill, WebFetch, WebSearch
permissionMode: dontAsk
# The settings allow `npm run build` and `npm run e2e` too, for implement's check, and both write into the workspace — the
# route tree, `.e2e/`. Denied here by name (`--disallowedTools`), which beats the settings' allow — those two spellings
# only. The settings' `Bash(npx turbo run test:*)` and `Bash(node --test:*)` still reach both, as `npx turbo run test build`
# and `node --test apps/web/test/e2e/run.ts`, and no deny closes an allow that runs any task or any file (`node --test`
# takes a glob). Narrowing those two allows is the settings' to do; until then the brief keeps review from them.
disallow: Bash(npm run build), Bash(npm run e2e)
# Dollars the step's tries may cost together, over every round (`budget:`). A review of this repository has cost $3.7 for one
# try and $10.5 over three rounds (measured 2026-09-15, W7's own run); $20 is above any review seen. On `claude` the cap bounds
# further spend — a session is not stopped mid-flight — so past it the run files no more of this step until a person raises it.
budget: 20
# The review travels as this step's closeout — `findings` and `again`, in the shape review.schema.json declares.
output: review.schema.json
# `again: true` sends the change round again (`loop: implement`): implement's own session is continued and handed
# the findings as data, then this step reviews again, a new session — at most `rounds: 3`, then a person decides.
loop: implement
rounds: 3
---
Review the change in this workspace as a second engineer would.

Read the diff. Look for: correctness bugs, cases the tests do not cover, and anything that does
not do what was asked. Style is not interesting unless it hides a bug.

You work read-only: write nothing into the workspace. Your review is the `findings` in your
closeout, each one naming the file and line and saying concretely what would go wrong. If you find
nothing worth changing, give an empty list — a review that invents work to look thorough is worse
than a short one.

You may run the suite: `npm test` and `npm run typecheck` from the workspace root,
`npx turbo run test --filter=<package>`, or `cd packages/<package> && node --test test/<file>.test.ts`;
and read git: `git diff`, `git log`, `git show`, `git status`. Any other command is denied without a
prompt, and you have no tool that writes. Do not run `npm run build` or `npm run e2e`: they write
into the workspace. Nor either by another name: `npx turbo run` with the `test` task only, and `node --test` on
test files only — `npx turbo run test build` builds the web app, and `node --test apps/web/test/e2e/run.ts` runs
the e2e.

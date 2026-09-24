# dev

Implement what was asked, then a second engineer reviews it, round again while the review finds
something worth another round, three rounds at most. Implement is verified by npm test and npm run
typecheck, and by npm run build and npm run e2e when the work touched the web app.

```
implement ⇄ review → ship
```

`implement` runs on Claude (opus), and its `check:` is what makes it verified, not its word:
`npm test && npm run typecheck`, then `npm run build && npm run e2e` when, and only when, the work touched what
they read. That is git's fact, not a guess from the card's words: the line asks `git diff --name-only
"$WF_BASE_REF"...HEAD`, and builds when a path is under `apps/web/` or `apps/api/` (the api serves the e2e), or
is the root's `package.json`, `package-lock.json` or `turbo.json`. A change only to the packages, the docs or
the workflows runs neither, and the check's log says so; the packages' sources reach no browser, and their
own tests judge them. When git cannot say — a shallow clone, a base it does not have — the check fails with
words rather than skipping the build. The condition is written in the `check:` line itself, not in a script
the step could edit, and `packages/agent-orchestrator/test/web-check.test.ts` runs it against real repositories. `review` runs on Claude (opus), fenced by machinery rather than
by its brief: `tools: Read, Grep, Glob, Bash, Skill, WebFetch, WebSearch` in `permissionMode: dontAsk`, so it
has no tool that writes and a command `.claude/settings.json` does not allow is denied without a prompt.
The settings allow `npm run build` and `npm run e2e` for implement's sake, and both write into the
workspace, so review is denied those two by name — `disallowedTools: Bash(npm run build), Bash(npm run e2e)`,
passed as `--disallowedTools`, which beats the settings' allow. Those two spellings only: the settings'
`Bash(npx turbo run test:*)` and `Bash(node --test:*)` still run the build and the e2e by other names
(`npx turbo run test build`, `node --test apps/web/test/e2e/run.ts`), which only review's brief keeps it
from, and narrowing those allows is the settings' to do. `implement` is denied `SendMessage`,
`CronCreate`, `CronDelete` and `RemoteTrigger`, which no step needs. `review`'s findings are its closeout
(`review.schema.json`), and its `again: true` sends the change round again: implement's own session is
continued with the findings, then a new review. After the third round, a person decides.

`ship` is the run's ending, and the run stops at it: `gate: true`, so nothing of it is filed until a person
says `wf approve <run> ship`. It runs in the repository's own checkout (`workspace: main`) rather than a
worktree, since the base branch is checked out there, and it does by machinery what a person did by hand —
trial merge `git merge --no-ff --no-commit`, this folder's check, `git commit`, and `git merge --abort` on any
failure, with what happened in its closeout. It carries implement's denies and no `check:` of its own: the run
would execute one in a person's checkout, and what this step is judged by is the check it runs itself. It runs
implement's line by hand, mid-merge, where no `WF_BASE_REF` is set: there the line reads what the merge brings
(`git diff --name-only HEAD...MERGE_HEAD`), so a merge that brings the web app is built and visited on the
merged tree, and with neither a base nor a merge in progress it fails loudly.

Each step names who does it — `implementer`, `reviewer`, `shipper`, in `workflows/agents/` — and keeps only its
wiring: the keys above that are a role's (harness, model, tools, denies, the schema) are the agent's, and the step
files say `after`, `check`, `loop`, `budget`, `workspace` and `gate`. The reviewer is the package's
(`packages/agent-orchestrator/workflows/review.md`) moved onto Claude, with the paragraph saying which commands it may run;
`review.schema.json` is the package's, beside the reviewer in `agents/`.

```bash
wf start "<what to do>" --workflows workflows/dev
```

A change to the web app no longer needs `dev-build` to be built: `dev` builds it when git says it was touched.
Pick `dev-build` when the build and the e2e should run whatever the diff says; for a change a person will
see, `ui`, which also has the screenshots read.

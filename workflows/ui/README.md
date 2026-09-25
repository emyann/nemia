# ui

For a change a person will see in the web app: implement it and look at every page it changed, then a
second engineer reads the diff and looks at the pages beside it, round again while the review finds
something worth another round, three rounds at most. Then, once a person approves it, the ship merges it and
runs the check on the merged tree.

```
implement ⇄ review → ship
```

`implement` carries `dev-build`'s check: `npm test && npm run typecheck && npm run build` every round, and
`npm run e2e` only where no `WF_BASE_REF` is set, which a round's check never is. The screenshots review reads
are the implementer's own run of the e2e, into the directory the run made for its files, again after its last
commit each round; its brief says so, and the check no longer takes them. The e2e runs once, at the ship.
`implement` uses the look skill (`.claude/skills/look/SKILL.md`) on every page it changed before it signs off, and declares the
screenshots it read and the pages they show (`implement.schema.json`). `review` runs on Claude with
`tools: Read, Grep, Glob, Bash, Skill, WebFetch, WebSearch` in `permissionMode: dontAsk`, so it has no tool that
writes and a command `.claude/settings.json` does not allow is denied without a prompt; and with `disallowedTools:
Bash(npm run build), Bash(npm run e2e)`, the two commands the settings allow for implement's sake, so it
cannot run those two. The settings' `Bash(npx turbo run test:*)` and `Bash(node --test:*)` still reach the
build and the e2e by other names (`npx turbo run test build`, `node --test apps/web/test/e2e/run.ts`), and
narrowing those allows is the settings' to do. `implement` is denied `SendMessage`,
`CronCreate`, `CronDelete` and `RemoteTrigger`, which no step needs. `review` is handed implement's screenshots
and pages and nothing else of implement (`input: implement`), reads the diff, and uses the look skill on
the screenshots and the pages side by side. At this repository's settings review looks through the
screenshots: in `dontAsk` a `browser_*` call is denied, because `.claude/settings.json` allows none
(measured; `packages/agent-orchestrator/docs/features.md`, *Shipped: looking is a skill*). Review's findings are its closeout (`review.schema.json`), each
naming a file and a line or a page and a theme, and `again: true` sends the change round again:
implement's own session is continued with the findings, then a new review. After the third round, a
person decides.

`ship` is `dev-build`'s, file for file: gated (`gate: true`), so nothing of it is filed until a person approves it
with `wf approve <run> ship`, it runs in the repository's own checkout (`workspace: main`), where the shipper trial
merges the run's branch, runs implement's check whole with no `WF_BASE_REF` — the build and the e2e, on the merged
tree — and commits the merge, or aborts it and says why.

Looking is a skill rather than a step, so any step may do it: a step of its own could only look at
pictures another step took, and could not send the change round again.

The steps name `ui-implementer`, `ui-reviewer` and `shipper`, in `workflows/agents/` with `implement.schema.json`: the role
keys above and the instructions are theirs, and the step files keep the wiring. Every file but this README is a
copy of the package's `packages/agent-orchestrator/workflows/ui/`, and its three agents of `packages/agent-orchestrator/workflows/agents/`,
which stay the package's shipped example, and a test holds the copy to them; the package README,
*`workflows/ui/`: a change a person will see*, says more.

```bash
wf start "<what to do>" --workflows workflows/ui
```

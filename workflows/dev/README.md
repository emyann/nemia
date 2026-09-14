# dev

Implement what was asked, then a second engineer reviews it, round again while the review finds
something worth another round, three rounds at most. Implement is verified by npm test and npm run
typecheck.

```
implement ⇄ review
```

`implement` runs on Claude (opus), and its `check:` — `npm test && npm run typecheck` — is what makes
it verified, not its word. `review` runs on Claude (opus), fenced by machinery rather than
by its brief: `tools: Read, Grep, Glob, Bash, Skill, WebFetch, WebSearch` in `permissionMode: dontAsk`, so it
has no tool that writes and a command `.claude/settings.json` does not allow is denied without a prompt.
The settings allow `npm run build` and `npm run e2e` for implement's sake, and both write into the
workspace, so review is denied those two by name — `disallow: Bash(npm run build), Bash(npm run e2e)`,
passed as `--disallowedTools`, which beats the settings' allow. `implement` is denied `SendMessage`,
`CronCreate`, `CronDelete` and `RemoteTrigger`, which no step needs. `review`'s findings are its closeout
(`review.schema.json`), and its `again: true` sends the change round again: implement's own session is
continued with the findings, then a new review. After the third round, a person decides.

`review.md` is the package's reviewer (`packages/agent-workflows/workflows/review.md`) moved onto
Claude, with the paragraph saying which commands it may run; `review.schema.json` is the package's.

```bash
wf start "<what to do>" --workflows workflows/dev
```

For a change the web app builds from, `dev-build`; for a change a person will see, `ui`.

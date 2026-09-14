# dev

Implement what was asked, then a second engineer reviews it, round again while the review finds
something worth another round, three rounds at most. Implement is verified by npm test and npm run
typecheck.

```
implement ⇄ review
```

`implement` runs on Claude (opus), and its `check:` — `npm test && npm run typecheck` — is what makes
it verified, not its word. `review` runs on Claude (opus) and has no tool that writes and may run only the commands the project settings allow — which, for implement's sake, include `npm run build` and `npm run e2e`, so only its brief keeps it from those two — rather than
by its brief: `tools: Read, Grep, Glob, Bash` in `permissionMode: dontAsk`, so a command
`.claude/settings.json` does not allow is denied without a prompt. Its findings are its closeout
(`review.schema.json`), and `again: true` sends the change round again: implement's own session is
continued with the findings, then a new review. After the third round, a person decides.

`review.md` is the package's reviewer (`packages/agent-workflows/workflows/review.md`) moved onto
Claude, with the paragraph saying which commands it may run; `review.schema.json` is the package's.

```bash
wf start "<what to do>" --workflows workflows/dev
```

For a change the web app builds from, `dev-build`; for a change a person will see, `ui`.

# ui

For a change a person will see in the web app: implement it and photograph every page, have the code
reviewed and the screenshots looked at side by side, then implement answers both reviews.

```
implement ──► review (codex, read-only: the code)       ──┐
          └─► look   (claude: implement's screenshots)   ──┴─► respond (resumes implement)
```

`implement` and `respond` carry `check: npm test && npm run typecheck && npm run build && npm run e2e`,
and `implement` declares the screenshots it read and the pages they show (`implement.schema.json`).
`look` is handed those and nothing else of implement, reads the images with `tools: Read, Grep, Glob`,
and declares its findings by page and theme. `review` runs on codex in `permissionMode: read-only`.
`respond` continues implement's session and answers both in `RESPONSE.md`.

Every file but this README is a copy of the package's `packages/agent-workflows/workflows/ui/`, which
stays the package's shipped example; the package README, *`workflows/ui/`: a change a person will
see*, says more.

```bash
wf start "<what to do>" --workflows workflows/ui
```

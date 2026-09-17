# dev-planned-build

`dev-planned` for a change the web app builds from: plan the change before anyone makes it, then implement
it and have a second engineer review it, with implement verified by the build and the e2e as in `dev-build`.

```
plan → implement ⇄ review → ship
```

Every file but this README and `implement.md`'s `check:` is `dev-planned`'s, and that folder's README says
how the plan step works: read-only, on `WebFetch` and `WebSearch`, its closeout the plan (`plan.schema.json`),
and `blocked` with a question in `needs` when the brief admits two readings or says to wait for approval of
the plan. Implement's check is `dev-build`'s: `npm test && npm run typecheck && npm run build && npm run e2e`,
so a new route is built before it is typechecked and every page is visited in both themes. `ship` is
`dev-build`'s, file for file: the run's ending, gated, whose trial merge is run against that same check.

```bash
wf start "<what to do>" --workflows workflows/dev-planned-build
```

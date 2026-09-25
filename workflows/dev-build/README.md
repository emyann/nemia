# dev-build

Implement what was asked, then a second engineer reviews it, as in dev, for a change the web app
builds from: implement is verified by npm test, npm run typecheck and npm run build, and the merge by npm run e2e too.

```
implement ⇄ review → ship
```

The same two steps as `dev`, and one difference: `implement`'s `check:` is
`npm test && npm run typecheck && npm run build`, then `npm run e2e` where no `WF_BASE_REF` is set, whatever
the work touched. A round's check, which the run gives `WF_BASE_REF`, builds and runs no e2e; the ship's, on the
merged tree, runs both (`dev`'s README says why the line keys on that variable). `dev` runs the same build and
e2e when git says the work touched the web app (its README says which paths); this folder is for the person who
wants them run regardless. The build regenerates the web app's
route tree, which a new route needs before it typechecks, and the e2e builds the app, serves it
against a seeded store and visits every page in a light and a dark theme. `review` is `dev`'s, and
is denied both by name by its `disallowedTools:` line: both write into the workspace. By those names only — `dev`'s
README says which of the settings' allows still reach them.

`ship` is `dev`'s, with this folder's check as its `check:`: the run executes implement's line on the merge
ship stages, the e2e included, since the merged tree is the first tree either branch has built and no round's
check ran the e2e at all. `dev`'s README says what the step is.

```bash
wf start "<what to do>" --workflows workflows/dev-build
```

For a change a person will look at, `ui` also has the screenshots read.

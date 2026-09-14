# dev-build

Implement what was asked, then a second engineer reviews it, as in dev, for a change the web app
builds from: implement is verified by npm test, npm run typecheck, npm run build and npm run e2e.

```
implement ⇄ review
```

The same two steps as `dev`, and one difference: `implement`'s `check:` is
`npm test && npm run typecheck && npm run build && npm run e2e`. The build regenerates the web app's
route tree, which a new route needs before it typechecks, and the e2e builds the app, serves it
against a seeded store and visits every page in a light and a dark theme. `review` is `dev`'s, and
does not run either: both write into the workspace.

```bash
wf start "<what to do>" --workflows workflows/dev-build
```

For a change a person will look at, `ui` also has the screenshots read.

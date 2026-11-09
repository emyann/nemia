# tools/guards — the repository's own guards

The tests that hold this repository itself — its CI configuration, its docs, its skills, its test infrastructure — rather than the
code of a layer. A tool beside the layers, not a layer: no package or app imports it, and it is never shipped.

- **Its suite is its `test` script**: `npm test` from `tools/guards`, or `npx turbo run test --force --filter=guards`. One file:
  `node --test test/<file>` from `tools/guards`.
- **CI runs its suite only when it is due**: the `guards` job of `.github/workflows/ci.yml` runs `due.ts`, which reads the range a push
  or a pull request changed and says `due=true` when a path is named by the `guards#test` task's `inputs` in `turbo.json`, or lies
  under the folder of a workspace package the guards depend on (`agent-orchestrator`, and through it `agent-runtime`). It fails
  closed: an event with no range, a branch's first push and a range git cannot resolve are due. An input of a shape it does not read
  (`{a,b}`, `**/x`, `?`, `[`) is refused, so a new path a guard reads goes in those `inputs` in a shape it reads — turbo's cache and
  CI's filter are one list, and `test/due.test.ts` reads the real one. The apps' whole `src/`, their `.ts` beside their manifest, the
  board's `.storybook/` and their `glossary.json` are in it, for the glossary guard, so a change to the board's code makes them due.
- **It reaches the orchestrator only through its three entries** (rule 1, `docs/architecture.md`; `contract.test.ts` holds it, here
  too): `team-words` takes `splitFrontmatter` from `agent-orchestrator/workflow`, `board-skill` that and `skillEntryOf`, and `store-measure` its `Place` type, which is why
  `package.json` declares `agent-orchestrator`. `team-words` reads sdlc's role skills (`packages/templates/sdlc/skills`); sdlc's
  agents, workflows and skills are held whole by `packages/templates/test`. A config guard that imports the package deeper stays in
  `packages/agent-orchestrator/test/`: `agent-fences`, `frozen-step`, `mcp-config`, `nemia-shipped`, `skills-rendered`,
  `skill-folders`, `verbs-skill`, `quick-run`, `tally-start`, `observe`, `profile`, `workflow`; so do `stand-ins` and the
  orchestrator's own test-seat tests, and `observe-render.boundary`, a test of `tools/observe`'s code rather than of the configuration.
- **Its helpers are the test kit's** (`tools/test-kit`): a test makes its roots with `scratch(prefix)` of `test-kit/scratch`, never
  under `os.tmpdir` by hand, and takes the root, the workspaces and git's file list from `test-kit/repo`, whose `REPO` and
  `workspaces` spawn nothing. No test imports a helper of another workspace's `test/`; `test/test-kit.test.ts` holds both, and the
  kit's own boundary, over every workspace.
- **The repository-wide guards live here**: `names`, `others` and `local-paths` read every file git lists, `comments` and `limits`
  run oxlint with `.oxlintrc.json` and `lint/` over every package's code. `turbo.json` lists what they read among `guards#test`'s
  inputs.
- **`test/test-rules.baseline.ts` only shrinks**: the pinned-words debt left is the runtime's, the api's and the web's; the
  orchestrator's is gone.
- **`test/glossary.baseline.ts` only shrinks**: a change that removes a retired spelling from a file lowers its count there in the same
  commit, and takes the entry off where none is left; a new retired row in a glossary table adds its files' counts the day it lands
  (`test/glossary.test.ts`).
- **`test/closed-state.baseline.ts` only shrinks**: it holds, by key, each field at a door that says a state or a kind as a `string`
  (`test/closed-state.test.ts`). A change that closes a field takes its entry off in the same commit, and a rename moves its key with it;
  a new field at a door is typed as a closed union named in its glossary, never added to the baseline. Today's printout:
  `node tools/guards/test/closed-state.ts`.

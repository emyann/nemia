# tools/guards — the repository's own guards

The tests that hold this repository itself — its CI configuration, its docs, its workflows, its test infrastructure — rather than the
code of a layer. A tool beside the layers, not a layer: no package or app imports it, and it is never shipped.

- **Its suite is its `test` script**: `npm test` from `tools/guards`, or `npx turbo run test --force --filter=guards`. One file:
  `node --test test/<file>` from `tools/guards`.
- **CI runs its suite only when it is due**: the `guards` job of `.github/workflows/ci.yml` runs `due.ts`, which reads the range a push
  or a pull request changed and says `due=true` when a path is named by the `guards#test` task's `inputs` in `turbo.json`, or lies
  under the folder of a workspace package the guards depend on (`agent-orchestrator`, and through it `agent-runtime`). It fails
  closed: an event with no range, a branch's first push and a range git cannot resolve are due. An input of a shape it does not read
  (`{a,b}`, `**/x`, `?`, `[`) is refused, so a new path a guard reads goes in those `inputs` in a shape it reads — turbo's cache and
  CI's filter are one list, and `test/due.test.ts` reads the real one. The apps' whole `src/` and their `glossary.json` are in it, for
  the glossary guard, so a change to the board's source makes the guards due.
- **It reaches the orchestrator only through its three entries** (rule 1, `docs/architecture.md`; `contract.test.ts` holds it, here
  too): `team-words` and `team-portable` take `splitFrontmatter` from `agent-orchestrator/workflow`, which is why `package.json`
  declares `agent-orchestrator`. A config guard that imports the package deeper stays in `packages/agent-orchestrator/test/`:
  `agent-fences`, `build-told`, `frozen-step`, `mcp-config`, `nemia-shipped`, `skills-rendered`, `skill-folders`, `verbs-skill`,
  `quick-run`, `tally-start`, `observe`, `profile`, `workflow`, and the `landing`, `pull-request`, `quick-check`, `probe` and
  `pictures` boundaries; so do `stand-ins` and the orchestrator's own test-seat tests, and `observe-render.boundary`, a test of
  `tools/observe`'s code rather than of the configuration.
- **Helpers are copies, held byte for byte by `packages/agent-orchestrator/test/scratch.test.ts`**: `test/scratch.ts` (the runtime's),
  `test/repo-files.ts` and `test/workspaces.ts` (the orchestrator's). Change the original and copy it over; nothing imports a test
  helper across workspaces. A test makes its roots with `scratch(prefix)`, never under `os.tmpdir` by hand, and takes the root and
  the workspaces from `workspaces.ts`, which spawns nothing.
- **`test/test-rules.baseline.ts` only shrinks**: the pinned-words debt left is the runtime's, the api's and the web's; the
  orchestrator's is gone.
- **`test/glossary.baseline.ts` only shrinks**: a change that removes a retired spelling from a file lowers its count there in the same
  commit, and takes the entry off where none is left; a new retired row in a glossary table adds its files' counts the day it lands
  (`test/glossary.test.ts`).

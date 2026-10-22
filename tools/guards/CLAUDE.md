# tools/guards — the repository's own guards

The tests that hold this repository itself — its CI configuration, its docs, its workflows — rather than the code of a layer. A tool
beside the layers, not a layer: no package or app imports it, and it is never shipped.

- **Its suite is its `test` script**: `npm test` from `tools/guards`. One file: `node --test test/<file>` from `tools/guards`.
- **CI runs its suite only when it is due**: `due.ts` reads the range a push or a pull request changed and says `due=true` when a path
  is named by the `guards#test` task's `inputs` in `turbo.json`, or lies under the folder of a workspace package the guards depend on.
  It fails closed: an event with no range, a branch's first push and a range git cannot resolve are due. An input of a shape it does
  not read (`{a,b}`, `**/x`, `?`, `[`) is refused, so a new path a guard reads goes in those `inputs` in a shape it reads.
- **A test makes its roots with `scratch(prefix)`** (`test/scratch.ts`, a byte-equal copy of each package's), never under `os.tmpdir`
  by hand.

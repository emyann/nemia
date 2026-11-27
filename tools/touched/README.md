# tools/touched — the tests a change touched, and nothing else

A session's measure, never run by the suite or CI. It runs the tests the branch's change reaches, per workspace, and never a whole
suite.

```sh
npm run touched                       # the tests the change since main-worktree/HEAD reaches
npm run touched -- --dry              # what would run, and nothing run
npm run touched -- --base origin/main # the change since another base
npm run touched -- packages/objects/test/run.test.ts   # only the named files
```

The change is every file that differs between the merge base of the base and the working tree, committed or not, and every file git
does not track yet. For each workspace holding a changed file and a `vitest.config.ts`, one at a time, Vitest's Node API lists the
test files that import one of its changed files (a changed test file is its own); the tool prints them, then runs
`vitest related --run <the workspace's changed files>` under `nice`, in the workspace's folder and under its own config. In
`apps/web` only the `node` project runs. A change that reaches every test file of a workspace (its config, a seat) is said and not run:
CI runs it. A file outside every workspace (a doc, `tools/coverage/`) is named and reached by no import: the tests that read a file by
its path are found by grepping, and CI runs them. A named test file runs alone, and is refused (exit 2) unless it is a test of a
workspace the change touched.

It exits 0 when what ran passed or nothing was due, 1 when a test file failed, naming each, and 2 when it was not asked what it runs.
Its code and `tools/guards/test/touched.boundary.test.ts`, which plans over a scratch repository with a stub `vitest`, hold it.

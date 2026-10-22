# tools/coverage — a package's coverage per file, and two records compared

A session's measure, never run by the suite or CI. Around a change that touches tests alone, it records a package's line and branch
coverage per source file before and after, and says whether any file's coverage fell: the hit lines and branches are compared exactly,
never as percentages, since the sources do not move.

```sh
node tools/coverage/record.ts packages/agent-orchestrator --out before.json
node tools/coverage/compare.ts before.json after.json
```

`record.ts` runs the package's own `test` script in its folder (no shard: `WF_TEST_SHARD` is unset), with Node's
`--experimental-test-coverage` and an lcov reporter put right after its `node`, keeps the package's own sources (no test file, nothing
under `test/`, no fixture, nothing outside the folder) and writes the record; it exits with the suite's exit code. `compare.ts` exits 0
when nothing fell, 1 naming each file that fell and the lines it lost, 2 when its arguments are not two records. Its code and
`tools/guards/test/coverage*.test.ts` hold it.

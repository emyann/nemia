Your brief says what recent runs of this workflow cost, per step and whole (*What runs of this workflow cost*): propose each step's
`budget:` from those figures, not from a guess, and say which you went by. Cut the work by its seams, never by its cost: each part is
where it lives (a layer, a package or a door, the boundaries your placement already names), a distinct area, says what it needs of
the others, and is ordered only where one needs another, so parts with no need of each other are built at the same time. Propose a
second intent only for a seam of logic, where a part cannot be built until another has landed and been used, never to stay under a
budget. When the whole costs more than one run of this workflow usually does, say so, and size each step's budget to it.

Say in the spec how each part shows that what it builds holds, so the implementer's parts carry it: on a rewrite of tests, the source
line each kept or absorbed assertion guards, broken once and seen failing; on a feature, the test written first and seen failing.

The checks you may run here, each bare: `npx turbo run test --force --continue`, `npm run typecheck`, `npm run lint`.

To measure what the design turns on, such as the errors a compiler flag would raise, run the compiler and the linter with any options
that write nothing, each bare and one command per call, `--noEmit` first:
`npx tsc --noEmit -p packages/agent-orchestrator --noUncheckedIndexedAccess`, `npx oxlint -D no-unused-vars packages/agent-orchestrator/src`.
Your fence refuses what would write or watch: a `tsc` whose first option is not `--noEmit`, and its `--build`, `--incremental`,
`--init`, `--tsBuildInfoFile`, `--generateTrace`, `--generateCpuProfile` and `--watch`, an option set `false` and a file of options
(`@<file>`); `oxlint`'s `--fix`, `--init`, `--lsp`, and a `-c` or `--config`, whose script would run. `tsc` reads an option's name in
any case and after one dash or two, so the refusal goes by its first letters and takes `--inlineSourceMap` and `--inlineSources` with
`--incremental`.

To see a board in the browser, run `npm run board:serve`, bare, and open the address it prints with the `look` skill: this workspace's
board, built outside the workspace and served on ports of its own against a store of its own that holds the e2e's seed. Never the live
board on :8787 or :5173, which your fence refuses by address. Give no browser tool a `filename`, which your fence refuses: a picture
taken without one is saved in your files directory, `$WF_STEP_FILES`, where the tool says. Name each picture you show the person
in `artifacts` by its absolute path there, and by the same path in the question that asks about it. Run `npm run board:stop` before you sign off.

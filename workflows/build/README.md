# build

Build an accepted intent into working, reviewed code on main. Seldon writes the spec, which a person approves; Ada builds it; Agora
reviews it and sends it back while a finding is worth a round, three at most; Otto lands it, once a person approves the landing.

```
design → implement ⇄ review → land
```

Implement's check runs the mutants Ada's closeout names (`mutants.ts`, read from the run's base, never from the tree it judges): each on a
copy of her result, and a mutant its test does not kill refuses the step.

Where the work touches `apps/web/` or `apps/api/`, or the root's `package.json`, `package-lock.json` or `turbo.json`, implement's check
runs the whole e2e (`npm run e2e`, which builds the app), so a round reaches review with the board's pages passed; land's check runs it
again on the merged tree.

It also runs `pictures.ts`, read from the base as well, first: a change under `apps/web/src` touches the board's pages, and refuses the
step unless the closeout's `artifacts` names a picture, an image file (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.avif`) of more than 0
bytes, by an absolute path in the step's files directory (`WF_ARTIFACTS`) or from the workspace root. The refusal names the command that
takes them, `npm run e2e -- --photos --pages <name,…>`. A change only under `apps/web/test` asks for none.

The same script asks a change under `tools/observe` that a dashboard reads for its dashboards rendered: each
`tools/observe/dashboards/<name>.json` changed owes `dashboard-<name>.png` and `dashboard-<name>.txt` in `artifacts`, and any other path
there but `README.md` and `profile/`, one such pair at least. The refusal names the command that writes them, `node
tools/observe/render/render.ts --out <files>`, which implement alone may run; implement and review are given `see-a-dashboard`, this
repository's skill for reading them.

It runs `probe.ts`, read from the base as well: a session a step starts to measure something, a probe, is named `<run>-probe-<label>`
(`node workflows/build/probe.ts start <label> -- <prompt>`), runs in the machinery's trusted folder `$WF_ROOT/probes`, and says in its
first message whether the person must act; it reaches the person's phone through Remote Control only with `--answer`, and the step then
stops `blocked` on the `needs` line it prints. The check refuses while a probe named for the run is live, naming `probe.ts stop`. Ada's
and Otto's fences refuse a bare `claude --bg` or Remote Control, and an edit of a harness's trust or local settings anywhere.

Review counts what it closes out on (`tally: findings, findings.kind=placement, mutants.proves`): the findings of each round, those of
them whose `kind` is `placement` (a change in a boundary the repository's rules give to another concern), and the mutants it judged to
prove their rule. `wf stats` totals each per day, `—` on a day no review closed out.

Land's check runs the tests and the typecheck forced (`turbo run … --force`) on the merged tree, so a change turbo does not hash, such as a
doc or a workflow file, cannot land on a pass turbo replays from its cache.
Implement's check runs the tests forced too (`npm test -- --force`): it is the round's one run of the whole suite, its session running
only the tests of what it changed, and a round that changes only such a file must not pass on the last round's replay.

Start it after the intake run whose intent it builds: `wf start "<the intent's title>" --workflows build --after <intake-run>`. Its
first step, design, is told the intent under *From run*; the steps after it read the spec.

Design reads `costs` (`reads: costs`): its brief says what the last finished runs of build in its factory cost, per step and whole. Its
note asks for the cut and each step's budget from those figures; the owner's line for a run is the factory's, given by its rules
(`nemia factory rules <factory>`), never by this folder.

The agents and their skills are any software factory's, and say nothing of this repository (`team-portable.test.ts`); what is ours is on
the steps (`build-told.test.ts`). Implement and review each declare their own closeout (`output:`, `implement.schema.json` and
`review.schema.json` beside them): the mutants are this workflow's check, and review's schema is the reviewer's with `mutants` added.
Both add `look`, this repository's skill for its board, to the skills design, implement and review are given. Design and review deny
the build and the e2e on their own `disallowedTools:`, and review the whole suite, which implement's check already ran; the checks
they do run are named in their notes and allowed by `.claude/settings.json`.

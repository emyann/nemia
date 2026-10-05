# build

Build an accepted intent into working, reviewed code on main. Seldon writes the spec, which a person approves; Ada builds it; Agora
reviews it and sends it back while a finding is worth a round, three at most; Otto lands it, once a person approves the landing.

```
design → implement ⇄ review → land
```

Implement's check runs the mutants Ada's closeout names (`mutants.ts`, read from the run's base, never from the tree it judges): each on a
copy of her result, and a mutant its test does not kill refuses the step.

It also runs `pictures.ts`, read from the base as well, first: a change under `apps/web/src` touches the board's pages, and refuses the
step unless the closeout's `artifacts` names a picture, an image file (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.avif`) of more than 0
bytes, by an absolute path in the step's files directory (`WF_ARTIFACTS`) or from the workspace root. The refusal names the command that
takes them, `npm run e2e -- --photos --pages <name,…>`. A change only under `apps/web/test` asks for none.

Review counts what it closes out on (`tally: findings, findings.kind=placement, mutants.proves`): the findings of each round, those of
them whose `kind` is `placement` (a change in a boundary the repository's rules give to another concern), and the mutants it judged to
prove their rule. `wf stats` totals each per day, `—` on a day no review closed out.

Land's check runs the tests and the typecheck forced (`turbo run … --force`) on the merged tree, so a change turbo does not hash, such as a
doc or a workflow file, cannot land on a pass turbo replays from its cache.

Start it after the intake run whose intent it builds: `wf start "<the intent's title>" --workflows build --after <intake-run>`. Its
first step, design, is told the intent under *From run*; the steps after it read the spec.

Design reads `costs` (`reads: costs`): its brief says what the last finished runs of build in its factory cost, per step and whole. Its
note gives the owner's line, about $80 a run, and asks for the cut and each step's budget from those figures.

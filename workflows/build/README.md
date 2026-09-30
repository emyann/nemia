# build

Build an accepted intent into working, reviewed code on main. Seldon writes the spec, which a person approves; Ada builds it; Agora
reviews it and sends it back while a finding is worth a round, three at most; Otto lands it, once a person approves the landing.

```
design → implement ⇄ review → land
```

Implement's check runs the mutants Ada's closeout names (`mutants.ts`, read from the run's base, never from the tree it judges): each on a
copy of her result, and a mutant its test does not kill refuses the step.

Land's check runs the tests and the typecheck forced (`turbo run … --force`) on the merged tree, so a change turbo does not hash, such as a
doc or a workflow file, cannot land on a pass turbo replays from its cache.

Start it after the intake run whose intent it builds: `wf start "<the intent's title>" --workflows build --after <intake-run>`. Its
first step, design, is told the intent under *From run*; the steps after it read the spec.

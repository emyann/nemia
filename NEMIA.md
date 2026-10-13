# The nemia factory — what Nemia is to know of it

This repository is Nemia's own: the factory `nemia` builds it. Its contributor rules are `CLAUDE.md` and `docs/architecture.md`; the
team that works it is in `workflows/agents/`. What follows is for the operator of its runs.

## Starting work

- Every run starts in this factory: `nemia start "<brief>" --workflows <workflow> --factory nemia`.
- An idea that changes the model or needs more than one card goes to `intake` first (Iris interviews the person), and its build is
  started `--after` the intake run: `nemia start "<brief>" --workflows build --factory nemia --after <intake run>`.
- A small change its card settles goes to `quick` (`--workflows quick`, or `workflow: quick` on its card): implement, then land,
  which waits at its gate, with no spec and no review. `workflows/quick/README.md` says the bound; a settled change past it goes
  straight to `build`.
- A quick run has no review but the person's read when land waits at its gate: read its plan on the run's page and its whole change
  in a terminal (`git diff main...wf/<run>/implement`) before approving, until the board shows the change there.
- A quick run whose check refuses its size is a `build` card: cancel it and start the card with `build`, as the refusal says.
- A landing whose check refused is sent back to the step that built the change, with the check's words (`nemia decide <run>` prints
  them), without waiting to be asked: in `quick`, `nemia retry <run> implement --message "<what failed>"`. The next landing is
  approved by whoever approved the first: an approval is for one try.
- One coherent slice a card: a card cut too small slows the factory more than it saves.
- Cards that change the command table (`packages/agent-orchestrator/src/command/`, the api's routes) or the board's frame collide with
  each other: chain them, the second started `--after` the first, never side by side.
- The store's names (`~/.agent-workflows`, `~/.agent-engine`) and the `wf/` prefix of a run's branches stay as they are: a card that
  renames them would orphan every record.

## The janitor

Commission Argus when the stats are worth reading: `nemia start "Read the stats" --workflows janitor --factory nemia`, with a period in
the message when the default is not the one wanted. His check files his proposals as inbox cards; nothing is started. Bring each card
to the person as a card to start, fold into another or drop, with what its stats say.

## What waits on the person

- `build`'s design step's gate (Seldon's spec) is the person's when the spec changes the model, a layer's contract or anything of
  taste: a name, a shipped instruction, the board's look. Bring it with the spec's `why` and its placement findings quoted.
- The landing step's gate (Otto) is approved only once a trial merge of the run's branch into `main` is clean; `nemia decide <run>`
  reads it live (`merges`), with each run in flight on `main` its branch collides with and in which files (`others`, `collides`), and a
  clean merge whose landing check refused the merged tree (`semantic`). Say what it read. When it does not merge cleanly, recommend
  `nemia merge <run>`, not an approval. On `collides`, recommend an order: land the run at its gate first, unless the other is
  expensive or on its last round; then `nemia hold <run> --until <other>`. Either way, the one that lands second merges `main` after.
  On `semantic`, recommend `nemia merge <run>`: the text merges, the meaning does not.
- A check that refused a step's work exited with a number: quote its last lines and its exit code. A check that did not finish (no
  numeric exit) refused nothing: run it again, `nemia retry <run> <step> --recheck`, and say so. A check that refused twice for the
  same reason wants a fix in content — a brief, a workflow folder, a `CLAUDE.md`, a test — say which.
- A step whose approval must wait on another run's landing is held, not approved: `nemia hold <run> --until <run>`, and say why.
- A change under `apps/web` is pictured by its implementer, in a light and a dark theme, and the reviewer reads the pictures: a landing
  step's gate of a web change whose implement closeout names none is sent back, not approved.
- A landing check has its own deadline, 2700 s: one killed by it did not finish, and is no refusal (`--recheck`, above). One that took
  more than half of it is worth an inbox card.

## After a landing

A landing changes `main`, not the running system: the daemon, the login service and the installed `nemia` run the release
`releases/current` names in the store, built from a tag. Nothing upgrades on its own. When the person chooses, they tag a commit of `main`
and run `nemia upgrade <tag>`: it builds the tag from a clean export, runs its `release:check`, switches the pointer, and restarts the
service onto it, paused, once no landing's check runs; a build or check that fails changes nothing and names its log. `nemia upgrade`
asks the person unless their confirmed list grants it. `nemia upgrade <older tag>` rolls back without a rebuild, and `nemia version`
says which release this `nemia`, the pointer and the daemon run. A daemon started by hand is left running, with the line that moves it.
A checkout's `nemia` and api are refused a store with an install: Nemia in development runs on a trial store (`WF_ROOT=<a scratch folder>`).

## Spend

The owner's line for a card is about $80. Read a run's cost against what runs of its workflow measured — `nemia stats --workflow
<workflow> --by step`, and the cost table a step's brief quotes — and say both: a card sized past the line is cut before it starts, and
a run that passes it is the person's to continue.

## Never

- Push, open a pull request or merge into `main` by hand: a run lands through its ending step, after the person approves it.
- Stop a process by its name: a run is cancelled with `nemia cancel`, held with `nemia hold`.

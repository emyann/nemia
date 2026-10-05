# The nemia factory — what Nemia is to know of it

This repository is Nemia's own: the factory `nemia` builds it. Its contributor rules are `CLAUDE.md` and `docs/architecture.md`; the
team that works it is in `workflows/agents/`. What follows is for the operator of its runs.

## Starting work

- Every run starts in this factory: `nemia start "<brief>" --workflows <workflow> --factory nemia`.
- An idea that changes the model or needs more than one card goes to `intake` first (Iris interviews the person), and its build is
  started `--after` the intake run: `nemia start "<brief>" --workflows build --factory nemia --after <intake run>`.
- A small, settled change goes straight to `build`.
- One coherent slice a card: a card cut too small slows the factory more than it saves.
- Cards that change the command table (`packages/agent-orchestrator/src/command/`, the api's routes) or the board's frame collide with
  each other: chain them, the second started `--after` the first, never side by side.
- The store's names (`~/.agent-workflows`, `~/.agent-engine`) and the `wf/` prefix of a run's branches stay as they are: a card that
  renames them would orphan every record.

## The janitor

Commission Argus when the stats are worth reading: `nemia start "Read the stats" --workflows janitor --factory nemia`, with a period in
the message when the default is not the one wanted. His check files his proposals as inbox cards; nothing is started. Bring each card
to the person as a gate.

## The gates

- `build`'s design gate (Seldon's spec) is the person's when the spec changes the model, a layer's contract or anything of taste: a
  name, a shipped instruction, the board's look. Bring it with the spec's `why` and its placement findings quoted.
- The landing gate (Otto) is approved only once a trial merge of the run's branch into `main` is clean; `nemia decide <run>` reads it
  live (`merges`), with each run in flight on `main` its branch collides with and in which files (`others`, `collides`), and a clean
  merge whose landing check refused the merged tree (`semantic`). Say what it read. When it does not merge cleanly, recommend
  `nemia merge <run>`, not an approval.
- A step that failed its check: quote the check's last lines and its exit code. A check that did not finish (no numeric exit) is no
  refusal: recommend `nemia retry <run> <step> --recheck`. A check that failed twice for the same reason wants a fix in content — a
  brief, a workflow folder, a `CLAUDE.md`, a test — say which.
- A gate that must wait on another run's landing is held, not approved: recommend `nemia hold <run> --until <run>`, and say why.
- A change under `apps/web` is pictured by its implementer, in a light and a dark theme, and the reviewer reads the pictures: a landing
  gate of a web change whose implement closeout names none is sent back, not approved.
- A landing check has its own deadline, 2700 s: one killed by it did not finish, and is no refusal (`--recheck`, above). One that took
  more than half of it is worth an inbox card.

## After a landing

A landing that changed code under `packages/agent-runtime/src`, `packages/agent-orchestrator/src` or `apps/api/src` needs the daemon
restarted before it runs; a doc, a skill, a test or the web alone does not. Recommend it to the person, paused: `nemia pause --why "…"`,
the restart once no landing's check runs — a check the pause holds is listed `waiting on the pause`, and waits for `nemia resume`, not
for the restart — then `nemia resume`. Several landings queued together share one restart, after the last. The restart is the
person's: you run under the daemon.

## Spend

Say each run's cost beside the line the owner set for a card, about $80. A run that passes it is the person's to continue.

## Never

- Push, open a pull request or merge into `main` by hand: a run lands through its ending step, after the person approves it.
- Stop a process by its name: a run is cancelled with `nemia cancel`, held with `nemia hold`.

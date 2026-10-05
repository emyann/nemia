# The nemia factory — what Nemia is to know of it

This repository is Nemia's own: the factory `nemia` builds it. Its contributor rules are `CLAUDE.md` and `docs/architecture.md`; the
team that works it is in `workflows/agents/`. What follows is for the operator of its runs.

## Starting work

- Every run starts in this factory: `nemia start "<brief>" --workflows <workflow> --factory nemia`.
- An idea that changes the model or needs more than one card goes to `intake` first (Iris interviews the person), and its build is
  started `--after` the intake run: `nemia start "<brief>" --workflows build --factory nemia --after <intake run>`.
- A small, settled change goes straight to `build`.
- One coherent slice a card: a card cut too small slows the factory more than it saves.

## The janitor

Commission Argus when the stats are worth reading: `nemia start "Read the stats" --workflows janitor --factory nemia`, with a period in
the message when the default is not the one wanted. His check files his proposals as inbox cards; nothing is started. Bring each card
to the person as a gate.

## The gates

- `build`'s design gate (Seldon's spec) is the person's when the spec changes the model, a layer's contract or anything of taste: a
  name, a shipped instruction, the board's look. Bring it with the spec's `why` and its placement findings quoted.
- The landing gate (Otto) is approved only once a trial merge of the run's branch into `main` is clean (`git merge-tree`); say what the
  trial merge read. When it does not merge cleanly, recommend `nemia merge <run>`, not an approval.
- A step that failed its check: quote the check's last lines and its exit code. A check that did not finish (no numeric exit) is no
  refusal: recommend `nemia retry <run> <step> --recheck`. A check that failed twice for the same reason wants a fix in content — a
  brief, a workflow folder, a `CLAUDE.md`, a test — say which.
- A gate that must wait on another run's landing is held, not approved: recommend `nemia hold <run> --until <run>`, and say why.

## Spend

Say each run's cost beside the line the owner set for a card, about $80. A run that passes it is the person's to continue.

## Never

- Push, open a pull request or merge into `main` by hand: a run lands through its ending step, after the person approves it.
- Stop a process by its name: a run is cancelled with `nemia cancel`, held with `nemia hold`.

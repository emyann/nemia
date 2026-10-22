# The nemia factory — what Nemia is to know of it

This repository is Nemia's own: the factory `nemia` builds it. Its contributor rules are `CLAUDE.md` and `docs/architecture.md`; the
team that works it is in `workflows/agents/`. What follows is for the operator of its runs.

## Starting work

- Every run starts in this factory: `nemia start "<brief>" --workflows <workflow> --factory nemia`.
- An idea that changes the model or needs more than one card goes to `intake` first (Iris interviews the person), and its build is
  started `--after` the intake run: `nemia start "<brief>" --workflows build --factory nemia --after <intake run>`.
- A small change its card settles goes to `quick` (`--workflows quick`, or `workflow: quick` on its card): implement, then a review,
  then a landing nobody is asked to approve — Agora's pass files it. `workflows/quick/README.md` says the bound; a settled change past
  it goes straight to `build`.
- A quick run is read by Agora, not by the person: there is nothing to bring you for its landing, and `nemia approve` is refused
  there (*What waits on the person*, below, says what is still yours on such a run, and how to ask to read one yourself).
- A quick run whose check refuses its size is a `build` card: cancel it and start the card with `build`, as the refusal says.
- A landing whose check refused is sent back to the step that built the change, with the check's words (`nemia decide <run>` prints
  them), without waiting to be asked: in `quick`, through the review's loop, `nemia retry <run> review --message "<what failed>"` —
  implement is verified and its follower filed, so `nemia retry <run> implement` is refused there. On `build`, the next landing is
  approved again by whoever approved the first: an approval is for one try. On `quick` the review is filed again with the objection,
  sends the work round implement when it asks for a round, and its pass files the landing, with nobody to approve. A landing refused
  for what was not the work — a dirty checkout, a flaky test — is shipped again as it stands: `nemia retry <run> land`.
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
- **A `quick` run's landing is not gated at all, and waits on nobody**: its review's pass files land on the next tick, and `nemia
  approve <run> land` is refused there ("what waits on it is filed once it has passed its check, with nobody's approval, so there is
  nothing to approve"). There is nothing to bring the person about it. What is still theirs on such a run: a check that refused, a
  review that asked twice and is `exhausted` (`nemia round <run> review`, or `nemia accept <run> review`), and a landing that refused —
  which goes back through the review, `nemia retry <run> review --message "<what failed>"`, or ships again, `nemia retry <run> land`. A person who wants to read a quick change
  before it lands says so when the run starts — `nemia start … --gate land`, or the card's own `gate:` line naming land — and then
  everything below holds for that run as for a build run.
- The landing step's gate (Otto, on `build` and on a quick run gated at it) is approved only once the run's own pull request is green
  and mergeable on GitHub: open it — its
  address is on the implement closeout as an artifact — and read that the `ci` context passed on the head the review read. `nemia
  decide <run>` reads the trial merge live too (`merges`), with each run in flight on `main` its branch collides with and in which
  files (`others`, `collides`), and a clean merge whose landing check refused the merged tree (`semantic`). Say what both read. When it
  does not merge cleanly, or `ci` is red or missing, recommend `nemia merge <run>` or a round of implement, not an approval: the
  landing refuses anything but a green pull request, so an approval given over a red one only spends a session. On `collides`,
  recommend an order: land the run at its gate first, unless the other is expensive or on its last round; then `nemia hold <run>
  --until <other>`. Either way, the one that lands second merges `main` after.
  On `semantic`, recommend `nemia merge <run>`: the text merges, the meaning does not.
- A check that refused a step's work exited with a number: quote its last lines and its exit code. A check that did not finish (no
  numeric exit) refused nothing: run it again, `nemia retry <run> <step> --recheck`, and say so. A check that refused twice for the
  same reason wants a fix in content — a brief, a workflow folder, a `CLAUDE.md`, a test — say which.
- A step whose approval must wait on another run's landing is held, not approved: `nemia hold <run> --until <run>`, and say why.
- A change under `apps/web` is pictured by its implementer, in a light and a dark theme, and the reviewer reads the pictures: a landing
  step's gate of a web change whose implement closeout names none is sent back, not approved.
- A landing check has its own deadline, 2700 s: one killed by it did not finish, and is no refusal (`--recheck`, above). It is a
  receipt now — the pull request merged with a merge commit, the checkout clean on the base, every branch of the run an ancestor of
  HEAD — and takes seconds, `ci` having judged the suite and the e2e on the head the review read. One that took more than half the
  deadline is worth an inbox card.

## After a landing

A landing merges the run's pull request on GitHub and fast-forwards `main` in the owner's checkout, both by the run: nothing is pushed
or merged by hand afterwards, and the head branch is GitHub's to delete.

It changes `main`, not the running system: the daemon, the login service and the installed `nemia` run the release
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

- Push, open a pull request or merge into `main` by hand: a run opens its pull request through `workflows/build/pull-request.ts` and
  merges it through `workflows/build/landing.ts`, at its ending step — after the person approves it, or, on `quick`, once its review
  passes.
- Stop a process by its name: a run is cancelled with `nemia cancel`, held with `nemia hold`.

/**
 * The manual of `nemia inbox`, which `nemia inbox --help` prints: every form of the inbox, what a card holds, and what each form refuses.
 * The bare read's words (`INBOX_READ_WORDS`, `commands-reads.ts`) carry it. Pure.
 */

/** `nemia inbox --help`: every form of the inbox, what a card is, and what is refused by name. */
export const INBOX_MANUAL = `nemia inbox [--all]
nemia inbox -l <key>=<value>... [--all] [--show-labels] [-L <key>]...
nemia inbox add "<idea>"|<file> [--workflow <name>] [--repo <path>] [--factory <name>] [--label <key=value>]...
nemia inbox queue <name> [--workflow <w>] [--off]
nemia inbox from <name> <run>... | --off
nemia inbox rm <name>

An inbox is cards before they are started: \${WF_ROOT:-~/.agent-workflows}/inbox/, one <name>.md per card, beside
runs/. A card is a plan's card with two differences — its keys optional, and no after:, since what it waits on
is said at start:

    ---
    workflow: dev              # what runs it, chosen at start when the card does not say
    repo: /home/me/code/app    # the repository it is about, as an absolute path
    queued: 2026-09-16T10:00:00.000Z   # when it was queued to start on its own: nemia inbox queue writes it
    gate: review               # the step whose closeout waits for nemia approve in the run it starts
    factory: acme              # the factory it is started in (nemia factory --help); required to start
    from: add-cache-a1b2       # runs its run is handed as context, comma-separated: read, never waited on
    labels: { team: core }     # a person's labels: what -l selects it by, copied to the run it starts
    ---
    Cache the engine's views between passes.

  nemia inbox       lists the cards still in play: its name, the first line of its body, its workflow and repo when
                 set, and started as <runId>, <phase> for a card a run's record says it was started as, the phase
                 its run is in now (waiting on you where it waits on a person): a started card stays in the inbox,
                 and is not started again. A card whose run ended (succeeded, failed, stopped, cancelled) is listed
                 with --all. An entry that does not read as a card is listed with why. -l keeps the cards whose keys match
                 (key=v, key!=v, "key in (a,b)", "key notin (a,b)", key), over its labels, workflow and factory,
                 given again for another; --show-labels adds its labels to its line, -L <key> that key's value.
  nemia inbox add   files an idea, text or a file, named with the slug a run id makes of its first line, suffix and
                 all; --workflow, --repo and --factory write the keys, over a file's own; --label key=value (or
                 key-) edits its labels:, over a file's own and what the runs of its from: agree on.
  nemia inbox queue marks a card to start on its own: each pass, once every run has been advanced and a run slot is
                 free (WF_MAX_RUNS; always, with no cap), the tick starts the oldest queued card, one per pass, on its
                 workflow:, in its factory:, on its repo:, else its factory's one repository, else the directory nemia up
                 runs in. --workflow writes the key too; --off, or nemia inbox rm, takes the card back. nemia inbox says
                 queued and its place; a start the package refused is said there and on nemia up's line, and the card is
                 not tried again until it is edited or queued again (or, with no repository named by the card or its
                 factory, nemia up runs in another repository); a start that failed otherwise is said once, and tried
                 again on the next pass.
  nemia inbox from  sets the runs a card's run is handed as context (from:), each by its id, landed or still in
                 flight: what each concluded is read when the run's steps are filed, and none is waited on.
                 --off takes the key off.
  nemia inbox rm    drops a card without starting it. A name with no card says so, and which cards there are.

Refused by name: a key a card does not have, a key set to nothing, a repo: that is not an absolute path to a
directory, a queued: that is not a time or is on a card with no workflow:, a gate: naming more than one step or
saying true, a factory: that is not a factory's name — and, at start, a gate: naming no step of the workflow, a
card that names no factory and is started with no --factory, never one taken from its folder or its repo:, a
factory: the store does not have, default, or one that does not offer the workflow — an add with no idea, and a name that would
leave the folder; and a queue of a name with no card, of a card with no workflow and no --workflow, of one
already queued, of one a run was started from, and of one that names no factory, or default; a from: naming a run the store does not have, or one twice.`;

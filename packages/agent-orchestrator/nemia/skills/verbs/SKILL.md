---
name: verbs
description: Every nemia verb you run, by who answers for it — a read, yours unasked, one that prompts the person, one that answers what waits on them — with its usage and help.
---
# The verbs

Every verb `nemia` serves you, by who answers for it, with its usage and help as `nemia --help` prints them. `nemia <verb> --help`
says more of one that has a manual.

Generated from the command table, never edited by hand: from the repository's root, `node -e "import('./packages/agent-orchestrator/src/nemia/verbs.verb.ts').then((m) => process.stdout.write(m.verbsSkill()))" > packages/agent-orchestrator/nemia/skills/verbs/SKILL.md`.

## Reads

They write nothing: run them unasked, as often as you need. One that sets with some words prompts the person given them.

```text
  nemia concluded <runId>
                               what a run started with --from <runId> would be handed of it, now
  nemia inbox
                               the cards parked before they are started: name, first line, workflow
                               and repo when set, and started as <runId> (nemia inbox --help)
  nemia factory
                               the store's factories: the default first — every run and card that
                               names no factory, read, never written — then each by name with its
                               repositories (nemia factory --help)
  nemia factory ls
                               the same, by its name
  nemia factory instruction <name> [--path <path> | --store | --clear]
                               where a factory's instruction is kept: bare, prints it; --path reads it
                               from a file in the factory's first folder, --store keeps it in the
                               store, --clear reads NEMIA.md in the first folder again
                               reads bare; prompts the person given --path, --store, --clear
  nemia ls [<runId>]
                               runs and their steps — a run waiting on another says waiting on <run>,
                               one the cap on runs in flight holds waiting for a run slot (2 of 2 in
                               flight); what each step's tries and the run have cost, where measured;
                               last, whether a nemia up ticks the store and when its last pass was;
                               first, while the store is paused, Pausing: N finishing and each
                               session, check or landing at work, or Paused once none is, then each
                               check it holds, a landing with its merge staged in the checkout
                               (MERGE_HEAD) among them; a step whose check it holds says waiting on
                               the pause
  nemia show <runId>
                               the run, and what each step was told
  nemia logs <runId> <step>
                               that step's session output
  nemia feed [cursor]
                               what the tick judged, a line each time it changed: a run's status, a
                               step's word as nemia ls says it, and what a person's word changed — then
                               cursor: <n>, to read on from with nemia feed <n>; from the start with none
  nemia stats [--from <day>] [--to <day>] [--by agent|step|factory|workflow|repo] [--agent|--step|--factory|--workflow|--repo <v>] [--line|--json]
                               what every run in the store adds up to, by UTC day: rounds to
                               acceptance of each loop: step, landings of the workspace: main step
                               and on which try, cost and time per landed run, and each step's
                               tries, time, cost, checks and gate waits; first the last 14 days
                               against the 14 before. A number nothing measured reads —, never 0.
                               --line: one line, for a recap; --json: the whole answer
  nemia passes [--last <n>] [--json]
                               what the recent passes of the tick cost: their median and slowest
                               time, a histogram of their times, where the time went phase by
                               phase, and what the last saw — the runs in the store, its journal
                               reads, the sessions queued and admitted. --last <n>: the last n
                               passes only; --json: the whole answer
  nemia series [--range 24h|7d|30d|all] [--json]
                               the system's series over a range: a pass's time and its phases, its
                               journal reads, the runs in the store, the sessions queued and admitted
                               and the longest wait, the load, and the quota used. --range: 24h (a
                               point a minute, the default), 7d or 30d (an hour), all (a day);
                               --json: the whole answer
  nemia agents [--repo .]
                               the agents a step may name, the repository's then yours: what each is
                               for, what it says it can do (an entry for each skill, read off its
                               SKILL.md), and the skills it is given (its skills:)
  nemia agents card <name> [--repo .] [--from repo|yours]
                               that agent in the shape of an A2A Agent Card, JSON on stdout and
                               nothing else — every field the protocol marks REQUIRED but
                               supportedInterfaces, which is left out because nothing here serves an
                               agent over A2A. The card describes; it is not an address
  nemia agents custom <name> [--file <path>|-] [--clear] [--repo .]
                               your custom instructions for that agent: words you add to it without
                               rewriting it, kept in <store>/custom-instructions/<name>.md and told
                               after its instructions. Bare, prints them; --file writes them (- for
                               stdin); --clear removes them. Words only: a frontmatter block is
                               refused. A run keeps the words it was started with
                               reads bare; prompts the person given --file, --clear
  nemia level [manual|semi-auto]
                               Nemia, the store's own agent: bare, where she is and how to reach her;
                               semi-auto keeps her session: what waits on you (a gate, a step's question,
                               a loop out of rounds, a cap) is asked of you, and a write that cannot be
                               undone or changes your settings or a factory; the rest is hers;
                               manual stops it
                               reads bare; prompts the person given manual, semi-auto
  nemia memory [<fact>]
                               what Nemia keeps of the store: bare, her facts' names; given one, its
                               words. Read only: her session alone writes them
  nemia watch [cursor]
                               nemia feed's lines, followed as the tick writes them, until ^C
  nemia admit
                               a call's admission: the call a session is about to make, on stdin, answered
                               ask where it answers what waits on you
  nemia decide <runId> [--sensitive <globs>]
                               what the run produced, and the choice it leaves you (nemia decide --help)
```

## Yours

They write, and are yours to run unasked, on your judgement: say what you did.

```text
  nemia start <brief.md|card.md|"text"> [--workflows ./workflows] [--repo .] [--no-worktree] [--after <runId> ...] [--from <runId> ...] [--input <file> ...] [--gate <step> ...] [--factory <name>] [--brief "<brief>"]
                               --after <runId>: file nothing of this run until nemia decide says that
                               run has shipped — finished, and its result branch on the base
                               branch — and start from the base as it is then; once per run.
                               --from <runId>: hand this run what that run concluded, as context,
                               and wait on nothing: shipped or still in flight, it is read once,
                               when this run's steps are filed, and said not shipped, not judged
                               until it has shipped; once per run.
                               --gate <step>: that step's closeout waits for nemia approve before
                               anything after it is filed, as a step's own gate: true does; once
                               per step. An inbox card's gate: <step> is one more
                               --workflows takes a folder, or a name under <repo>/workflows/: dev
                               a card of a plan (nemia plan --help) starts its body: --workflows is its
                               workflow: unless given, and its after: needs an --after for each
                               --input <file>: copied into the run's own inputs/ directory, and named
                               on every step's brief under what was asked for; once per file
                               --factory <name>: the workflow must be attached to the factory, whose
                               hires fill its steps, and a step left with no agent is refused (nemia
                               factory --help). A factory with one repository gives the run its
                               --repo, and a repository not one of the factory's is refused, naming
                               them. Without it, the run is started in the factory whose repository
                               holds --repo, else where nemia start is typed, on that repository, when
                               one factory alone does; none, or two, is refused, naming the fix.
                               The default factory is history only: --factory default is refused
                               a card of the inbox (nemia inbox --help) starts its body, or --brief
                               "<brief>" in its place, and leaves the inbox: --workflows is its workflow:
                               unless given, --repo its repo:, --factory its factory:, and a card
                               that names no factory either way is refused
  nemia plan <folder> [--repo .] [--factory <name>]
                               start a plan: one run per card in the folder, parents first, each
                               --after the runs of the cards its after: names, in the factory as
                               nemia start finds it (nemia plan --help)
  nemia inbox add "<idea>"|<file> [--workflow <name>] [--repo <path>] [--factory <name>]
                               park an idea as a card in the inbox, named from its first line
  nemia inbox queue <name> [--workflow <w>] [--off]
                               mark a card to start on its own: the tick starts the oldest queued
                               card once a run slot is free; --off takes the mark back
  nemia inbox from <name> <run>... | --off
                               set the runs a card is handed as context (from:), read and
                               never waited on; --off takes them off
  nemia merge <runId> [<step>]
                               merge the base: a loop's work that no longer merges cleanly
                               goes back to merge it, once, on the next tick — on the round
                               it is on, which the merge does not spend
  nemia say <runId> <step> "<words>"
                               tell a step's running session something, through its harness: the
                               engine journals the words on the step's task, nemia ls notes the step
                               said to, and nemia decide prints them under it. A try that continues
                               the session is handed them again, as ## Said to your session
  nemia hold <runId> --until <runId> [--until <runId> ...] [--why "<words>"] [--by <name>]
                               file nothing more of a run until other runs ship, as --after would
                               have: what is in flight finishes, nothing new is filed, and nothing
                               is asked of you — nemia ls and nemia decide say held until <run> ships, and
                               what a step asks is asked once the hold lifts. The tick lifts it when
                               every run named has shipped. Refused of a run cancelled, pruned,
                               finished or already held, and of a run named that is unknown, the run
                               itself, or one that already waits on it, through --after or a hold.
                               --why: the reason, shown beside held until <run> ships wherever it is
                               said; --by: who puts the hold (default: your OS user).
                               nemia hold <runId> --off: lift the hold now, and the next tick goes on as
                               if it had never been put
  nemia pause [--why "<words>"] [--by <name>] [--now [--yes]]
                               pause the store: no pass starts new work — no step, try, round or
                               check filed, no queued task admitted, no queued card started — and
                               what runs finishes, its end and closeout recorded; a landing whose
                               check has ended commits or aborts. Pausing: N finishing while a
                               session works or a check or landing runs, Paused once none does.
                               nemia start still writes a run, and approvals, retries and answers are
                               kept, not acted on: the pass after nemia resume files what waits. nemia ls,
                               nemia feed, nemia start and nemia up say it, and nemia ls names what finishes.
                               Refused while a pause stands.
                               --why: the reason, said wherever the pause is; --by: who pauses it
                               (default: your OS user)
                               --now: pause at once — each step session or check at work, but a
                               landing, is asked to stop and tried again on nemia resume: a nudge of
                               its session, or a recheck. A pause that stands is kept as it was.
                               --yes: with --now, act; without it, --now only says what it would
                               interrupt
  nemia resume
                               resume the store: the next pass files what waits
  nemia subscribe <name> <task> [--wake <word>]... [--digest-every <minutes>]
                               give the engine's long-lived task <task> a subscription to the feed,
                               named <name>, from its end: a line holding a wake word is said to it at
                               once, and the rest folded into a digest said with the next wake, or
                               after --digest-every minutes (default 60) with none.
                               --wake: a word that wakes it, once for each (default: the feed's words
                               for a wait on a person). Refused for a task not long-lived.
  nemia unsubscribe <name>
                               take the subscription <name> away: its task is told nothing more of the feed
```

## Prompts the person

Each asks the person at a prompt every time it runs: say what it does before you run it.

```text
  nemia inbox rm <name>
                               drop a card without starting it
  nemia factory add <name> --repo <path> [--repo <path> ...]
                               file a factory: a lowercase slug naming one or more directories
  nemia factory attach <factory> <workflow>
                               offer a workflow in a factory, by its folder's name: a factory offers
                               only the workflows attached to it
  nemia factory detach <factory> <workflow>
                               take a workflow back, once no hire fills its steps
  nemia factory hire <factory> <agent> --step <workflow>/<step>
                               hire an agent into a workflow's step: one a step, a second replaces it
  nemia factory fire <factory> --step <workflow>/<step>
                               take a step's hire back
  nemia factory instruct <name> --file <path>|- | --clear
                               write the instruction the store keeps for a factory (- for stdin), or
                               remove it with --clear
  nemia factory rm <name>
                               remove a factory's file, and the instruction the store keeps for it
  nemia cancel <runId>
                               stop what it has in flight; file nothing more
  nemia rm <runId> [<runId> ...] [--delete-branches [--force-unmerged]]
                               forget runs that are over, a line each: a run's worktrees removed
                               through git, what one held uncommitted committed first, then its
                               record and every file under WF_ROOT keyed by its id. Refused while
                               a task of it is in flight, anything is due to be filed or asked
                               for, or a run waiting on it has not started. Its branches are kept:
                               --delete-branches deletes those merged into the run's base branch,
                               and --force-unmerged beside it the others, with their work. Then
                               the engine forgets the run's tasks: their journals and session
                               files; one not settled yet is forgotten by the next passes
  nemia prune [<runId> ...] [--unmerged] [--artifacts] [--yes]
                               free the space runs that are over hold: their worktrees, removed
                               through git, and nothing else — each run's record, branches and
                               files are kept, and it stays on nemia ls, nemia decide and the board,
                               marked pruned. --artifacts removes its files too (runs/<id>/
                               artifacts/: screenshots, logs), of a run whose worktrees are
                               already gone as well; its record and branches are still kept.
                               Lists what it would remove, with its size, and removes it on
                               --yes, or on y at the prompt. With no run, every run. Refused
                               while a run is not over, owes a hand-off, is a folder run, or has
                               a worktree locked, on no branch, or with changes no commit has;
                               and a finished run not merged unless --unmerged, with --artifacts
                               as without: its files are what a person reads to decide it
```

## Answers what waits

Each answers what waits on the person. Bring the matter first, with the `bring-what-waits` skill, then run the verb they choose with their words as `--message`: its prompt is their decision, asked once. `nemia retry` asks only of a step that waits on the person, or with `--budget`.

```text
  nemia retry <runId> <step> [--nudge | --fresh | --model <m> | --recheck] [--message "<answer>"] [--budget <amount>]
                               try a step waiting on you again, once, on the next tick:
                               --nudge (default) continues its session, told what happened;
                               --fresh a new session on its branch; --model <m> the same, on m;
                               --recheck runs its check again, and files no session;
                               --message "<answer>" goes into the try's brief, as ## Your answer:
                               for a step that signed off blocked, the answer to its needs — or
                               what you have to say to any step you try again; not with --recheck.
                               The next argument is the answer, whatever it starts with; an answer
                               that is only one of these flags' names goes as --message=<answer>;
                               --budget <amount>: for a step over budget or budget exhausted, its
                               cap raised to that many dollars, above what its tries have cost
  nemia approve <runId> <step> [--message "<words>"]
                               let a step waiting at its gate hand on: what waits on it is filed on
                               the next tick, and every step after the gate is handed your words
                               under ## Approved. To send it back instead, with what to change:
                               nemia retry <runId> <step> --message "<objection>"
  nemia round <runId> [<step>] [--budget <amount>]
                               once more: a loop out of rounds goes round again, once, on the
                               next tick — the step it loops to continued, then a new reviewer;
                               --budget raises the cap of a step of the loop over its budget
  nemia accept <runId> [<step>] --message "<why>"
                               enough: a loop out of rounds ends on your word, with its findings
                               open. What waits on the looping step is filed on the next tick as
                               if it had said again: false — a gated ending goes to its gate —
                               and every step after the loop is handed your words and those
                               findings under ## Accepted. The other answer to nemia round
```

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
  nemia factory diff <name> --to <x.y.z> [--template <folder|archive>]
                               preview a templated factory's upgrade: what merges cleanly, and each
                               conflict with its sides; nothing is written
  nemia factory servers <factory>
                               a factory's own MCP servers, each with the state its harness reports
  nemia factory rules <name> [--file <path>|- | --clear]
                               a factory's rules and policies: words told to every agent hired into
                               it, after its custom instructions and before the step's own note,
                               kept by the store with the factory. Bare, prints them; --file writes
                               them (- for stdin); --clear removes them. Words only: a frontmatter
                               block is refused. A run keeps the rules it was started with
                               reads bare; prompts the person given --file, --clear
  nemia factory instruction <name> [--path <path> | --store | --clear]
                               where a factory's instruction is kept, what Nemia is to know of the
                               factory (its agents are told its rules: nemia factory rules): bare,
                               prints it; --path reads it from a file in the factory's first folder,
                               --store keeps it in the store, --clear reads NEMIA.md in the first
                               folder again
                               reads bare; prompts the person given --path, --store, --clear
  nemia template lint <folder|archive>
                               check a template's folder or archive: every problem at once, each at its
                               file and line
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
  nemia agents sources [--path <folder>]
                               the agent files the store knows of, to copy into your library:
                               each repository's, yours, and those of a --path <folder>
  nemia agents custom <name> [--file <path>|-] [--clear] [--repo .]
                               your custom instructions for that agent: words you add to it without
                               rewriting it, kept in <store>/custom-instructions/<name>.md and told
                               after its instructions. Bare, prints them; --file writes them (- for
                               stdin); --clear removes them. Words only: a frontmatter block is
                               refused. A run keeps the words it was started with; nemia, the
                               store's own agent, is told them in her open session
                               reads bare; prompts the person given --file, --clear
  nemia level [manual|semi-auto|auto] [--factory <name> [--for <duration> | --end]]
                               Nemia, the store's own agent: bare, where she is, each factory's level and
                               how to reach her; a level sets the store's, which every factory follows
                               unless it has its own; --factory sets that factory's, --for raises it for
                               a stretch (90m, 2h, 1d; up to 7d) and --end ends the raise. semi-auto keeps
                               her session: what waits on you (a gate, a step's question, a loop out of
                               rounds, a cap) is asked of you, and a write that cannot be undone or
                               changes your settings or a factory; the rest is hers. auto is semi-auto,
                               but an answer your confirmed list allows in the run's state is given
                               unasked (nemia policy <agent>), in a session of hers filed since auto came:
                               one kept from before asks every answer until filed again (manual, then
                               auto once it is off). A factory at manual is left alone, and her session
                               stops once none is above manual
                               reads bare; prompts the person given manual, semi-auto, auto, --factory, --for, --end
  nemia memory [<fact>]
                               what Nemia keeps of the store: bare, her facts' names; given one, its
                               words. Read only: her session alone writes them
  nemia policy <agent>
                               the agent's rules at auto: the answers it may give unasked, in force once
                               you confirm them, and what it proposed from your custom instruction,
                               with the words the machinery cannot hold, kept as guidance
  nemia service status [--name <name>]
                               the login service and the lease: whether it is installed and runs,
                               the checkout it runs, who holds the store, and lingering
  nemia version [--json]
                               this nemia's release, an install's tag or a checkout, and its folder;
                               the release the store's releases/current names; and the release the
                               daemon runs, from its lease. --json: the whole answer
  nemia watch [cursor] [--once] [-l <selector>]... [--cursor-file <path>] [--json]
                               the feed's lines, followed as the tick writes them, until ^C, and a
                               daemon down line when nothing ticks the store, daemon up when it does
                               again: a run's status, a step's word as nemia ls says it, and what a
                               person's word changed. --once: read from the cursor to the feed's end,
                               print cursor: <n> and stop; from the start with no cursor. -l: the
                               lines a selector takes, given again for another (key=v, key!=v, "key in
                               (a,b)", "key notin (a,b)", key), over run, factory, workflow, step,
                               agent, kind, reason, on, via, type, waits and source. --cursor-file:
                               keep the cursor read to in a file, and start from it where it is there.
                               --json: one JSON object a line, a feed line with its cursor, and a
                               cursor of its own every 30 seconds while the feed is still. With no -l,
                               every line; -l waits=person takes the lines that wait on a person. A
                               step with no agent carries agent: none, which -l agent!=none leaves out.
                               A line's reason is a step's code as the api gives the step (reason);
                               its word and message are for people: select on the reason, never on
                               the words.
  nemia admit [--at-least <level>] [--auto <agent>]
                               a call's admission: the call a session is about to make, on stdin, answered
                               ask where it answers what waits on you;
                               --at-least: deny a call acting on a run or a factory below the level;
                               --auto: let through, for a run of a factory at auto, an answer the agent's
                               rules you confirmed allow in the run as it stands (nemia policy <agent>)
  nemia decide <runId> [--sensitive <globs>]
                               what the run produced, and the choice it leaves you (nemia decide --help)
```

## Yours

They write, and are yours to run unasked, on your judgement: say what you did.

```text
  nemia start <brief.md|card.md|"text"|folder> [--workflows ./workflows] [--repo .] [--no-worktree] [--after <runId> ...] [--from <runId> ...] [--input <file> ...] [--gate <step> ...] [--factory <name>] [--brief "<brief>"]
                               --after <runId>: file nothing of this run until nemia decide says that
                               run has landed — finished, and its result branch on the base
                               branch — and start from the base as it is then; once per run.
                               --from <runId>: hand this run what that run concluded, as context,
                               and wait on nothing: landed or still in flight, it is read once,
                               when this run's steps are filed, and said not landed, not judged
                               until it has landed; once per run.
                               --gate <step>: that step's closeout waits for nemia approve before
                               anything after it is filed, as a step's own gate: true does; once
                               per step. An inbox card's gate: <step> is one more
                               --workflows takes a folder, or a name under <repo>/workflows/: dev
                               a folder of cards starts a plan, a run per card, parents first, at
                               the command line alone (nemia start --help)
                               a card of a plan (nemia start --help) starts its body: --workflows is its
                               workflow: unless given, and its after: needs an --after for each
                               a frontmatter block of keys a plan's card lacks is refused by its key,
                               never taken as the brief: file an inbox card with nemia inbox add <file>
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
                               a card of the inbox (nemia inbox --help), by its path or its name,
                               starts its body, or --brief "<brief>" in its place, and stays in the
                               inbox, listed as started: --workflows is its workflow:
                               unless given, --repo its repo:, --factory its factory:, and a card
                               that names no factory either way is refused
  nemia inbox add "<idea>"|<file> [--workflow <name>] [--repo <path>] [--factory <name>]
                               park an idea as a card in the inbox, named from its first line
  nemia inbox queue <name> [--workflow <w>] [--off]
                               mark a card to start on its own: the tick starts the oldest queued
                               card once a run slot is free; --off takes the mark back
  nemia inbox from <name> <run>... | --off
                               set the runs a card is handed as context (from:), read and
                               never waited on; --off takes them off
  nemia refresh <runId> [<step>] [--base]
                               take the new revisions: a run keeps the workflow, agents, skills and
                               factory rules it resolved when it started, and this pins it to the
                               ones they hold now, so every filing after it — a new step, a retry,
                               a round — is filed on them. What has already been filed is not re-run,
                               and the steps the run has are neither added to nor removed. Refused of
                               a run that has filed nothing, which resolves afresh at its first filing
                               anyway, of one already on the newest revision of every kind, and of one
                               whose factory follows revisions (nemia factory revisions), whose every
                               filing takes them with no refresh;
                               --base: take the base instead — a loop's work that no longer merges
                               cleanly goes back to merge it, once, on the next tick, on the round it
                               is on, which the merge does not spend; the step is the one that closes
                               the loop, left out where the run has one loop
  nemia say <runId> <step> "<words>"
                               tell a step's running session something, through its harness: the
                               engine journals the words on the step's task, nemia ls notes the step
                               said to, and nemia decide prints them under it. A try that continues
                               the session is handed them again, as ## Said to your session
  nemia agents run yours <name> --brief <words>
                               an agent of yours tried on a short brief, in a folder of its own,
                               capped at $1
  nemia hold <runId> --until <runId> [--until <runId> ...] [--why "<words>"] [--by <name>]
                               file nothing more of a run until other runs land, as --after would
                               have: what is in flight finishes, nothing new is filed, and nothing
                               is asked of you — nemia ls and nemia decide say held until <run> lands, and
                               what a step asks is asked once the hold lifts. The tick lifts it when
                               every run named has landed. Refused of a run cancelled, pruned,
                               finished or already held, and of a run named that is unknown, the run
                               itself, or one that already waits on it, through --after or a hold.
                               --why: the reason, shown beside held until <run> lands wherever it is
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
                               nemia watch --once, nemia start and nemia up say it, and nemia ls names what finishes.
                               Refused while a pause stands.
                               --why: the reason, said wherever the pause is; --by: who pauses it
                               (default: your OS user)
                               --now: pause at once — each step session or check at work, but a
                               landing, is asked to stop and tried again on nemia resume: a continue of
                               its session, or a recheck. A pause that stands is kept as it was.
                               --yes: with --now, act; without it, --now only says what it would
                               interrupt
  nemia resume
                               resume the store: the next pass files what waits
  nemia subscribe <name> <task> [-l <selector>]... [--digest-every <minutes>] [--at-least <level>]
                               give the engine's long-lived task <task> a subscription to the feed,
                               named <name>, from its end: a line one of its selectors takes is said to
                               it at once, and the rest folded into a digest said with the next wake,
                               or after --digest-every minutes (default 60) with none.
                               -l: the lines a selector takes, given again for another (default:
                               waits=person, the lines that wait on a person). Refused for a task not
                               long-lived.
                               --at-least: only the lines of runs whose factory's level is at least
                               this (manual, semi-auto, auto), read as each line is delivered.
  nemia unsubscribe <name>
                               take the subscription <name> away: its task is told nothing more of the feed
  nemia policy propose <agent> --file <path>|-
                               the agent's proposal: rules from your custom instruction, as JSON,
                               with the words the machinery cannot hold kept as guidance; none is in
                               force until you confirm it (nemia policy confirm)
```

## Prompts the person

Each asks the person at a prompt every time it runs: say what it does before you run it.

```text
  nemia inbox rm <name>
                               drop a card without starting it
  nemia factory add <name> --repo <path> [--repo <path> ...] [--no-trust]
                               file a factory: a lowercase slug naming one or more directories,
                               each trusted for its steps unless --no-trust
  nemia factory apply <name> --template <folder|archive> --repo <path> [--repo <path> ...] [--set <key>=<value> ...] [--no-trust]
                               make a factory from a template that passes its check, its parameters
                               given with --set; the daemon renders its tree
  nemia factory upgrade <name> --to <x.y.z> [--template <folder|archive>] [--downgrade]
                               upgrade a templated factory: its file wants --to, and the daemon merges
                               the template's change into its tree once each conflict is resolved
  nemia factory resolve <name> <conflict> --ours|--theirs|--file <path>
                               choose for one conflict of a templated factory's upgrade: your tree, the
                               template, or the text of a file; the daemon merges once each has one
  nemia factory attach <factory> <workflow>
                               offer a workflow in a factory, by its folder's name: a factory offers
                               only the workflows attached to it
  nemia factory detach <factory> <workflow>
                               take a workflow back, once no hire fills its steps
  nemia factory hire <factory> <agent> --step <workflow>/<step>
                               hire an agent into a workflow's step: one a step, a second replaces it
  nemia factory fire <factory> --step <workflow>/<step>
                               take a step's hire back
  nemia factory schedule <factory> <workflow> --cron <expr> --brief <text> [--repo <path>] [--tz <zone>]
                               start a run of an attached workflow at each fire of a cron, by the
                               daemon, at every level; a second replaces the first
  nemia factory unschedule <factory> <workflow>
                               take a workflow's schedule back: the daemon starts it no more
  nemia factory server add <factory> <server> --url <address> [--transport http|sse] [--header <name>=<value> ...] [--client-id <id>] [--callback-port <port>]
                               record a remote MCP server for a factory: its steps' sessions are
                               handed it, and an agent `mcp:` line names it
  nemia factory server rm <factory> <server>
                               take a server off a factory's record
  nemia factory instruct <name> --file <path>|- | --clear
                               write the instruction the store keeps for a factory (- for stdin), what
                               Nemia is to know of it and no step is told, or remove it with --clear
  nemia factory revisions <name> follow|pinned
                               whether a factory's runs follow merged revisions at each filing (follow)
                               or keep them until nemia refresh (pinned, the default)
  nemia factory trust <name>
                               trust a factory's places for the harnesses its steps run on, so each
                               place's own settings apply to them
  nemia factory rm <name>
                               remove a factory's file, and the instruction and the rules the store
                               keeps for it
  nemia template export <folder> --from <repo> [--factory <name>]
                               write a template from a repository and a factory, and say where each
                               part came from
  nemia template pack <folder> [--out <file>]
                               pack a template's folder that passes its check into one archive, and print
                               the digest of its content
  nemia template unpack <archive> <dir>
                               write the folder a template's archive holds at <dir>/<name>, each file's
                               bytes and mode as packed
  nemia agents write (yours | factory) [<name>] --file <name>.md [--factory <name>] [--version <v>]
                               an agent of yours, or of a templated --factory, written from its file:
                               <name> is the agent it changes or renames, at the --version it was
                               read at; none, a new one
  nemia agents copy <file> [--as <name>] [--keep <part>]...
                               an agent file copied into your library, with its schema and skills;
                               a part your library holds otherwise stops it: --as or --keep
  nemia agents rm yours <name> --version <v>
                               an agent of yours removed, at the --version it was read at
  nemia skills write (yours | factory) [<name>] --file <SKILL.md> [--factory <name>] [--version <v>]
                               a skill of yours, or of a templated --factory, written from its
                               SKILL.md: <name> is the skill it changes, at the --version it was
                               read at; none, a new one
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
                               a worktree held, on no branch, or with changes no commit has;
                               and a finished run not merged unless --unmerged, with --artifacts
                               as without: its files are what a person reads to decide it
  nemia policy confirm <agent> <id> --words '<words>'
                               put in force a rule the agent proposed, or the default again, as its
                               words read: from then on, at auto, the answer it names is given unasked
                               where it holds. Refused once the rule reads otherwise. Your first confirm
                               keeps the default beside it. Asked of you every time
  nemia policy rm <agent> <id>
                               take a rule out of force, the default among them: what it allowed is
                               asked of you again. Asked of you every time
  nemia service install [--env KEY=VALUE ...] [--name <name>] [--take-over <pid>]
                               install the daemon as a login service: a systemd user unit on Linux,
                               a launchd agent on macOS. It runs the api of this checkout with this
                               node, WF_ROOT and PATH, and each --env, written once; it restarts on
                               failure and starts at login. Started now unless another daemon holds
                               the store; --take-over <pid> pauses the store, waits for landing
                               checks, stops that pid and starts the service. --name: the service
                               name (nemia; required for a store that is not the default)
  nemia service uninstall [--name <name>]
                               stop the login service, disable it and remove its file; a daemon
                               started by hand is left alone
  nemia service restart [--name <name>]
                               restart the service's daemon on the code it runs: pause the store, wait
                               for landing checks, stop it, start the service, and resume once the new
                               daemon has completed its first pass; refused, naming the log, when that
                               pass fails. A pause a person put stands. Starts the service where
                               nothing ticks; a daemon started by hand is named with --take-over's line
  nemia upgrade <tag> [--repo <path>] [--name <name>]
                               build the tag from a clean export into the store's releases/<tag>:
                               npm ci, npm run build and npm run release:check there, on a trial
                               store; then point releases/current at it and restart the daemon onto
                               it where the login service runs the pointer. A tag built already is
                               switched to without a rebuild, so an older tag rolls back. --repo:
                               the repository the tag is in (the running release's source);
                               --name: the service (nemia)
  nemia frontmatter rewrite [<folder>...] [--check]
                               rewrite as YAML each markdown file's frontmatter still in the former
                               line form, under the folders given or the store's own. --check: write
                               nothing, and exit 1 where a rewrite is due
  nemia workflows write (yours | factory) <name> --folder <draft> [--factory <name>] [--version <v>]
                               a workflow folder of yours, or of a templated --factory, written from
                               a draft folder; one there already, at the --version it was read at
  nemia workflows rm yours <name> --version <v>
                               a workflow folder of yours removed, at the --version it was read at
```

## Answers what waits

Each answers what waits on the person. Bring the matter first, with the `bring-what-waits` skill, then run the verb they choose with their words as `--message`: its prompt is their decision, asked once. `nemia retry` asks only of a step that waits on the person, or with `--budget`.

```text
  nemia retry <runId> [<step>] [--continue | --fresh | --model <m> | --recheck | --round] [--answer <n>=<letter>]... [--message "<answer>"] [--budget <amount>]
                               try a step waiting on you again, once, on the next tick:
                               --continue (default) continues its session, told what happened;
                               --fresh a new session on its branch; --model <m> the same, on m;
                               --recheck runs its check again, and files no session;
                               --round: once more — a loop out of rounds goes round again, once,
                               the step it loops to continued, then a new reviewer; the step is the
                               one that closes the loop, left out where the run has one loop;
                               --message "<answer>" goes into the try's brief, as ## Your answer:
                               for a step that signed off blocked, the answer to its needs — or
                               what you have to say to any step you try again; not with --recheck
                               or --round. The next argument is the answer, whatever it starts with;
                               an answer that is only one of these flags' names goes as --message=<answer>;
                               --budget <amount>: for a step with a budget that waits on you, its
                               cap raised to that many dollars, above its cap and what it has cost;
                               with --round, the cap of a step of the loop over its budget;
                               --answer <n>=<letter>: answer question n, numbered as nemia decide
                               <runId> prints them, with the option its letter names; once for each
                               question: "<n>=a,c" chooses several where it takes several,
                               "<n>=a: <words>" adds your own words, "<n>: <words>" says words
                               alone; --message is then the note under your answers
  nemia approve <runId> [<step>] [--answer <n>=<letter>]... [--message "<words>"]
                               let a step waiting at its gate hand on: what waits on it is filed on
                               the next tick, and every step after the gate is handed your words
                               under ## Approved. To send it back instead, with what to change:
                               nemia retry <runId> <step> --message "<objection>"
                               Of a loop out of rounds — the step that closes it, or the run alone
                               where it has one loop — enough: the loop ends on your words, with its
                               findings open, --message "<why>" required. What waits on the looping
                               step is filed as if it had said again: false, and every step after
                               the loop is handed your words and those findings under ## Accepted.
                               To go round once more instead: nemia retry <runId> [<step>] --round
                               --answer <n>=<letter>: answer question n, numbered as nemia decide
                               <runId> prints them, with the option its letter names; once for each
                               question: "<n>=a,c" chooses several where it takes several,
                               "<n>=a: <words>" adds your own words, "<n>: <words>" says words
                               alone; --message is then the note under your answers
```

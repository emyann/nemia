---
name: verbs
description: Every nemia verb you run, by who answers for it — a read, yours unasked, one that prompts the person, one that answers what waits on them — with its usage and help, and where to start.
---
# The verbs

Every verb `nemia` serves you, by who answers for it, with its usage and help as `nemia --help` prints them. `nemia <verb> --help`
says more of one that has a manual. With a shell, run `nemia <verb>`; on the MCP port, call the tool its `on the port` line names,
whose schema says its arguments. A verb said `CLI only` runs at a shell alone, for the reason given. `tools.md`, beside this file,
says each tool's words as the port says them: the endpoint it calls, what it does and what each argument takes.

Generated from the command table, never edited by hand: from the repository's root, `node -e "import('./packages/agent-orchestrator/src/nemia/verbs.verb.ts').then((m) => process.stdout.write(m.verbsSkill()))" > packages/agent-orchestrator/nemia/skills/verbs/SKILL.md && node -e "import('./packages/agent-orchestrator/src/nemia/verbs.verb.ts').then((m) => process.stdout.write(m.toolsReference()))" > packages/agent-orchestrator/nemia/skills/verbs/tools.md`.

## Start here

Nemia runs agent workflows in factories. A workflow is a folder of steps; a run is one pass of it, each step a session of an agent
that signs off with a closeout. A step may wait at a gate for a person to approve it or try it again; ideas wait as cards in an
inbox until one is started as a run. These tools read and act on one Nemia store: its runs and their steps, the gates waiting on
a person, the inbox, factories and the agents, skills and workflows they offer.

Reach for `nemia` when the task is about a run, a step, a gate, a card, a factory or what an agent of a run concluded: what is in
flight, what waits on a person, starting or filing work, approving or retrying a step, reading what a step signed off with.

Start with:
- `nemia ls` for the state of the runs and their steps; a run's state is one of waiting, inFlight, finished.
- `nemia show <runId>` for one run as a whole object.
- `nemia decide <runId>` for what a run produced and the choice it leaves a person.
- `nemia approve` to let a step waiting at its gate hand on, `nemia retry` to try it again.
- `nemia inbox add` to file a card, `nemia start <card>` to start a run from one.
- `nemia say` to tell a running step's session something.
- `nemia closeout` for what a step's try signed off with, `--try <n>` for an earlier one.

How you are told of the feed without polling: inside, while some factory is above `manual`, your subscription to the feed wakes you
with each line that waits on a person, the rest folded into a digest. At a shell, `nemia watch` follows the feed, and
`nemia wait --from <cursor>` waits for its next line, or the next its `-l` takes: the fallback, which polls.

Each verb below names its tool on the port. That tool's section in `tools.md`, beside this file, says the endpoint it calls, what
the endpoint does and what each argument takes. On the port a list answers a page at a time, its last line naming the continue
token of the next. A refusal says what to do next.

## Reads

They write nothing: run them unasked, as often as you need. One that sets with some words prompts the person given them.

```text
  nemia concluded <runId>
                               what a run started with --from <runId> would be handed of it, now
                               each tool's words: tools.md#concluded
                               on the port: concluded
  nemia inbox
                               a page of the cards still in play: name, first line, workflow when set,
                               and started as <runId>, <phase> (nemia inbox --help); --all: those whose
                               run ended too; -l: the cards whose labels match; --search <words>: those
                               whose title or name hold them; --phase <phase>: those in it; --sort
                               newest|oldest|name; --limit <n>, --continue <token>: the page; --show-labels,
                               -L <key>: their labels on each line; -o wide: every column
                               each tool's words: tools.md#inbox, tools.md#inbox_card
                               on the port: inbox, inbox_card
  nemia factory
                               the store's factories: the default first — every run and card that
                               names no factory, read, never written — then each by name with its
                               repositories (nemia factory --help)
                               each tool's words: tools.md#factory
                               on the port: factory
  nemia factory ls
                               the same, by its name
                               each tool's words: tools.md#factory_ls
                               on the port: factory_ls
  nemia factory diff <name> --to <x.y.z> [--template <name|folder|archive>] [--set <key>=<value> ...] | <name> --template <name|folder|archive> [--set <key>=<value> ...]
                               preview a templated factory's upgrade: what merges cleanly, and each
                               conflict with its sides; onto a template of another name, a switch
                               with no common base; or a hand-made factory's takeover by a
                               template, and the plan nemia factory adopt takes; nothing is written.
                               To change a parameter alone: --to the version applied, and
                               --set <key>=<value> for each; it prints the line that files it
                               each tool's words: tools.md#factory_diff
                               on the port: factory_diff
  nemia factory servers <factory>
                               a factory's own MCP servers, each with the state its harness reports
                               each tool's words: tools.md#factory_servers
                               on the port: factory_servers
  nemia factory rules <name> [--file <path>|- | --clear]
                               a factory's rules and policies: words told to every agent hired into
                               it, after its custom instructions and before the step's own note,
                               kept by the store with the factory. Bare, prints them; --file writes
                               them (- for stdin); --clear removes them. Words only: a frontmatter
                               block is refused. A run keeps the rules it was started with
                               reads bare; prompts the person given --file, --clear
                               each tool's words: tools.md#factory_rules, tools.md#factory_rules_put, tools.md#factory_rules_delete
                               on the port: factory_rules, factory_rules_put, factory_rules_delete
  nemia factory instruction <name> [--path <path> | --store | --clear]
                               where a factory's instruction is kept, what Nemia is to know of the
                               factory (its agents are told its rules: nemia factory rules): bare,
                               prints it; --path reads it from a file in the factory's first folder,
                               --store keeps it in the store, --clear reads NEMIA.md in the first
                               folder again
                               reads bare; prompts the person given --path, --store, --clear
                               each tool's words: tools.md#factory_instruction, tools.md#factory_instruction_put, tools.md#factory_instruction_delete
                               on the port: factory_instruction, factory_instruction_put, factory_instruction_delete
  nemia template lint <folder|archive>
                               check a template's folder or archive: every problem at once, each at its
                               file and line
                               CLI only: a template is a folder on the machine nemia runs on; the board reads none yet
  nemia ls [<runId>] [-l <key>=<value>] [--show-labels] [-L <key>] [-o wide]
                               runs and their steps — a run waiting on another says waiting on <run>,
                               one the cap on runs in flight holds waiting for a run slot (2 of 2 in
                               flight); what each step's tries and the run have cost, where measured;
                               last, whether a nemia up ticks the store and when its last pass was;
                               first, while the store is paused, Pausing: N finishing and each
                               session, check or landing at work, or Paused once none is, then each
                               check it holds, a landing with its merge staged in the repository's
                               own working tree (MERGE_HEAD) among them; a step whose check it holds
                               says waiting on the pause. -l: the runs whose labels match (team=core,
                               given again for another); --show-labels: each run with its labels;
                               -L <key>: that label beside each run, given again for another; -o
                               wide: every column, each step among them
                               each tool's words: tools.md#ls, tools.md#ls_run
                               on the port: ls, ls_run
  nemia show <runId> [--raw]
                               the run as one object (nemia/v1 Run); --raw: its record, and
                               what each step was told
                               each tool's words: tools.md#show
                               on the port: show
  nemia closeout <runId> <step> [--try <n>]
                               what a step's try signed off with: its latest, or --try <n>
                               each tool's words: tools.md#closeout
                               on the port: closeout
  nemia check-output <runId> <step> [--try <n>] [--check <name>] [--stderr] [--from <n> | --before <n>] [--limit <n>] [--last <n>] [--match <text>]
                               what a step's try's check printed, its latest try or --try <n>, the check
                               named by --check <name> where the step has several:
                               stdout whole, or --stderr; --from <n> or --before <n> with --limit <n>,
                               or --last <n>: one page; --match <text>: the lines containing it, any
                               case, numbered
                               each tool's words: tools.md#check-output
                               on the port: check-output
  nemia logs <runId> <step>
                               that step's session output
                               each tool's words: tools.md#logs
                               on the port: logs
  nemia stats [--from <day>] [--to <day>] [--by agent|step|factory|workflow|repo] [--agent|--step|--factory|--workflow|--repo <v>] [-l <key>=<value>] [--line|--json]
                               what every run in the store adds up to, by UTC day: rounds to
                               acceptance of each loop: step, landings of the workspace: base step
                               and on which try, cost and time per merged run, and each step's
                               tries, time, cost, checks and gate waits; first the last 14 days
                               against the 14 before. A number nothing measured reads —, never 0.
                               --line: one line, for a recap; --json: the whole answer; -l: the
                               runs whose labels it takes, as nemia ls -l takes them
                               each tool's words: tools.md#stats
                               on the port: stats
  nemia passes [--last <n>] [--json]
                               what the recent passes of the tick cost: their median and slowest
                               time, a histogram of their times, where the time went phase by
                               phase, and what the last saw — the runs in the store, its journal
                               reads, the sessions queued and admitted. --last <n>: the last n
                               passes only; --json: the whole answer
                               each tool's words: tools.md#passes
                               on the port: passes
  nemia series [--range 24h|7d|30d|all] [--json]
                               the system's series over a range: a pass's time and its phases, its
                               journal reads, the runs in the store, the sessions queued and admitted
                               and the longest wait, the load, and the quota used. --range: 24h (a
                               point a minute, the default), 7d or 30d (an hour), all (a day);
                               --json: the whole answer
                               each tool's words: tools.md#series
                               on the port: series
  nemia agents [--repo .]
                               the agents a step may name, the repository's then the library's: what each is
                               for, what it says it can do (an entry for each skill, read off its
                               SKILL.md), and the skills it is given (its skills:)
                               each tool's words: tools.md#agents
                               on the port: agents
  nemia agents card <name> [--repo .] [--from repo|user]
                               that agent in the shape of an A2A Agent Card, JSON on stdout and
                               nothing else — every field the protocol marks REQUIRED but
                               supportedInterfaces, which is left out because nothing here serves an
                               agent over A2A. The card describes; it is not an address
                               each tool's words: tools.md#agents_card
                               on the port: agents_card
  nemia agents sources [--path <folder>]
                               the agent files the store knows of, to copy into the store's library:
                               each repository's, the library's, and those of a --path <folder>
                               each tool's words: tools.md#agents_sources
                               on the port: agents_sources
  nemia agents custom <name> [--file <path>|-] [--clear] [--repo .]
                               your custom instructions for that agent: words you add to it without
                               rewriting it, kept in <store>/custom-instructions/<name>.md and told
                               after its instructions. Bare, prints them; --file writes them (- for
                               stdin); --clear removes them. Words only: a frontmatter block is
                               refused. A run keeps the words it was started with; nemia, the
                               store's own agent, is told them in her open session
                               reads bare; prompts the person given --file, --clear
                               each tool's words: tools.md#agents_custom, tools.md#agents_custom_put, tools.md#agents_custom_delete, tools.md#nemia_instructions, tools.md#nemia_instructions_put, tools.md#nemia_instructions_delete
                               on the port: agents_custom, agents_custom_put, agents_custom_delete, nemia_instructions, nemia_instructions_put, nemia_instructions_delete
  nemia wait [-l <key>=<value>]... [--from <cursor>] [--for <duration>]
                               wait for the feed's next line -l takes, and print it with the
                               cursor after it: from --from (a cursor a wait or nemia watch printed),
                               else from the feed's end now. It ends on the first lines -l takes, or
                               after --for (4m by default, at most 270s) with none, and prints the
                               cursor either way: wait again from it and no line is lost.
                               -l: as nemia watch -l takes it, given again for another; none takes
                               every line.
                               each tool's words: tools.md#wait
                               on the port: wait
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
                               each tool's words: tools.md#level, tools.md#level_set
                               on the port: level, level_set
  nemia memory [<fact>]
                               what Nemia keeps of the store: bare, her facts' names; given one, its
                               words. Read only: her session alone writes them
                               each tool's words: tools.md#memory, tools.md#memory_fact
                               on the port: memory, memory_fact
  nemia policy <agent>
                               the agent's rules at auto: the answers it may give unasked, in force once
                               you confirm them, and what it proposed from your custom instruction,
                               with the words the machinery cannot hold, kept as guidance
                               each tool's words: tools.md#policy
                               on the port: policy
  nemia policy reach <agent> (--factory <name> | --run <runId>)
                               which steps at their gate the agent's rules in force could ever approve
                               unasked, in a factory or a run: why each other rule cannot (a step approved
                               before it runs has done nothing to recommend or check; one with no check
                               never passed one), what keeps a rule from a run now, and the rules that would
                               each tool's words: tools.md#policy_reach
                               on the port: policy_reach
  nemia service status [--name <name>]
                               the login service and the lease: whether it is installed and runs,
                               the checkout it runs, who holds the store, and lingering
                               CLI only: it writes or reads the person's login services, on the machine the command runs on
  nemia service addresses [--json]
                               this machine's addresses, loopback first, one a line: the address, its
                               interface and its kind (loopback, private, shared, link-local,
                               unique-local, public), so --bind takes a private one; --json prints
                               {"addresses":[{"address","interface","family","kind"}]}
                               CLI only: it reads the network interfaces of the machine the command runs on
  nemia doctor [--json]
                               every piece this server needs before a run: each harness installed and
                               signed in, the service and its linger, the bind, the machine, the git
                               identity, each factory's workflows' and repository's needs, a factory, a
                               newer release — each in place or missing, with the command or fix that
                               puts it there. --json: the whole read
                               each tool's words: tools.md#doctor
                               on the port: doctor
  nemia readiness
                               retired: nemia doctor reads what it read
                               CLI only: retired: nemia doctor is the read, served on the port
  nemia token ls
                               the tokens you minted, by name: who holds each, the factory and the
                               narrowing of an agent’s, and when it was minted. Never a token itself
                               each tool's words: tools.md#token_ls
                               on the port: token_ls
  nemia pairings ls
                               the pairings the store keeps, newest first: the client that asked, and
                               whether it waits for your approval, is approved, was claimed or lapsed.
                               Never a code: approve the one the client shows with nemia pairings approve
                               each tool's words: tools.md#pairings_ls
                               on the port: pairings_ls
  nemia claude-token status
                               whether your subscription token is kept, its file and its mode, when it
                               was set and the days left of its year, warned of a month before it ends:
                               never the token
                               CLI only: the token is the person's own, kept on the machine the store is on and read there from the terminal; no caller of the port reads or writes it
  nemia version [--json]
                               this nemia's release, an install's tag or a checkout, and its folder;
                               the release the store's releases/current names; and the release the
                               daemon runs, from its lease, and whether it promises to keep a running
                               session on its files; and the sessions at work by release and harness
                               version, off their records; and a newer release, where the daemon's
                               release check read one. --json: the whole answer
                               CLI only: it says which code the command runs from; the api answers its own at GET /api/version
  nemia admit [--at-least <level>] [--auto <agent>]
                               a call's admission: the call a session is about to make, on stdin, answered
                               ask where it answers what waits on you;
                               --at-least: deny a call acting on a run or a factory below the level;
                               --auto: let through, for a run of a factory at auto, an answer the agent's
                               rules you confirmed allow in the run as it stands (nemia policy <agent>)
                               CLI only: a session's hook asks it before each call, on its own machine
  nemia decide <runId> [--sensitive <globs>]
                               what the run produced, and the choice it leaves you (nemia decide --help)
                               each tool's words: tools.md#decide
                               on the port: decide
  nemia get <resource>[/<name>] [<name>] [-n <namespace> | -A] [-l <selector>]... [-o json|yaml|name]
                               the objects of a resource the api serves, or one by its name (nemia get --help)
                               CLI only: generic over every kind discovery lists, where a port tool calls one endpoint: each kind's read is said in objects' UNLINKED_READS
  nemia explain <resource>[.<field>]...
                               what a resource the api serves is, and each of its fields (nemia explain --help)
                               each tool's words: tools.md#explain
                               on the port: explain
  nemia quota [--json]
                               the subscription's quota: each window's used share and when it
                               resets, or the api's sentence why there is none; --json: the whole
                               answer
                               each tool's words: tools.md#quota
                               on the port: quota
  nemia library [skills|agents|mcpservers|workflows [<name>] [--json]] [--factory <factory>]
                               the store's library: the user library's skills, agents, MCP servers and
                               workflows beside the builtins, each with the factories that add it;
                               --factory: that factory's adds, each with its state and the fix of a missing one;
                               given a kind and a name, that item whole, as YAML (--json: as JSON)
                               each tool's words: tools.md#library, tools.md#library_agents, tools.md#library_mcpservers, tools.md#library_workflows, tools.md#library_adds, tools.md#library_skill, tools.md#library_agent, tools.md#library_mcpserver, tools.md#library_workflow
                               on the port: library, library_agents, library_mcpservers, library_workflows, library_adds, library_skill, library_agent, library_mcpserver, library_workflow
  nemia lines <runId> [--json]
                               the lines a run keeps: its decide and refresh lines, each step's,
                               the card it came from, as YAML; --json: as JSON
                               each tool's words: tools.md#lines
                               on the port: lines
  nemia server version [--json]
                               the release the server runs and the newest it knows of, as YAML;
                               --json: as JSON. nemia version is this machine's
                               each tool's words: tools.md#server_version
                               on the port: server_version
  nemia server upgrades [--json]
                               the server's last upgrade and the release going back goes to, as
                               YAML; --json: as JSON
                               each tool's words: tools.md#server_upgrades
                               on the port: server_upgrades
  nemia capabilities [--factory <factory>] [--repo <path>] [--json]
                               the harnesses, models, skills and servers a step may be given, as
                               YAML, in a factory or a repository of it; --json: as JSON
                               each tool's words: tools.md#capabilities
                               on the port: capabilities
  nemia repository [--factory <factory>] [--repo <path>] [--json]
                               the repository a factory works in, as the server reads it, as YAML;
                               --json: as JSON
                               each tool's words: tools.md#repository
                               on the port: repository
  nemia store [--json]
                               where the store keeps its workflows, agents and skills, with the
                               commands that file a factory and turn Nemia on, as YAML; --json: as JSON
                               each tool's words: tools.md#store
                               on the port: store
  nemia milestones [--json]
                               how far the store is towards its first run that succeeded, each milestone
                               done or not, as YAML; --json: as JSON
                               each tool's words: tools.md#milestones
                               on the port: milestones
  nemia factory commands <factory> [--json]
                               the commands a factory's steps run, its checks among them, as YAML;
                               --json: as JSON
                               each tool's words: tools.md#factory_commands
                               on the port: factory_commands
  nemia factory server sign-in <factory> <server> [--json]
                               where the sign-in of a factory's MCP server stands, as YAML;
                               --json: as JSON
                               each tool's words: tools.md#factory_server_sign-in
                               on the port: factory_server_sign-in
  nemia workflows keys [--json]
                               every key a workflow's step takes, its kind and what it means, as
                               YAML; --json: as JSON
                               each tool's words: tools.md#workflows_keys
                               on the port: workflows_keys
```

## Yours

They write, and are yours to run unasked, on your judgement: say what you did.

```text
  nemia start <brief.md|card|"text"> --workflows <name> [--repo .] [--no-worktree] [--after <runId> ...] [--from <runId> ...] [--input <file> ...] [--card <name> ...] [--gate <step> ...] [--model <step>=<model> ...] [--factory <name>] [--brief "<brief>"]
                               start a run of a workflow from a brief, a text, or a card of the inbox
                               --workflows <name>: the workflow, by its name, as its factory offers
                               it (nemia workflows lists them); a card's own workflow: where it names
                               one. A path to a workflow folder, and a folder of cards, are refused:
                               file each card (nemia inbox add <card>) and start it by its name
                               --after <runId>: file nothing of this run until that run has succeeded
                               (nemia ls says succeeded), or a person ran nemia release on it; the
                               run starts from the base branch as it is then; once per run.
                               --from <runId>: hand this run what that run concluded, as context,
                               and wait on nothing: succeeded or still in flight, it is read once,
                               when this run's steps are filed, and said not succeeded, not judged
                               until it has succeeded; once per run.
                               --gate <step>: that step's closeout waits for nemia approve before
                               anything after it is filed, as a step's own gate: true does; once
                               per step. An inbox card's gate: <step> is one more
                               --model <step>=<model>: that step runs on the model in this run alone;
                               its other steps, and every other run, keep their agents' models. Once
                               per step, over an inbox card's model: for the same step. Refused, naming
                               the models that keep it, where the step's harness refuses the model or
                               its permission mode is dropped on it
                               a file that opens with a frontmatter block of workflow: and after: starts
                               its body, on its workflow: unless --workflows is given; its after: needs
                               an --after for each. Any other key is refused by its name, never taken
                               as the brief: file an inbox card with nemia inbox add <file>
                               --input <file>: copied into the run's own inputs/ directory, and named
                               on every step's brief under what was asked for; once per file
                               --card <name>: an inbox card, as nemia inbox lists it, copied as it
                               reads now into the run's inputs/cards/<name>.md and named on every
                               step's brief beside the files; once per card. A name with no card is
                               refused before anything is written
                               --factory <name>: the workflow must be attached to the factory, whose
                               hires fill its steps, and a step left with no agent is refused (nemia
                               factory --help). Without it, the run is started in the factory whose
                               repository holds --repo, else the daemon's own repository, when one
                               factory alone does; none, or two, is refused, naming the fix. In a
                               factory the run works on the repository it names for the workflow
                               (nemia factory attach <factory> <workflow> --repo <name>), else its
                               only one: --repo only finds the factory, and the start says so where
                               it differs
                               The default factory is history only: --factory default is refused
                               a card of the inbox (nemia inbox --help), by its name, starts its body,
                               or --brief "<brief>" in its place, and stays in the inbox, listed as
                               started: --workflows, a name, is its workflow: unless given, --factory
                               its factory:, and a card that names no factory either way is refused;
                               --repo is refused: its factory places the run
                               each tool's words: tools.md#start, tools.md#inbox_start
                               on the port: start, inbox_start
  nemia inbox add "<idea>"|<file> [--workflow <name>] [--factory <name>] [--after <card>]... [--label <key=value>]... [--file <path>]...
                               park an idea as a card in the inbox, named from its first line;
                               each --file is uploaded and carried by the card, as is each file
                               beside an idea file that its text names as an image or a link;
                               each --after names a card it waits on, and it starts once they have succeeded
                               each tool's words: tools.md#inbox_add
                               on the port: inbox_add
  nemia inbox queue <name> [--workflow <w>] [--off]
                               mark a card to start on its own: the tick starts the oldest queued
                               card once a run slot is free; --off takes the mark back
                               each tool's words: tools.md#inbox_queue, tools.md#inbox_unqueue
                               on the port: inbox_queue, inbox_unqueue
  nemia inbox resend <name> [--workflow <w>]
                               send a started card on: file it again as <run>-resent, handed its run,
                               queued on --workflow or, with none, for its factory's card triggers;
                               the run it came from is cancelled when it waits on you
                               each tool's words: tools.md#inbox_resend
                               on the port: inbox_resend
  nemia inbox from <name> <run>... | --off
                               set the runs a card is handed as context (from:), read and
                               never waited on; --off takes them off
                               each tool's words: tools.md#inbox_from
                               on the port: inbox_from
  nemia inbox edit <name> "<card>"|<file>
                               replace a card's body and keys with a card's text, typed or a file;
                               the card keeps its name, and its labels: nemia label inbox edits those
                               each tool's words: tools.md#inbox_edit
                               on the port: inbox_edit
  nemia inbox attach <name> <path>...
                               upload files and attach them to a card no run was started from,
                               each under its own name: every run started from it takes them
                               each tool's words: tools.md#inbox_attach
                               on the port: inbox_attach
  nemia inbox detach <name> <file>...
                               take files off a card no run was started from, by their names
                               in the card, as nemia inbox files lists them
                               each tool's words: tools.md#inbox_detach
                               on the port: inbox_detach
  nemia label run <runId> <key=value|key->... [--overwrite]
                               edit a run's labels: key=value sets a key, key- removes it; changing a
                               value takes --overwrite. nemia ls -l selects by them, and the feed's
                               lines written after carry them
                               each tool's words: tools.md#label_run
                               on the port: label_run
  nemia label inbox <name> <key=value|key->... [--overwrite]
                               edit an inbox card's labels: key=value sets a key, key- removes it;
                               changing a value takes --overwrite. nemia inbox -l selects by them, and
                               the run the card starts is created with them
                               each tool's words: tools.md#label_inbox
                               on the port: label_inbox
  nemia route <runId> <condition> <route>
                               route a condition by hand: the next tick takes your route over the
                               condition's own answer, for the try it is on, and files the nodes
                               whose when: names it. Refused once a node after it is filed or sent:
                               nemia cancel <runId>, and start again.
                               each tool's words: tools.md#route
                               on the port: route
  nemia condition <runId> <step> <name> --status True|False|Unknown [--message "<words>"] [--try <n>]
                               write a condition a check of the step waits on (condition: <name> in its checks:): True lets
                               the step go on, False refuses it as a failed check is (it counts against retries:, then waits
                               on you), Unknown leaves it waiting. It speaks of one try of the step: --try, else the try the
                               step is on now; a status for any other try is refused. The step's own session, and its checks,
                               are refused: a step never vouches for its own work. A template's program writes it with the
                               session token it is given.
                               --message: the words that go with the status; a False one is handed to the next try as the
                               check's output
                               each tool's words: tools.md#condition
                               on the port: condition
  nemia refresh <runId> [<step>] [--base [--off]]
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
                               the loop, left out where the run has one loop;
                               --base --off: take back that merge, asked and not yet filed: the ask
                               is set aside, never deleted, and the loop waits on you again
                               each tool's words: tools.md#refresh
                               on the port: refresh
  nemia say <runId> <step> "<words>"
                               tell a step's running session something, through its harness: the
                               engine journals the words on the step's task, nemia ls notes the step
                               said to, and nemia decide prints them under it. A try that continues
                               the session is handed them again, as ## Said to your session.
                               Words to a step not filed yet (waiting on --after, a hold or an
                               earlier step) are kept, not delivered: its first try is handed them,
                               as ## Said before you started, and no try after it.
                               Words are from whoever holds the token sent: a session its run filed
                               speaks as its agent (WF_SESSION_TOKEN), an agent given a token of its
                               own (nemia token add <name> --agent <agent>) as that agent. An
                               agent's words reach the step under its name, never as yours
                               each tool's words: tools.md#say
                               on the port: say
  nemia agents write (user | factory) [<name>] --file <name>.md [--factory <name>] [--version <v>]
                               an agent of the user library, or of a templated --factory, written from its file:
                               <name> is the agent it changes or renames, at the --version it was
                               read at; none, a new one
                               each tool's words: tools.md#agents_write, tools.md#agents_replace
                               on the port: agents_write, agents_replace
  nemia agents copy <file> [--as <name>] [--keep <part>]...
                               an agent file copied into the store's library, with its schema and skills;
                               a part the library holds otherwise stops it: --as or --keep
                               each tool's words: tools.md#agents_copy
                               on the port: agents_copy
  nemia agents run user <name> --brief <words>
                               an agent of the user library tried on a short brief, in a folder of its own,
                               capped at $1
                               each tool's words: tools.md#agents_run
                               on the port: agents_run
  nemia skills write (user | factory) [<name>] --file <SKILL.md> [--factory <name>] [--version <v>]
                               a skill of the user library, or of a templated --factory, written from its
                               SKILL.md: <name> is the skill it changes, at the --version it was
                               read at; none, a new one
                               each tool's words: tools.md#skills_write, tools.md#skills_replace, tools.md#skills_copy
                               on the port: skills_write, skills_replace, skills_copy
  nemia hold <runId> [--until <runId> ...] [--why "<words>"] [--by <name>]
                               file nothing more of a run until other runs succeed, as --after would
                               have: what is in flight finishes, nothing new is filed, and nothing
                               is asked of you — nemia ls and nemia decide say held until <run> succeeds, and
                               what a step asks is asked once the hold lifts. The tick lifts it when
                               every run named has succeeded (or been released: nemia release). With no --until, the run is held until a
                               person lifts it (--off), and no tick lifts it: nemia ls and nemia
                               decide say held until a person lifts it. Refused of a run cancelled,
                               pruned, succeeded or already held, and of a run named that is unknown,
                               the run itself, or one that already waits on it, through --after or a
                               hold.
                               --why: the reason, shown beside held until <run> succeeds wherever it is
                               said; --by: who puts the hold (default: your OS user).
                               nemia hold <runId> --off: lift the hold now, and the next tick goes on as
                               if it had never been put
                               each tool's words: tools.md#hold, tools.md#unhold
                               on the port: hold, unhold
  nemia release <runId>
                               let go every run that waits on this one — --after, hold --until and a
                               card's after: alike — as if it had succeeded. For a run that will not
                               succeed on its own: one that failed or was cancelled and whose work you
                               merged by hand. Written once, never taken back. Refused of a run
                               that has already succeeded or been released.
                               each tool's words: tools.md#release
                               on the port: release
  nemia assign <runId> [--to <name>] [--why "<words>"] [--for <d>]
                               say who has a run in hand: what it asks of a person — an approval, a
                               question, a retry, a budget, a hold only a person ends — is theirs to
                               answer, and leaves waiting on you, the bell and the counts, until they
                               give it back (--off), the run is over, or an ask waits on them past
                               their time, when it waits on you again. Nothing is refused because of it:
                               anyone may still answer. nemia ls says assigned to <name>. Refused of a
                               run cancelled, pruned or over, and of one someone already has in hand.
                               --to: who has it (default: your OS user); --why: the reason;
                               --for: how long an ask may wait on them (90s, 10m, 2h; from 1s to 23h;
                               default 1h).
                               nemia assign <runId> --off: give the run back now
                               each tool's words: tools.md#assign, tools.md#unassign
                               on the port: assign, unassign
  nemia pause [--why "<words>"] [--by <name>] [--timeout <d> | --now [--yes]]
                               pause the store: no pass starts new work — no step, try, round or
                               check filed, no queued task admitted, no queued card started — and
                               every session, job or attached, parks at its tool call's end: a call
                               still in flight once the timeout has passed is cut. A check runs on, its
                               end recorded; a landing whose check has ended commits or aborts.
                               Pausing: N sessions finishing a tool call, cut in M min while they
                               do, Paused once none does; nemia ls says each step paused.
                               nemia start still writes a run, and approvals, retries and answers are
                               kept, not acted on: the pass after nemia resume files what waits. nemia ls,
                               nemia watch --once, nemia start and nemia up say it, and nemia ls names what finishes.
                               Refused while a pause stands.
                               --why: the reason, said wherever the pause is; --by: who pauses it
                               (default: your OS user)
                               --timeout: how long a call in flight is given to end, for this pause
                               (90s, 10m, 2h; from 1s to 23h); default: the store's, nemia pause-timeout
                               --now: pause at once, the board's Stop now — each step session at work,
                               but a landing's, has its call cut at once and parks, going on as the
                               same try on nemia resume;
                               each check is asked to stop and run again. A pause that stands is kept.
                               --yes: with --now, act; without it, --now only says what it would
                               cut
                               each tool's words: tools.md#pause
                               on the port: pause
  nemia resume
                               resume the store: each session parked goes on as the same try, and the
                               next pass files what waits
                               each tool's words: tools.md#resume
                               on the port: resume
  nemia subscribe <name> <task> [-l <key>=<value>]... [--digest-every <minutes>] [--at-least <level>]
                               give the engine's long-lived task <task> a subscription to the feed,
                               named <name>, from its end: a line one of its selectors takes is said to
                               it at once, and the rest folded into a digest said with the next wake,
                               or after --digest-every minutes (default 60) with none.
                               -l: the lines it takes, given again for another (default:
                               waits=person, the lines that wait on a person). Refused for a task not
                               long-lived.
                               --at-least: only the lines of runs whose factory's level is at least
                               this (manual, semi-auto, auto), read as each line is delivered.
                               each tool's words: tools.md#subscribe
                               on the port: subscribe
  nemia unsubscribe <name>
                               take the subscription <name> away: its task is told nothing more of the feed
                               each tool's words: tools.md#unsubscribe
                               on the port: unsubscribe
  nemia policy propose <agent> --file <path>|-
                               the agent's proposal: rules from your custom instruction, as JSON,
                               with the words the machinery cannot hold kept as guidance; none is in
                               force until you confirm it (nemia policy confirm)
                               each tool's words: tools.md#policy_propose
                               on the port: policy_propose
  nemia daemon [--json]
                               the store's daemon, started where none ticks it (as any command that
                               ticks starts it, unless NEMIA_DAEMON_START=off): its state, its pid and
                               the url the api serves at, from its lease. --json: the whole answer
                               each tool's words: tools.md#daemon
                               on the port: daemon
  nemia workflows write (user | factory) <name> --folder <draft> [--factory <name>] [--version <v>]
                               a workflow folder of the user library, or of a templated --factory, written from
                               a draft folder, its steps, README, scripts and schemas, leaving a file
                               it does not carry; one there already, at the --version it was read at
                               each tool's words: tools.md#workflows_write, tools.md#workflows_replace
                               on the port: workflows_write, workflows_replace
```

## Prompts the person

Each asks the person at a prompt every time it runs: say what it does before you run it.

```text
  nemia inbox rm <name>
                               drop a card without starting it
                               each tool's words: tools.md#inbox_rm
                               on the port: inbox_rm
  nemia factory add <name> [--volume <path|url>:ro|:rw ...] [--no-trust]
                               file a factory: a lowercase slug, with none or several volumes, each a folder or
                               a git URL, cloned; each writable one trusted for its steps unless --no-trust
                               each tool's words: tools.md#factory_add
                               on the port: factory_add
  nemia factory apply <name> --template <name|folder|archive> [--volume <path|url>:ro|:rw ...] [--set <key>=<value> ...] [--no-trust]
                               make a factory from a template that passes its check, its parameters
                               given with --set; the daemon renders its tree
                               each tool's words: tools.md#factory_apply
                               on the port: factory_apply
  nemia factory adopt <name> --template <name|folder|archive> [--set <key>=<value> ...] --plan <digest>
                               take a hand-made factory over by a template, in place, as nemia factory
                               diff previewed it: its name, cards, runs and stats stay
                               each tool's words: tools.md#factory_adopt
                               on the port: factory_adopt
  nemia factory upgrade <name> --to <x.y.z> [--template <name|folder|archive>] [--set <key>=<value> ...] [--plan <digest>] [--downgrade]
                               upgrade a templated factory: its file wants --to, and the daemon merges
                               the template's change into its tree once each conflict is resolved;
                               with --to the version applied and --set, a change of its parameters
                               alone, filed with the --plan nemia factory diff printed for it
                               each tool's words: tools.md#factory_upgrade
                               on the port: factory_upgrade
  nemia factory resolve <name> <conflict> --ours|--theirs|--file <path>
                               choose for one conflict of a templated factory's upgrade or switch: your
                               tree, the template (none: drop the file), or the text of a file; once
                               each conflict of a workflow, an agent, a skill, a hire or the rules and
                               instruction has one, that object is proposed as they compose it, to
                               approve (nemia proposals approve <p> -n <name>); a carried file stays
                               a choice; the daemon merges once each has one and each proposal applied
                               each tool's words: tools.md#factory_resolve
                               on the port: factory_resolve
  nemia factory attach <factory> <workflow> [--repo <name>]
                               offer a workflow in a factory, by its folder's name: a factory offers
                               only the workflows attached to it; --repo names the repository its runs
                               work on, by folder name, required where the factory has several
                               each tool's words: tools.md#factory_attach
                               on the port: factory_attach
  nemia factory detach <factory> <workflow>
                               take a workflow back, once no hire fills its steps
                               each tool's words: tools.md#factory_detach
                               on the port: factory_detach
  nemia factory hire <factory> <agent> --step <workflow>/<step>
                               hire an agent into a workflow's step: one a step, a second replaces it
                               each tool's words: tools.md#factory_hire
                               on the port: factory_hire
  nemia factory fire <factory> --step <workflow>/<step>
                               take a step's hire back
                               each tool's words: tools.md#factory_fire
                               on the port: factory_fire
  nemia factory schedule <factory> <workflow> --cron <expr> --brief <text> [--tz <zone>]
                               start a run of an attached workflow at each fire of a cron, by the
                               daemon, at every level; a second replaces the first
                               each tool's words: tools.md#factory_schedule
                               on the port: factory_schedule
  nemia factory unschedule <factory> <workflow>
                               take a workflow's schedule back: the daemon starts it no more
                               each tool's words: tools.md#factory_unschedule
                               on the port: factory_unschedule
  nemia factory trigger <factory> <name> --labels <labelSelector> --to <workflow>
                               queue each card of the factory whose labels its labelSelector matches, in
                               the order filed: on the card's own workflow, else on --to; a second replaces the first
                               each tool's words: tools.md#factory_trigger
                               on the port: factory_trigger
  nemia factory untrigger <factory> <name>
                               take a factory's own card trigger back: the cards it queued wait unqueued
                               each tool's words: tools.md#factory_untrigger
                               on the port: factory_untrigger
  nemia factory server add <factory> <server> --url <address> [--transport http|sse] [--header <name>=<value> ...] [--client-id <id>] [--callback-port <port>]
                               record a remote MCP server for a factory: its steps' sessions are
                               handed it, and an agent `mcp:` line names it
                               each tool's words: tools.md#factory_server_add
                               on the port: factory_server_add
  nemia factory server rm <factory> <server>
                               take a server off a factory's record
                               each tool's words: tools.md#factory_server_rm
                               on the port: factory_server_rm
  nemia factory volume add <factory> <path|url>:ro|:rw [--no-trust] [--claude-md on|off] [--skills on|off]
                               give a factory a volume: a folder or a git URL, read-only (:ro) or writable
                               (:rw), a writable one a repository it works on, trusted unless --no-trust
                               each tool's words: tools.md#factory_volume_add
                               on the port: factory_volume_add
  nemia factory volume set <factory> <volume> [--claude-md on|off] [--skills on|off]
                               set a volume's switches, by its stored name: whether its memory files load
                               and its skills are offered to the factory's sessions; one not given is kept
                               each tool's words: tools.md#factory_volume_set
                               on the port: factory_volume_set
  nemia factory volume rm <factory> <path>
                               take a volume off a factory, by its path
                               each tool's words: tools.md#factory_volume_rm
                               on the port: factory_volume_rm
  nemia factory setting set <factory> <harness>.<key> <json>
                               give every session of a factory's runs on a harness one of its settings,
                               claude.attribution among them; its value is JSON
                               each tool's words: tools.md#factory_setting_set
                               on the port: factory_setting_set
  nemia factory setting rm <factory> <harness>.<key>
                               take a harness setting off a factory, by its key
                               each tool's words: tools.md#factory_setting_rm
                               on the port: factory_setting_rm
  nemia factory cost-line set <factory> <workflow> <usd>
                               set what a run of a workflow may cost before its gate says so, in dollars:
                               a gate whose caps pass it is said, and never approved unasked at auto
                               each tool's words: tools.md#factory_cost-line_set
                               on the port: factory_cost-line_set
  nemia factory cost-line rm <factory> <workflow>
                               take a workflow's cost line off a factory
                               each tool's words: tools.md#factory_cost-line_rm
                               on the port: factory_cost-line_rm
  nemia factory instruct <name> --file <path>|- | --clear
                               write the instruction the store keeps for a factory (- for stdin), what
                               Nemia is to know of it and no step is told, or remove it with --clear
                               each tool's words: tools.md#factory_instruct, tools.md#factory_instruct_delete
                               on the port: factory_instruct, factory_instruct_delete
  nemia factory revisions <name> follow|pinned
                               whether a factory's runs follow merged revisions at each filing (follow)
                               or keep them until nemia refresh (pinned, the default)
                               each tool's words: tools.md#factory_revisions
                               on the port: factory_revisions
  nemia factory trust <name>
                               trust a factory's places for the harnesses its steps run on, so each
                               place's own settings apply to them
                               each tool's words: tools.md#factory_trust
                               on the port: factory_trust
  nemia factory rm <name>
                               remove a factory's file, and the instruction and the rules the store
                               keeps for it
                               each tool's words: tools.md#factory_rm
                               on the port: factory_rm
  nemia template export <folder> --from <repo> [--factory <name>]
                               write a template from a repository and a factory, and say where each
                               part came from
                               CLI only: a template is a folder on the machine nemia runs on; the board reads none yet
  nemia template pack <folder> [--out <file>]
                               pack a template's folder that passes its check into one archive, and print
                               the digest of its content
                               CLI only: a template is a folder on the machine nemia runs on; the board reads none yet
  nemia template unpack <archive> <dir>
                               write the folder a template's archive holds at <dir>/<name>, each file's
                               bytes and mode as packed
                               CLI only: a template is a folder on the machine nemia runs on; the board reads none yet
  nemia agents rm user <name> --version <v>
                               an agent of the user library removed, at the --version it was read at
                               each tool's words: tools.md#agents_rm
                               on the port: agents_rm
  nemia cancel <runId>
                               stop what it has in flight; file nothing more
                               each tool's words: tools.md#cancel
                               on the port: cancel
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
                               each tool's words: tools.md#rm
                               on the port: rm
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
                               each tool's words: tools.md#prune
                               on the port: prune
  nemia pause-timeout [<d>]
                               the store's pause timeout: how long nemia pause, nemia service restart and
                               nemia upgrade give each tool call in flight to end before it is cut; bare,
                               the timeout in force (10m by default); given one, sets it: digits and s, m
                               or h, from 1s to 23h, as 90s, 10m or 2h. nemia pause --timeout <d> gives one
                               pause a timeout of its own
                               each tool's words: tools.md#pause-timeout, tools.md#pause_timeout_set
                               on the port: pause-timeout, pause_timeout_set
  nemia policy confirm <agent> <id> --words '<words>'
                               put in force a rule the agent proposed, or the default again, as its
                               words read: from then on, at auto, the answer it names is given unasked
                               where it holds. Refused once the rule reads otherwise. Your first confirm
                               keeps the default beside it. Asked of you every time
                               each tool's words: tools.md#policy_confirm
                               on the port: policy_confirm
  nemia policy rm <agent> <id>
                               take a rule out of force, the default among them: what it allowed is
                               asked of you again. Asked of you every time
                               each tool's words: tools.md#policy_rm
                               on the port: policy_rm
  nemia service install [--env KEY=VALUE ...] [--size auto] [--bind <addr> [--public]] [--name <name>] [--take-over <pid>]
                               install the daemon as a login service: a systemd user unit on Linux,
                               a launchd agent on macOS. It runs the api of this checkout with this
                               node, WF_ROOT and PATH, and each --env, written once; it restarts on
                               failure and starts at login. Started now unless another daemon holds
                               the store; --take-over <pid> pauses the store, waits for the calls
                               in flight of its sessions, stops that pid and starts the service
                               (checks and jobs run on, as nemia service restart --help says).
                               --size auto: the sessions at once and each one's memory limit and
                               request, read off this machine (WF_MAX_CONCURRENT, WF_MEMORY_LIMIT,
                               WF_MEMORY_REQUEST; neither memory one on macOS), each but one --env
                               gives; the floor kept, WF_MEMORY_RESERVED, is its default (an eighth
                               of the machine, 1 GiB at least). On systemd it also writes
                               <name>-sessions.slice, its MemoryMax at the machine less that floor,
                               and points WF_CGROUP_PARENT at it, so the sessions together are
                               held to what the machine allocates (none written where --env gives
                               WF_CGROUP_PARENT: a line names its set-property). --bind <addr>: the
                               address the daemon listens on (NEMIA_BIND), and the store marked
                               exposed (WF_EXPOSED=1), so every caller presents a token: nemia
                               pairings approve and nemia board link hand out the first. A public or
                               wildcard address is refused unless --public acknowledges it
                               (NEMIA_BIND_PUBLIC=1); nemia service addresses lists this machine's.
                               --name: the service name (nemia; required for a store that is not
                               the default)
                               CLI only: it writes or reads the person's login services, on the machine the command runs on
  nemia service uninstall [--name <name>]
                               stop the login service, disable it and remove its file and the
                               sessions' slice --size auto wrote; a daemon started by hand is left
                               alone
                               CLI only: it writes or reads the person's login services, on the machine the command runs on
  nemia service restart [--name <name>] [--timeout <d>]
                               restart the service's daemon on the code it runs: pause the store, give
                               the daemon's sessions up to the timeout to end their tool calls
                               (--timeout <d>, else nemia pause-timeout, 10m by default), stop it (up to
                               90s, and until the unit has ended its process), start the service (up to
                               60s), and resume once the new daemon has completed its first pass;
                               refused, naming the log, when that pass fails, and naming the command
                               that starts the service when it is not running.
                               Jobs and checks, a landing waiting on CI among them, run on and are not
                               waited for; each session parks and resumes as the same try. Each wait is
                               said on stderr as it waits. A pause a person put stands; the restart's
                               own ends with the command: killed, the next pass of the daemon lifts it.
                               Starts the service where nothing ticks; a daemon started by hand is
                               named with --take-over's line
                               CLI only: it restarts the person's login service, on the machine the command runs on
  nemia upgrade [<tag>] [--repo <path>] [--name <name>] [--timeout <d>]
                               on an archive install, download the tag's archive (the newest where
                               none is named), check it against its SHA256SUMS and run its nemia
                               version, into the store's releases/<tag>; on a release built from a
                               repository, build the tag from a clean export into releases/<tag>:
                               npm ci, npm run build and npm run release:check there, on a trial
                               store; then point releases/current at it and restart the daemon onto
                               it where the login service runs the pointer: jobs run on, and the
                               daemon's sessions are given up to the timeout to end their tool calls
                               (--timeout <d>, else nemia pause-timeout), park, and resume as the same try on
                               the new release; then say each piece the new release reads missing
                               that a run waits on, and each of the machine and its service, with
                               its fix, or that none of those is. A tag built already is switched
                               to without a rebuild, so an older tag rolls back. --repo:
                               the repository the tag is in (the running release's source);
                               --name: the service (nemia). Then it removes each release that is
                               not current, not among the two newest, and that no session or
                               running nemia runs on, the folder of each build whose upgrade died,
                               and each build log older than 30 days, as the daemon does every five
                               minutes. A tag older than the oldest release that can read the store
                               (store.json) is refused before anything is fetched or built. It
                               upgrades this machine's install, whatever the context: the server a
                               context names is upgraded from here with nemia server upgrade [<tag>],
                               through its api (not nemia service, this machine's login unit)
                               each tool's words: tools.md#upgrade
                               on the port: upgrade
  nemia frontmatter rewrite [<folder>...] [--check]
                               rewrite as YAML each markdown file's frontmatter still in the former
                               line form, under the folders given or the store's own. --check: write
                               nothing, and exit 1 where a rewrite is due
                               CLI only: it rewrites files on the machine nemia runs on, folders a person names among them
  nemia workflows rm user <name> --version <v>
                               a workflow folder of the user library removed, at the --version it was read at
                               each tool's words: tools.md#workflows_rm
                               on the port: workflows_rm
```

## Answers what waits

Each answers what waits on the person. Bring the matter first, with the `bring-what-waits` skill, then run the verb they choose, at a shell with their words as `--message`, or its tool on the port with them as its message: its prompt is their decision, asked once. `retry` asks only of a step that waits on the person, or with `--budget`.

```text
  nemia retry <runId> [<step>] [--continue | --fresh | --model <m> | --recheck [--check <name>] | --round] [--answer <n>=<letter>]... [--message "<answer>"] [--budget <amount>] | <runId> <step> --off | <runId> [<step>] --round --off
                               try a step waiting on you again, once, on the next tick:
                               --continue (default) continues its session, told what happened;
                               --fresh a new session on its branch; --model <m> the same, on m;
                               --recheck runs its check again, and files no session;
                               --check <name>, with --recheck: that refused check alone, the others kept;
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
                               alone, "<n>=none" says none of its options fits; --message is
                               then the note under your answers
                               --off: take back the try asked of the step and not yet filed, or with
                               --round the round asked of its loop: the ask is set aside, never
                               deleted, and the step waits on you again
                               each tool's words: tools.md#retry
                               on the port: retry
  nemia approve <runId> [<step>] [--answer <n>=<letter>]... [--budget <step>=<amount>]... [--message "<words>"] | <runId> <step> --off
                               let a step waiting at its gate hand on: what waits on it is filed on
                               the next tick, and every step after the gate is handed your words
                               under ## Approved. To send it back instead, with what to change:
                               nemia retry <runId> <step> --message "<objection>"
                               Of a loop out of rounds — the step that closes it, or the run alone
                               where it has one loop — enough: the loop ends on your words, with its
                               findings open, --message "<why>" required. What waits on the looping
                               step is filed as if it had said again: false, and every step after
                               the loop is handed your words and those findings, under the heading
                               of a loop ended as it stands.
                               To go round once more instead: nemia retry <runId> [<step>] --round
                               --answer <n>=<letter>: answer question n, numbered as nemia decide
                               <runId> prints them, with the option its letter names; once for each
                               question: "<n>=a,c" chooses several where it takes several,
                               "<n>=a: <words>" adds your own words, "<n>: <words>" says words
                               alone, "<n>=none" says none of its options fits; --message is
                               then the note under your answers
                               --budget <step>=<amount>: the cap of a step after the gate, in
                               dollars, over what the step proposed for it; once for each step.
                               Your approval makes the budgets the step proposed the caps of the
                               steps after the gate, and auto never approves unasked a cap above
                               a step's own budget
                               --off: take back the approval of a step that stands approved while
                               nothing it approved has been filed — an ending waiting on the base
                               branch, held, or not yet ticked. The step waits at its gate again.
                               Of a loop ended as it stands, while nothing waiting on its step is
                               filed: that acceptance taken back, and the loop waits on you again
                               each tool's words: tools.md#approve
                               on the port: approve
```

# The port's tools

Each tool of the MCP port, by its name, as the port describes it: the verb it is, with its usage and help, what its endpoint does,
the call, what each argument takes, and how the port answers it. At a shell, run the verb; an argument whose shell spelling is
given is typed so, and one without is the endpoint's, which the verb's own usage says how to give.

Generated from the command table and the Api, never edited by hand: from the repository's root, `node -e "import('./packages/agent-orchestrator/src/nemia/verbs.verb.ts').then((m) => process.stdout.write(m.verbsSkill()))" > packages/agent-orchestrator/nemia/skills/verbs/SKILL.md && node -e "import('./packages/agent-orchestrator/src/nemia/verbs.verb.ts').then((m) => process.stdout.write(m.toolsReference()))" > packages/agent-orchestrator/nemia/skills/verbs/tools.md`.

## start

```text
  nemia start <brief.md|card|"text"> --workflows <name> [--repo .] [--no-worktree] [--after <runId> ...] [--from <runId> ...] [--input <file> ...] [--card <name> ...] [--gate <step> ...] [--model <step>=<model> ...] [--factory <name>] [--brief "<brief>"]
    start a run of a workflow from a brief, a text, or a card of the inbox
    --workflows <name>: the workflow, by its name, as its factory offers
    it (nemia workflows lists them); a card's own workflow: where it names
    one. A path to a workflow folder, and a folder of cards, are refused:
    file each card (nemia inbox add <card>) and start it by its name
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
```

Starts a run of a workflow in the namespace's factory, from the RunStart body; in default, the factory whose repository holds the folder ?repo= names places it. Answers RunStarted with a 201, the new run's address in Location.

Calls `POST /api/namespaces/:namespace/runs`.

Its arguments:

- namespace: The namespace, a run's factory (default for one that names none).
- repo (--repo at a shell): The folder whose repository holds the factory that places the run, for a start in default.
- models (--model at a shell): Each step's model for this run alone, step to model, as `--model <step>=<model>` gives it.
- gates (--gate at a shell): The steps gated in this run (--gate): each one's closeout waits for an approval before anything after it is filed.
- noWorktree (--no-worktree at a shell): Whether the run works with no worktree of its own (--no-worktree).
- inputs (--input at a shell): The files handed to its steps (`--input <file>`), each by its name.
- workflow: The workflow to run, by name.
- from: Where the workflow is read from when both the repository and the user library have it: repo or user.
- after (--after at a shell): The runs its first steps wait on to land (--after), by id.
- context (--from at a shell): The runs whose conclusions it is handed as context (--context), by id; it does not wait on them.
- cards (--card at a shell): The inbox cards it is handed, by name.
- brief (<brief> at a shell): What the run is asked to do.
- label (--label at a shell): The labels it is started with, each key=value.
- card: Refused: an inbox card is started at its own path, `POST /api/namespaces/<namespace>/cards/<name>/start`.

## inbox_start

```text
  nemia start <brief.md|card|"text"> --workflows <name> [--repo .] [--no-worktree] [--after <runId> ...] [--from <runId> ...] [--input <file> ...] [--card <name> ...] [--gate <step> ...] [--model <step>=<model> ...] [--factory <name>] [--brief "<brief>"]
    start a run of a workflow from a brief, a text, or a card of the inbox
    --workflows <name>: the workflow, by its name, as its factory offers
    it (nemia workflows lists them); a card's own workflow: where it names
    one. A path to a workflow folder, and a folder of cards, are refused:
    file each card (nemia inbox add <card>) and start it by its name
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
```

Starts a run of the card in the namespace's factory, on the workflow the body or the card names; in default, on the factory ?factory= names. Answers CardStarted with a 201, the run's address in Location.

Calls `POST /api/namespaces/:namespace/cards/:name/start`.

Its arguments:

- namespace: The namespace the object is in: the name of its factory, default for one that names none.
- name: The object's name, unique in its namespace for its kind.
- workflow: The workflow its run is started on, by name; the card's own `workflow:` when it names none.
- from: Retired, read and ignored: the factory finds the workflow.
- after (--after at a shell): The runs its first steps wait on to land, by id.
- context (--from at a shell): The runs whose conclusions it is handed as context, by id; it does not wait on them.
- brief (<brief> at a shell): The brief given in place of the card's body.
- label (--label at a shell): The labels the run is started with, each as `key=value` or `key-` to take one off.
- cards (--card at a shell): The inbox cards it is handed, by name.
- models (--model at a shell): Each step's model for this run alone, step to model, as `--model <step>=<model>` gives it.
- gates (--gate at a shell): The steps gated in this run (--gate): each one's closeout waits for an approval before anything after it is filed.
- noWorktree (--no-worktree at a shell): Whether the run works with no worktree of its own (--no-worktree).
- inputs (--input at a shell): The files handed to its steps (`--input <file>`), each by its name.

## concluded

```text
  nemia concluded <runId>
    what a run started with --from <runId> would be handed of it, now
```

Reads what a run started now with this run as context would be handed: whether it has landed, and its ## From run section. Answers Concluded.

Calls `GET /api/runs/:name/concluded`.

Its arguments:

- name: The run's name, found among the runs the store lists in any namespace.

## inbox

```text
  nemia inbox
    the cards still in play: name, first line, workflow when set,
    and started as <runId>, <phase> (nemia inbox --help); --all: those whose
    run ended too; -l: the cards whose labels match; --show-labels, -L <key>:
    their labels on each line; -o wide: every column
```

Lists the inbox's cards of every namespace, a page at a time; ?labelSelector= keeps those whose labels match, and ?fieldSelector= those still in play or not. Answers a CardList, or the same page as a Table where the request asks for one.

Calls `GET /api/cards`.

Its arguments:

- limit: The most items a page holds, a whole number from 1.
- continue: The token the page before answered, to read the page after it; absent, the first page.
- labelSelector: A label query, or several given again, that keeps the objects whose labels match any of them; absent, every object.
- selector (-l at a shell): The retired spelling of labelSelector, read the same.
- resourceVersion: With watch=true on a list of events, the resourceVersion of the last event or bookmark a reader was sent, or of a page's metadata, to resume the stream from; a watch of any other list refuses one.
- fieldSelector: A fieldSelector in Kubernetes' spelling that keeps the cards still in play (status.inPlay=true) or those whose run ended (status.inPlay=false); empty or absent, every card.

- On the port: Answers a line per item, as `inbox -o wide` prints them.
- On the port: Answers 20 at most unless limit is given; a last line or metadata.continue names the token for the next page.
- On the port: Sends fieldSelector=status.inPlay=true where the call gives no fieldSelector: give it to ask otherwise.

## inbox_card

```text
  nemia inbox
    the cards still in play: name, first line, workflow when set,
    and started as <runId>, <phase> (nemia inbox --help); --all: those whose
    run ended too; -l: the cards whose labels match; --show-labels, -L <key>:
    their labels on each line; -o wide: every column
```

Reads one card by its name in any namespace, with its file as written. Answers the Card.

Calls `GET /api/cards/:name`.

Its arguments:

- name: The card's name, whichever namespace holds it.

## inbox_add

```text
  nemia inbox add "<idea>"|<file> [--workflow <name>] [--factory <name>] [--label <key=value>]...
    park an idea as a card in the inbox, named from its first line
```

Files a new card in the inbox, in the namespace's factory (none, in default), from the CardFile body. Answers the Card filed with a 201, naming any label it left out.

Calls `POST /api/namespaces/:namespace/cards`.

Its arguments:

- namespace: The namespace the list is of: the name of a factory, default for one that names none.
- body: The card's idea, in markdown: its first line is its title.
- workflow (--workflow at a shell): The workflow that runs the card, by name.
- from: Retired, read and ignored: the factory finds the workflow.
- repo: Retired and refused: the factory places the card's run.
- factory (--factory at a shell): The factory the card is filed in.
- label (--label at a shell): The labels the card is filed with, each as `key=value`.

## inbox_queue

```text
  nemia inbox queue <name> [--workflow <w>] [--off]
    mark a card to start on its own: the tick starts the oldest queued
    card once a run slot is free; --off takes the mark back
```

Queues a card to start when there is room, on the workflow ?workflow= names or else its own. Answers the Card, with how many are queued and the repository it starts on.

Calls `POST /api/namespaces/:namespace/cards/:name/queue`.

Its arguments:

- namespace: The namespace the object is in: the name of its factory, default for one that names none.
- name (<name> at a shell): The object's name, unique in its namespace for its kind.
- workflow (--workflow at a shell): The workflow the card starts on, by name, written over the card's own; absent, the card's own.

## inbox_unqueue

```text
  nemia inbox queue <name> [--workflow <w>] [--off]
    mark a card to start on its own: the tick starts the oldest queued
    card once a run slot is free; --off takes the mark back
```

Takes a card off the queue. Answers the Card as it is now.

Calls `POST /api/namespaces/:namespace/cards/:name/unqueue`.

Its arguments:

- namespace: The namespace the object is in: the name of its factory, default for one that names none.
- name (<name> at a shell): The object's name, unique in its namespace for its kind.

## inbox_from

```text
  nemia inbox from <name> <run>... | --off
    set the runs a card is handed as context (from:), read and
    never waited on; --off takes them off
```

Writes a card whole from the CardWrite body, its name kept, and reads it again. Answers the Card as it is now.

Calls `PUT /api/namespaces/:namespace/cards/:name`.

Its arguments:

- namespace: The namespace the object is in: the name of its factory, default for one that names none.
- name (<name> at a shell): The object's name, unique in its namespace for its kind.
- metadata: The card's labels, and the version it was read at.
- spec: The spec of the card as it is to be, `queued` as the card has it.

## inbox_edit

```text
  nemia inbox edit <name> "<card>"|<file>
    replace a card's body and keys with a card's text, typed or a file;
    the card keeps its name, and its labels: nemia label inbox edits those
```

Writes a card from its file's text, frontmatter and body, refused where the card changed since the resourceVersion given, and reads it again. Answers the Card as it is now.

Calls `PUT /api/namespaces/:namespace/cards/:name/source`.

Its arguments:

- namespace: The namespace the object is in: the name of its factory, default for one that names none.
- name (<name> at a shell): The object's name, unique in its namespace for its kind.
- source (<source> at a shell): The card's file as it is to be, frontmatter and body, as status.source serves it and nemia inbox add reads a file.
- resourceVersion: The version the card was read at; the write is refused where the card has changed since.

## inbox_rm

```text
  nemia inbox rm <name>
    drop a card without starting it
```

Drops a card from the inbox. Answers the Card as it was before it was dropped.

Calls `DELETE /api/namespaces/:namespace/cards/:name`.

Its arguments:

- namespace: The namespace the object is in: the name of its factory, default for one that names none.
- name (<name> at a shell): The object's name, unique in its namespace for its kind.

## label_run

```text
  nemia label run <runId> <key=value|key->... [--overwrite]
    edit a run's labels: key=value sets a key, key- removes it; changing a
    value takes --overwrite. nemia ls -l selects by them, and the feed's
    lines written after carry them
```

Edits the run's labels: sets and removes the keys the LabelEdit body names. Answers Labelled, the labels the run holds after it.

Calls `POST /api/namespaces/:namespace/runs/:name/labels`.

Its arguments:

- namespace: The namespace, a run's factory (default for one that names none).
- name: The run's name.
- labels (<labels> at a shell): The edits, in kubectl's words: key=value to set a label, key- to remove one.
- overwrite (--overwrite at a shell): Whether a set may change a value the label already has (--overwrite); left out, it may not.

## label_inbox

```text
  nemia label inbox <name> <key=value|key->... [--overwrite]
    edit an inbox card's labels: key=value sets a key, key- removes it;
    changing a value takes --overwrite. nemia inbox -l selects by them, and
    the run the card starts is created with them
```

Edits a card's labels: sets and removes the keys the LabelEdit body names. Answers Labelled, the labels the card holds after it.

Calls `POST /api/namespaces/:namespace/cards/:name/labels`.

Its arguments:

- namespace: The namespace the object is in: the name of its factory, default for one that names none.
- name (<name> at a shell): The object's name, unique in its namespace for its kind.
- labels (<labels> at a shell): The edits, in kubectl's words: key=value to set a label, key- to remove one.
- overwrite (--overwrite at a shell): Whether a set may change a value the label already has (--overwrite); left out, it may not.

## factory

```text
  nemia factory
    the store's factories: the default first — every run and card that
    names no factory, read, never written — then each by name with its
    repositories (nemia factory --help)
```

Lists the factories, which no namespace holds, a page at a time, the default first; ?labelSelector= keeps those whose labels match. Answers a FactoryList, or the same page as a Table where the request asks for one.

Calls `GET /api/factories`.

Its arguments:

- limit: The most items a page holds, a whole number from 1.
- continue: The token the page before answered, to read the page after it; absent, the first page.
- labelSelector: A label query, or several given again, that keeps the objects whose labels match any of them; absent, every object.
- selector: The retired spelling of labelSelector, read the same.
- resourceVersion: With watch=true on a list of events, the resourceVersion of the last event or bookmark a reader was sent, or of a page's metadata, to resume the stream from; a watch of any other list refuses one.

- On the port: Answers a line per item, as `factory -o wide` prints them.
- On the port: Answers 20 at most unless limit is given; a last line or metadata.continue names the token for the next page.

## factory_ls

```text
  nemia factory ls
    the same, by its name
```

Lists the factories, which no namespace holds, a page at a time, the default first; ?labelSelector= keeps those whose labels match. Answers a FactoryList, or the same page as a Table where the request asks for one.

Calls `GET /api/factories`.

Its arguments:

- limit: The most items a page holds, a whole number from 1.
- continue: The token the page before answered, to read the page after it; absent, the first page.
- labelSelector: A label query, or several given again, that keeps the objects whose labels match any of them; absent, every object.
- selector: The retired spelling of labelSelector, read the same.
- resourceVersion: With watch=true on a list of events, the resourceVersion of the last event or bookmark a reader was sent, or of a page's metadata, to resume the stream from; a watch of any other list refuses one.

- On the port: Answers a line per item, as `factory ls -o wide` prints them.
- On the port: Answers 20 at most unless limit is given; a last line or metadata.continue names the token for the next page.

## factory_add

```text
  nemia factory add <name> [--volume <path|url>:ro|:rw ...] [--no-trust]
    file a factory: a lowercase slug, with none or several volumes, each a folder or
    a git URL, cloned; each writable one trusted for its steps unless --no-trust
```

Files a new factory with the volumes the body names, none at all included, each a folder of this machine by its whole path or a git URL it clones, its writable ones trusted unless the body says not to. Answers FactoryCreated.

Calls `POST /api/factories`.

Its arguments:

- name (<name> at a shell): The name of the factory to file.
- volumes (--volume at a shell): Its volumes, each a folder of the machine the api runs on by its whole path, or a git URL that machine clones, marked :ro or :rw.
- noTrust (--no-trust at a shell): Whether to leave its places untrusted.

## factory_apply

```text
  nemia factory apply <name> --template <name|folder|archive> [--volume <path|url>:ro|:rw ...] [--set <key>=<value> ...] [--no-trust]
    make a factory from a template that passes its check, its parameters
    given with --set; the daemon renders its tree
```

Makes a factory from the template the body sends or names, on the repositories it names, the template kept under the store once the factory is filed. Answers FactoryApplied: the factory, its file, its template and what was asked for its places' trust.

Calls `POST /api/factories/:name/apply`.

Its arguments:

- name (<name> at a shell): The factory's name.
- template (--template at a shell): The template to make the factory from.
- volumes (--volume at a shell): Its volumes, each a folder of the machine the api runs on by its whole path, or a git URL that machine clones, marked :ro or :rw.
- sets (--set at a shell): The template's parameters as `--set` words, `<key>=<value>`.
- noTrust (--no-trust at a shell): Whether to leave its places untrusted.

## factory_adopt

```text
  nemia factory adopt <name> --template <name|folder|archive> [--set <key>=<value> ...] --plan <digest>
    take a hand-made factory over by a template, in place, as nemia factory
    diff previewed it: its name, cards, runs and stats stay
```

Takes over a hand-made factory by the template the body sends, following the plan its preview printed. Answers FactoryAdopted: its file, the template it is now made from and the tree it runs from.

Calls `POST /api/factories/:factory/adopt`.

Its arguments:

- factory (<factory> at a shell): The factory's name.
- template (--template at a shell): The template that takes the factory over.
- sets (--set at a shell): The template's parameters as `--set` words, `<key>=<value>`.
- plan (--plan at a shell): The digest of the plan its preview printed.

## factory_diff

```text
  nemia factory diff <name> --to <x.y.z> [--template <name|folder|archive>] [--set <key>=<value> ...] | <name> --template <name|folder|archive> [--set <key>=<value> ...]
    preview a templated factory's upgrade: what merges cleanly, and each
    conflict with its sides; onto a template of another name, a switch
    with no common base; or a hand-made factory's takeover by a
    template, and the plan nemia factory adopt takes; nothing is written.
    To change a parameter alone: --to the version applied, and
    --set <key>=<value> for each; it prints the line that files it
```

Previews a factory's upgrade or takeover by the template the body sends: what would change, with nothing written and nothing sent kept. Answers FactoryPlan.

Calls `POST /api/factories/:factory/diff`.

Its arguments:

- factory (<factory> at a shell): The factory's name.
- to (--to at a shell): The version an upgrade is previewed to.
- template (--template at a shell): The template to preview, where another than the factory names.
- sets (--set at a shell): The template's parameters as `--set` words, `<key>=<value>`.

## factory_upgrade

```text
  nemia factory upgrade <name> --to <x.y.z> [--template <name|folder|archive>] [--set <key>=<value> ...] [--plan <digest>] [--downgrade]
    upgrade a templated factory: its file wants --to, and the daemon merges
    the template's change into its tree once each conflict is resolved;
    with --to the version applied and --set, a change of its parameters
    alone, filed with the --plan nemia factory diff printed for it
```

Files a factory's upgrade onto a newer version of its template, from the template the body sends where it sends one. Answers FactoryUpgraded: the versions, its file, the parameters it drops and how many conflicts wait for a choice.

Calls `POST /api/factories/:factory/upgrade`.

Its arguments:

- factory (<factory> at a shell): The factory's name.
- to (--to at a shell): The version wanted.
- template (--template at a shell): The template to read it from, where another than the factory names.
- sets (--set at a shell): The template's parameters as `--set` words, `<key>=<value>`.
- plan (--plan at a shell): The digest of the plan its preview printed.
- downgrade (--downgrade at a shell): Whether to go to a version below the one applied.

## factory_resolve

```text
  nemia factory resolve <name> <conflict> --ours|--theirs|--file <path>
    choose for one conflict of a templated factory's upgrade or switch: your
    tree, the template (none: drop the file), or the text of a file; once
    each conflict of a workflow, an agent, a skill, a hire or the rules and
    instruction has one, that object is proposed as they compose it, to
    approve (nemia proposals approve <p> -n <name>); a carried file stays
    a choice; the daemon merges once each has one and each proposal applied
```

Records the choice for one conflict of a factory's upgrade, proposed by the caller as an owner's resolution. Answers FactoryResolved, with the proposals the merge waits on.

Calls `POST /api/factories/:factory/resolve`.

Its arguments:

- factory (<factory> at a shell): The factory's name.
- conflict (<conflict> at a shell): The conflict, as the preview names it.
- ours (--ours at a shell): Whether to keep the factory's side.
- theirs (--theirs at a shell): Whether to take the template's side.
- text: The words the conflict becomes: the text of a file, never its path.

## factory_attach

```text
  nemia factory attach <factory> <workflow> [--repo <name>]
    offer a workflow in a factory, by its folder's name: a factory offers
    only the workflows attached to it; --repo names the repository its runs
    work on, by folder name, required where the factory has several
```

Attaches a workflow to a factory, on the repository the body names where it has several. Answers the Factory as it reads after, with the file written.

Calls `PUT /api/factories/:name/workflows/:workflow`.

Its arguments:

- name: The factory's name.
- workflow (<workflow> at a shell): The name of the workflow, as the factory attaches it.
- repo (--repo at a shell): The folder name of the repository of the factory its runs work on, required where the factory has several; absent to keep what its wiring names.

## factory_detach

```text
  nemia factory detach <factory> <workflow>
    take a workflow back, once no hire fills its steps
```

Detaches a workflow from a factory. Answers the Factory as it reads after, with the file written.

Calls `DELETE /api/factories/:name/workflows/:workflow`.

Its arguments:

- name: The factory's name.
- workflow (<workflow> at a shell): The name of the workflow, as the factory attaches it.

## factory_hire

```text
  nemia factory hire <factory> <agent> --step <workflow>/<step>
    hire an agent into a workflow's step: one a step, a second replaces it
```

Hires the agent the body names into the step. Answers the Hire as it reads after, with the file written and the agent it replaced.

Calls `PUT /api/namespaces/:namespace/hires/:name`.

Its arguments:

- namespace: The namespace the object is in: the name of its factory, default for one that names none.
- name: The object's name, unique in its namespace for its kind.
- agent (<agent> at a shell): The agent to hire into the step.

## factory_fire

```text
  nemia factory fire <factory> --step <workflow>/<step>
    take a step's hire back
```

Fires the agent hired into the step. Answers the Hire as it reads after, with the file written and the agent it fired.

Calls `DELETE /api/namespaces/:namespace/hires/:name`.

Its arguments:

- namespace: The namespace the object is in: the name of its factory, default for one that names none.
- name: The object's name, unique in its namespace for its kind.

## factory_schedule

```text
  nemia factory schedule <factory> <workflow> --cron <expr> --brief <text> [--tz <zone>]
    start a run of an attached workflow at each fire of a cron, by the
    daemon, at every level; a second replaces the first
```

Writes a factory's schedule of the workflow named in the path, the cron the body sends. Answers the Schedule as it reads after, with the file written and the cron it replaced.

Calls `PUT /api/namespaces/:namespace/schedules/:name`.

Its arguments:

- namespace: The namespace the object is in: the name of its factory, default for one that names none.
- name: The object's name, unique in its namespace for its kind.
- cron (--cron at a shell): The cron, five or six fields, its runs start at.
- brief (--brief at a shell): The brief each run is asked.
- repo (--repo at a shell): Retired: read and ignored, since the factory's wiring places a scheduled run.
- tz (--tz at a shell): The time zone the cron is read in.

## factory_unschedule

```text
  nemia factory unschedule <factory> <workflow>
    take a workflow's schedule back: the daemon starts it no more
```

Takes back a factory's schedule of the workflow named in the path. Answers the Schedule as it was, with the file written.

Calls `DELETE /api/namespaces/:namespace/schedules/:name`.

Its arguments:

- namespace: The namespace the object is in: the name of its factory, default for one that names none.
- name: The object's name, unique in its namespace for its kind.

## factory_trigger

```text
  nemia factory trigger <factory> <name> --labels <labelSelector> --to <workflow>
    queue each card of the factory whose labels its labelSelector matches, in
    the order filed: on the card's own workflow, else on --to; a second replaces the first
```

Writes a factory's trigger named in the path: a card labelSelector and its target, or a cron, named by its workflow, which writes the schedule. Answers the Trigger as it reads after, with the file written.

Calls `PUT /api/namespaces/:namespace/triggers/:name`.

Its arguments:

- namespace: The namespace the object is in: the name of its factory, default for one that names none.
- name (<name> at a shell): The object's name, unique in its namespace for its kind.
- when: When the trigger fires: at each fire of a cron (time), or on each card its labelSelector matches (cards).
- target: What the trigger sends what it matches to: a workflow its factory offers.

## factory_untrigger

```text
  nemia factory untrigger <factory> <name>
    take a factory's own card trigger back: the cards it queued wait unqueued
```

Takes back a factory's own trigger named in the path, a schedule of the time kind. Answers the Trigger as it was, with the file written.

Calls `DELETE /api/namespaces/:namespace/triggers/:name`.

Its arguments:

- namespace: The namespace the object is in: the name of its factory, default for one that names none.
- name (<name> at a shell): The object's name, unique in its namespace for its kind.

## factory_servers

```text
  nemia factory servers <factory>
    a factory's own MCP servers, each with the state its harness reports
```

Lists a factory's MCP servers in its namespace, a page at a time, each header's value masked; ?labelSelector= keeps those whose labels match. Answers an McpServerList, or the same page as a Table where the request asks for one.

Calls `GET /api/namespaces/:namespace/mcpservers`.

Its arguments:

- namespace: The namespace the list is of: the name of a factory, default for one that names none.
- limit: The most items a page holds, a whole number from 1.
- continue: The token the page before answered, to read the page after it; absent, the first page.
- labelSelector: A label query, or several given again, that keeps the objects whose labels match any of them; absent, every object.
- selector: The retired spelling of labelSelector, read the same.
- resourceVersion: With watch=true on a list of events, the resourceVersion of the last event or bookmark a reader was sent, or of a page's metadata, to resume the stream from; a watch of any other list refuses one.

- On the port: Answers a line per item, as `factory servers -o wide` prints them.
- On the port: Answers 20 at most unless limit is given; a last line or metadata.continue names the token for the next page.

## factory_server_add

```text
  nemia factory server add <factory> <server> --url <address> [--transport http|sse] [--header <name>=<value> ...] [--client-id <id>] [--callback-port <port>]
    record a remote MCP server for a factory: its steps' sessions are
    handed it, and an agent `mcp:` line names it
```

Records an MCP server in a factory under the name in the path, a header sent as the mask keeping the value stored. Answers the McpServer as it reads after, with the file written and the address it replaced.

Calls `PUT /api/namespaces/:namespace/mcpservers/:name`.

Its arguments:

- namespace: The namespace the object is in: the name of its factory, default for one that names none.
- name: The object's name, unique in its namespace for its kind.
- type: The transport; http where none is given.
- url (--url at a shell): The server's url.
- headers: Its headers by name; a value sent as HEADER_MASK keeps the value the server holds.
- oauth: The OAuth client it signs in with.

## factory_server_rm

```text
  nemia factory server rm <factory> <server>
    take a server off a factory's record
```

Takes an MCP server off a factory. Answers the McpServer as it was, with the file written.

Calls `DELETE /api/namespaces/:namespace/mcpservers/:name`.

Its arguments:

- namespace: The namespace the object is in: the name of its factory, default for one that names none.
- name: The object's name, unique in its namespace for its kind.

## factory_volume_add

```text
  nemia factory volume add <factory> <path|url>:ro|:rw [--no-trust] [--claude-md on|off] [--skills on|off]
    give a factory a volume: a folder or a git URL, read-only (:ro) or writable
    (:rw), a writable one a repository it works on, trusted unless --no-trust
```

Gives a factory a volume: a folder of this machine by its whole path, or a git URL it clones, marked :ro or :rw; a writable one is a repository the factory works on. Answers VolumeAdded.

Calls `POST /api/factories/:factory/volumes`.

Its arguments:

- factory (<factory> at a shell): The factory's name.
- volume (<volume> at a shell): The folder of the machine the api runs on, by its whole path, or a git URL it clones, marked :ro or :rw, as `nemia factory volume add` spells it.
- noTrust (--no-trust at a shell): Whether to leave a writable volume untrusted.
- claudeMd (--claude-md at a shell): Whether the volume's CLAUDE.md files reach the factory's sessions; absent keeps what it had, off for a new one.
- skills (--skills at a shell): Whether the volume's skills are offered to the factory's sessions; absent keeps what it had, on for a new one.

## factory_volume_set

```text
  nemia factory volume set <factory> <volume> [--claude-md on|off] [--skills on|off]
    set a volume's switches, by its stored name: whether its memory files load
    and its skills are offered to the factory's sessions; one not given is kept
```

Sets the switches of one of a factory's volumes, by its stored name: those the body gives, the others kept, its folder and mark unmoved. Answers the Volume as it reads after, with the file written.

Calls `PATCH /api/namespaces/:namespace/volumes/:name`.

Its arguments:

- namespace: The namespace the object is in: the name of its factory, default for one that names none.
- name: The object's name, unique in its namespace for its kind.
- claudeMd (--claude-md at a shell): Whether the volume's CLAUDE.md files reach the factory's sessions; absent keeps it.
- skills (--skills at a shell): Whether the skills of the volume's .claude/skills are offered to the factory's sessions; absent keeps it.

## factory_volume_rm

```text
  nemia factory volume rm <factory> <path>
    take a volume off a factory, by its path
```

Takes the volume mounted at ?path= off a factory. Answers VolumeRemoved.

Calls `DELETE /api/factories/:factory/volumes`.

Its arguments:

- factory (<factory> at a shell): The factory's name.
- path (<path> at a shell): The folder of the machine the api runs on whose volume is taken off, as it was mounted.

## factory_setting_set

```text
  nemia factory setting set <factory> <harness>.<key> <json>
    give every session of a factory's runs on a harness one of its settings,
    claude.attribution among them; its value is JSON
```

Sets one harness setting of a factory to the value the body sends. Answers the Factory as it reads after, with the file written and what it replaced.

Calls `PUT /api/factories/:name/settings/:setting`.

Its arguments:

- name: The factory's name.
- setting (<setting> at a shell): The name of the harness setting.
- value (<value> at a shell): The setting's value as JSON text, as the command line takes it.

## factory_setting_rm

```text
  nemia factory setting rm <factory> <harness>.<key>
    take a harness setting off a factory, by its key
```

Takes one harness setting off a factory. Answers the Factory as it reads after, with the file written and what it replaced.

Calls `DELETE /api/factories/:name/settings/:setting`.

Its arguments:

- name: The factory's name.
- setting (<setting> at a shell): The name of the harness setting.

## factory_cost-line_set

```text
  nemia factory cost-line set <factory> <workflow> <usd>
    set what a run of a workflow may cost before its gate says so, in dollars:
    a gate whose caps pass it is said, and never approved unasked at auto
```

Sets the cost line of one of a factory's workflows, the dollars a run of it should stay under. Answers the Factory as it reads after, with the file written and what it replaced.

Calls `PUT /api/factories/:name/costlines/:workflow`.

Its arguments:

- name: The factory's name.
- workflow (<workflow> at a shell): The name of the workflow, as the factory attaches it.
- usd (<usd> at a shell): The dollars a run of the workflow should stay under.

## factory_cost-line_rm

```text
  nemia factory cost-line rm <factory> <workflow>
    take a workflow's cost line off a factory
```

Takes back the cost line of one of a factory's workflows. Answers the Factory as it reads after, with the file written and what it replaced.

Calls `DELETE /api/factories/:name/costlines/:workflow`.

Its arguments:

- name: The factory's name.
- workflow (<workflow> at a shell): The name of the workflow, as the factory attaches it.

## factory_rules

```text
  nemia factory rules <name> [--file <path>|- | --clear]
    a factory's rules and policies: words told to every agent hired into
    it, after its custom instructions and before the step's own note,
    kept by the store with the factory. Bare, prints them; --file writes
    them (- for stdin); --clear removes them. Words only: a frontmatter
    block is refused. A run keeps the rules it was started with
```

Reads a factory's rules: the file they are kept in, their words, and why that file does not read where it does not. Answers FactoryRules.

Calls `GET /api/factories/:name/rules`.

Its arguments:

- name: The factory's name.

## factory_rules_put

```text
  nemia factory rules <name> [--file <path>|- | --clear]
    a factory's rules and policies: words told to every agent hired into
    it, after its custom instructions and before the step's own note,
    kept by the store with the factory. Bare, prints them; --file writes
    them (- for stdin); --clear removes them. Words only: a frontmatter
    block is refused. A run keeps the rules it was started with
```

Writes a factory's rules from the words the body sends. Answers FactoryRules as they are now.

Calls `PUT /api/factories/:name/rules`.

Its arguments:

- name: The factory's name.
- words: What every agent hired into the factory is told.

## factory_rules_delete

```text
  nemia factory rules <name> [--file <path>|- | --clear]
    a factory's rules and policies: words told to every agent hired into
    it, after its custom instructions and before the step's own note,
    kept by the store with the factory. Bare, prints them; --file writes
    them (- for stdin); --clear removes them. Words only: a frontmatter
    block is refused. A run keeps the rules it was started with
```

Clears a factory's rules. Answers FactoryRules, with whether there were any to remove.

Calls `DELETE /api/factories/:name/rules`.

Its arguments:

- name: The factory's name.

## factory_instruction

```text
  nemia factory instruction <name> [--path <path> | --store | --clear]
    where a factory's instruction is kept, what Nemia is to know of the
    factory (its agents are told its rules: nemia factory rules): bare,
    prints it; --path reads it from a file in the factory's first folder,
    --store keeps it in the store, --clear reads NEMIA.md in the first
    folder again
```

Reads a factory's instruction: where it is kept, its words, why the file there does not read, and whether the store keeps text for it. Answers FactoryInstruction.

Calls `GET /api/factories/:name/instruction`.

Its arguments:

- name: The factory's name.

## factory_instruction_put

```text
  nemia factory instruction <name> [--path <path> | --store | --clear]
    where a factory's instruction is kept, what Nemia is to know of the
    factory (its agents are told its rules: nemia factory rules): bare,
    prints it; --path reads it from a file in the factory's first folder,
    --store keeps it in the store, --clear reads NEMIA.md in the first
    folder again
```

Places a factory's instruction: at the path the body names, or in the store's own keeping. Answers FactoryInstruction as it is now.

Calls `PUT /api/factories/:name/instruction`.

Its arguments:

- name: The factory's name.
- path (--path at a shell): The path of a file in the factory's first folder that holds the instruction.
- store (--store at a shell): True: the store keeps the instruction.

## factory_instruction_delete

```text
  nemia factory instruction <name> [--path <path> | --store | --clear]
    where a factory's instruction is kept, what Nemia is to know of the
    factory (its agents are told its rules: nemia factory rules): bare,
    prints it; --path reads it from a file in the factory's first folder,
    --store keeps it in the store, --clear reads NEMIA.md in the first
    folder again
```

Clears where a factory's instruction is kept. Answers FactoryInstruction as it is now.

Calls `DELETE /api/factories/:name/instruction`.

Its arguments:

- name: The factory's name.

## factory_instruct

```text
  nemia factory instruct <name> --file <path>|- | --clear
    write the instruction the store keeps for a factory (- for stdin), what
    Nemia is to know of it and no step is told, or remove it with --clear
```

Writes the words the store keeps as a factory's instruction. Answers FactoryInstruction as it is now.

Calls `PUT /api/factories/:name/instruction/words`.

Its arguments:

- name: The factory's name.
- words: The text the store keeps for the factory's instruction.

## factory_instruct_delete

```text
  nemia factory instruct <name> --file <path>|- | --clear
    write the instruction the store keeps for a factory (- for stdin), what
    Nemia is to know of it and no step is told, or remove it with --clear
```

Takes off the words the store keeps as a factory's instruction, leaving where it is placed. Answers FactoryInstruction, with whether there was any text to remove.

Calls `DELETE /api/factories/:name/instruction/words`.

Its arguments:

- name: The factory's name.

## factory_revisions

```text
  nemia factory revisions <name> follow|pinned
    whether a factory's runs follow merged revisions at each filing (follow)
    or keep them until nemia refresh (pinned, the default)
```

Sets a factory's revisions policy: whether its runs follow merged revisions of their workflow or keep the one they started on. Answers the Factory as it reads after, with the file written and what it replaced.

Calls `PUT /api/factories/:name/revisions`.

Its arguments:

- name: The factory's name.
- revisions (<revisions> at a shell): Whether the factory's runs follow merged revisions or keep them.

## factory_trust

```text
  nemia factory trust <name>
    trust a factory's places for the harnesses its steps run on, so each
    place's own settings apply to them
```

Trusts a factory's places again where the store runs, asking each harness that keeps a trust. Answers FactoryTrusted, what was asked for each place.

Calls `POST /api/factories/:name/trust`.

Its arguments:

- name: The factory's name.

## factory_rm

```text
  nemia factory rm <name>
    remove a factory's file, and the instruction and the rules the store
    keeps for it
```

Removes a factory: its file, and the folder of the instruction and rules the store kept for it; a trust given to its places is left. Answers FactoryRemoved.

Calls `DELETE /api/factories/:name`.

Its arguments:

- name: The factory's name.

## retry

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
```

Asks for another try or round of the step, written as a file the next pass acts on. Answers RunAsked with a 202: the ask's file and what it asked for.

Calls `POST /api/namespaces/:namespace/runs/:name/steps/:step/retry`.

Its arguments:

- namespace: The namespace, a run's factory (default for one that names none).
- name: The run's name.
- step (<step> at a shell): The step's name.
- mode (--continue, --fresh, --recheck, --model at a shell): How the step is tried again: continue its session, start it fresh, or recheck its work; nudge is continue's former spelling.
- model (--model at a shell): The model a fresh try runs on; left out, the step's own.
- round (--round at a shell): Whether this asks another round of the loop the step closes (--round), not another try.
- message (--message at a shell): The words the try is told: an answer to its needs, or what to do differently.
- budget (--budget at a shell): A raise of the step's cap in dollars (--budget), above what its tries have cost.
- answers: One answer to each question the step asks now, as the run's decision lists them under questions (GET /api/runs/:runId/decision): question is the question's title, word for word; chose the labels of the options chosen, never their letters, several only where the question takes several (multiple); own your own words, beside a choice or instead of one.

## approve

```text
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
    alone; --message is then the note under your answers
    --budget <step>=<amount>: the cap of a step after the gate, in
    dollars, over what the step proposed for it; once for each step.
    Your approval makes the budgets the step proposed the caps of the
    steps after the gate, and auto never approves unasked a cap above
    a step's own budget
    --off: take back the approval of a step that stands approved while
    nothing it approved has been filed — an ending waiting on the base
    branch, held, or not yet ticked. The step waits at its gate again
```

Approves the step at its gate, recording who gave the approval; with off, takes the approval back. Answers RunApproved with a 202: the approval written, its file and what follows it.

Calls `POST /api/namespaces/:namespace/runs/:name/steps/:step/approve`.

Its arguments:

- namespace: The namespace, a run's factory (default for one that names none).
- name: The run's name.
- step (<step> at a shell): The step's name.
- off (--off at a shell): Takes back the approval of a step that stands approved while nothing it approved has been filed (--off), with none of the keys below.
- message (--message at a shell): The words given with the approval, which the steps after it are told.
- answers: One answer to each question the step asks now, as the run's decision lists them under questions (GET /api/runs/:runId/decision): question is the question's title, word for word; chose the labels of the options chosen, never their letters, several only where the question takes several (multiple); own your own words, beside a choice or instead of one.
- budgets: The caps the approval sets on the steps after it, each a step and its dollars.

## route

```text
  nemia route <runId> <condition> <route>
    route a condition by hand: the next tick takes your route over the
    condition's own answer, for the try it is on, and files the nodes
    whose when: names it. Refused once a node after it is filed or sent:
    nemia cancel <runId>, and start again.
```

Gives a condition step's route by hand, for its try that stands. Answers RunRouted: the condition, its try, the route and its file; the next pass files the steps whose when: names the route.

Calls `POST /api/namespaces/:namespace/runs/:name/steps/:step/route`.

Its arguments:

- namespace: The namespace, a run's factory (default for one that names none).
- name: The run's name.
- step (<step> at a shell): The step's name.
- route (<route> at a shell): The route the condition takes, one of its routes:.

## refresh

```text
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
```

Brings the run onto its workflow's newest revision, or merges its base into its branch, as the RunRefresh body asks. Answers RunRefreshed with a 202: the drift it found, or the merge it asked of the looping step.

Calls `POST /api/namespaces/:namespace/runs/:name/refresh`.

Its arguments:

- namespace: The namespace, a run's factory (default for one that names none).
- name: The run's name.
- step (<step> at a shell): With base, the looping step whose loop's work merges its base.
- base (--base at a shell): Whether the loop's work is sent to merge its base (--base), rather than the run pinned to the new revisions.

## say

```text
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
```

Says words to the step's session, from the caller and who the body says they are from; words for a step not filed yet are kept for it. Answers RunSaid with a 202: when they were taken, by which attempt, and what follows them.

Calls `POST /api/namespaces/:namespace/runs/:name/steps/:step/say`.

Its arguments:

- namespace: The namespace, a run's factory (default for one that names none).
- name: The run's name.
- step (<step> at a shell): The step's name.
- text (<text> at a shell): The words said to the step's running session.
- from: Retired: who wrote the words is the caller the token says. One naming an agent is refused; one naming the person is read no further.

## ls

```text
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
```

Lists the runs of every namespace, a page at a time, each judged into its run object; ?labelSelector= and ?fieldSelector= keep those that match. Answers a RunList, or the same page as a Table where the request asks for one.

Calls `GET /api/runs`.

Its arguments:

- limit: The most items a page holds, a whole number from 1.
- continue: The token the page before answered, to read the page after it; absent, the first page.
- labelSelector: A label query, or several given again, that keeps the objects whose labels match any of them; absent, every object.
- selector (-l at a shell): The retired spelling of labelSelector, read the same.
- resourceVersion: With watch=true on a list of events, the resourceVersion of the last event or bookmark a reader was sent, or of a page's metadata, to resume the stream from; a watch of any other list refuses one.
- fieldSelector: The runs in one state or outcome, as one term: status.state=<state> or status.state!=<state>, status.outcome=<outcome> or status.outcome!=<outcome>.

- On the port: Answers a line per item, as `ls -o wide` prints them.
- On the port: Answers 20 at most unless limit is given; a last line or metadata.continue names the token for the next page.

## ls_run

```text
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
```

Reads one run by its name in any namespace, judged into the run object. Answers the Run; one whose tasks do not all read is Unjudged.

Calls `GET /api/runs/:name`.

Its arguments:

- name: The run's name, found among the runs the store lists in any namespace.

## show

```text
  nemia show <runId> [--raw]
    the run as one object (nemia/v1 Run); --raw: its record, and
    what each step was told
```

Reads the run's record as the store keeps it, its brief and each frozen step's body cut short. Answers RunRecord.

Calls `GET /api/runs/:name/record`.

Its arguments:

- name: The run's name, found among the runs the store lists in any namespace.

## closeout

```text
  nemia closeout <runId> <step> [--try <n>]
    what a step's try signed off with: its latest, or --try <n>
```

Reads what one try of a run's step signed off with, its output narrowed to the fields asked and its body a page at a time, or why it does not read. Answers TryCloseout.

Calls `GET /api/runs/:runId/steps/:step/tries/:try/closeout`.

Its arguments:

- runId (<runId> at a shell): The run's id, found among the runs the store lists in any namespace.
- step (<step> at a shell): The step's name.
- try (--try at a shell): The try's number, from 1.
- fields: The fields of the closeout's output to answer, comma-separated, * for every one, an empty one naming none; not given, the fields whose JSON is short.
- bodyFrom: The character the closeout body starts at; 0 where not given.
- bodyLimit: How many characters of the closeout body to answer.

- On the port: Sends fields= where the call gives no fields: give it to ask otherwise.

## tries

```text
  nemia tries <runId> <step>
    a step's tries
    the port's alone: no `nemia` verb runs it at a shell
```

Reads a run's step's tries, earliest first and the current one last, each with its task, where it stands, its attempts, check and closeout, the closeout's output narrowed to the fields asked. Answers StepTries.

Calls `GET /api/runs/:runId/steps/:step/tries`.

Its arguments:

- runId (<runId> at a shell): The run's id, found among the runs the store lists in any namespace.
- step (<step> at a shell): The step's name.
- fields: The fields of the closeout's output to answer, comma-separated, * for every one, an empty one naming none; not given, the fields whose JSON is short.
- bodyFrom: The character the closeout body starts at; 0 where not given.
- bodyLimit: How many characters of the closeout body to answer.

## try

```text
  nemia try <runId> <step> <try>
    one try of a step
    the port's alone: no `nemia` verb runs it at a shell
```

Reads one try of a run's step whole: its round, its task, where it stands, its attempts, its check, its closeout or why that does not read, and a person's answer to it. Answers StepTry.

Calls `GET /api/runs/:runId/steps/:step/tries/:try`.

Its arguments:

- runId (<runId> at a shell): The run's id, found among the runs the store lists in any namespace.
- step (<step> at a shell): The step's name.
- try (<try> at a shell): The try's number, from 1.
- fields: The fields of the closeout's output to answer, comma-separated, * for every one, an empty one naming none; not given, the fields whose JSON is short.
- bodyFrom: The character the closeout body starts at; 0 where not given.
- bodyLimit: How many characters of the closeout body to answer.

- On the port: Sends fields= where the call gives no fields: give it to ask otherwise.

## told

```text
  nemia told <runId> <step>
    what a step was told
    the port's alone: no `nemia` verb runs it at a shell
```

Reads what a run's step was told: its own body in the workflow, its brief by layer, and its task by part. Answers StepTold.

Calls `GET /api/runs/:runId/steps/:step/told`.

Its arguments:

- runId (<runId> at a shell): The run's id, found among the runs the store lists in any namespace.
- step (<step> at a shell): The step's name.

## logs

```text
  nemia logs <runId> <step>
    that step's session output
```

Reads the end of a run's step's session output, its last lines as tail asks. Answers StepLog, with whether there were more.

Calls `GET /api/runs/:runId/steps/:step/log`.

Its arguments:

- runId (<runId> at a shell): The run's id, found among the runs the store lists in any namespace.
- step (<step> at a shell): The step's name.
- tail: How many of its last lines to answer.

## stats

```text
  nemia stats [--from <day>] [--to <day>] [--by agent|step|factory|workflow|repo] [--agent|--step|--factory|--workflow|--repo <v>] [-l <key>=<value>] [--line|--json]
    what every run in the store adds up to, by UTC day: rounds to
    acceptance of each loop: step, landings of the workspace: base step
    and on which try, cost and time per landed run, and each step's
    tries, time, cost, checks and gate waits; first the last 14 days
    against the 14 before. A number nothing measured reads —, never 0.
    --line: one line, for a recap; --json: the whole answer; -l: the
    runs whose labels it takes, as nemia ls -l takes them
```

Reads the flow numbers of every run in the store over the range and filters asked: each group's, the runs that did not read, and the system's health. Answers Stats.

Calls `GET /api/stats`.

Its arguments:

- from (--from at a shell): The first UTC day of the range, as YYYY-MM-DD.
- to (--to at a shell): The last UTC day of the range, as YYYY-MM-DD.
- by (--by at a shell): What the rows go by: agent, step, factory, workflow or repo.
- agent (--agent at a shell): Keep the facts of this agent.
- step (--step at a shell): Keep the facts of this step.
- workflow (--workflow at a shell): Keep the facts of this workflow.
- ofFactory: Keep the facts of this factory.
- ofRepo: Keep the facts of this repository.
- labelSelector: A label query, given once or again: keep the runs whose labels one of them takes.

## step_artifact

```text
  nemia step artifact <runId> <step> <name>
    one file of a step's files directory
    the port's alone: no `nemia` verb runs it at a shell
```

Reads a file a run's step left in its files directory, at its top or in a folder beneath it, by its path there (encoded whole as one segment, its `/` as `%2F`), as the bytes on disk with the headers that serve an agent's file safely. Answers the file, or Gone where a prune removed it.

Calls `GET /api/runs/:runId/steps/:step/artifacts/:file`.

Its arguments:

- runId (<runId> at a shell): The run's id, found among the runs the store lists in any namespace.
- step (<step> at a shell): The step's name.
- file: The file's path under the step's folder, encoded whole as one segment of the request's path, its `/` as `%2F` (`e2e%2Fbar.png`). One that climbs out (`..`), is absolute, or passes a link is refused.

## step_file

```text
  nemia step file <runId> <step> <name>
    one file of a folder step's own folder
    the port's alone: no `nemia` verb runs it at a shell
```

Reads a file of a folder step's own folder, at its top or in a folder beneath it, by its path there (encoded whole as one segment, its `/` as `%2F`), as the bytes on disk with the headers that serve an agent's file safely. Answers the file.

Calls `GET /api/runs/:runId/steps/:step/files/:file`.

Its arguments:

- runId (<runId> at a shell): The run's id, found among the runs the store lists in any namespace.
- step (<step> at a shell): The step's name.
- file: The file's path under the step's folder, encoded whole as one segment of the request's path, its `/` as `%2F` (`e2e%2Fbar.png`). One that climbs out (`..`), is absolute, or passes a link is refused.

## step_path

```text
  nemia step path <runId> <step>
    the path of a step's task through the runtime's lifecycle
    the port's alone: no `nemia` verb runs it at a shell
```

Reads the path one try of a run's step walked through the runtime's lifecycle, the latest try where none is asked. Answers StepPath: its task, the task's path and the lifecycle it walks.

Calls `GET /api/runs/:runId/steps/:step/path`.

Its arguments:

- runId (<runId> at a shell): The run's id, found among the runs the store lists in any namespace.
- step (<step> at a shell): The step's name.
- try: The try's number, from 1; the latest where not given.

## step_transcript

```text
  nemia step transcript <runId> <step>
    a read of a step's conversation
    the port's alone: no `nemia` verb runs it at a shell
```

Reads a page of a run's step's conversation from a cursor, the first or the last events after it, of the kinds asked. Answers StepTranscript: the events, the cursor to read on from, and whether the task still runs or may say more.

Calls `GET /api/runs/:runId/steps/:step/transcript`.

Its arguments:

- runId (<runId> at a shell): The run's id, found among the runs the store lists in any namespace.
- step (<step> at a shell): The step's name.
- after (--after at a shell): The cursor to read on from.
- limit (--limit at a shell): How many of the first events after the cursor to answer; never with last.
- last (--last at a shell): How many of the last events to answer; never with limit.
- kinds (--kinds at a shell): The kinds of event to answer, comma-separated; every one where not given.

- On the port: Answers 20 at most unless limit is given; a last line or metadata.continue names the token for the next page.
- On the port: Sends last=50 where the call gives no last: give it to ask otherwise.

## ceilings

```text
  nemia ceilings
    the cap on runs in flight, the runs it counts and the runs it holds
    the port's alone: no `nemia` verb runs it at a shell
```

Reads the run slots: what the daemon's last pass ran with, the cap on runs in flight, the runs that count against it and those it holds, and what the last pass cost. Answers Ceilings.

Calls `GET /api/ceilings`.

## passes

```text
  nemia passes [--last <n>] [--json]
    what the recent passes of the tick cost: their median and slowest
    time, a histogram of their times, where the time went phase by
    phase, and what the last saw — the runs in the store, its journal
    reads, the sessions queued and admitted. --last <n>: the last n
    passes only; --json: the whole answer
```

Reads the daemon's recent passes, oldest first, with the histogram of their lengths, their phases and a summary. Answers PassesRead.

Calls `GET /api/passes`.

Its arguments:

- last (--last at a shell): How many of the recent passes to read.

## series

```text
  nemia series [--range 24h|7d|30d|all] [--json]
    the system's series over a range: a pass's time and its phases, its
    journal reads, the runs in the store, the sessions queued and admitted
    and the longest wait, the load, and the quota used. --range: 24h (a
    point a minute, the default), 7d or 30d (an hour), all (a day);
    --json: the whole answer
```

Reads the floor's series over a range (24h, 7d, 30d or all), each series and label set's points in time. Answers SeriesRead.

Calls `GET /api/series`.

Its arguments:

- range (--range at a shell): The range the series are read over: 24h, 7d, 30d or all.

## agents

```text
  nemia agents [--repo .]
    the agents a step may name, the repository's then the library's: what each is
    for, what it says it can do (an entry for each skill, read off its
    SKILL.md), and the skills it is given (its skills:)
```

Lists a namespace's agents, a page at a time: the repository's, the user library's added to it and, in a factory made from a template, its tree's, each with the steps that name it and the hires that fill a step with it. ?origin= reads one origin's. Answers an AgentList, or the same page as a Table where the request asks for one.

Calls `GET /api/namespaces/:namespace/agents`.

Its arguments:

- namespace: The namespace the list is of: the name of a factory, default for one that names none.
- limit: The most items a page holds, a whole number from 1.
- continue: The token the page before answered, to read the page after it; absent, the first page.
- labelSelector: A label query, or several given again, that keeps the objects whose labels match any of them; absent, every object.
- selector: The retired spelling of labelSelector, read the same.
- resourceVersion: With watch=true on a list of events, the resourceVersion of the last event or bookmark a reader was sent, or of a page's metadata, to resume the stream from; a watch of any other list refuses one.
- origin: The one origin asked for, whose definitions are served shadowed or not, each saying what shadows it; absent, every origin.
- repo (--repo at a shell): The path on the api's machine of a repository a factory works on, or a folder under one, read as that repository; absent, the person's library and the builtins alone.

- On the port: Answers a line per item, as `agents -o wide` prints them.
- On the port: Answers 20 at most unless limit is given; a last line or metadata.continue names the token for the next page.

## agents_card

```text
  nemia agents card <name> [--repo .] [--from repo|user]
    that agent in the shape of an A2A Agent Card, JSON on stdout and
    nothing else — every field the protocol marks REQUIRED but
    supportedInterfaces, which is left out because nothing here serves an
    agent over A2A. The card describes; it is not an address
```

Reads an agent as an A2A Agent Card, with the truth about it: it is not served over A2A, and why says what the card leaves out. Answers AgentCard.

Calls `GET /api/namespaces/:namespace/agents/:name/card`.

Its arguments:

- namespace: The namespace the object is in: the name of its factory, default for one that names none.
- name (<name> at a shell): The object's name, unique in its namespace for its kind.
- origin: The one origin asked for, whose definitions are served shadowed or not, each saying what shadows it; absent, every origin.
- repo (--repo at a shell): The path on the api's machine of a repository a factory works on, or a folder under one, read as that repository; absent, the person's library and the builtins alone.

## agents_sources

```text
  nemia agents sources [--path <folder>]
    the agent files the store knows of, to copy into the store's library:
    each repository's, the library's, and those of a --path <folder>
```

The agent files the store knows of, to copy into the person's library: each repository's, the library's, and those of a folder named.

Calls `GET /api/agent-sources`.

Its arguments:

- path (--path at a shell): A folder of agent files on the api's machine, listed besides those the store knows of; absent, the store's alone.

## agents_custom

```text
  nemia agents custom <name> [--file <path>|-] [--clear] [--repo .]
    your custom instructions for that agent: words you add to it without
    rewriting it, kept in <store>/custom-instructions/<name>.md and told
    after its instructions. Bare, prints them; --file writes them (- for
    stdin); --clear removes them. Words only: a frontmatter block is
    refused. A run keeps the words it was started with; nemia, the
    store's own agent, is told them in her open session
```

Reads a person's custom instructions for an agent's name, told to whichever agent of that name a run finds: its file, its words, and why the file does not read where it does not. Answers AgentInstructions.

Calls `GET /api/namespaces/:namespace/agents/:name/instructions`.

Its arguments:

- namespace: The namespace the object is in: the name of its factory, default for one that names none.
- name (<name> at a shell): The object's name, unique in its namespace for its kind.
- repo (--repo at a shell): The path on the api's machine of a repository a factory works on, whose agents the name is looked for in; absent, the person's library and the builtins alone.

## agents_custom_put

```text
  nemia agents custom <name> [--file <path>|-] [--clear] [--repo .]
    your custom instructions for that agent: words you add to it without
    rewriting it, kept in <store>/custom-instructions/<name>.md and told
    after its instructions. Bare, prints them; --file writes them (- for
    stdin); --clear removes them. Words only: a frontmatter block is
    refused. A run keeps the words it was started with; nemia, the
    store's own agent, is told them in her open session
```

Writes the person's custom instructions for an agent's name, which every factory's steps on it are told.

Calls `PUT /api/agents/:name/instructions`.

Its arguments:

- name (<name> at a shell): The library item's name, unique in the store's library for its kind.
- repo (--repo at a shell): The path on the api's machine of a repository a factory works on, whose agents the name is looked for in; absent, the person's library and the builtins alone.
- words: What the agent is told after its own instructions; the last write wins.

## agents_custom_delete

```text
  nemia agents custom <name> [--file <path>|-] [--clear] [--repo .]
    your custom instructions for that agent: words you add to it without
    rewriting it, kept in <store>/custom-instructions/<name>.md and told
    after its instructions. Bare, prints them; --file writes them (- for
    stdin); --clear removes them. Words only: a frontmatter block is
    refused. A run keeps the words it was started with; nemia, the
    store's own agent, is told them in her open session
```

Clears the person's custom instructions for an agent's name.

Calls `DELETE /api/agents/:name/instructions`.

Its arguments:

- name (<name> at a shell): The library item's name, unique in the store's library for its kind.
- repo (--repo at a shell): The path on the api's machine of a repository a factory works on, whose agents the name is looked for in; absent, the person's library and the builtins alone.

## nemia_instructions

```text
  nemia agents custom <name> [--file <path>|-] [--clear] [--repo .]
    your custom instructions for that agent: words you add to it without
    rewriting it, kept in <store>/custom-instructions/<name>.md and told
    after its instructions. Bare, prints them; --file writes them (- for
    stdin); --clear removes them. Words only: a frontmatter block is
    refused. A run keeps the words it was started with; nemia, the
    store's own agent, is told them in her open session
```

Reads Nemia's custom instructions: the file they are kept in, their words, and why the file does not read where it does not. Answers NemiaInstructions.

Calls `GET /api/nemia/instructions`.

## nemia_instructions_put

```text
  nemia agents custom <name> [--file <path>|-] [--clear] [--repo .]
    your custom instructions for that agent: words you add to it without
    rewriting it, kept in <store>/custom-instructions/<name>.md and told
    after its instructions. Bare, prints them; --file writes them (- for
    stdin); --clear removes them. Words only: a frontmatter block is
    refused. A run keeps the words it was started with; nemia, the
    store's own agent, is told them in her open session
```

Writes Nemia's custom instructions, the words she is told after her own. Answers NemiaInstructions as they are now.

Calls `PUT /api/nemia/instructions`.

Its arguments:

- words: The words she is told after her own instructions.

## nemia_instructions_delete

```text
  nemia agents custom <name> [--file <path>|-] [--clear] [--repo .]
    your custom instructions for that agent: words you add to it without
    rewriting it, kept in <store>/custom-instructions/<name>.md and told
    after its instructions. Bare, prints them; --file writes them (- for
    stdin); --clear removes them. Words only: a frontmatter block is
    refused. A run keeps the words it was started with; nemia, the
    store's own agent, is told them in her open session
```

Clears Nemia's custom instructions. Answers NemiaInstructionsCleared, with whether there were words to remove.

Calls `DELETE /api/nemia/instructions`.

## agents_write

```text
  nemia agents write (user | factory) [<name>] --file <name>.md [--factory <name>] [--version <v>]
    an agent of the user library, or of a templated --factory, written from its file:
    <name> is the agent it changes or renames, at the --version it was
    read at; none, a new one
```

Makes an agent in the person's library; a factory resolves it once it adds it.

Calls `POST /api/agents`.

Its arguments:

- metadata: The metadata a write hands back: its name and the resourceVersion it read.
- spec: The agent as its file says it: its role, description, harness keys, skills, MCP servers, output schema and instructions.

## agents_replace

```text
  nemia agents write (user | factory) [<name>] --file <name>.md [--factory <name>] [--version <v>]
    an agent of the user library, or of a templated --factory, written from its file:
    <name> is the agent it changes or renames, at the --version it was
    read at; none, a new one
```

Writes an agent of the person's library whole, at the resourceVersion it was read at; a builtin's is written as the person's copy, which shadows it.

Calls `PUT /api/agents/:name`.

Its arguments:

- name (<name> at a shell): The library item's name, unique in the store's library for its kind.
- metadata: The metadata a write hands back: its name and the resourceVersion it read.
- spec: The agent as its file says it: its role, description, harness keys, skills, MCP servers, output schema and instructions.

## agents_copy

```text
  nemia agents copy <file> [--as <name>] [--keep <part>]...
    an agent file copied into the store's library, with its schema and skills;
    a part the library holds otherwise stops it: --as or --keep
```

Copies an agent file the store knows of into the person's library.

Calls `POST /api/agents/copy`.

Its arguments:

- file (<file> at a shell): The agent file to copy into your library, by its path as the sources list it.
- as (--as at a shell): The name it takes in your library; left out, its own.
- keep (--keep at a shell): Each skill or schema of the copy whose library's version stays, by name.

## agents_rm

```text
  nemia agents rm user <name> --version <v>
    an agent of the user library removed, at the --version it was read at
```

Removes an agent of the person's library; refused with a 409 naming each factory that uses it, and a builtin is never removed.

Calls `DELETE /api/agents/:name`.

Its arguments:

- name (<name> at a shell): The library item's name, unique in the store's library for its kind.
- resourceVersion: The resourceVersion the object was read at; the removal is refused where the files now hold another.
- repo: The path on the api's machine of a repository a factory works on, or a folder under one, read as that repository; absent, the person's library and the builtins alone.

## agents_run

```text
  nemia agents run user <name> --brief <words>
    an agent of the user library tried on a short brief, in a folder of its own,
    capped at $1
```

Tries an agent of the person's library on a short brief, in a folder of its own, under a small cap.

Calls `POST /api/agents/:name/try`.

Its arguments:

- name (<name> at a shell): The library item's name, unique in the store's library for its kind.
- brief (--brief at a shell): What the agent is asked to do.

## agents_read

```text
  nemia agents read <from> <name>
    one agent, read for its page
    the port's alone: no `nemia` verb runs it at a shell
```

Reads one of a namespace's agents by its name, with the steps that name it, the hires and factories that use it, and the revision its file holds now. Answers the Agent.

Calls `GET /api/namespaces/:namespace/agents/:name`.

Its arguments:

- namespace: The namespace the object is in: the name of its factory, default for one that names none.
- name (<name> at a shell): The object's name, unique in its namespace for its kind.
- origin: The one origin asked for, whose definitions are served shadowed or not, each saying what shadows it; absent, every origin.

## skills

```text
  nemia skills [<skills> ...]
    the skill folders named, each read
    the port's alone: no `nemia` verb runs it at a shell
```

Lists a namespace's skills, a page at a time: the factory's tree's, the repository's, the user library's and Nemia's builtin it has added, each name served once, the first origin that holds it, unless ?origin= reads one origin's. Answers a SkillList, or the same page as a Table where the request asks for one.

Calls `GET /api/namespaces/:namespace/skills`.

Its arguments:

- namespace: The namespace the list is of: the name of a factory, default for one that names none.
- limit: The most items a page holds, a whole number from 1.
- continue: The token the page before answered, to read the page after it; absent, the first page.
- labelSelector: A label query, or several given again, that keeps the objects whose labels match any of them; absent, every object.
- selector: The retired spelling of labelSelector, read the same.
- resourceVersion: With watch=true on a list of events, the resourceVersion of the last event or bookmark a reader was sent, or of a page's metadata, to resume the stream from; a watch of any other list refuses one.
- origin: The one origin asked for, whose definitions are served shadowed or not, each saying what shadows it; absent, every origin.

- On the port: Answers a line per item, as `skills -o wide` prints them.
- On the port: Answers 20 at most unless limit is given; a last line or metadata.continue names the token for the next page.

## skills_show

```text
  nemia skills show <from> <name>
    one skill, read for its page
    the port's alone: no `nemia` verb runs it at a shell
```

Reads one of a namespace's skills by its name: its SKILL.md as a draft and the folder's other text files. Answers the Skill.

Calls `GET /api/namespaces/:namespace/skills/:name`.

Its arguments:

- namespace: The namespace the object is in: the name of its factory, default for one that names none.
- name (<name> at a shell): The object's name, unique in its namespace for its kind.
- origin: The one origin asked for, whose definitions are served shadowed or not, each saying what shadows it; absent, every origin.

## skills_write

```text
  nemia skills write (user | factory) [<name>] --file <SKILL.md> [--factory <name>] [--version <v>]
    a skill of the user library, or of a templated --factory, written from its
    SKILL.md: <name> is the skill it changes, at the --version it was
    read at; none, a new one
```

Makes a skill in the person's library; a factory resolves it once it adds it.

Calls `POST /api/skills`.

Its arguments:

- metadata: The metadata a write hands back: its name and the resourceVersion it read.
- spec: The skill as its SKILL.md says it: its title, description, tags, examples, whether it is preloaded, its body, and its folder's other text files.
- preload: Whether the skill is loaded whole every turn.

## skills_replace

```text
  nemia skills write (user | factory) [<name>] --file <SKILL.md> [--factory <name>] [--version <v>]
    a skill of the user library, or of a templated --factory, written from its
    SKILL.md: <name> is the skill it changes, at the --version it was
    read at; none, a new one
```

Writes a skill of the person's library whole, at the resourceVersion it was read at; a builtin's is written as the person's copy, which shadows it.

Calls `PUT /api/skills/:name`.

Its arguments:

- name (<name> at a shell): The library item's name, unique in the store's library for its kind.
- metadata: The metadata a write hands back: its name and the resourceVersion it read.
- spec: The skill as its SKILL.md says it: its title, description, tags, examples, whether it is preloaded, its body, and its folder's other text files.
- preload: Whether the skill is loaded whole every turn.

## skills_copy

```text
  nemia skills write (user | factory) [<name>] --file <SKILL.md> [--factory <name>] [--version <v>]
    a skill of the user library, or of a templated --factory, written from its
    SKILL.md: <name> is the skill it changes, at the --version it was
    read at; none, a new one
```

Copies a builtin skill into the person's library, recording the builtin's digest so a later change is flagged.

Calls `POST /api/skills/:name/copy`.

Its arguments:

- name (<name> at a shell): The library item's name, unique in the store's library for its kind.

## cancel

```text
  nemia cancel <runId>
    stop what it has in flight; file nothing more
```

Calls the run off: asks every task it has in flight to stop, and files nothing more of it. Answers RunCancelled, the plan it followed, a run already over included.

Calls `POST /api/namespaces/:namespace/runs/:name/cancel`.

Its arguments:

- namespace: The namespace, a run's factory (default for one that names none).
- name: The run's name.

## hold

```text
  nemia hold <runId> [--until <runId> ...] [--why "<words>"] [--by <name>]
    file nothing more of a run until other runs land, as --after would
    have: what is in flight finishes, nothing new is filed, and nothing
    is asked of you — nemia ls and nemia decide say held until <run> lands, and
    what a step asks is asked once the hold lifts. The tick lifts it when
    every run named has landed. With no --until, the run is held until a
    person lifts it (--off), and no tick lifts it: nemia ls and nemia
    decide say held until a person lifts it. Refused of a run cancelled,
    pruned, finished or already held, and of a run named that is unknown,
    the run itself, or one that already waits on it, through --after or a
    hold.
    --why: the reason, shown beside held until <run> lands wherever it is
    said; --by: who puts the hold (default: your OS user).
    nemia hold <runId> --off: lift the hold now, and the next tick goes on as
    if it had never been put
```

Puts a hold on the run, until the runs the body names land or, naming none, until a person lifts it, recording who put it. Answers RunHeld.

Calls `POST /api/namespaces/:namespace/runs/:name/hold`.

Its arguments:

- namespace: The namespace, a run's factory (default for one that names none).
- name: The run's name.
- until (--until at a shell): The runs the hold waits on to land (--until); left out, a hold only a person lifts.
- why (--why at a shell): The person's words for why, one line.
- by (--by at a shell): Who puts the hold, one line.

## unhold

```text
  nemia hold <runId> [--until <runId> ...] [--why "<words>"] [--by <name>]
    file nothing more of a run until other runs land, as --after would
    have: what is in flight finishes, nothing new is filed, and nothing
    is asked of you — nemia ls and nemia decide say held until <run> lands, and
    what a step asks is asked once the hold lifts. The tick lifts it when
    every run named has landed. With no --until, the run is held until a
    person lifts it (--off), and no tick lifts it: nemia ls and nemia
    decide say held until a person lifts it. Refused of a run cancelled,
    pruned, finished or already held, and of a run named that is unknown,
    the run itself, or one that already waits on it, through --after or a
    hold.
    --why: the reason, shown beside held until <run> lands wherever it is
    said; --by: who puts the hold (default: your OS user).
    nemia hold <runId> --off: lift the hold now, and the next tick goes on as
    if it had never been put
```

Lifts the run's hold now, recording who lifted it. Answers RunHeld, lifted.

Calls `DELETE /api/namespaces/:namespace/runs/:name/hold`.

Its arguments:

- namespace: The namespace, a run's factory (default for one that names none).
- name: The run's name.

## wait

```text
  nemia wait [-l <key>=<value>]... [--from <cursor>] [--for <duration>]
    wait for the feed's next line -l takes, and print it with the
    cursor after it: from --from (a cursor a wait or nemia watch printed),
    else from the feed's end now. It ends on the first lines -l takes, or
    after --for (4m by default, at most 270s) with none, and prints the
    cursor either way: wait again from it and no line is lost.
    -l: as nemia watch -l takes it, given again for another; none takes
    every line.
```

Waits on the feed for lines the label queries take, from a cursor, up to a bound. Answers FeedWait: why it ended, the lines as Events, and the cursor the next wait starts from. It is the fallback for a client that can only call tools, and it polls: the MCP port's instructions name the two ways that need no polling, a channel and a subscriptions/listen stream of the feed's resources.

Calls `GET /api/feed/wait`.

Its arguments:

- labelSelector: A label query, given once or again, each as `nemia watch -l` takes it.
- from (--from at a shell): The cursor to read from; the feed's end when none.
- for (--for at a shell): The bound, as `nemia wait --for` takes it (30s, 4m).

## rm

```text
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
```

Removes a try, a run started from an agent's page; with whole=true, any run as a whole: its worktrees removed through git, its branches kept unless deleteBranches asks. Answers RunRemoved: what the engine forgot of it and what became of its worktrees, branches and files.

Calls `DELETE /api/namespaces/:namespace/runs/:name`.

Its arguments:

- namespace: The namespace, a run's factory (default for one that names none).
- name: The run's name.
- whole: true to remove a run of a workflow as nemia rm does, its worktrees removed through git and its branches kept; left out, only a try is removed.
- deleteBranches (--delete-branches at a shell): true to delete its branches merged into its base too.
- forceUnmerged (--force-unmerged at a shell): true, beside deleteBranches, to delete the unmerged ones too, with their work.

## prune

```text
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
```

Lets go of what a run no longer needs: its lines, its worktrees and its files, keeping what cannot go yet with why; with preview, lists what it would free and removes nothing. Answers RunPruned.

Calls `POST /api/namespaces/:namespace/runs/:name/prune`.

Its arguments:

- namespace: The namespace, a run's factory (default for one that names none).
- name: The run's name.
- unmerged (--unmerged at a shell): Prunes a run nobody merged (--unmerged).
- artifacts (--artifacts at a shell): Prunes its steps' files too (--artifacts).
- preview: Judges and lists it with what it would free, removing nothing, as nemia prune does before it asks.

## pause

```text
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
```

Pauses the store: no pass starts new work, and each session parks at the end of its tool call, a call still in flight past the timeout cut; with now, the work in flight is cut at once. Answers the pause put, with what it cut and left, or that an earlier pause was kept.

Calls `POST /api/pause`.

Its arguments:

- why (--why at a shell): Why to pause.
- by (--by at a shell): Who pauses.
- timeout (--timeout at a shell): How long a call in flight is given, as 15m; the store timeout where left out.
- now (--now at a shell): Whether to pause at once, cutting what is at work.

## pause-timeout

```text
  nemia pause-timeout [<d>]
    the store's pause timeout: how long nemia pause, nemia service restart and
    nemia upgrade give each tool call in flight to end before it is cut; bare,
    the timeout in force (10m by default); given one, sets it: digits and s, m
    or h, from 1s to 23h, as 90s, 10m or 2h. nemia pause --timeout <d> gives one
    pause a timeout of its own
```

Reads the store's pause timeout in force, how long a tool call in flight is given to end when the store is paused or restarted before it is cut. Answers PauseTimeoutAnswer.

Calls `GET /api/pause/timeout`.

## pause_timeout_set

```text
  nemia pause-timeout [<d>]
    the store's pause timeout: how long nemia pause, nemia service restart and
    nemia upgrade give each tool call in flight to end before it is cut; bare,
    the timeout in force (10m by default); given one, sets it: digits and s, m
    or h, from 1s to 23h, as 90s, 10m or 2h. nemia pause --timeout <d> gives one
    pause a timeout of its own
```

Sets the store's pause timeout from the body. Answers PauseTimeoutAnswer, the timeout in force and that this call wrote it.

Calls `PUT /api/pause/timeout`.

Its arguments:

- timeout (<timeout> at a shell): The new timeout (`nemia pause-timeout <d>`): digits and s, m or h, from 1s to 23h, as 10m.

## resume

```text
  nemia resume
    resume the store: each session parked goes on as the same try, and the
    next pass files what waits
```

Lifts the store's pause: each parked session goes on as the same try, and the next pass files what waits. Answers Resumed, the pause lifted.

Calls `DELETE /api/pause`.

## paused

```text
  nemia paused
    the store's pause, what finishes under it, and each check it holds, a landing with its merge staged among them
    the port's alone: no `nemia` verb runs it at a shell
```

Reads the store's pause, or null where none stands, with each task still finishing under it and each session, landing and check it holds. Answers Paused.

Calls `GET /api/pause`.

## pause_now

```text
  nemia pause now
    what a pause at once would stop, each task at work but a landing, and what that costs
    the port's alone: no `nemia` verb runs it at a shell
```

Reads what a pause at once would cut, each task at work but a landing, and what that costs. Answers PauseNowRead.

Calls `GET /api/pause/now`.

## subscribe

```text
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
```

Gives a long-lived task a subscription to the feed under the name in the path: the lines its selectors and level keep, said to it from the feed's end, in digests where asked. It gives the feed to a long-lived task of this store's engine alone, and is no way for a client outside it to be told of the feed. Answers Subscribed with a 201, the subscription as written.

Calls `POST /api/subscriptions/:name`.

Its arguments:

- name (<name> at a shell): The subscription's name.
- task (<task> at a shell): The task told to the long-lived session when a line wakes it.
- selectors (-l at a shell): The selectors of the lines that wake it; waits=person where left out.
- digestEvery (--digest-every at a shell): The minutes a digest waits; 60 where left out.
- atLeast (--at-least at a shell): The level a run's factory is at least at; kept as text.

## unsubscribe

```text
  nemia unsubscribe <name>
    take the subscription <name> away: its task is told nothing more of the feed
```

Takes a subscription away, removing its file. Answers Unsubscribed, its name.

Calls `DELETE /api/subscriptions/:name`.

Its arguments:

- name (<name> at a shell): The subscription's name.

## level

```text
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
```

Reads where Nemia is: the store's level and since when, her task and its session, how a person reaches her, what her ended sessions cost, and each factory's level. Answers NemiaLevel.

Calls `GET /api/level`.

## level_set

```text
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
```

Sets the store's level, or a factory's default, raised for a stretch or its raise ended, as the body says. Answers NemiaLevel, where she is after.

Calls `PUT /api/level`.

Its arguments:

- level (<level> at a shell): The level to set: the store's, or with `factory` that factory's default.
- factory (--factory at a shell): The factory whose level is raised or whose raise is ended.
- for (--for at a shell): How long the raise lasts, as a duration like `2h`.
- end (--end at a shell): Whether to end the factory's raise.

## memory

```text
  nemia memory [<fact>]
    what Nemia keeps of the store: bare, her facts' names; given one, its
    words. Read only: her session alone writes them
```

Reads the facts Nemia keeps: the folder they are in and their names. Answers NemiaMemory.

Calls `GET /api/nemia/memory`.

## memory_fact

```text
  nemia memory [<fact>]
    what Nemia keeps of the store: bare, her facts' names; given one, its
    words. Read only: her session alone writes them
```

Reads one of the facts Nemia keeps, by its name, with its words. Answers NemiaMemory.

Calls `GET /api/nemia/memory/:fact`.

Its arguments:

- fact (<fact> at a shell): The name of the fact asked.

## policy

```text
  nemia policy <agent>
    the agent's rules at auto: the answers it may give unasked, in force once
    you confirm them, and what it proposed from your custom instruction,
    with the words the machinery cannot hold, kept as guidance
```

Reads an agent's rules for auto: the person's list, the rules in force, what the agent proposed, its custom instruction, and the builtin rule. Answers PolicyList.

Calls `GET /api/policy/:name`.

Its arguments:

- name (<name> at a shell): The agent's name.

## policy_propose

```text
  nemia policy propose <agent> --file <path>|-
    the agent's proposal: rules from your custom instruction, as JSON,
    with the words the machinery cannot hold kept as guidance; none is in
    force until you confirm it (nemia policy confirm)
```

Records what an agent proposes from its custom instruction, the rules and the guidance the body's words hold, over what it proposed before. Answers PolicyList as it is after.

Calls `PUT /api/policy/:name/proposal`.

Its arguments:

- name (<name> at a shell): The agent's name.
- words: The proposal as JSON text, `{ "rules": [...], "guidance": [...] }`: the rules it proposes and the words kept as guidance.

## policy_confirm

```text
  nemia policy confirm <agent> <id> --words '<words>'
    put in force a rule the agent proposed, or the default again, as its
    words read: from then on, at auto, the answer it names is given unasked
    where it holds. Refused once the rule reads otherwise. Your first confirm
    keeps the default beside it. Asked of you every time
```

Puts in force a rule the agent proposed, as the person read it, by the words the body sends, which must be the rule's. Answers PolicyList as it is after.

Calls `PUT /api/policy/:name/rules/:id`.

Its arguments:

- name (<name> at a shell): The agent's name.
- id (<id> at a shell): The rule's id.
- words (--words at a shell): The rule as the person read it, so what is confirmed is what they read.

## policy_rm

```text
  nemia policy rm <agent> <id>
    take a rule out of force, the default among them: what it allowed is
    asked of you again. Asked of you every time
```

Takes a rule of an agent's out of force, the builtin one among them. Answers PolicyList as it is after.

Calls `DELETE /api/policy/:name/rules/:id`.

Its arguments:

- name (<name> at a shell): The agent's name.
- id (<id> at a shell): The rule's id.

## policy_reach

```text
  nemia policy reach <agent> (--factory <name> | --run <runId>)
    which steps at their gate the agent's rules in force could ever approve
    unasked, in a factory or a run: why each other rule cannot (a step approved
    before it runs has done nothing to recommend or check; one with no check
    never passed one), what keeps a rule from a run now, and the rules that would
```

Reads how far an agent's rules in force reach in a factory: how many of the steps at their gate they reach, a row for each, the rules suggested for the rest, and the whole proposal to propose them by. Answers PolicyReach.

Calls `GET /api/policy/:name/reach`.

Its arguments:

- name (<name> at a shell): The agent's name.
- factory (--factory at a shell): The factory whose steps at their gate are read; exactly one of `factory` and `run`.
- run: The run whose steps at their gate are read; exactly one of `factory` and `run`.

## doctor

```text
  nemia doctor [--json]
    every piece this server needs before a run: each harness installed and
    signed in, the service and its linger, the bind, the machine, the git
    identity, each factory's workflows' and repository's needs, a factory, a
    newer release — each in place or missing, with the command or fix that
    puts it there. --json: the whole read
```

Reads every piece the server needs to run its factories, each in place, missing or not activated, what it costs while missing, and the fix that puts it there. Answers Readiness.

Calls `GET /api/readiness`.

## doctor_fix

```text
  nemia doctor fix <need> [--factory <factory> [--workflow <workflow>]] [--index <n>] [--answer <name>=<value>]... [--detach]
    start a need's fix on this server, as nemia doctor lists it: a place's
    or a harness's need by its name, a workflow's with its --factory and
    --workflow, a repository's with its --factory alone; --index picks
    among its fixes, --answer gives each answer it asks. Follows what it
    prints to its end, a code it shows set apart; --detach starts it and
    returns
```

Starts one of a missing piece's fixes on the server, with the answers its asks were given. Answers the Fix started: its id, what it fixes and its phase.

Calls `POST /api/readiness/fixes`.

Its arguments:

- need (<need> at a shell): The need whose fix to start.
- factory (--factory at a shell): The factory of a workflow's need, or the factory alone of a repository's need; absent for a place's or a harness's.
- workflow (--workflow at a shell): The workflow of a workflow's need.
- index (--index at a shell): Which of its fixes to start; the first where left out.
- answers: The answers its asks were given, by their names.

## token_add

```text
  nemia token add <name> [--agent <agent> [--factory <factory>] [--narrow read|act]]
    mint a token under a name, printed this once: the store keeps only its
    digest. With no --agent it is yours, named for the device it is for: a
    request presenting it, as Authorization: Bearer <token>, is you. With
    --agent <agent> it is that agent: it reaches what an agent may at the
    factories' levels, in one factory with --factory, and no higher than
    --narrow read (reads alone) or act (no answers). nemia token rm frees it
```

Mints a standing token for the person under a device's name, or for an agent, bound to a factory or store-wide and maybe narrowed. Answers TokenMinted with a 201, the token itself once, which the store keeps only the digest of.

Calls `POST /api/tokens`.

Its arguments:

- name (<name> at a shell): The new token's name: for the person's, the device it is for.
- agent (--agent at a shell): The agent that holds it; left out, the token is the person's, and factory and narrowed are refused.
- factory (--factory at a shell): The factory an agent's token is bound to; left out, it is store-wide.
- narrowed (--narrow at a shell): How an agent's token is narrowed below its floor; left out, it is not.

## token_ls

```text
  nemia token ls
    the tokens you minted, by name: who holds each, the factory and the
    narrowing of an agent’s, and when it was minted. Never a token itself
```

Lists the standing tokens the store keeps by name, each with who holds it, the factory it is bound to and its narrowing; never the token. Answers TokenList.

Calls `GET /api/tokens`.

## token_rm

```text
  nemia token rm <name>
    retire the token named <name>: a request presenting it is refused
    from then on
```

Retires a standing token by its name, so it is refused from then on. Answers the Token retired.

Calls `DELETE /api/tokens/:name`.

Its arguments:

- name (<name> at a shell): The name of the token to retire.

## pairings_ls

```text
  nemia pairings ls
    the pairings the store keeps, newest first: the client that asked, and
    whether it waits for your approval, is approved, was claimed or lapsed.
    Never a code: approve the one the client shows with nemia pairings approve
```

Lists the pairings the store keeps, newest first, never their code nor their secret. Answers PairingList.

Calls `GET /api/pairings`.

## pairings_approve

```text
  nemia pairings approve <code>
    approve the pairing whose code a client shows (XXXX-XXXX, in either
    case, the dash left out or not): the client's next ask claims a token
    of yours minted then, named after it; nemia token rm <name> revokes it
```

Approves a pairing by the short code the client shows, so the client may claim it. Answers the Pairing.

Calls `POST /api/pairings/approve`.

Its arguments:

- code (<code> at a shell): The pairing's short code, as the client shows it, in either case, with or without its dash.

## board_link

```text
  nemia board link [--base <url>]
    a first-visit link to the board, opened once within ten minutes: the
    browser that opens it is signed in with a token of yours minted then,
    named board-<day>. Printed under where the api serves (its bound
    address, or localhost); --base <url> prints it under another, the name
    you reach the board by (a browser keeps one cookie per host name).
    nemia open opens it in your browser instead
```

Mints a single-use first-visit link the browser that opens it claims, with no approval. Answers LinkMinted, once: the link to open and when it lapses.

Calls `POST /api/links`.

Its arguments:

- base (--base at a shell): The base the link is printed under; the board's own address where left out.

## open

```text
  nemia open [--base <url>]
    open the board in this machine's browser, signed in: a first-visit link
    is minted (a token of yours, named board-<day>) and opened, under
    localhost on this machine, or the server a remote context names. Where
    no browser can be opened the link is printed, to open once within ten
    minutes; --base <url> mints it under the name you reach the board by
```

Mints a single-use first-visit link the browser that opens it claims, with no approval. Answers LinkMinted, once: the link to open and when it lapses.

Calls `POST /api/links`.

Its arguments:

- base (--base at a shell): The base the link is printed under; the board's own address where left out.

## upgrade

```text
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
```

Starts the server's upgrade to the release the body's tag names, run as a job of the engine that outlives the daemon it restarts. Answers the Upgrade started.

Calls `POST /api/upgrades`.

Its arguments:

- tag (<tag> at a shell): The release to upgrade the server to, by its tag (v0.4.0), as `nemia upgrade <tag>` takes it.

## daemon

```text
  nemia daemon [--json]
    the store's daemon, started where none ticks it (as any command that
    ticks starts it, unless NEMIA_DAEMON_START=off): its state, its pid and
    the url the api serves at, from its lease. --json: the whole answer
```

Reads the store's daemon as its file says itself: where it stands, who started it, where it serves and when it last moved. Answers Daemon.

Calls `GET /api/daemon`.

## workflows_write

```text
  nemia workflows write (user | factory) <name> --folder <draft> [--factory <name>] [--version <v>]
    a workflow folder of the user library, or of a templated --factory, written from
    a draft folder, its steps, README, scripts and schemas, leaving a file
    it does not carry; one there already, at the --version it was read at
```

Makes a workflow in the person's library, whatever builtin holds its name; a factory attaches it to run it.

Calls `POST /api/workflows`.

Its arguments:

- metadata: The workflow to make, by its name.
- spec: The workflow as its files hold it, the shape a proposal carries: its README whole, each step's file in file-name order, and the folder's other text files.

## workflows_replace

```text
  nemia workflows write (user | factory) <name> --folder <draft> [--factory <name>] [--version <v>]
    a workflow folder of the user library, or of a templated --factory, written from
    a draft folder, its steps, README, scripts and schemas, leaving a file
    it does not carry; one there already, at the --version it was read at
```

Writes a workflow of the person's library whole, at the resourceVersion it was read at; a builtin's is written as the person's copy.

Calls `PUT /api/workflows/:name`.

Its arguments:

- name (<name> at a shell): The library item's name, unique in the store's library for its kind.
- metadata: The metadata a write hands back: its name and the resourceVersion it read.
- spec: The workflow as its files hold it, the shape a proposal carries: its README whole, each step's file in file-name order, and the folder's other text files.
- schemas: The schema files beside the steps.

## workflows_rm

```text
  nemia workflows rm user <name> --version <v>
    a workflow folder of the user library removed, at the --version it was read at
```

Removes a workflow of the person's library; refused with a 409 naming each factory that attaches it, and a builtin is never removed.

Calls `DELETE /api/workflows/:name`.

Its arguments:

- name (<name> at a shell): The library item's name, unique in the store's library for its kind.
- resourceVersion: The resourceVersion the object was read at; the removal is refused where the files now hold another.
- repo: The path on the api's machine of a repository a factory works on, or a folder under one, read as that repository; absent, the person's library and the builtins alone.

## workflows_step

```text
  nemia workflows step <from> <name> <step>
    one step of a workflow folder, loaded
    the port's alone: no `nemia` verb runs it at a shell
```

Reads one step of a workflow for its page, in the namespace's factory: what it would be told by layer, the agent hired into it and the factories that hire into it, where each of its skills is found, and its newest runs. Answers WorkflowStepPage.

Calls `GET /api/namespaces/:namespace/workflows/:name/steps/:step`.

Its arguments:

- namespace: The namespace the object is in: the name of its factory, default for one that names none.
- name (<name> at a shell): The object's name, unique in its namespace for its kind.
- step (<step> at a shell): The name of the step in the workflow.
- origin: The one origin asked for, whose definitions are served shadowed or not, each saying what shadows it; absent, every origin.

## decide

```text
  nemia decide <runId> [--sensitive <globs>]
    what the run produced, and the choice it leaves you (nemia decide --help)
```

Reads what there is to decide of the run: what it changed, its checks, its reviews, its cost and the questions waiting on you, or why there is nothing yet (waiting, holding, running). Answers RunDecision, the files ?sensitive= names shown in full and the diffs ?diffs= names whole.

Calls `GET /api/runs/:runId/decision`.

Its arguments:

- runId: The run's id.
- sensitive: Comma-separated globs whose changed files the decision shows in full (nemia decide --sensitive); else the defaults.
- diffs: Comma-separated paths whose diffs it answers whole, * for every one; every other file's lines are left out, its path and counts kept. Not given, no diff is answered whole.

- On the port: Sends diffs= where the call gives no diffs: give it to ask otherwise.

## explain

```text
  nemia explain <resource>[.<field>]...
    what a resource the api serves is, and each of its fields (nemia explain --help)
```

Reads every resource the api serves, read off its own definition: each one's name, singular, kind, scope and verbs, as Kubernetes' /api says them. Answers APIResourceList.

Calls `GET /api`.

## quota

```text
  nemia quota [--json]
    the subscription's quota: each window's used share and when it
    resets, or the api's sentence why there is none; --json: the whole
    answer
```

Reads the subscription's quota as the board is given it: its windows when fresh, or why there are none. Answers Quota.

Calls `GET /api/quota`.

## library

```text
  nemia library [skills|agents|mcpservers|workflows [<name>] [--json]] [--factory <factory>]
    the store's library: the user library's skills, agents, MCP servers and
    workflows beside the builtins, each with the factories that add it;
    --factory: that factory's adds, each with its state and the fix of a missing one;
    given a kind and a name, that item whole, as YAML (--json: as JSON)
```

The store's library of skills: the person's beside the builtins, each with the factories that use it and what shadows it.

Calls `GET /api/skills`.

Its arguments:

- limit: The most items a page holds, a whole number from 1.
- continue: The token the page before answered, to read the page after it; absent, the first page.
- labelSelector: A label query, or several given again, that keeps the objects whose labels match any of them; absent, every object.
- selector: The retired spelling of labelSelector, read the same.
- resourceVersion: With watch=true on a list of events, the resourceVersion of the last event or bookmark a reader was sent, or of a page's metadata, to resume the stream from; a watch of any other list refuses one.
- origin: The one origin asked for, whose definitions are served shadowed or not, each saying what shadows it; absent, every origin.

- On the port: Answers a line per item, as `library -o wide` prints them.
- On the port: Answers 20 at most unless limit is given; a last line or metadata.continue names the token for the next page.

## library_agents

```text
  nemia library [skills|agents|mcpservers|workflows [<name>] [--json]] [--factory <factory>]
    the store's library: the user library's skills, agents, MCP servers and
    workflows beside the builtins, each with the factories that add it;
    --factory: that factory's adds, each with its state and the fix of a missing one;
    given a kind and a name, that item whole, as YAML (--json: as JSON)
```

The store's library of agents: the person's beside the builtins, each with the factories that use it and what shadows it.

Calls `GET /api/agents`.

Its arguments:

- limit: The most items a page holds, a whole number from 1.
- continue: The token the page before answered, to read the page after it; absent, the first page.
- labelSelector: A label query, or several given again, that keeps the objects whose labels match any of them; absent, every object.
- selector: The retired spelling of labelSelector, read the same.
- resourceVersion: With watch=true on a list of events, the resourceVersion of the last event or bookmark a reader was sent, or of a page's metadata, to resume the stream from; a watch of any other list refuses one.
- origin: The one origin asked for, whose definitions are served shadowed or not, each saying what shadows it; absent, every origin.

- On the port: Answers a line per item, as `library -o wide` prints them.
- On the port: Answers 20 at most unless limit is given; a last line or metadata.continue names the token for the next page.

## library_mcpservers

```text
  nemia library [skills|agents|mcpservers|workflows [<name>] [--json]] [--factory <factory>]
    the store's library: the user library's skills, agents, MCP servers and
    workflows beside the builtins, each with the factories that add it;
    --factory: that factory's adds, each with its state and the fix of a missing one;
    given a kind and a name, that item whole, as YAML (--json: as JSON)
```

The store's library of MCP servers: the person's, recorded once for every factory that adds one, beside those Nemia offers, each with the factories that add it.

Calls `GET /api/mcpservers`.

Its arguments:

- limit: The most items a page holds, a whole number from 1.
- continue: The token the page before answered, to read the page after it; absent, the first page.
- labelSelector: A label query, or several given again, that keeps the objects whose labels match any of them; absent, every object.
- selector: The retired spelling of labelSelector, read the same.
- resourceVersion: With watch=true on a list of events, the resourceVersion of the last event or bookmark a reader was sent, or of a page's metadata, to resume the stream from; a watch of any other list refuses one.

- On the port: Answers 20 at most unless limit is given; a last line or metadata.continue names the token for the next page.

## library_workflows

```text
  nemia library [skills|agents|mcpservers|workflows [<name>] [--json]] [--factory <factory>]
    the store's library: the user library's skills, agents, MCP servers and
    workflows beside the builtins, each with the factories that add it;
    --factory: that factory's adds, each with its state and the fix of a missing one;
    given a kind and a name, that item whole, as YAML (--json: as JSON)
```

The store's library of workflows: the person's beside the builtins, each with the factories that attach it and what shadows it.

Calls `GET /api/workflows`.

Its arguments:

- limit: The most items a page holds, a whole number from 1.
- continue: The token the page before answered, to read the page after it; absent, the first page.
- labelSelector: A label query, or several given again, that keeps the objects whose labels match any of them; absent, every object.
- selector: The retired spelling of labelSelector, read the same.
- resourceVersion: With watch=true on a list of events, the resourceVersion of the last event or bookmark a reader was sent, or of a page's metadata, to resume the stream from; a watch of any other list refuses one.
- origin: The one origin asked for, whose definitions are served shadowed or not, each saying what shadows it; absent, every origin.

- On the port: Answers 20 at most unless limit is given; a last line or metadata.continue names the token for the next page.

## library_adds

```text
  nemia library [skills|agents|mcpservers|workflows [<name>] [--json]] [--factory <factory>]
    the store's library: the user library's skills, agents, MCP servers and
    workflows beside the builtins, each with the factories that add it;
    --factory: that factory's adds, each with its state and the fix of a missing one;
    given a kind and a name, that item whole, as YAML (--json: as JSON)
```

The library items a factory has added, each with what it is there: resolved, shadowed by the factory's own, or missing from the library.

Calls `GET /api/namespaces/:namespace/libraryadds`.

Its arguments:

- namespace: The namespace the list is of: the name of a factory, default for one that names none.
- limit: The most items a page holds, a whole number from 1.
- continue: The token the page before answered, to read the page after it; absent, the first page.
- labelSelector: A label query, or several given again, that keeps the objects whose labels match any of them; absent, every object.
- selector: The retired spelling of labelSelector, read the same.
- resourceVersion: With watch=true on a list of events, the resourceVersion of the last event or bookmark a reader was sent, or of a page's metadata, to resume the stream from; a watch of any other list refuses one.

- On the port: Answers 20 at most unless limit is given; a last line or metadata.continue names the token for the next page.

## library_skill

```text
  nemia library [skills|agents|mcpservers|workflows [<name>] [--json]] [--factory <factory>]
    the store's library: the user library's skills, agents, MCP servers and
    workflows beside the builtins, each with the factories that add it;
    --factory: that factory's adds, each with its state and the fix of a missing one;
    given a kind and a name, that item whole, as YAML (--json: as JSON)
```

One skill of the store's library by its name, the person's first, with the factories that use it.

Calls `GET /api/skills/:name`.

Its arguments:

- name (<name> at a shell): The library item's name, unique in the store's library for its kind.
- origin: The one origin asked for, whose definitions are served shadowed or not, each saying what shadows it; absent, every origin.

## library_agent

```text
  nemia library [skills|agents|mcpservers|workflows [<name>] [--json]] [--factory <factory>]
    the store's library: the user library's skills, agents, MCP servers and
    workflows beside the builtins, each with the factories that add it;
    --factory: that factory's adds, each with its state and the fix of a missing one;
    given a kind and a name, that item whole, as YAML (--json: as JSON)
```

One agent of the store's library by its name, the person's first, with the factories that use it.

Calls `GET /api/agents/:name`.

Its arguments:

- name (<name> at a shell): The library item's name, unique in the store's library for its kind.
- origin: The one origin asked for, whose definitions are served shadowed or not, each saying what shadows it; absent, every origin.

## library_mcpserver

```text
  nemia library [skills|agents|mcpservers|workflows [<name>] [--json]] [--factory <factory>]
    the store's library: the user library's skills, agents, MCP servers and
    workflows beside the builtins, each with the factories that add it;
    --factory: that factory's adds, each with its state and the fix of a missing one;
    given a kind and a name, that item whole, as YAML (--json: as JSON)
```

One MCP server of the store's library, the person's or a builtin, by its name.

Calls `GET /api/mcpservers/:name`.

Its arguments:

- name (<name> at a shell): The library item's name, unique in the store's library for its kind.

## library_workflow

```text
  nemia library [skills|agents|mcpservers|workflows [<name>] [--json]] [--factory <factory>]
    the store's library: the user library's skills, agents, MCP servers and
    workflows beside the builtins, each with the factories that add it;
    --factory: that factory's adds, each with its state and the fix of a missing one;
    given a kind and a name, that item whole, as YAML (--json: as JSON)
```

One workflow of the store's library by its name, the person's first, with the factories that attach it.

Calls `GET /api/workflows/:name`.

Its arguments:

- name (<name> at a shell): The library item's name, unique in the store's library for its kind.
- origin: The one origin asked for, whose definitions are served shadowed or not, each saying what shadows it; absent, every origin.

## lines

```text
  nemia lines <runId> [--json]
    the lines a run keeps: its decide and refresh lines, each step's,
    the card it came from, as YAML; --json: as JSON
```

Reads the lines kept beside the run object: its decide and refresh lines, each step's, the card it came from and its workflow's page address. Answers RunLines, constant for a run.

Calls `GET /api/runs/:name/lines`.

Its arguments:

- name: The run's name, found among the runs the store lists in any namespace.

## server_version

```text
  nemia server version [--json]
    the release the server runs and the newest it knows of, as YAML;
    --json: as JSON. nemia version is this machine's
```

Reads the release the api runs, the code it was built from, and the newest release the daemon knows of. Answers VersionAnswer.

Calls `GET /api/version`.

## server_upgrades

```text
  nemia server upgrades [--json]
    the server's last upgrade and the release going back goes to, as
    YAML; --json: as JSON
```

Reads the release going back would go to and the store's last upgrade. Answers UpgradesRead.

Calls `GET /api/upgrades`.

## capabilities

```text
  nemia capabilities [--factory <factory>] [--repo <path>] [--json]
    the harnesses, models, skills and servers a step may be given, as
    YAML, in a factory or a repository of it; --json: as JSON
```

Reads what the repository the request's ?factory= and ?repo= resolve offers a step: its skills, agents, MCP servers and permission rules, the read-only commands, and what each step of each workflow gets. Answers the capabilities, or why no repository was read.

Calls `GET /api/capabilities`.

Its arguments:

- factory (--factory at a shell): The factory the request is answered in.
- repo (--repo at a shell): The repository of that factory the request is answered in.

## repository

```text
  nemia repository [--factory <factory>] [--repo <path>] [--json]
    the repository a factory works in, as the server reads it, as YAML;
    --json: as JSON
```

Reads the repository a start runs in, as the request's ?factory= and ?repo= resolve it. Answers RepositoryAnswer.

Calls `GET /api/repository`.

Its arguments:

- factory (--factory at a shell): The factory the request is answered in.
- repo (--repo at a shell): The repository of that factory the request is answered in.

## store

```text
  nemia store [--json]
    where the store keeps its workflows, agents and skills, with the
    commands that file a factory and turn Nemia on, as YAML; --json: as JSON
```

Reads your store's folders of workflows, agents and skills, the line that files a factory in it and the line that turns Nemia on. Answers YourStore.

Calls `GET /api/store`.

## milestones

```text
  nemia milestones [--json]
    how far the store is towards its first landed change, each milestone
    done or not, as YAML; --json: as JSON
```

Reads where the store stands on the way to its first landed change: a harness, a factory, a volume and a run landed, each done by what the store holds now. Answers Milestones.

Calls `GET /api/readiness/milestones`.

## factory_commands

```text
  nemia factory commands <factory> [--json]
    the commands a factory's steps run, its checks among them, as YAML;
    --json: as JSON
```

Reads the command lines a person types for a factory, built off the command table: each of its verbs with the factory's name filled in, and the line that takes back each schedule and volume. Answers FactoryCommands.

Calls `GET /api/factories/:name/commands`.

Its arguments:

- name: The factory's name.

## factory_server_sign-in

```text
  nemia factory server sign-in <factory> <server> [--json]
    where the sign-in of a factory's MCP server stands, as YAML;
    --json: as JSON
```

Reads where signing a factory's MCP server in stands. Answers SignInState.

Calls `GET /api/namespaces/:namespace/mcpservers/:name/sign-in`.

Its arguments:

- namespace: The namespace the object is in: the name of its factory, default for one that names none.
- name: The object's name, unique in its namespace for its kind.

## workflows_keys

```text
  nemia workflows keys [--json]
    every key a workflow's step takes, its kind and what it means, as
    YAML; --json: as JSON
```

The builder's form: every key a step takes, with its kind and what it means.

Calls `GET /api/workflow-keys`.

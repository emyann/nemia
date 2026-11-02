# The orchestrator's model

The orchestrator's model is its entities as Effect Schemas, each context's beside its glossary in a `<context>.model.ts` file: run-core's
in `src/record/record.model.ts` — a run (the aggregate), its steps, their tries, a round asked of a loop, and a landing — with every
identifier branded by one helper (`src/model/brand.model.ts`), checked on create by its writer's own rule and nominal on read, so no
record already written becomes unreadable. Each aggregate's invariants are checks on its schema, each citing the line of the writer
that upholds it. A relation to another layer is an identifier only: a try names the runtime's `TaskId`, which the diagram draws as a
node known by its id and no block. A model is a declaration: in S1 nothing reads through it, and its doors adopt it slice by slice.
The diagram below is printed by the code (`src/model/diagram.model.ts`, through the printer in `src/model/er.model.ts`), never drawn.

## The seams S1 leaves

- **S2, the Run door.** `readRun` decodes a record through `Run` with `Schema.decodeUnknownEffect`, behind a `Context.Service` with a
  files layer and a memory layer, as the runtime's `Journal` is; a record an invariant refuses is then named, not read.
- **S3, the Card door**, landed: the inbox's cards and the tick's tries behind `CardDoor` (`src/cards/cards.store.ts`), rooted, its
  writes checked by `CardName.OnCreate`, the card's reader and `MissedStart`; one run per card held at the Run door's create by a `wx`
  claim under `<root>/started/`.
- **S4, the Task and its Journal**, the runtime's: its model is its own (`agent-runtime/src/core/model.ts`), and run-core keeps holding
  `TaskId` by key alone; S4 picks the pattern a task's id is checked by on create.
- **S5, the definitions**, each read and written through a door on the Run door's pattern, its files today's. **S5a**, the Factory door
  (`FactoryDoor`, `src/factories/factories.store.ts`): a factory, its level, rules and servers, rooted at the store's root a program is
  given (`rootedDoor`), its wiring judged by `wiring.ts`, whose refusals `contracts/wiring.contract.ts` proves; the callers still on its stores are
  counted in `test/factory-door.baseline.ts`. **S5b**, the Workflow door (`WorkflowDoor`, `src/workflows/workflows.store.ts`): a workflow
  and its steps (`src/folder/folder.model.ts`), addressed by its folder, `WorkflowDir`, over `folder.store.ts` and `write.store.ts`,
  rooted as S5a's, a write judged against the version it was read at by `workflowVersionRefusal`, which
  `contracts/workflow-version.contract.ts` proves; a run names the folder it started on and the steps it froze (`Run.workflow`, read
  loosely); the callers still on the folder's stores are counted in `test/workflow-door.baseline.ts`. **S5d**, the Template door
  (`TemplateDoor`, `src/templates/templates.store.ts`): a template's folder or archive read, written and packed, rooted as S5a's, each
  tree written checked by `TemplateTreeWrite`; the model's `Template` (`src/templates/templates.model.ts`) is keyed by its source, and a
  factory's `template` is an `AppliedTemplate`, whose source names it. Still to come, its own card on S5a: **S5c**, the Agent and Skill
  doors (one context, the same lookup roots). A run's `pinned` revisions, left out of `Run` today, are named there.
- **S6, the subscription, the ledger and the feed**, landed, each behind a rooted door on the pattern, its files today's. The
  Subscription door (`SubscriptionDoor`, `src/subscription/subscription.store.ts`), by `SubscriptionName`: a subscription put once
  (`wx`, a name taken is `Conflict`) and checked by `Subscription`, its delivery by the model's `Delivery`. The Ledger door
  (`LedgerDoor`, `src/revisions/revisions.store.ts`), by `RevisionOf`: an append checked by `Revision`
  (`src/revisions/revisions.model.ts`), a stored entry read nominally. The Feed door (`FeedDoor`, `src/feed/feed.store.ts`),
  append-only: each line appended decoded by `FeedLine`, a cursor read at a line's boundary, the fold's memo its caller's
  (`emitFeed`). The callers still on their module spellings are counted in `test/subscription-door.baseline.ts`,
  `test/ledger-door.baseline.ts` and `test/feed-door.baseline.ts`; the store measured after them is `tools/store-measure/baselines/s6.json`.
- **AgentOnStep** is `StepAgent` in the agents' model: the agent a step is given, and what the step overrides of it, within what the
  agent offers (`Agent.overridable`).
- **Decision 9**: the place's model names `PlaceKind` (`git` or `folder`, as a step's `place:` says it, and `MountKind` before it), beside
  the runtime's `Mount`; the follow-up intent renames the place to the runtime's mount (place → mount).
- **SQLite**: Effect's `Model.Class` (`effect/schema/Model`, the class `effect/sql`'s repositories read and write) takes these branded
  fields as they are, so a store kept in a database keeps the same ids.

## The diagram

<!-- diagram:orchestrator-model:begin — generated, from the repository's root: node -e "import('./packages/agent-orchestrator/src/model/diagram.model.ts').then((m) => console.log(m.orchestratorModelDiagram()))" -->
```mermaid
erDiagram
  Run {
    RunId id PK
    string workspace
    string brief
    WorkflowDir workflowDir FK
    list after FK "optional"
    list context FK "optional"
    list inputs "optional"
    object from "optional"
    object scheduled "optional"
    list gates FK "optional"
    FactoryName factory FK "optional"
    list mounts "optional"
    object place "optional"
    string repo "optional"
    string baseRef "optional"
    string branch "optional"
    boolean isolate "optional"
    object placeSkill "optional"
    string stagedFile "optional"
    object tips "optional"
    string cancelledAt "optional"
    string createdAt
  }
  Step {
    TaskId taskId FK
    string workspace "optional"
    string branch "optional"
    object check "optional"
    TaskId handedOff FK "optional"
    object filesRead "optional"
    string closeoutHash "optional"
  }
  Try {
    TaskId taskId FK
    object check "optional"
    TryCause cause
    string model "optional"
    enum paused "optional"
    number budget "optional"
  }
  Round {
    StepName step FK
    number round
    number budget "optional"
    string at
    object merge "optional"
  }
  Landing {
    string commit "optional"
    string aborted "optional"
    string refusedOn "optional"
    string untouched "optional"
  }
  Workflow {
    WorkflowDir dir PK
    WorkflowName name PK
    string readme "optional"
  }
  WorkflowStep {
    StepName name PK
    list after FK
    StepName loop PK "optional"
    boolean gate "optional"
    string check "optional"
  }
  Inbox {
    object tries
  }
  Card {
    CardName name PK
    string file
    string workflow "optional"
    string repo "optional"
    string queued "optional"
    StepName gate FK "optional"
    FactoryName factory FK "optional"
    list from FK "optional"
    string body
  }
  Factory {
    FactoryName name PK
    list repos
    list workflows FK
    object hires FK
    object schedules
    unknown instruction "optional"
    enum revisions "optional"
    string tree "optional"
  }
  AppliedTemplate {
    TemplateSource source FK
    string version
    object params
  }
  Hire {
    FactoryName factory FK
    WorkflowName workflow FK
    StepName step FK
    AgentName agent FK
  }
  Template {
    TemplateSource source PK
    string name
    string version
    object parameters
    object hires FK
    list workflows FK
    string digest "optional"
  }
  Agent {
    AgentName name PK
    string role "optional"
    string description "optional"
    list skills "optional"
    enum harnessPrompt "optional"
    list mcp "optional"
    list overridable "optional"
    object keys
    string body
    string customInstructions "optional"
  }
  StepAgent {
    WorkflowName workflow FK
    StepName step FK
    AgentName agent FK
    list overrides "optional"
  }
  Subscription {
    SubscriptionName name PK
    TaskId task FK
    list selectors
    number digestEvery
    FeedCursor from
    object scope "optional"
  }
  Delivery {
    SubscriptionName name FK
    object of
    FeedCursor cursor
    object since "optional"
  }
  RunLine {
    string at
    RunId run FK
    StepName step FK "optional"
    string word
    string note "optional"
    string apiVersion "optional"
    object involved "optional"
    object labels "optional"
    string reason "optional"
    string type "optional"
    string waits "optional"
    string source "optional"
    string message "optional"
    string call "optional"
    TryNumber try FK "optional"
  }
  DaemonLine {
    string at
    number daemon
    enum word
    string note "optional"
    string apiVersion "optional"
    object involved "optional"
    object labels "optional"
    string reason "optional"
    string type "optional"
    string waits "optional"
    string source "optional"
    string message "optional"
    string call "optional"
  }
  StoreLine {
    string at
    string store
    string word
    string note "optional"
    string apiVersion "optional"
    object involved "optional"
    object labels "optional"
    string reason "optional"
    string type "optional"
    string waits "optional"
    string source "optional"
    string message "optional"
    string call "optional"
  }
  Revision {
    enum kind
    string name
    number n
    string hash
    string at
  }
  Workflow ||--o{ Run : workflowDir
  Run ||--o{ WorkflowStep : workflow
  Run ||--o{ Run : after
  Run ||--o{ Run : context
  WorkflowStep ||--o{ Run : gates
  Factory ||--o{ Run : factory
  Run ||--o{ Step : steps
  TaskId ||--o{ Step : taskId
  Step ||--o{ Try : tries
  TaskId ||--o{ Step : handedOff
  Step ||--o| Landing : landed
  TaskId ||--o{ Try : taskId
  WorkflowStep ||--o{ Round : step
  Workflow ||--o{ WorkflowStep : steps
  WorkflowStep ||--o{ WorkflowStep : after
  Inbox ||--o{ Card : cards
  WorkflowStep ||--o{ Card : gate
  Factory ||--o{ Card : factory
  Run ||--o{ Card : from
  Workflow ||--o{ Factory : workflows
  Agent ||--o{ Factory : hires
  Factory ||--o| AppliedTemplate : template
  Template ||--o{ AppliedTemplate : source
  Factory ||--o{ Hire : factory
  Workflow ||--o{ Hire : workflow
  WorkflowStep ||--o{ Hire : step
  Agent ||--o{ Hire : agent
  Agent ||--o{ Template : hires
  Workflow ||--o{ Template : workflows
  Workflow ||--o{ StepAgent : workflow
  WorkflowStep ||--o{ StepAgent : step
  Agent ||--o{ StepAgent : agent
  TaskId ||--o{ Subscription : task
  Subscription ||--o{ Delivery : name
  Delivery ||--o{ RunLine : digest
  Delivery ||--o{ DaemonLine : digest
  Delivery ||--o{ StoreLine : digest
  Run ||--o{ RunLine : run
  WorkflowStep ||--o{ RunLine : step
  Try ||--o{ RunLine : try
```
<!-- diagram:orchestrator-model:end -->

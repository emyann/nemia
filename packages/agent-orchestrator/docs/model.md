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
  counted in `test/factory-door.baseline.ts`. Still to come, each its own card on S5a: **S5b**, the Workflow door (its steps, over
  `folder.store.ts` and `write.store.ts`); **S5c**, the Agent and Skill doors (one context, the same lookup roots); **S5d**, the
  Template door. A run's frozen `workflow` and its `pinned` revisions, left out of `Run` today, are named there.
- **S6, the subscription, the ledger and the feed**, each behind a door on the feed's model.
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
    string workflowDir
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
    object template "optional"
    string tree "optional"
  }
  Hire {
    FactoryName factory FK
    WorkflowName workflow FK
    StepName step FK
    AgentName agent FK
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
  Run ||--o{ Run : after
  Run ||--o{ Run : context
  Step ||--o{ Run : gates
  Factory ||--o{ Run : factory
  Run ||--o{ Step : steps
  TaskId ||--o{ Step : taskId
  Step ||--o{ Try : tries
  TaskId ||--o{ Step : handedOff
  Step ||--o| Landing : landed
  TaskId ||--o{ Try : taskId
  Step ||--o{ Round : step
  Inbox ||--o{ Card : cards
  Step ||--o{ Card : gate
  Factory ||--o{ Card : factory
  Run ||--o{ Card : from
  Workflow ||--o{ Factory : workflows
  Agent ||--o{ Factory : hires
  Factory ||--o{ Hire : factory
  Workflow ||--o{ Hire : workflow
  Step ||--o{ Hire : step
  Agent ||--o{ Hire : agent
  Workflow ||--o{ StepAgent : workflow
  Step ||--o{ StepAgent : step
  Agent ||--o{ StepAgent : agent
  TaskId ||--o{ Subscription : task
  Run ||--o{ RunLine : run
  Step ||--o{ RunLine : step
  Try ||--o{ RunLine : try
```
<!-- diagram:orchestrator-model:end -->

# The runtime's model

The runtime's words as Effect Schemas, at its door beside its glossary (`src/core/model.ts`, exported as `RuntimeModel` from
`src/index.ts`): a task and its attempts, the session each runs, the entries of its journal, the arguments it gives its harness and
the folders it may reach. Each id comes in two forms, from one helper (`src/core/brand.ts`): checked on create (`TaskId.create`,
`TaskId.OnCreate`) and nominal on read (`TaskId.OnRead`), and every stored field holds the read form, so a journal written before a
check still reads. A task's id is what its journal file can be named (`taskIdRefusal`), which every id in use is. The task is the
aggregate, and its invariant is that its attempts number from 1 with no gap, as `decide` starts each at `attempts.length + 1`. A
journal entry carries the journal's own schema of an event (`StoredEventSchema`, `src/core/event-schema.ts`), not a copy, and the
model's mount is held to the harness's `Mount` by `src/core/model.test.ts`. A relation to another layer is an id alone: the
orchestrator holds a `TaskId` by its key, with no import.

Nothing reads through the model yet, and nothing is reshaped by it. It leaves three seams. The Task and Journal door (S4) decodes
what it reads through these schemas, and holds a new id to `TaskId`'s create form at `file`, where today any id is taken. A store
kept in SQLite takes the branded schemas as its `Model.Class` fields. The place a session runs, `ExecutionPlace`, is the host and
nothing else, so a task holds no field for it (decision Q17); it gains one only when a second place exists.

<!-- diagram:runtime-model:begin — generated, from the repository's root: node -e "import('./packages/agent-runtime/src/core/model.ts').then((m) => console.log(m.runtimeModelDiagram()))" -->
```mermaid
erDiagram
  Task {
    TaskId taskId PK
    string filedAt "optional"
    number priority "optional"
    string brief
    string cwd
    string harness "optional"
    number deadlineSeconds "optional"
    SessionId resumeFrom FK "optional"
    object closeoutSchema "optional"
    list said
    enum holdOpen "optional"
    Always restartPolicy "optional"
    object labels "optional"
    string traceparent "optional"
    boolean queued "optional"
    number admitted "optional"
    list inputs
    boolean closed
    boolean stopRequested
    Outcome settled
  }
  Attempt {
    AttemptNumber n
    string startedAt
    object startedMono "optional"
    string spawnedAt
    object spawnedMono "optional"
    Outcome ended
    string endedAt
    object endedMono "optional"
    EndReason reason
    SessionId nativeId FK
    SessionId resumeFrom FK "optional"
    string nudge "optional"
    unknown closeout "optional"
    boolean closedOut "optional"
    unsigned former "optional"
    object usage
    number exitCode
    list denials "optional"
    list skills "optional"
    list files "optional"
    string ranOn "optional"
    string limit "optional"
    number turn "optional"
    string error "optional"
    string gapSince "optional"
    object gapMono "optional"
    list processes "optional"
  }
  Session {
    SessionId nativeId PK
  }
  JournalEntry {
    TaskId taskId FK
    Event event
  }
  HarnessArgs {
    string model "optional"
    string permissionMode "optional"
    unknown worktree "optional"
    list tools "optional"
    list disallowedTools "optional"
    list allowedTools "optional"
    string effort "optional"
    object mcp "optional"
    list projectMcp "optional"
    number contextTokens "optional"
    boolean background "optional"
    number budgetUsd "optional"
    object claude "optional"
    object codex "optional"
    list command "optional"
    object env "optional"
    number niceness "optional"
    object callAdmission "optional"
    boolean mayAsk "optional"
    unknown enabledSkills "optional"
    boolean remoteControl "optional"
    list checkoutMcp "optional"
  }
  Mount {
    string path
    boolean readOnly
  }
  ExecutionPlace {
    host place
  }
  Session ||--o{ Task : resumeFrom
  Task ||--o| HarnessArgs : config
  Task ||--o{ Attempt : attempts
  Session ||--o{ Attempt : nativeId
  Session ||--o{ Attempt : resumeFrom
  Task ||--o{ JournalEntry : taskId
  HarnessArgs ||--o{ Mount : mounts
```
<!-- diagram:runtime-model:end -->

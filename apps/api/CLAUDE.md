# apps/api — the workflows behind HTTP

Hono over the orchestrator's public contract (`agent-orchestrator`, `agent-orchestrator/run`, `agent-orchestrator/workflow`).

- **Every test file imports `test/harness.ts` first**: a fake `claude` first on PATH, so no test asks this machine's live registry
  (`harness.test.ts` refuses a file that does not).
- **A body read off a response is `unknown`**: name the api's own answer type (`(await res.json()) as RunDetail`).
- **An encoded `..` never reaches a route in a test**: `app.request` resolves `%2E%2E` before the router sees it. Send `..%2F…` to reach
  a name refusal.
- **The list answers a finished run from memory** (`runs/resting.ts`) while its record, its stamps, the feed for its tasks and its branch tips
  stand. A new input `summarize` reads for a finished run goes into one of those, or a poll answers it stale. `WF_VERIFY_REST=1` (set by
  the harness) judges every kept answer afresh; a test that counts reads turns that off for its request (`unverified`). Requests overlap
  and share the feed cursor: a request keeps nothing once another has read the feed past where it read to.
- **A run's tasks are every step's, every check's, and every earlier try's and its check's** (`runTasks` in the package's `run.ts`); `list(taskIds)`
  looks at no harness when nothing among them is in flight.
- **A run whose task's journal does not read is answered off its record** (`judgedOrNot` in `runs/runs.ts`), never judged, and not kept:
  `list` names the task in `unreadable`, and a parent's task read to see if it shipped rejects with the `JournalError`.
- **A transcript of an attempt in flight asks its harness**: read it on a run's detail, never on the list the Factory polls.
- **Read a `Wait` by the key you mean**: a hold's `Wait` carries `shipped`, which an `--after` wait never does (`holdNeedsYou`, not
  `neverShips`, in `runs/judged.ts`).
- **A remote agent's address is shown as origin and path, never whole** (`remoteOf` in `detail/detail.ts`): a query string can carry a key.
- **A new offer in `wf decide` is parsed here** (`ONCE_MORE` in `decide/decision.ts`), with its label in `DecideCommand` and the web's mirror, or
  the board offers the whole sentence as a command. Test the bare command, not that the offer is listed.
- **A list a page turns into a sentence carries everything the sentence is about** (`folderFiles` in `steps/artifacts.ts` lists what it cannot
  serve by path), and leaves out only what the run itself put there (`GIVEN`).
- **The list's `toDecide` is not the package's decision**: `decision` answers `awaiting` where `toDecide` says nothing; a page that must
  agree with a verb's refusal reads `Decidable.awaiting`, which `test/prune.test.ts` holds to `wf prune`'s own answer.
- **A remote step's wait is answered with `wf say`** (`answerIn` in `needsOf`), never in Claude Code.
- **A new key in `STEP_KEYS` or `AGENT_KEYS` has sites here**: see `packages/agent-orchestrator/CLAUDE.md`.
- **A request body is decoded by its route's schema** (`readBody` in `body.ts`) and refused in the route's own words, the first wrong
  key named: no schema message reaches a response. A new key goes into the schema and its `*_SHAPE`, with a test that makes it refuse.
- **A feed fixture writes the events the runtime writes**: the runtime decodes its feed, so a fixture event missing a field the
  runtime always writes fails the read, not the assertion you meant.
- **A test sets `WF_ROOT` (and `CLAUDE_CONFIG_DIR`) before it imports the api or the package**: the orchestrator reads them as its
  modules load, so the imports after the assignment are dynamic (`test/app.test.ts`).
- **A route's contract is an entry in the JSDoc of its exported router** (`asks` in `asks/asks.ts`): the comment guard refuses a JSDoc on
  `.post(`. In a test, what a statement means goes into the test's name, an assertion's message, or a JSDoc on a property.

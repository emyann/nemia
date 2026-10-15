# Design discussion, 2026-10-15: kinds and revisions, the closeout's shape, and sessions attached to the daemon

**Status: a discussion to be refined, the next time the owner and the operator take it up.** Not a spec, not a plan, and nothing is
filed from it. It records what the owner and the operator session worked out on the night of 2026-10-14 to 15, starting from the
store's disk footprint, at main `ab023d78`. Where it says *decided*, the owner said so; everything else is the session's reading, for
the owner to refine, cut or overturn before any of it becomes an intake card for Iris.

What it is for: picking the discussion up again without re-reading the code. Section 2 is the facts, each with where it was read;
section 3 is the owner's positions; sections 4 and 5 are the thinking and the open choices.

## 1. How it started

The owner asked what a run freezes and what the stores take on disk. Measured (`~/.cache/hkb-handoffs/store-bytes/measurements.md`):
a run freezes about 157 KiB (median), and the weight is elsewhere: 9.5 GiB of pictures, and every Claude Code step session stored
twice, once in Claude Code's own transcript (4.8 GiB) and once as the runtime's capture of the session's output (5.0 GiB). Asked why
the runtime keeps that copy, the owner widened the question: whether sessions should run detached at all, what the runtime should
keep, and what a closeout is.

## 2. Facts

### 2.1 How a session runs today

- A Claude Code step is a job, `claude -p --output-format stream-json --verbose`, in a worker the runtime detaches; the worker writes
  stdout to `engine/runs/claude/<session>.log` (`packages/agent-runtime/src/harness/detached/detached.ts`). The runtime's README:
  *"the session outlives the engine. So a three-hour session is not a three-hour process here — the engine can be killed, upgraded or
  restarted at any point in it."*
- What the runtime reads of the capture (`claudeStreamOutput`, `src/harness/detached/output.ts`): the `init` line (session id, skills,
  folder), the `result` line (answer, usage, cost, error), each `permission_denied` event with the call it names, and the files read or
  written. What it read is kept in `.said` beside the capture (31 MiB for every session). The step's transcript page reads Claude
  Code's own transcript (`src/harness/claude/transcript.ts`), not the capture.
- Claude Code's transcript records a denial only as text: a `tool_result` with `is_error: true` and *"Permission to use Bash with
  command … has been denied"* (read on `2udj`'s land session). The structured event, with `decision_reason_type`, is in stdout alone.
- An Agent SDK runner already exists, `sdkRunner()` in `src/harness/sdk.ts`, which says of itself: *"rich. This process owns the
  session; cost, turns and tool calls arrive live, and a gate can refuse a tool call. NOT durable."* The SDK still runs the CLI, as a
  child of the process that calls `query()`.
- The daemon started 117 times between 2026-10-05 and 2026-10-15 (`~/.agent-workflows/api.log`, "api listening"), about a dozen a day.
  A restart onto new code already goes through a pause that lets sessions finish ("Pausing: 6 finishing — the operator restarts the
  daemon on the new code").

### 2.2 The closeout today

- A fixed envelope of four (`CLOSEOUT_SCHEMA`, `packages/agent-orchestrator/src/closeout/closeout.ts`), and the fields a step's
  `output:` declares merged flat beside them, all required and strict (`closeoutSchemaOf`); a loop's target owes `replies` too. Each step
  hands the harness its own `StructuredOutput` schema, and a session continued under another one pays its whole conversation again.
- How the four are read, and how 3,351 kept closeouts fill them:

  | Field | Read by | Filled |
  |---|---|---|
  | `outcome` | routing: `blocked` stops the step on the person (`decide`, `retry`, auto's facts, stats); the board's tags | 3,091 done, 260 blocked |
  | `needs` | the question to the person (the board's `Needs`, `GateBrief`, `Decide`) | on all 260 blocked; on 13 done ones too |
  | `summary` | the person alone (run page, gate reports); never handed between steps (`brief/handed.ts`) | asked "one to three sentences"; median 684 characters, p90 2,067, max 10,191 |
  | `artifacts` | the next step's brief, the board's links, the build check's pictures (`workflows/build/pictures.ts`); a file listed and absent refuses the closeout | none on 76%; p90 6, max 251; 371 hand a picture |

- Both layers declare outputs already. Agents: Seldon `spec.schema.json`, Agora `review.schema.json` (findings, again), Otto
  `land.schema.json` (message), Iris `intent.schema.json`, Argus `argus.schema.json`. Steps: `build/implement` and `quick/implement`
  `implement.schema.json` (mutants). An agent's `output:` is a role key, so a step's replaces it: `build/review.schema.json` copies
  Agora's `findings` and `again` to add `mutants`.
- Fields beyond the four, by how many closeouts carry them: `mutants` 1,316, `findings` and `again` 1,031, `replies` 939, the spec's
  fields (`approach`, `steps`, `risks`…) about 670, `message` 535, `placement` 404.

### 2.3 Freezing today

- At `nemia start` each node is resolved and frozen on the run: the step merged with its agent, the instructions, the skills copied,
  the factory's rules, the closeout schema (`packages/agent-orchestrator/README.md`, *At `wf start` each node is resolved and frozen*).
- A card in the inbox is not frozen: starting it reads today's folder. What misses an edit is a run already started: each retry and
  round of it, and a run started `--after` another, which may wait hours before its first step is filed (`c61k` waited about three).
- Nothing on the board says that a run uses older instructions than its folder has now.

### 2.4 What Kubernetes does (the reference the owner named)

- It freezes too: a Job's pod template cannot change once created, and an edit of a CronJob reaches only the Jobs it creates after.
- Every template change is a numbered revision kept as an object (a Deployment's ReplicaSets, a StatefulSet's ControllerRevisions),
  so it can be rolled back; every instance carries the revision it came from (`pod-template-hash`).
- Drift is visible: `metadata.generation` goes up with each spec change, and `status.observedGeneration` says which one the controller
  has acted on.
- Moving live instances to a new revision is an explicit strategy per kind (`RollingUpdate`, `Recreate`, `OnDelete`).
- `apiVersion` is another thing: it versions a kind's schema (`apps/v1`), and the server converts a stored object between versions.

## 3. The owner's positions

- **Decided: the runtime keeps what it reads of a session's output, never the conversation.** Filed and started as
  `the-runtime-keeps-what-it-re-8umt` (after the disk-by-kind run, `m18j`, which landed `ab023d7`).
- Rely on the harness's state for the conversation: Claude Code reads its own transcripts, so a given version of it can read them.
  Record what is Nemia's own while the session runs: denials, the closeout, the artifacts, `.said`.
- Sessions attached to the daemon, as its child processes, resumed after a restart or a crash rather than detached: cleaner, still
  level-triggered, and a session resumes cheaply while its cache holds.
- The Agent SDK rather than the plain CLI: Nemia building Nemia writes TypeScript against the harness, which would use it better.
- The closeout: a fixed shape the system and the board rely on (outcome, summary, artifacts, needs are fine), and a shape the person
  using Nemia owns: what an agent outputs whatever step it is hired into, and what a step needs, merged into one final structured output,
  stable across runs until a schema changes, a factory template is applied, or any kind is applied.
- Kinds as in Kubernetes: an agent, a skill (and a workflow, a step, a template) is a kind that is applied, upgraded and versioned.
  The owner does not like today's freezing: a person who edits a step on the board, then sees a run that waited use the old
  instructions, is never told.

## 4. The session's reading

- **(b) Attached sessions.** Make the SDK runner the default and get durability from resuming, not from detaching. What it would
  replace: the `PreToolUse` admission script by a `canUseTool` callback deciding in the daemon (a denial known as it happens); the
  stream's readers and `.said` by typed messages; MCP config files by servers in the daemon's process. What it costs: each restart or
  crash interrupts every session at work, losing its turn in flight (a suite running in a tool call), and a resume pays the full context
  once the prompt cache has expired. Codex has an SDK of its own, so the runtime's seam can keep one shape per harness. Nemia's own
  long-lived session (`claude --bg`) is a question of its own.
- **(c) The closeout.** The envelope stays top level, where the board finds it. Possibly tighter: `needs` as part of `blocked`, a short
  `summary` line beside a body for the board, typed artifacts (a file, or a value). The dynamic part: one object merged from the agent's
  schema and the step's, each field owned by one declarer, the declarer recorded.
- **Kinds and revisions.** Each kind gets an identity and revisions (content hashed); a run records the revision of each kind it
  resolved; the merged closeout schema is derived from those revisions, so the same revisions give the same `StructuredOutput` tool;
  the board shows drift ("implement: rev 3, the workflow is at rev 4"); a run has an update strategy; the closeout carries an
  `apiVersion`, so an old run's closeout stays readable after the shape changes. Factories are the one kind that already applies and
  upgrades (`nemia factory apply`, `upgrade`, `plan`, `resolve`).

## 5. Open choices

1. **The default strategy for a live run:** resolve each step when it is filed (a run waiting `--after` takes today's edit), keep the
   run's revisions as a Job does, or keep them and offer an explicit "take the new revision".
2. **A field declared by both an agent and its step:** refused when applied, naming both; or one wins, and which.
3. **Attached sessions: drain or interrupt.** May an upgrade wait for the sessions at work to end (some run for hours), or does it
   interrupt them and resume?
4. Smaller ones: `needs` within `blocked`; `summary` as a line and a body; artifacts typed; whether Nemia's `--bg` session moves too;
   Codex alongside.

## 6. Next

Take it up with the owner, settle the open choices, then hand it to Iris as the input of an intake: likely two intents, (b) and
(c) with the kinds, which may be ordered one after the other.

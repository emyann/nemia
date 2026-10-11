# tools/observe — the side Grafana

A Grafana to watch how Nemia runs while we build it: one `grafana/otel-lgtm` container holding the OpenTelemetry collector, Tempo, Loki,
Prometheus, Pyroscope and Grafana, with six dashboards loaded from `dashboards/`. It is a tool of this repository and never ships: no
package, `bin` or workflow refers to it. The daemon sends nothing anywhere unless it is given an endpoint, and the stack listens on this
machine alone (`127.0.0.1`).

## Up and down

From the repository's root:

```sh
docker compose -f tools/observe/compose.yaml up -d      # up, on 3000 (Grafana), 4317 (OTLP gRPC), 4318 (OTLP HTTP), 4040 (Pyroscope)
docker compose -f tools/observe/compose.yaml down       # down, keeping what it stored
docker compose -f tools/observe/compose.yaml down -v    # down, and drop what it stored
```

What it stores (traces, logs, metrics, profiles, Grafana's own database) lives in the volume `nemia-observe_data`, mounted on `/data`.
Traces are kept 14 days (`336h`, written out in `tempo.yaml`) and metrics 90 (`PROMETHEUS_EXTRA_ARGS` in `compose.yaml`). A stack made
before a change to `compose.yaml` takes it with `docker compose -f tools/observe/compose.yaml up -d`, which recreates the container and
keeps the volume. A change to `tempo.yaml` or `otelcol.yaml`, which are bind-mounted, is taken only with `docker compose -f
tools/observe/compose.yaml up -d --force-recreate`: compose's config hash does not see a mounted file's contents, so `up -d` alone says
the container is running and recreates nothing. `docker compose restart` fails on WSL, where Docker Desktop's bind mount of a file is
not found again, and leaves the stack stopped; `up -d --force-recreate` brings it back.

Open Grafana at <http://localhost:3000>: it lets anyone on this machine in as an admin, with no login. It lands on **System**.

## Point the daemon at it

Start the daemon (the api, `node src/main.ts` in `apps/api`, or `nemia up`) with:

```sh
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

It then exports its spans, its logs and its metrics there, filed under the service `nemia`, or `OTEL_SERVICE_NAME` when that is set: the
dashboards' `Service` variable picks it. The packages' README says what the daemon exports (`packages/agent-orchestrator/README.md`,
*What the daemon says*).

Add `NEMIA_TOOL_DETAILS=1` beside it for each session's tool spans to say their inputs too — a Bash call's command, a file's path, an
error's words — which then stay in this machine's Tempo and Loki. **Time** reads Bash by its command's head only then: without it, a
Bash call is `Bash: (no command)`.

## Profile the daemon

The daemon sends no profiles by itself. A preload in `profile/` profiles it into the stack's Pyroscope, its CPU and its heap, when it is
named on the daemon's command line and `PYROSCOPE_SERVER_ADDRESS` is set. The profiler (`@pyroscope/nodejs`, a native addon) is installed
in that folder alone, outside the workspaces: no package or app depends on it, and the root lockfile does not name it. Once, from the
repository's root:

```sh
npm ci --prefix tools/observe/profile
```

Then start the daemon from `apps/api` with the preload before its entry:

```sh
PYROSCOPE_SERVER_ADDRESS=http://localhost:4040 OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
  node --import ../../tools/observe/profile/preload.ts src/main.ts
```

It sends a profile every 15 seconds, filed under the service its traces use (`OTEL_SERVICE_NAME`, else `nemia`): wall time with the CPU
time beside it, and the heap in use. Without `PYROSCOPE_SERVER_ADDRESS`, or with it blank, the preload loads nothing and opens nothing. It
takes the endpoint out of the daemon's environment once read, so no check or session the daemon starts inherits it, and a `--import` on
the command line reaches the daemon alone: never give it through `NODE_OPTIONS`, which every node child of the daemon would load (the
checks' `npm test`, a harness). A profiler that is not installed is said once on stderr, and the daemon runs unprofiled.

The login service (`nemia service install`) writes `node <entry>` and nothing between them, so it cannot be profiled yet. Doing so is a
follow-up: an option of `nemia service install` that writes node's own arguments between the node and the entry, in the unit's
`ExecStart=` and the plist's `ProgramArguments` (`unitText`, `plistText` in `packages/agent-orchestrator/src/service/service.ts`), read
back by `unitRead` and `plistRead`, with `PYROSCOPE_SERVER_ADDRESS` given as `--env`.

A stack started before Pyroscope's port was published must be made again to publish it: `docker compose -f tools/observe/compose.yaml up
-d` recreates the container and keeps the volume.

What it costs, measured on a scratch daemon over a scratch store of 24 runs with 7 sessions working (2026-10-06), in rounds of two
minutes, profiled and not, in the order B A A B B A, 90 passes each way: a pass's median went from 47.4 to 49.6 ms (+4.6%), its mean
from 49.4 to 52.3 ms (+5.9%), and the daemon's CPU from 12.2 to 19.4 ms a second (0.7% of one core more). The passes' own phases did not
move (`assess` 7.75 ms both ways); the difference is in `git` (30.1 to 32.6 ms), the phase that waits on git's processes, and two rounds
of the same kind differed by up to 10%. A loop of pure JavaScript ran no slower profiled. The live daemon's passes are heavier (200 to 300
ms), so read the share again there before keeping it on.

## The dashboards

They sit in the folder `Nemia`, linked to each other at the top of each page. They are provisioned from the files: an edit made in
Grafana cannot be saved, so edit the JSON here, and Grafana reads it again within ten seconds.

- **System** — every metric the daemon and the api export, from Prometheus: a pass's time, its phases and its journal reads; the runs in
  the store, the sessions queued and admitted, the oldest one's wait and the machine's load; the api's reads by route; each step's cost,
  tokens, time, tries, checks and rounds over the range, by factory, workflow, step and agent; the feed's readers, the subscriptions and
  Nemia's keeper. Its **Denied calls** is no metric: it counts the `step.denied` spans from Tempo, by step, agent and tool, as **Steps**
  does. Below them, **Profiles**: the CPU and the heap in use from Pyroscope, by stack, over the dashboard's
  range and its `Service`, for a daemon started with the preload. A flame graph sums every pass in its range: read it beside **Passes**
  over the same range, which the links at the top keep.
- **Passes** — a pass's time from the `pass` spans (TraceQL metrics), its phases from `pass.phase.duration` (the phases are not spans),
  and the slowest of the latest 500 `pass` and `advancePass` spans, each linked to its trace. Its tables are span tables
  (`tableType: "spans"`): a row's Duration is the span's own. A trace lasts as long as the session a pass filed, which joins it
  (`TRACEPARENT`), so a pass is read from its `pass` span, never from its trace's length: the search API's `durationMs`, and a table of
  traces, the default, show that length (measured 2026-10-06 on Grafana 13.2.2: a `pass` of 272 ms in a trace of 496 s).
- **A run** — pick a run: its filings (the runtime's `file` spans, one for each session a step filed), the runtime's appends to its
  journals with their task and kind, and its logs, by step. The orchestrator's `fileReady`, `fileTries`, `fileRounds` and `fileChecks`
  spans carry no run: they are a pass's phases, under its `advancePass`.
- **Steps** — tokens by step and agent, and what went wrong in a step's sessions, twice: for **one run's session** (pick a run, and a
  session, `task`, as **Time** does) and **across runs** (by factory, workflow, step and agent). Its note says what each reads and
  links to **Time** for the steps and the range it shows.
  - **Denied calls** count the daemon's `step.denied` spans (TraceQL metrics, `count_over_time()`): one span for each call a harness
    denied a session, made when its attempt ends, whatever its try came to, so the number is the one a run's page shows. For one run
    by `tool` and `call`, the call as a permission rule names it (`Skill(md3-spec)`, `Bash(npm run md3)`); across runs by workflow,
    step, agent and `tool`; and **Denied calls, each**, a table of the latest spans with their run and call. A span has no first sample
    to lose, and what is counted is marked on the run's record, so a daemon started again counts none twice.
  - **Tool errors** count the sessions' own `tool_result` events with `success="false"`, from Loki, by `tool_name`: a command that
    exited non-zero, a file that is not there, a pattern the search refused.
  - **Failed skill loads** are those errors of the `Skill` tool: a skill that was called and whose loading failed (measured: a skill
    whose own shell command failed), by `tool_parameters`, which names the skill where the event carries its inputs
    (`NEMIA_TOOL_DETAILS=1`). A call to a skill that is not there exports no event and no span, and is **not measured**; a skill a
    session was refused is a denied call, `Skill(<name>)`.
  - Their limits: Tempo answers 7 days back at most; errors and skill loads are counted for sessions that export telemetry alone (a
    Claude Code step of a daemon given an endpoint, never a Codex step); a run started before the daemon counted denied calls has
    none, and the daemon must run the code that counts them.
- **Time** — where a step's time goes. **One run's step**, from Tempo: pick a run (and a session, `task`), and its turns' time is the sum of
  their leaves — the model (`claude_code.llm_request`), each tool by name, Bash by its command's head — beside the turns' own length, with
  **Other** the turns' time no leaf covers, so the bars add up to the turns; the time waiting on a permission is shown as part of the
  tools'; **Tests by scope**, Bash time by what its test command ran; and the run's queue, checks (by verdict) and gates, as span tables.
  **A step across runs**, from Prometheus: the same over the range, by factory, workflow, step and agent, from Tempo's span metrics, beside
  the daemon's step time (`step_duration`), its queue, checks and gates, **Tests by scope**, a trend of the leaves, and **Unmeasured**: the
  steps with time but no session spans, a Codex step today. **A run** links to it for its run.
- **Timeline** — one workflow as a run's page shows one run, averaged over its runs that ended in the range: pick a factory, one workflow
  and how the runs ended. A row per step in the workflow's order and a row for its check under it, with the mean time a try's session
  **ran** and was **queued**, its **tries a run** and its **cost a try**; the mean wall time of each round of a loop; and a run's mean
  wall time beside what of it was waiting, in the queue, in its checks and at its gates. *A workflow's timeline*, below, says what it reads.

`packages/agent-orchestrator/test/observe.test.ts` holds them to the code: a query that names a metric, label, span, attribute or log field
the code does not emit fails it, and so does a metric the code defines that System does not chart, a profile type the profiler does not
send, a Tempo table naming a span that would show its trace's duration, a span name both layers emit, a server-side expression reading a
query its panel has not, and a Timeline query that asks a row's `of` or `part` for a value the code gives none of or is not held to the one
factory and the one workflow picked, and a Timeline factory or workflow choice that may hold several. What a session sends and what the span metrics write are no code of ours: the test lists them as measured below.
`agent-orchestrator/test/observe-time.test.ts` holds the timing below: the command head and the test scope, each over a table of commands,
the span metrics' dimensions, the retention and reach, and the mounts. `agent-orchestrator/test/profile.test.ts` holds the preload: with no
endpoint, nothing loaded and nothing opened.

## Timing a step

A step's Claude Code session exports its own spans (`packages/agent-orchestrator/README.md`): a turn, `claude_code.interaction`, holds
its model requests (`claude_code.llm_request`) and tool calls (`claude_code.tool`); a tool call holds its wait on a permission
(`claude_code.tool.blocked_on_user`) and its run (`claude_code.tool.execution`); a subagent's own spans sit under its Agent tool's
`tool.execution` and carry `agent_id`. The leaves of a turn are its model requests and tool calls: **Time** sums those, and a subagent
is counted once, as its Agent tool.

- **Tools are timed on `claude_code.tool`.** Its `tool.execution` and `tool.blocked_on_user` children carry no `tool_name` (measured
  2026-10-07), so a tool's time is its call's, the permission wait shown as the part of it spent waiting.
- **`claude_code.interaction` is sent by a `-p` job alone**, a step; a long-lived session (`--bg`) sends none, and has no turn to sum.
- **The main thread's leaves are read structurally**: `{… name="claude_code.interaction"} > {name="claude_code.llm_request"}` keeps a
  turn's own children, and a subagent's, a level further down, out. `span.agent_id = nil` beside a `name` returned no series or the wrong
  count on Tempo 3.0.3 (2026-10-07). Prometheus' permission wait is the span metrics', and so a subagent's is in it.
- **The command head** (`otelcol.yaml`, a transform the collector runs before its batch) gives each Bash `claude_code.tool` span that
  carries its command a `command_head`: past a leading `cd <dir> &&`, `NAME=value` words and the wrappers `timeout` (its flags and
  duration), `nohup`, `time` and `npx`, the first word, a second after a command of subcommands (`npm`, `git`, `turbo`, `docker`…), and
  a third after the `run` of a package runner (`npm`, `pnpm`, `yarn`, `turbo`) alone; a flag, path, quote, `$`, `=` or the next line
  ends it. `npx turbo run test --force` is `turbo run test`, `docker run postgres:16-alpine` is `docker run`, `git commit -m "…"` is
  `git commit`, and a command it does not read, `./run.sh`, is `other`. No argument gets in, so it is a label.
- **The test scope** (`otelcol.yaml`, a second transform, after the head) gives the same spans a `test_scope`, what a test command ran:
  `suite` (`turbo run test`, or `npm test` from the root), `package` (with `--filter`, `-F`, `-w` or `--workspace`, or after a `cd` into
  `packages/<name>` or `apps/<name>`), `files` (`node --test`), `e2e: all` (`npm run e2e`) or `e2e: pages` (with `--pages`). It is read
  at any command of the line, not only the head, so `npm run build && npm run e2e -- --pages time` is `e2e: pages`; a flag counts only
  in its own command, and the last statement that matches wins. Each value is a literal, so no package, file or page name gets in; a
  command that runs no tests has none. A `cd` counts only when the test command comes right after it, joined by `&&` or `;`: `cd
  packages/agent-runtime; npm test` and `cd packages/agent-orchestrator && npx turbo run test --force` are `package`, and `cd apps/web
  && cd ../.. && npx turbo run test` is `suite`. It reads the text, not the shell: a bare `npm test` in a package's folder after an
  earlier `cd` is `suite`.
- **Span metrics** (Tempo's generator) keep span time by factory, workflow, step, agent, span type, `tool_name`, `bash_command_class`,
  `command_head` and `test_scope`, never by a run or a task, and leave a subagent's spans out (`agent_id`). They are written as
  `traces_spanmetrics_latency_{bucket,count,sum}` (seconds), `traces_spanmetrics_calls_total` and `traces_spanmetrics_size_total`, each
  labelled `service`, `span_name`, `span_kind` and `status_code` beside the dimensions.
- **A session sends a span when it ends**, so a turn arrives minutes after it began. Tempo's generator keeps span time for a span that
  ended up to 2 minutes before it arrived (its default, 30 s, was measured to drop one 45 s late), and a TraceQL metrics query counts a
  span that began up to a day before it arrived (`live_store.wal`; its default, 2 minutes, left a turn of five minutes out though a
  search found it). A drill-down reaches 7 days back (`max_duration`).

## Counting a session's errors

Measured 2026-10-11 on Claude Code 2.1.296, over the 7 days this stack held:

- **A tool's error is counted from Loki, not Tempo.** The errored span, `claude_code.tool.execution` with `status=error`, carries no
  `tool_name`; its parent `claude_code.tool` carries it and no error status. TraceQL's join of the two (`{… status=error} < {name=
  "claude_code.tool"}`) answered for 68 of 174 errored spans, though each one's parent was in its trace, so it is no count. The
  session's `tool_result` event carries `tool_name` and `success` itself: 176 over the same days.
- **A failed skill load is a `tool_result` of `Skill` with `success="false"`**: 15, each a skill whose own shell command failed as it
  loaded. A `Skill` call for a skill that is not there exported nothing: no `tool_decision`, no `tool_result`, no span.
- **The harness's own `tool_decision` events (`decision="reject"`) are not what Denied calls counts**: it counts what the runtime
  journals of a job's denials, the list a run's page shows.

## A workflow's timeline

**Timeline** reads one span, `run.timeline`, and nothing else: the daemon's own, no session's.

- **A span is one number of one run's timeline**, the timeline its page shows (`timeline`, `timelineRows` in
  `packages/agent-orchestrator/src/timeline/`). It carries `value`, and what the value is: `of` (`try`, `check`, `step`, `round`, `run`),
  `part` (`queued`, `ran`, `cost`, `tries`, `wall`, and of a run `check` and `gate`), and `row`, the name of its row: a step's place in
  the workflow and its name (`02 implement`), its check's (`02 implement check`), a round's (`review round 01`), or `run`. Times are in
  ms and a cost in dollars. Beside them its `run`, its `try` on a try's and a check's row, and `factory`, `workflow` and `outcome` (how
  the run ended, `succeeded` or `cancelled`), with `step` and `agent` on a step's rows.
- **The rows sort as text into the workflow's order**, each check under its step: the panels sort on the name, since Tempo answers the
  series in no order. A workflow whose steps were renamed or moved inside the range shows the old rows beside the new.
- **A run is counted once, when it is over**: on the first pass that reads it succeeded or called off with nothing in flight, marked on
  its record (`runTimed`). A run still going, or stopped at a gate nobody answered, is not there yet; neither is a run started before
  the daemon ran this code, nor one retried after it was counted, whose later tries are missing.
- **A span is stamped when it is made, not when its run ended**: a run that ended while the daemon was down is in the range of the
  restart. The span has no length; its number is `span.value`, never its duration.
- **The means are per try**, `avg_over_time(span.value) by (span.row)`, as a run's page has a row per try: a step that takes three tries
  a run spends three times its bar, and **Tries a run** says how many. A range holding one run shows that run's own numbers
  (`agent-orchestrator/test/timeline-spans.test.ts` holds the spans equal to the page's rows).
- **Tempo answers 7 days back**, where Prometheus keeps 90: no month over month here. The `factory` and `workflow` choices are read from
  Prometheus (`step_tries_total`), so a workflow is offered once a session of it has settled.
- Measured 2026-10-11 on this stack, over probe spans under a service of their own: `avg_over_time` of a numeric span attribute answers
  the mean, an integer and a decimal value averaged together included (a whole-dollar cost leaves as an integer); a bar gauge over the
  instant query draws a bar per row once `reduce` (series to rows) and `sortBy` put them in order.

## The names, as measured

Read off a daemon exporting to this stack (2026-10-06), and a step's session (2026-10-07):

- **Prometheus**: a metric's dots become underscores. A histogram has `_bucket`, `_count` and `_sum` (`pass_duration_bucket`); a gauge
  takes `_ratio`, from the unit `1` the exporter gives it (`machine_load_ratio`); a counter that only grows (`incremental: true`) takes
  `_total` (`step_cost_total`); any other counter is a gauge with no suffix (`subscription_wakes`, `nemia_acts`). Every series carries
  `job` and `service_name`, both the service's name. The step metrics carry `factory`, `workflow`, `step`, `agent` and `outcome`, the
  phases `phase`, and the api's reads `route`. A run's id is never a label.
- **Tempo**: the resource attribute `service.name`; the span attributes `run`, `step`, `task`, `kind` and `attempt`, as `span.run` and so
  on. An `append` made outside a filing (a session's end) carries its task and kind but no run. Two spans are named `tick`: the
  orchestrator's tick and the runtime engine's tick inside it, so a query on `name="tick"` mixes them. Read a pass from `pass`. A step's
  waits are spans of their own, `step.queue`, `step.check` and `step.gate`, with `run`, `try` and the step's attributes, and so is each
  call a harness denied, `step.denied`, with `run`, `task`, `tool`, `call` and the step's `factory`, `workflow`, `step` and `agent`. A
  session's
  spans carry `tool_name`, `full_command` (with `NEMIA_TOOL_DETAILS=1`), `bash_command_class`, `agent_id`, and the labels it was started
  with: `run`, `step`, `task`, `factory`, `workflow` and `agent`.
- **Loki**: one stream label, `service_name`; the logs' annotations (`run`, `step`, `word`) and the collector's fields (`trace_id`,
  `span_id`, `severity_text`, `detected_level`) are structured metadata, filtered as `| run="…"`. The daemon exports what it logs at
  `Info`. A step's session files its own events under `claude-code` (measured 2026-10-11, Claude Code 2.1.296): `event_name`
  (`tool_result`, `tool_decision`, `skill_activated`…), and on a `tool_result` `success`, `tool_name`, `error_type` and, with
  `NEMIA_TOOL_DETAILS=1`, `tool_parameters` and `error`, beside the labels it was started with (`run`, `step`, `task`, `factory`,
  `workflow`, `agent`).
- **Pyroscope**: one label of ours, `service_name`, the profiler's `appName`. The profile types: `wall:wall:nanoseconds:wall:nanoseconds`,
  `wall:samples:count:wall:nanoseconds`, `wall:cpu:nanoseconds:wall:nanoseconds` (the CPU time collected beside the wall samples),
  `memory:inuse_objects:count:inuse_space:bytes` and `memory:inuse_space:bytes:inuse_space:bytes`.

## Replacing a hand-run container

A container started by hand as `nemia-lgtm` holds its data inside itself. To swap it for this one and keep that data:

```sh
docker stop nemia-lgtm
docker cp nemia-lgtm:/data "$HOME/nemia-lgtm-data"
docker rm nemia-lgtm
docker compose -f tools/observe/compose.yaml create
docker run --rm -v nemia-observe_data:/data -v "$HOME/nemia-lgtm-data":/from alpine cp -a /from/. /data/
docker compose -f tools/observe/compose.yaml start
```

`create` makes the volume and the container without starting it, so the data is in place before the stack first reads it. The ports
are the same, so a daemon exporting to `http://localhost:4318` keeps going: what it says while the collector is down is lost. The
metrics and logs are back at once; Tempo lists the old traces again a few minutes after the start, once it has polled its blocks.

## Moving the image

The image is pinned by digest. To move it: `docker pull grafana/otel-lgtm`, read the digest with
`docker image inspect grafana/otel-lgtm --format '{{index .RepoDigests 0}}'`, and put it in `compose.yaml`. The test refuses a tag.

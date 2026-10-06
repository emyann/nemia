# tools/observe — the side Grafana

A Grafana to watch how Nemia runs while we build it: one `grafana/otel-lgtm` container holding the OpenTelemetry collector, Tempo, Loki,
Prometheus, Pyroscope and Grafana, with four dashboards loaded from `dashboards/`. It is a tool of this repository and never ships: no
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

Open Grafana at <http://localhost:3000>: it lets anyone on this machine in as an admin, with no login. It lands on **System**.

## Point the daemon at it

Start the daemon (the api, `node src/main.ts` in `apps/api`, or `nemia up`) with:

```sh
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

It then exports its spans, its logs and its metrics there, filed under the service `nemia`, or `OTEL_SERVICE_NAME` when that is set: the
dashboards' `Service` variable picks it. The packages' README says what the daemon exports (`packages/agent-orchestrator/README.md`,
*What the daemon says*).

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
  tokens, time, tries, checks, rounds and denied calls over the range, by factory, workflow, step and agent; the feed's readers, the
  subscriptions and Nemia's keeper. Below them, **Profiles**: the CPU and the heap in use from Pyroscope, by stack, over the dashboard's
  range and its `Service`, for a daemon started with the preload. A flame graph sums every pass in its range: read it beside **Passes**
  over the same range, which the links at the top keep.
- **Passes** — a pass's time from the `pass` spans (TraceQL metrics), its phases from `pass.phase.duration` (the phases are not spans),
  and the slowest of the latest 500 `pass` and `advancePass` spans, each linked to its trace.
- **A run** — pick a run: its filings (the runtime's `file` spans, one for each session a step filed), the runtime's appends to its
  journals with their task and kind, and its logs, by step. The orchestrator's `fileReady`, `fileTries`, `fileRounds` and `fileChecks`
  spans carry no run: they are a pass's phases, under its `advancePass`.
- **Steps** — tokens and denied calls by step and agent. Turns and tool calls wait on the card that has a step's session export its
  telemetry (`a-step-s-session-exports-its-1tan`).

`packages/agent-orchestrator/test/observe.test.ts` holds them to the code: a query that names a metric, label, span, attribute or log
field the code does not emit fails it, and so does a metric the code defines that System does not chart, or a profile type the profiler
does not send. `agent-orchestrator/test/profile.test.ts` holds the preload: with no endpoint, nothing loaded and nothing opened.

## The names, as measured

Read off a daemon exporting to this stack (2026-10-06):

- **Prometheus**: a metric's dots become underscores. A histogram has `_bucket`, `_count` and `_sum` (`pass_duration_bucket`); a gauge
  takes `_ratio`, from the unit `1` the exporter gives it (`machine_load_ratio`); a counter that only grows (`incremental: true`) takes
  `_total` (`step_cost_total`); any other counter is a gauge with no suffix (`subscription_wakes`, `nemia_acts`). Every series carries
  `job` and `service_name`, both the service's name. The step metrics carry `factory`, `workflow`, `step`, `agent` and `outcome`, the
  phases `phase`, and the api's reads `route`. A run's id is never a label.
- **Tempo**: the resource attribute `service.name`; the span attributes `run`, `step`, `task`, `kind` and `attempt`, as `span.run` and so
  on. An `append` made outside a filing (a session's end) carries its task and kind but no run.
- **Loki**: one stream label, `service_name`; the logs' annotations (`run`, `step`, `word`) and the collector's fields (`trace_id`,
  `span_id`, `severity_text`, `detected_level`) are structured metadata, filtered as `| run="…"`. The daemon exports what it logs at
  `Info`.
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

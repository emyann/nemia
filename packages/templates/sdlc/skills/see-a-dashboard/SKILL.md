---
name: see-a-dashboard
description: See a dashboard of the side Grafana (tools/observe) rendered before it lands — run the render that starts a throwaway stack from the checkout with fake data, read each dashboard's picture beside the text of its panels, and name a bar with no name, a panel with no data, a query's error or one series where the seed holds several. For a step that changes a dashboard, the collector or Tempo's file, before it signs off, and for one that reviews the change. Writes nothing into the workspace.
---

# See a dashboard rendered

A dashboard whose queries answer and whose panels draw one nameless bar is not done. The live Grafana shows only what is on main, over
what a landed daemon emits: a dashboard, a collector rule or a span that exists only in a worktree is drawn by nothing there. This is
how a step sees it anyway: a throwaway copy of the stack, started from the checkout, fed fake telemetry, and read through a picture
and the text of every panel.

## 1. Take the pictures, or read them

- **When a step before you named them** in its artifacts, `dashboard-<name>.png` and `dashboard-<name>.txt` for each dashboard, read
  those: the text first, then the picture.
- **Otherwise, and after each change you make,** render the checkout you are in:

  ```sh
  node tools/observe/render/render.ts --out <your files directory> [--dashboards steps,time]
  ```

  It takes a minute and a half and about 0.8 GiB, one at a time on the machine: a second render waits for the first (`--wait
  <seconds>`, 600 by default). It needs `docker` and Playwright's Chromium. It starts a container of its own name
  (`nemia-render-<pid>-<random>`) on ports Docker picks, never the live stack, and removes it when it ends, also when it fails. With
  no `--out` the files go to `$WF_ARTIFACTS`, else to `.observe/` at the repository's root, which git ignores. Never write them
  anywhere else in the workspace: a file there rides the branch.

A dashboard is named as its file is, without `.json` (`tools/observe/dashboards/`). Name every file the render wrote in your
`artifacts`, by its absolute path: the build's check refuses a change under `tools/observe` that names no picture and text of each
dashboard it changed.

## 2. Read the text beside the picture

The text is what the page drew, panel by panel, in the order of the page; the picture is the whole page, 1600 pixels wide, in
Grafana's dark theme. Read the text first: a panel far down a tall page is small in the picture, and a missing name is easier to
see in a line of text.

```
## Tool errors, across runs [bargauge]
  bar: (no name) = 2
```

- `bar: <name> = <value>` — one line for each bar. **`(no name)` is a bar drawn with no label**: the legend names a label the query
  does not keep, or the query sums the series into one.
- `series: <name>` — a chart's legend, one line a series.
- `columns:` and `row:` — a table's header and its rows; only the columns the window shows are written.
- `line:` — a log line.
- `no data` — the panel drew nothing.
- `error: …` — what the panel's query answered, word for word.
- `not seeded: <why>` — no fixture meets this panel, on purpose; `no data` there says nothing about the panel.

Then judge each panel the change touches against what the seed holds:

- **One series where the seed holds several.** The seed tells of two steps, `build / implement · ada` and `build / review · agora`, in
  the run `seeded-run-1`, and every panel that draws series is met by two at least. One bar, or one line, is a query that drops a
  label or a legend that names the wrong one.
- **A label that is missing.** One failed `tool_result` of the seed carries no `tool_name`. A panel by tool should show it apart, or
  leave it out on purpose; a panel that folds it into another bar hides it.
- **`no data` on a seeded panel.** The query names something the seed does not send, or filters it away. If the change adds a span,
  an attribute or a metric, the seed must send it too: add the fixture in `tools/observe/render/seed.ts`, whose test
  (`packages/agent-orchestrator/test/observe.test.ts`) refuses a name the code does not emit and a panel the seed does not meet.
- **The picture.** A panel cut off or overlapping, a unit that reads wrong (`4 hours` where seconds were meant), a bar chart whose
  longest label is cut, a legend that says `{{step}}` as written.

The numbers are fake: read whether they are told apart and labelled, not whether they are plausible. Fixed by hand, the seed can meet
a panel and still differ from what the code sends in a value or a unit: the names are held to the code, the values are not.

## 3. With a browser

A step that has the browser tools can look at the stack itself, to hover a bar, open a legend or change a variable:

```sh
node tools/observe/render/render.ts --out <your files directory> --hold [<seconds>]
```

It renders and writes the same files, then leaves the stack up, 600 seconds unless told, 1800 at most, and prints where Grafana
listens and each dashboard's address, on the range, the run and the session the pictures were taken at. Open an address with
`browser_navigate`; there is no login. An edit made in that Grafana is not the checkout's file: load the printed address again to see
the file. When you are done, stop it, since it holds the machine's one render slot:

```sh
node tools/observe/render/render.ts --stop <the name it printed>
```

The stack is removed by its own name when its time ends even if you do not. A look in the browser replaces neither the pictures nor
the text: both are still owed.

## 4. Say what you saw

Each thing that is off names the dashboard, the panel by its title, the line of the text or the place in the picture, and what is
wrong. A dashboard the change touches with no picture or no text is a finding. If nothing is off, say so, and that you judged from
the files: a look that invents work is worse than a short one.

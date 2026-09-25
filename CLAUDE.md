# hkb-v2 — contributor guide

Two packages and two apps. `packages/agent-runtime` runs one agent session to completion, durably
(the `ae` CLI; `src/domain.ts` is the whole judgement). `packages/agent-orchestrator` sequences engine
tasks into runs of steps — a folder of markdown is a workflow (the `wf` CLI). `apps/api` puts the
workflows behind HTTP; `apps/web` talks to it. Dependencies point down that list, never up. Read
`README.md` and each package's README for the model before changing behaviour.

The packages are named for their layers: a runtime keeps one agent session alive to completion, and an orchestrator
turns declared work into its tasks, watches them and reconciles. They were `agent-engine` and `agent-workflows` until renamed on 2026-09-23.
What people type and what is on disk kept its name on purpose: the `wf` and `ae` commands, `~/.agent-workflows` (`WF_ROOT`)
and `~/.agent-engine` (`AE_ROOT`), since a new default would orphan every record there.

Beside them, and optional: `packages/agent-judge` asks TypeSafe's Jev a typed question once and records the
answer (the `judge` CLI; Effect inside, plain Promises out). It imports nothing from the workspace and nothing
imports it — `test/boundary.test.ts` refuses both — with no `TYPESAFE_API_KEY` every question reads `unsure`,
and nothing in a tick, `assess`, `wf decide` or a gate calls it (its README's *Never in a tick*).

## Check your work

- `npm test` — from the root, turbo runs `node --test test/*.test.ts` in every package
  (181 engine · 169 workflows · 21 api · 33 web at 2026-09-13). Runs from a package directory
  too. Not bare `node --test` from the root: `agent-runtime/test/facade.test.ts` is cwd-relative.
  It runs the packages in parallel. Until 2026-09-14 it ran them one at a time: the api's tests asked the machine's
  live `claude agents` registry and died under contention (plan §4b). Every api test file now imports
  `apps/api/test/harness.ts` first — a fake `claude` first on PATH, the harness the api's engine runs — and
  `harness.test.ts` refuses a file that does not, so a new api test file imports it first. Measured parallel three
  times in a row with `npx turbo run test --force`: without `--force` turbo replays a cached pass and measures nothing.
- `npm run typecheck` — `tsc --noEmit` per package. **This is the lint.** There is no eslint or
  biome, on purpose, until one replaces more code than it adds.
- Run both before you commit. Green is the floor, not the bar: a change that makes the suite
  pass by weakening a test is a finding to report, not a fix.
- **Turbo does not see `workflows/`.** A change to a shipped folder replays every package's cached pass (`FULL TURBO`)
  though three tests pin those folders: the round trip in `agent-orchestrator/test/workflow.test.ts`, the package's `ui`
  copy, file for file, and the api's picture of `dev` and `dev-build` (`apps/api/test/workflows.test.ts`). After touching
  `workflows/`, run `npx turbo run test --force`, and copy a `workflows/ui` change into
  `packages/agent-orchestrator/workflows/ui` (learned by the change that gave every shipped step an `effort:`).
- **A package's former name is refused outside history, and turbo can replay that refusal's pass.** `packages/agent-orchestrator/test/names.test.ts`
  reads every file git lists, tracked or not yet added, and fails on a line naming either package by the name it had before 2026-09-23,
  except in a file on its `HISTORY` (dated writing, each with a line at its top saying it keeps its words — a `.md` one that
  names a former package fails without the mark and that note in its first five lines), in a store's path
  (`~/.agent-workflows`, `~/.agent-engine`, whose names stay), or on a line that says `renamed on 2026-09-23`. New dated writing that
  quotes the old names joins `HISTORY`. Turbo caches the package's pass by the package's own files, so a change only to a doc or to
  another package replays it: run `npx turbo run test --force` after such a change (learned by the run that renamed the packages).
- **Another project is described, never named, history included.** Before the repository went public the owner chose to say what
  two groups of other projects do, in a few words, with no name and no link (an agent kanban; a Go agent SDK, its sandbox runtime and
  an A2A adapter for Claude Code). `packages/agent-orchestrator/test/others.test.ts` reads every file but `package-lock.json` and the
  vendored `.claude/skills/shadcn/`, and refuses a line naming one; the names sit there in base64. What we integrate (Claude Code,
  Codex, A2A, `@a2a-js/sdk`) and what is compared by name on purpose (TypeSafe, Tekton, Argo, n8n, Kubernetes) are not on it.
- `npm run build` too when you touch `apps/web`: the router plugin regenerates
  `src/routeTree.gen.ts` only in a vite build, so a new route file fails `typecheck` until
  `build` has run once (learned by the run that added `/runs/$runId`).
- For `apps/web` changes, run `npm run e2e` and read the PNGs it writes before you sign off (`.e2e/`,
  or `WF_ARTIFACTS=<your files directory> npm run e2e` in a run, whose PNGs are the screenshots the ui reviewer reads). A
  round's check builds but runs no e2e: the shipped lines run it only where no `WF_BASE_REF` is set, so once, on the merged
  tree, in the shipper's hands, and your own run is the only e2e the change meets before
  the merge (since 2026-09-25). A new page is a file of its own, `apps/web/test/e2e/pages/NNN-<name>.ts`, whose default
  export is its `PageSpec` named `<name>`, the name its screenshots take; add the file, add `<name>` as a line at the end of
  `pages/NAMES`, and touch nothing else. NAMES is merged by union, and the load refuses a page with no line and a line with no
  page, so a page deleted by mistake fails `npm test` (delete its line too when you mean it). The pages are
  visited in the order of their file names, the number first (in tens, to leave room); they share one store, so give a page
  a number after any page whose leavings it reads. `pages.ts` refuses anything else in `pages/` but NAMES: a helper two pages use goes
  in `board.ts` or `canvas.ts`, the runner's state is `world.ts`'s, a run a page writes during its visit and takes back sits
  in its page's file, and what `main` seeds before the first visit is `seed.ts`'s, since every page sees that store (learned
  by two runs that each added a page to one array, and conflicted every time). Once per machine, install a browser for each
  playwright: `npx playwright install chromium` for the e2e's, and `node node_modules/@playwright/mcp/cli.js install-browser
  chromium` for the one behind the steps' `browser_*` tools (`.mcp.json`). One build per playwright
  version lives in `~/.cache/ms-playwright`, and these two differ (1.62.1 and a 1.63 alpha). An install
  deletes every build whose playwright is not listed alive in `~/.cache/ms-playwright/.links`, so
  install through the checkout's own `node_modules`, never from an `npx` download. (Learned by the run
  that added the browser, whose install deleted the e2e's builds.)
- **`npm test` runs `test/*.test.ts` and nothing under `test/e2e/`.** A web test that needs no browser sits in `test/` (the e2e's
  own, `e2e-pages.test.ts` and `e2e-merge.test.ts`, typechecked by `test/e2e/tsconfig.json`); `test/e2e/*.test.ts` are the ones that
  launch Chromium, and only `npm run e2e` runs them. The two sat in `test/e2e/`, so the check of a run that touches nothing under
  `apps/` stayed green with CLAUDE.md's union line gone (learned by the run that put the e2e's page names in `pages/NAMES`).
- **An e2e expectation about a time of day must read the day, not assume it.** The quota page's five-hour window resets 130
  minutes out, and the page spelled the reset it expected with no weekday. After 21:50 that reset falls on tomorrow, `clockWord`
  prepends `Sun`, and the page fails for the hour it was run at and nothing else. Work the expected words out by the rule the code
  keeps — same day or not — and assert the weekday separately where it must show (learned by the run that added the folder page).
- **A run added to the e2e's seed shifts every count asserted about the store.** The Factory's tally, and the Runs page's rows,
  its Finished heading and the count it checks again after Enter, all name a number: one more finished run fails four assertions on
  three pages before its own page is reached. Add the run, then run the e2e and follow it to the end (learned by the same run).
- **A test that names the last e2e page fails on the next page added.** The merge test (`apps/web/test/e2e-merge.test.ts`) wrote
  `240-capabilities.ts` as the last page and `250` as the number two runs would both take, so the page after it failed before a browser
  opened. It reads both off `pages/` now; a test about the pages reads the pages that exist (learned by the run that added the `outcome` page).
- **`assert.throws(fn, /^…/)` matches `String(err)`, which starts with `Error: `.** An anchored
  pattern never matches a message; assert on `err.message` (`assert.throws(fn, (e) => /^…/.test(e.message))`).
  Learned by R, whose refusal tests passed for the wrong reason until anchored right.
- **A `check:` line tells the run's check from a hand run by `WF_BASE_REF`, never by `WF_STEP`.** The run sets `WF_BASE_REF` on
  every check it executes of a git run; the ship has no `check:` and its shipper runs `workChecks`' line by hand, mid-merge, with
  nothing set, so `WF_STEP=ship` never occurs. The shipped lines read what was touched and hold the e2e for the merged tree on that
  one variable, and a line keyed that way runs the whole of itself wherever the run's environment is missing (`web-check.test.ts`
  runs each both ways; learned by the run that took the e2e out of the rounds).
- **A check the run files starts at low priority; what a session runs itself does not.** `CHECK.command` in
  `agent-orchestrator/src/check.ts` wraps it in `nice -n 10` (`CHECK_NICENESS`), and `checkScript`'s first line puts its shell in
  the idle IO class where `ionice` exists and is allowed, so a machine without it still runs the check. On 2026-09-24 several runs'
  checks at once (turbo, the web build, the e2e's software-GL Chromium) froze the owner's Windows desktop for moments, with vmmemWSL
  at up to 401% of a core. Agent sessions stay at normal priority, and so does an `npm test` or `npm run e2e` you run inside yours:
  a niced process cannot be un-niced by its child, so niceing `package.json`'s scripts would nice them there too. `nice` ranks
  processes inside the VM only; with nothing else busy in WSL, a niced check still uses every CPU it has.
- **A step's check logs its stdout alone, and a person is shown the tail of its stderr.** The whole stderr is on disk at the check's
  `WF_STDERR` (`~/.agent-workflows/checks/<run>-<step>-check.stderr`), named on the check's record beside its `.log`. The e2e said why a
  page failed once, first, on stderr, and then thirty lines of the servers' output: the check read as an exit 1 after
  `the factory page … ✓`, with nothing printed. `exitOn` (`visit.ts`) now ends both streams with the failure in a few lines (`headlineOf`:
  the page, the theme and the error; the element Playwright waited for and what lay over it; the picture), and `visit.test.ts` reads the
  end of each. Anything a check runs that can fail says why last, on stdout too (learned by thin runtime stage 2 part 4b, round 2).
- **The e2e's watch counts every 4xx a page sees against it.** A refusal the e2e makes on purpose goes
  in a page of its own, with a watch that must see that one refusal and nothing else (the `answer` page,
  learned by the run that added the answer box). And the e2e visits every page in light, then every page
  in dark, so a page that writes to the store takes its write back before it ends. It lets one failure pass: a
  `net::ERR_ABORTED` on `/api/feed/stream` opened before the page itself navigated or reloaded (`watch` in `checks.ts`);
  the board closing that stream mid-page still counts.
- **The engine's `transcript` of an attempt still in flight asks its harness** for the session's id, which is on no record
  yet: `find` where the harness has one (claude's reads the registration file, about 2 ms), and one `claude agents` call per
  read where it has none or finds nothing. Since the transcript crossed the A2A seam (`sessionTranscript`) the journal is read
  twice per read too, and a task with no attempt asks nothing. Read it on a run's detail, never on the list the Factory polls
  (learned by the run that put a blocked session's last line on the board; the cost said again by the run that read the
  transcript through the seam).
- **Playwright's `dragTo` onto a React Flow handle waits for ever.** A handle a connection cannot start from has `pointer-events: none`
  until a drag is under way, so `dragTo`'s check of what the pointer would hit finds the node over the handle. Drag with `page.mouse`
  (down, move in steps, up), and keep both ends in the frame: a drag that starts off a handle pans the pane (`drawEdge` in
  `apps/web/test/e2e/canvas.ts`, learned by the run that built the workflow builder).
- **A sed address built from `grep -n` output can write a file.** `sed -n "$(grep -n pat f | cut -d: -f1)p"` is safe; one that keeps
  the matched text (`2427:  watch = watchFeed({`) hands sed a `w` command, and sed writes the input to a file named after the rest of the
  line, at the root, with nothing said. `git add -A` then committed a second `apps/api/src/app.ts` named `atch = watchFeed({p`. Read
  `git status --short` before `git add -A`, and read a line of `git diff --name-only` that looks like noise (learned by the run that let
  `wf watch` survive a cut feed).
- **A file written through a script can turn an escape into the character it names.** A Python heredoc, or a tool that decodes
  escapes, wrote a raw NUL and DEL into a regular expression's class in `apps/api/src/builder.ts`: ripgrep then took the whole file for
  binary, and a search of `apps/api/src` did not find it. Each app's `test/source.test.ts` refuses a raw control character in its `src` and
  `test`; a script that needs one builds it with `String.fromCharCode` (learned by the run that built the workflow builder, round 2).
  The same happened to a byte order mark: writing `\uFEFF` through the file tools put a raw BOM into `agent-judge`'s `card.ts` and
  `card.test.ts`, twice — and into this very line as it was written, caught only by looking for one — and that package's
  `test/source.test.ts` refuses one too (learned by the run that built the judge package).
- **An e2e fixture written relative to now crosses midnight.** The quota seed resets the five-hour window 130 minutes out, and the
  page spec assumed that time is always today: run between about 21:50 and midnight, the header rightly says `resets Sun 00:26` and the
  e2e failed on the weekday it added. An expectation over a formatted time decides the same way the code does — `clockWord` compares the
  calendar day — rather than hardcoding which form it will take (learned by the second round of the run that gave an agent its skills).
- **A picture of one card on the fitted Factory is a third of its size.** `card.screenshot()` photographs the node as the floor draws it,
  zoomed out to fit every run, so a card at rest came out 110 pixels wide and nothing on it could be read. Photograph a card with
  `photographCard` (`apps/web/test/e2e/canvas.ts`): it zooms the floor in about the card with the wheel, drags the pane from an empty spot to
  bring the card to the middle, takes the picture and fits the view again (learned by the run that put a run's steps on its card).
- **Playwright treats a straight SVG edge path as hidden.** A zero-height `<path>` fails
  `toBeVisible()`, so an e2e that waits for an edge to be visible waits for ever; count the edge
  paths instead (learned by the run that animated the edges).
- **Something beside the Factory's floor that mounts after its first render narrows a floor already fitted.** The e2e still passes, and
  the picture shows the last card cut at the right. Load what it draws in the route's loader (`prefetchQuery`, which never throws), and fit
  again when it comes or goes (the queue's lane, learned by the run that drew queued cards on the Factory).
- **A card on the Factory must fit its cell.** The grid puts the card beneath a `CELL_HEIGHT` below, so a card drawn taller reaches
  over it on every layout, and no screenshot shows it: the tall cards are finished runs, off the default floor. The e2e measures it
  after a Reset layout (`expectClearOfEachOther` in `apps/web/test/e2e/canvas.ts`); a card that grows a line is measured there, not seen
  (learned by the run that took up the board's review leftovers).
- **The Factory's fit is padded by the panels over its floor, measured at each fit.** A proportional padding put the bottom row under
  the legend, which wraps to two lines at 1280 wide, once more runs stayed on the default floor; the card's buttons could not be clicked.
  `fitClear` in `FactoryCanvas.tsx` pads by what the panels cover, and the e2e's `expectClearOfPanels` refuses a card under one. A size
  read off a card on the floor is zoomed: measure a row in the card's own pixels (`offsetHeight`), or under half size it rounds to none
  (learned by the run that kept a run waiting on a person on the floor).
- **An EventSource closed on the server's last event aborts a request the server has answered.** The api writes `settled` and ends the
  response; closed the moment the event arrives, before the end does, Chromium reports `net::ERR_ABORTED`, and the e2e's watch fails the page
  now and then. Close it on the `error` fired as the response ends, or after a grace (`follow`, learned by the run that drew the queue).
- **React Flow moves a dragged node from the second pointer move, not the first.** The first move past its threshold
  only starts the drag. Playwright's `dragTo`, and the browser tool's `browser_drag` on top of it, send one move and move
  nothing: drag with `page.mouse.move(…, { steps: 12 })` in an e2e, and in the browser tools with mouse events synthesized
  from `browser_evaluate` a few milliseconds apart (learned by the run that made the Factory's steps draggable).
- **The engine's task view carries no filing time; its feed does.** A slot wait is filed → first attempt, so the timeline
  reads filings off `e.feed` (`readFilings`). A store written by hand — the e2e's seed — writes `engine/feed.jsonl` too
  (`seedFeed`), or every queue time reads `not known` (learned by the run that added the timeline).
- **A browser's `requestAnimationFrame` throws when called off another object.** `{ request: requestAnimationFrame }`
  lost every live event of the session stream with no error on the page; call it as `(f) => requestAnimationFrame(f)`
  (`animationFrames`, learned by the say page's e2e).
- **Playwright's `hasText` reads `textContent`, which puts no space between two elements.** A label beside a rendered
  `Markdown` block — `<p>asks:</p><div data-markdown>…` — reads `asks:Warm colours…`, and a locator for `asks: Warm colours…`
  waits for ever. Put `{' '}` between them (`Asks` in `Decide.tsx`, learned by the run that rendered markdown on the board).
- **React Aria's `DisclosurePanel` keeps what it holds, and a closed panel is still laid out.** It hides the panel `until-found`, which is
  `content-visibility: hidden`, not `display: none`: a folded result is rendered for nobody, and a margin or a border on the panel shows under
  a closed fold. The board's folds draw their content only while open (the `Disclosure`'s render function, or `DisclosureStateContext`) and
  put their spacing on what they draw (`ToolRun`, `ToolContent`, `ReasoningContent`; learned by the run that put the app on React Aria).
- **Enter on a React Aria link is two clicks, and each can navigate.** On keydown the browser clicks the link, and React Aria does not
  prevent it: without React Aria's `RouterProvider` (the root's, on `router.navigate`) the browser follows it and loads the whole page. On
  keyup React Aria calls the link's `onClick` itself, with a click it makes, so TanStack's `createLink` over it navigates again to the same
  place and the route loads twice (measured by counting `onBeforeLoad`). A link to a route is `routeLink` (`components/routeLink.tsx`):
  `createLink` for the typed `to`, `href`, preloading and `aria-current`, with TanStack's click handler left off, and anything to run on a
  press in `onPress`. The e2e's runs page presses Enter on a place and fails without the provider; nothing counts loads (learned by the same
  run, its second round).
- **Playwright's click on a React Aria switch waits for ever.** Its role and name are on an input hidden to the eye inside the switch's own
  `<label>`, which intercepts the click. Press the label, `page.locator('label', { has: toggle })`, then check it is `checked`
  (`showFinished` in `canvas.ts`). A checkbox or radio from React Aria is built the same way (learned by the same run).
- **`browser_take_screenshot` resolves a relative `filename` against the workspace, not `--output-dir`.** With `@playwright/mcp` 0.0.80 a
  relative name failed as a path under the worktree, and would have written there had the folder existed. Give it an absolute path under
  `/tmp/playwright-mcp`, in a folder made first (learned by the same run; the `look` skill still says relative).
- **An encoded `..` never reaches a Hono route in a test.** `app.request` parses its URL, and a URL resolves `%2E%2E` as `..`
  before the router sees it: the answer is the router's 404, not the route's refusal. Send `..%2F…` — a slash encoded — to reach
  a name refusal (learned by the run that added a card's page).
- **A query keyed by the state it answers for must not be invalidated by a write.** The board reads a run's decision under a key that is the
  run's state (`decisionStamp`), and the writes invalidated `['runs', <id>]` by prefix: the refetch filled the key the page was on with the
  answer for the state *after* the write, and a run whose state went back to one already read showed a blank Decide section until a reload.
  A write invalidates the run's record alone (`exact: true`); the next state is a key of its own (learned by the run that put a finished
  run's decision on the board).
- **A page that changes what it shows at the end of its e2e is photographed mid-read.** `visit.ts` waits for the network to idle (`idle`) before the
  picture, but a page whose state changes after that wait re-issues the queries its state keys — the run page reads its decision again when
  a step moves — and the shot showed `Reading the branch…` where the branch's diff stat belongs. End such a page by waiting for what it
  reads again, with an assertion of its own (the `decide` page's last line, learned by the run that put a finished run's decision on the
  board).
- **The e2e waits for `idle(page)`, never `networkidle`.** Playwright's `networkidle` waits for no request in flight, so a stream that never
  ends — the workflow feed the board may hold open from its root — holds it for ever. `idle` (`checks.ts`) waits for 500 ms with nothing in
  flight but `/api/feed/stream`, measured from the call, and a `goto` or `reload` waits for `load` and then `idle`. Under Playwright 1.62 a
  page that navigates or reloads drops its old document's requests with no `requestfinished` and no `requestfailed`, so `idle` lets go of
  every request but the navigation's at the main frame's commit, as Playwright's own `networkidle` does (`_onClearLifecycle`), or waits
  for a fetch that will never be answered — a poll the old document started while the navigation was on its way included. The watch's
  allowance for a stream the page left is proven on events emitted by hand (`checks.test.ts`), since this Playwright reports no such abort.
  A page that edits the store by hand where the board must see it says so on the feed too, `fed(run, step?, word)` in `board.ts` (learned
  by the run that taught the e2e to wait past the feed stream).
- **While the board follows the feed it polls once a minute, and react-query re-reads a changed `refetchInterval` only when the query
  changes.** `runsQuery`, `runQuery` and `ceilingsQuery` poll at `pace(5_000)` (`lib/feed.ts`): 60 s while `/api/feed/stream` is open, 5 s
  while it is not. An e2e page that edits the store by hand and waits on the board to see it calls `fed()`, or waits out the minute and fails
  at `WAIT_MS`; never raise the wait (the `outcome` page took its run back unsaid and relied on the 5 s poll; it says `removed` now). And a function interval is read again on the query's next update, not when the flag it reads flips:
  `useFeed` marks the polled queries stale when the stream opens (`refetchType: 'none'`, which reads nothing) and reads them when it goes
  down, or a run the feed has no line for keeps its 5 s timer (learned by the run that made the board follow the feed).
- **A page opened on the board reads what it shows twice, once from its loader and once from the feed's replay.** The feed's stream opens with
  no cursor and replays the whole feed, and each line invalidates what it can change, so a run's record is read again moments after the load. An
  e2e page that holds a read with `route` to fake a moment before a change routes before its `goto`: the say page's second page routed after
  the load, the replay's read went out first and came back after the journal said the session ended, and its box was closed for good in the
  dark theme only (learned by the run that made the board follow the feed, round 2).
- **A suspense query keeps what it showed when a read again fails.** `useSuspenseQuery` throws only while it has no data
  (`defaultThrowOnError` is `data === undefined`), and retries a failure three times first, so a run's page whose record read 404 after
  `wf rm` still drew the run, and said nothing. Reading a query again is not a page saying what the read found: a page that must say a
  thing is gone reads the query's `error` beside its `data`, and a query whose 404 is an answer does not retry it (`runGone` and `retryRun`
  in `apps/web/src/lib/api/detail.ts`; learned by the run that made a `removed` event read the run's record again, round 2).
- **Closing an e2e's second page refetches the first.** The first page is focused again, and react-query refetches its queries on focus:
  a fixture taken back *after* `refused.close()` is read by that refetch, and the page's last picture shows it (the Agents list showed a
  node that names `scribe` which was gone). Take the fixture back before the close, then wait for what the page reads again (learned by the
  run that put the agents on the board).
- **A background shell that never exits keeps your session busy, and your closeout is never read.** A
  `run_in_background` loop such as `until grep -q Local: server.log; do sleep 0.5; done` outlives the server it waits for,
  the registry reads the session as `shell`, the engine reads the step as working, and nothing settles it (seventy-seven
  minutes, learned by the run that drew the queue on the Factory; engine open issue 24). Give every background loop
  a bound — `timeout 120 bash -c '…'` — and end your own servers and watchers before you sign off.
- **A handle closed is still counted until the event loop turns.** `process.getActiveResourcesInfo()` lists an `fs.watch` as
  `FSEventWrap` until libuv's close phase has run, and a stream read through `app.request` is all promises: four tests ran start to
  end without one turn, so a baseline taken at the fifth counted seven watchers already stopped, and the count then fell below it. Wait
  for an absolute count (`until(() => watchers() === 0)` in `apps/api/test/feed.test.ts`), never read one once after a close (learned
  by the run that streamed the workflow feed).
- **A guard is not proven by a test that asks whether it allows.** Every new refusal — a parser
  key, a value, a tool, a check — gets a test that makes it *refuse*, at shipped defaults. Guards
  that were only ever tested for the allowing case have been silently inert before (hkb's
  admission gate, worktree base and lease each were).
- **A test of a timer waits for the ticks it counts, never for a length of time.** "start() ticks on a timer" slept 200 ms
  and wanted two ticks at 20 ms; a process the scheduler parks for those 200 ms wakes with the interval and the sleep both
  due, sees one tick, and fails — two full checks in four at a load of 20, and on demand by freezing the test with `SIGSTOP`
  as its loop starts. Wait for the Nth tick under a bound of seconds (`ticksUntil` in `agent-runtime/test/facade.test.ts`); a
  wait *after* `stop()` is safe at any length over the interval, since an interval that survived comes due first. And a tick
  faster than its interval proves no overlap guard: the old test passed with `start()`'s guard deleted. Run a mutant of a
  loop under `timeout`: one whose `stop()` no longer clears its interval holds `node --test` open for ever (learned by the
  run that made the timer test pass under load).
- **A test's temporary folder comes from `scratch(prefix)`, never from `os.tmpdir()`.** A test that failed before it stopped its
  detached worker left the worker, and a fake that reads its stdin for ever, running for hours, and roots nobody removed piled up
  to 12,583 `ae-detached-*` folders in `/tmp`. `test/scratch.ts` is the same byte for byte in every package whose tests make
  folders. After each test it stops what still runs in that test's roots (a worker by SIGTERM, then the rest killed with its
  group). After the file it removes every root and fails the file if a process or a root is left. A process counts as in a root
  when its arguments, its cwd or its environment name one. Each package's `scratch.test.ts` refuses a `tmpdir(` call anywhere
  else under `test/`; a line that makes no root there says `// not a root` and why. It also holds the copy to the runtime's, so a
  change to the helper is made in `packages/agent-runtime/test/scratch.ts` and copied. `agent-runtime/test/leaks.test.ts` runs a
  failing fixture file under `timeout` with a TMPDIR of its own and requires that nothing is left, and one that leaves a root
  it cannot remove, which must fail the file. A fake harness that reads stdin
  bounds its own life all the same. The worker itself also ends its harness and exits when its run file or store is removed
  (open issue 32). To measure a leak, run with `TMPDIR=$(mktemp -d)`: other worktrees' suites write to `/tmp` too (learned by
  the run that found the leak).
- **A test that fails only under load is a race until shown otherwise, and it is made to happen on demand before it is fixed.**
  Of the three a loaded suite failed on 2026-09-23, two were races in the code. The detached worker published its pid and only
  then installed its SIGTERM handler, so a stop sent in between killed it by the signal's default action and its harness ran on
  under a run file that said `working`; it installs its handlers first now (`ae-worker.ts`). And `wf watch` printed
  `watching from N` before the watch checked N, so a reader that cut the feed on the banner had the watch refuse its cursor and
  die with a stack; the banner is printed once the watch holds it (`watchPrinted` in `cli.ts`). The third was the test's: a Codex
  task's thread id is on its run file before its output is on disk, since the log is a write stream, and the test read the logs
  once. Each was made to happen every time with a throwaway `--import` hook passed through `NODE_OPTIONS` to the one process
  concerned (freeze the worker with `SIGSTOP` after its first rename, delay its `fs.write`, pause the watch's child after its
  banner), and the test for the worker keeps its hook. Wait on a frozen process with `ps -o stat=` before continuing it: a
  `SIGCONT` sent before its own `SIGSTOP` leaves it stopped for good (learned by the run that found them).
- **A rule about order or names is not proven by a fixture that already has it.** The equal-times admission test read
  a journal whose `list` sorts, and a sort is stable, so it passed with the id tiebreak deleted; the pool test
  configured the `claude-bg` runner as `claude`, whose pool is `claude`, so it passed with `poolsOf`'s mapping
  deleted. Give the fixture the opposite order, or another name, and check the test fails without the rule
  (learned by the run that closed engine issues 24 and 25).
- **An e2e page run against the old code proves only its first failing assertion.** The page stops at the first `Refused`, so
  the Factory page's card drags failing on the old canvas said nothing of its step drag further down. To prove each new assertion
  fails without the change, skip the earlier ones in a throwaway edit (`if (0) await …`), run again, and put the page back
  (learned by the run that let every card and step move alone).
- **A key added to `STEP_KEYS` has three obligations outside the package.** `KINDS` in `apps/api/src/builder.ts`, or the
  api's typecheck fails; `WorkflowStepSpec` and `specOf` in `apps/api/src/workflows.ts`, or the key never reaches the
  board; and `apps/web/src/lib/api/workflows.ts`'s mirror with `UNSET` beside it (`apps/web/src/lib/builder.ts`), or the board can
  read the key on a folder that has it and never set it on one that does not (learned by the run that added
  `workspace: main`).
- **A key renamed in `STEP_KEYS` is still read under its old name, and written under it on a record.** Folders on disk and frozen run records say
  the old name, so the old name goes into `FORMER_KEYS` (`workflow.ts`), which `readKeys` reads as the new one (and refuses when both
  are written). `asNamed` renames a frozen step in `readRun`, since a record never goes back through the parser, and the api's
  fallback for an agent whose file does not load reads the old name too (`formerOf` in `apps/api/src/agents.ts`). And `renderStep`
  and `renderAgent` refuse the old name with a message saying to reload (`formerKeyWritten`), because a board page opened before the
  rename sends it back. And a record is *written* under both names (`withFormerNames`, in `store.ts`'s `recordText`): a `wf up` started
  before the rename keeps its code, and its tick, reading only the old field, would file every step with no rule list and say nothing.
  Nothing migrates a file: `wf start` names each line to rename (`formerKeyLines`). Learned by the run that
  renamed `disallow:` and `allow:` to `disallowedTools:` and `allowedTools:` (renamed on 2026-09-23, Claude Code's names).
- **A new line in `wf decide`'s offers is parsed by the api, or handed to a person as a paragraph to run.** `ONCE_MORE` in
  `apps/api/src/decision.ts` pulls the command out of each offer the package words, and `commandsOf` falls back to `?? said` — the whole
  English sentence — for a verb it does not know. Nothing fails: the board draws a `once more` button that copies
  *"review: enough — go on with what is there; its findings stay on the record, and …:  wf accept r-1 review --message …"*. So an offer
  the package gains adds its verb and its placeholder to that regex, a label to `DecideCommand` and to `apps/web/src/lib/api/decision.ts`'s
  mirror, in the same change — with a test that asserts the *bare* command, since one asserting the offer is listed passes either way
  (learned by the run that let a person accept a loop out of rounds).
- **A level-triggered ask is not a file a person can simply be told to delete.** The run reads a person's word off disk on
  every pass — an approval, an acceptance — so deleting the file is how they take it back, but only while nothing has been done
  on it. Once a tick has filed what the word released, the deletion undoes the *reading* and not the *filing*: the loop reads
  `rounds exhausted` again and a round files its work under a step already running on it. A retry ask is safe to delete because
  it is unconsumed by definition; these are not. So a refusal that offers the deletion says when it is safe, and the verb it
  would let through refuses the state the deletion makes — the wording is not the guard (learned by the run that let a person
  accept a loop out of rounds, round 2).
- **The engine's phase is free text that four places compare exactly.** `needs-human` is matched character for character by
  `harnessBlocked` (`agent-orchestrator/src/views.ts`), by `needsOf` in `apps/api/src/judged.ts`, by `stepState` in
  `apps/web/src/lib/status.ts` — the chip — and twice inside `listing` (`run.ts`). So a word added to what a person reads goes
  *beside* the phase, never into it: `listing` takes what the harness waits for as its own parameter (`waitingOf`) and decorates
  the printed status, and the api carries it as a field of its own (`StepNeeds.waitingFor`) rather than lengthening the status the
  chip reads. Decorating the phase itself turns every one of those four comparisons off, and the tests that check them pass on the
  undecorated fixtures (learned by the run that said what a blocked step's harness waits for).
- **A new engine phase is read in two places in the orchestrator, and the second is not `phaseOfView`.** `listing` (`run.ts`) is handed the
  engine's word as text and narrows it itself (`settledOf`), since it prints that word; `phaseOfView` (`views.ts`) narrows the view for the
  tick. Taught `input-required` in `phaseOfView` alone, `assess` held a gated step at its gate while `wf ls` printed `input-required · done`
  and never `awaiting approval`, and every pure test passed, since they hand `listing` the settled words. Teach both, and the board's
  `stepState` (learned by the run that held a gate on the step's own task).
- **A new step status is a word the board draws as `working` until it knows it.** `stepState` (`apps/web/src/lib/status.ts`) falls
  through to `working` for any word it does not match, so a status added to `StepStatus` in `run.ts` passes every orchestrator and api
  test and shows on the board as a step still running — the one surface that says nothing is wrong. Add the word to `stepState`, its
  meaning and class, `stepGraph`'s fill and `offersOf` in `asks.ts` in the same change, with a test of each. And the git fixture
  (`agent-orchestrator/test/fixtures/git-runs-before.json`) pins every `Decision` whole, so a new list on `Decision` fails
  `git-before-after.test.ts` on every folder: refresh it with `everything()` of `git-runs-pin.ts`, read the diff line by line — only the
  new key may move — and say so in that test's doc (learned by the run that added `denials: fail`).
- **A word from outside, printed into a column, is made one line before it is measured.** `wf ls` pads each status to the width of
  the widest (`cli.ts`), so a harness's `waitingFor` — free text, which can carry a newline — breaks its row in two and mis-aligns
  every other row of that run, and `wf decide` splits the same way. A browser would have collapsed it and nothing would have shown
  there, so only the terminal says it. `waitingWords` (`run.ts`) turns every run of whitespace into one space before it measures or
  clips, and its test asserts the printed status holds no double space and no control character (learned by the same run, round 2).
- **A line that `truncate`s inside a node holds about thirty characters.** The step node's need line is `w-56`, so
  `blocked by the harness: waiting for a permission prompt` showed as `blocked by the harness: waiting f…` — every new word cut off,
  under a chip that already said `needs-human`. The node says the wait alone (`needNodeText` in `apps/web/src/lib/asks.ts`), the whole
  sentence stays in its `title` and on the run's page, and the e2e proves it is read whole with `expectUncut` rather than assuming the
  width fits: a screenshot of a cut line looks like a line (learned by the same run, round 2).
- **Another package reaches the runtime through its exports, never by a URL beside them.** `agent-orchestrator/test/vocabulary.test.ts`
  once read the harnesses' lists with `await import(new URL('./runner-claude-vocabulary.ts', import.meta.resolve('agent-runtime')))`,
  which a grep for `from '…/runner.ts'` missed, so moving the export between the engine's files failed only the other package's suite,
  reading `undefined` (learned by the run that split the engine's `runner.ts`). The runtime exports the lists now, and
  `packages/agent-runtime/test/contract.test.ts` refuses a path into its `src` by any route, `import.meta.resolve` included.
- **A name moved out of `run.ts` leaves the `agent-orchestrator/run` subpath, and the api's tests read that subpath by `await import`.**
  `const { messageRefusal } = await import('agent-orchestrator/run')` in `apps/api/test/asks.test.ts` is no `import … from` line, so a
  scan of static imports misses it, and no typecheck sees it: neither agent-orchestrator's nor the api's `tsconfig.json` includes `test/`.
  Only the api's suite fails. Before moving a name out of `run.ts`, grep the workspace for `agent-orchestrator/run'`, and re-export from
  `run.ts` what the api reads there, from a module beneath it, so no cycle (learned by the run that moved *trying again* into `retry.ts`).
- **The same holds for `agent-orchestrator/workflow`, and a name that leaves it for the root is a contract change.** The api's tests took
  `loadWorkflows` from `await import('agent-orchestrator/workflow')`, which nothing typechecks; moved into `workflow-store.ts`, the readers
  are exported from `agent-orchestrator`, and `./workflow` is the pure format (`packages/agent-orchestrator/test/contract.test.ts` refuses a
  reader back on it). Before moving a name out of `workflow.ts`, grep the workspace for `agent-orchestrator/workflow'` (learned by the run
  that wrote `docs/architecture.md`).
- **An optional field added to what a function returns is dropped by every caller that rebuilds the answer field by field.** A
  TypeScript optional field makes no caller fail: `startQueued` built its `QueueStarted` from `startFromInbox`'s answer a field at
  a time, and `apps/api/src/workflows.ts` built its 201 the same way, so a card's ignored `repo:` was printed by `wf start` and by
  nothing else — no daemon log, no board. Grep for every place that spreads or rebuilds the type, and give the new fact one writer
  (`ignoredRepoLine`) so the paths cannot word it differently either (learned by the run that started a folder team from a card).
- **A key added to `AGENT_KEYS` that is not a role key has three exclusion sites.** `description` and `skills` describe the agent and are no
  step's, so each place that turns `AGENT_KEYS` into the keys a step inherits excludes them by name: `ROLE_KEYS` in `apps/api/src/builder.ts`
  and in `apps/api/src/agents.ts`, and the hand-written mirror in `apps/web/src/lib/agents.ts`. Miss one and the board offers the key as a
  role key on every step form. And a key that names a file beside the agent is digested twice — `agentVersion` in the package, `versionOf` in
  `apps/api/src/workflows.ts` — or an edit of that file moves the agent's version and not the folder's (learned by the run that added
  `skills:`).
- **A shipped folder is not whole without `workflows/agents/`.** Every shipped step but the supervisor's names an agent there, so a
  test that copies a folder (`cpSync(SHIPPED/dev, …)`) copies `agents/` beside it, or the load refuses `agent: implementer` as not
  there. The package's `workflows/ui` copy has its three agents in the package's `workflows/agents`, held byte for byte by the ui copy
  test: a change to `ui-implementer.md`, `ui-reviewer.md` or `shipper.md` (and its skills) is copied there too (learned by the run that
  put the roles in `agents/`; the shipper joined when ui gained its ship).
- **The board's listing of a step is resolved; its file is not.** `spec` holds the agent's keys merged in, so a PUT that sends `spec`
  alone writes every one of them into the step file, and `renderStep` of an edited resolved step writes any inherited key whose value
  moved off the agent's (`given`). A step's own keys and note travel as `own` (`ListedStep.own`), and the builder writes those (same run).
- **A step key read into another form is shown as the package writes it.** `context: 200k` is read into `200000`, and the step
  page's key rows (`keyValue` in `apps/api/src/workflows.ts`) printed the number, which the e2e refuses as not what the file says.
  A key the parser converts gets its written form there and in `renderStep` (`contextText`), one function for both (learned by the
  run that added `context:`).
- **Code outside the package that reads a step's frontmatter reads it as the parser does.** `readKeys` trims each line and each key,
  so `  agent: coder` and `agent : coder` name an agent; the builder's `versionOf` matched `^agent:` and missed both, so an edit of that
  agent's file never moved the folder's version. Read the block through `splitFrontmatter` and trim as `readKeys` does, and version what
  the key names in turn (the agent's `output:` schema; `frontmatterValue` in `apps/api/src/workflows.ts`, learned by the run that put the
  roles in `agents/`, round 2).
- **`execFileSync` with no `stdio` writes the child's stderr on yours.** It captures stderr for the error's message *and*
  copies it to `process.stderr`, so a command that fails on every pass of a loop prints git's words on every pass, beside
  the line the loop says itself. Pass `stdio: ['ignore', 'pipe', 'pipe']`: the error's message keeps them (`git` in
  `agent-orchestrator/src/worktree.ts`, learned by the run that took up the queue's leftovers).
- **A `readdirSync` entry for a symlink is not `isFile()`, and every read and write follows it.** So code that writes each
  file it lists and removes the rest writes *through* a link — into whatever it points at, outside the folder — and leaves
  it behind when it should have removed it, with nothing said either way. Where a folder's files are meant to be its own,
  refuse a link by name (`writeWorkflow`, same run).
- **A fake engine's closeout is flat, as a harness writes it.** `parseCloseout` moves the fields beside `outcome` — a schema's
  `title`, `gist` — under `output`; a test that hands the fake an `output` already nested reads the step as `unsigned`, and the next
  step is never filed. Give the fake `{ ...SIGNED, title, gist }` (learned by the run that added `workspace: folder`).
- **A background session in a folder nobody has opened blocks for ever in any mode that can ask; a job never does.**
  A `workspace: folder` step works in a directory the run just made: no settings file, nothing trusted. The first
  call outside it — reading the artifacts directory beside it, say — raises an ordinary permission prompt in a
  `claude --bg` session, `claude agents` reads it `blocked` with `waitingFor: 'permission prompt'`, and nobody is
  there to answer (thirty-one minutes in `acceptEdits`, and `auto` does the same; Claude Code 2.1.278, the first live
  `note` run — not the workspace-trust dialog, which a folder run starts past unattended). A job, `claude -p`, waits
  on nobody in any mode: the call is denied, recorded on the attempt, and the session carries on (M1, 2.1.280). Every
  step has been a job since thin runtime stage 2 part 2, so `validateFolderMode` judges only a step that says
  `background: true`, which must run `dontAsk` or `bypassPermissions`. The rule was written for every step while every
  step was `--bg`, and a guard kept past the measurement that justified it refuses modes that no longer stall anything.
  What was measured is Claude Code's prompt: `codex exec` is not interactive, and `background:` is refused on any
  harness but claude, so a codex folder team passes in every mode codex has (learned by the run that made steps jobs).
- **A session started anywhere under `~/.claude/` cannot write there, in any mode.** Claude Code reads that directory
  as its own and refuses a write into it — *"sits under `~/.claude/`, which the harness treats as sensitive"* — whatever
  `--permission-mode` and `--allowedTools` say. `$CLAUDE_JOB_DIR/tmp` is under it, so a live `wf` store put there
  fails every write a step makes and every measurement taken in it is about that, not about the fence being measured.
  Put a probe store somewhere else (`mktemp -d /tmp/…`). This cost a live run and a wrong conclusion about the
  allow rule.
- **A `Write(path)` allow rule is taken and never matched.** Claude Code matches a file write against `Edit` rules
  alone, whatever tool made it, and an `Edit` rule covers Write and NotebookEdit with it. Given
  `--allowedTools 'Write(**)'` it warns on a stderr nobody reads — *"is not matched by file permission checks — only
  Edit(path) rules are"* — and denies the write: the shipped note writer, fenced by `dontAsk`, could not write its
  own `note.md` and the run learned why from nothing. Write `allowedTools: Edit(**)`; a bare `Write` (no path) is matched,
  and allows a write anywhere. `allowedTools:` refuses a path rule on a file-editing tool that is not `Edit`
  (`fileRuleRefusal` in `workflow.ts`), since accepted-and-dropped is the failure this repository refuses elsewhere.
- **A rule offered for the next run must not name this one.** A step works in `worktrees/<run id>/<step>`, and the harness records a
  denied write by its absolute path, so the first `denials: fail` offer told a person to add `Edit(//…/worktrees/<this id>/implement/notes.md)`,
  which the next run's worktree never matches; its tests used `/tmp/w/notes.md` and passed. `allowRuleOf` writes a path in the step's own
  directory from it and this run's id as `*`, and a call the step's own `disallowedTools:` may have denied is offered no allow at all, since a deny
  beats every allow (`disallowedBy`). A fixture for a path the run makes is a path the run makes (learned in review of that run).
- **A path a fenced step's brief names must be inside the step's own folder.** A folder team runs in `dontAsk`, so a read
  outside its directory is denied with no prompt and the session carries on: the brief is the only thing that says the path
  exists, and it was lying twice — the parents' folders a fan-in is told to read, and `runs/<id>/inputs` on every brief of a
  run started with `--input`. Neither fails, and the shipped chain meets neither. The fix is to copy what the brief names
  into the folder (`givenPlan` in `run.ts` words the brief and `folderPlace.make` does the copy, off the same plan), and the
  test is the one that refuses drift: in a real run, no brief names a path under the store, and every path a brief does name
  is on disk under that step's own cwd. A read inside cwd needs no `allowedTools:` rule on any harness (measured by
  `note-reviewer`); a write needs `Edit(**)`. Reaching out instead would be a new field on the engine's task and a fresh live
  measurement (learned by the run that gave a folder step its `given/`).
- **A key one function refuses is refused by every function that writes it, not by the one the comment names.**
  `cardRepoRefusal`'s doc said `addToInbox` is the one writer of a card's `workflow:`, and `wf inbox queue --workflow` writes
  it too: a card with `repo:` was queued onto a folder team, to start on a repository no step of it looks at. Before trusting
  "one writer" in a comment, grep for the key (same run).
- **A list a page turns into a sentence must carry everything the sentence is about.** The board says *the folder is empty* of an
  empty `files`, and `folderFiles` listed only what its route can serve by name: a step whose work went into `notes/` was reported
  to a person as having made nothing, on the one surface a person who never opens a terminal has. Either the list carries what it
  cannot serve, by path (what was done), or the sentence says only what the list knows. Anywhere a page words an empty list, read
  what the list leaves out (learned by the run that started a folder team from a card, round 3).
- **A directory the run writes into a step's workspace is listed by every surface that lists that workspace.** `folderFiles`
  (`apps/api/src/artifacts.ts`) carries what it cannot serve by path, so *the folder is empty* is never said of a step whose work went
  into `notes/` — and the run's own `given/` then stood in the folder of every step of every folder run started with `--input`, as an
  absolute path with no name, and no step could be read as having made nothing. What the run itself put there is left out, under the
  name the package exports (`GIVEN`), and the narrowing is tested too: a regular file a step wrote called `given` is its work and is
  listed (learned by the run that gave a folder step its `given/`, round 2).
- **A control hidden by a condition still holds what was put in it.** `StartRun` hides the After picker for a team that works in
  folders and kept its state, so picking runs under a git workflow and then picking a folder team sent them anyway — and the api's
  refusal named a control no longer on the page. Send what the current choice takes, not what the state holds (`afterFor`, same
  round). The same for a field a form stops showing.
- **A person's fact that stops a run's asks is read by `assess`, not only by the verbs and the tick.** The verbs refused a retry on a pruned
  run and `mayFile` kept the tick from filing one, and `wf ls` still printed a retry written by hand as `try 2 asked — the next tick files
  it`, and the board drew the run as moving: `listing` and the api read what is due off `assess`, not off the tick. A new marker beside
  `.cancelled` goes into `assess` (and `listing`'s `waitingOnYou`), and its test asserts `wf ls` and the api say nothing is coming (learned
  by the run that added `wf prune`).
- **A line that offers a verb says that verb's refusal itself; its callers do not.** `decide` and the api's `decisionOf` each wrapped
  `retryLines` in `run.pruned ? [] : …`, and neither wrapped `overBudgetLine`: a pruned run over its budget was told `OVER BUDGET, waiting
  on you` with a `wf retry --budget` that `prunedRefusal` refused, while `wf ls` said nothing waited on you. And `wf ls`'s step notes
  (`gateNote`, `exhaustedNote`, `heldNote`) offered `wf approve` and `wf round` with no caller guarding them at all. Each producer in `run.ts`
  now reads `run.pruned`, so every surface that calls it agrees. A new marker that refuses verbs is checked against every string with `wf <verb>`
  in it (`grep -n "wf round \|wf retry \|wf approve \|wf accept " src/*.ts`), not against the callers you remember (learned by the run
  that made a pruned run say it was pruned).
- **A field moved under another key makes every untyped read of it pass for the wrong reason.** When the ten harness arguments went
  under `config`, the orchestrator's and the api's tests — not typechecked — still read `spec.contextTokens` and `f.model`: each one
  asserting a value failed, and each asserting `undefined` passed, and `chainDifferences` in `session-cache.test.ts` compared
  `undefined` with `undefined` on every key and found a chain that changes its model the same as one that keeps it. Grep the
  untyped tests for the old key, read the passing ones too, and check a comparison still fails with a mutant (learned by the run
  that made the harness's arguments one `config`). The runtime refuses the old place at `file` (`argsRefusalOf`), which is how an
  untyped `...(worktree ? { worktree: true } : {})` in its own tests was found at all.
- **A worktree gets a `node_modules` of its own.** Each workspace package (`packages/*`, `apps/*`)
  links to the worktree's copy, so an app change can lean on a package change from the same branch;
  third-party packages are the main checkout's, hardlinked file by file into directories of the
  worktree's (about half a second, no data copied), and `npm install` in a worktree writes the
  worktree's directory, never main's. With the store on another filesystem a hardlink fails, the
  packages are linked to main's instead, and the run's notes say so. When the worktree's `package-lock.json` differs from what main
  has on disk, the run does `npm ci` there instead — about a minute, and the brief says so. Two habits
  keep that minute rare: a step that adds a dependency commits the lockfile (`npm install
  --package-lock-only` is enough; the next step's worktree installs it), and after merging such a
  branch, `npm install` on main before the next run, or every worktree cut from it pays the minute
  (main's lockfile ahead of its tree counts as a difference). (U1 hit the linked tree; W2 replaced it.)
- **Claude Code allows a path through a symlink only when the link and its target both match.** A worktree's `node_modules`
  linked each third-party package to main's, so in a `dontAsk` job a `Read`, a `Grep` or an `ls` of `node_modules/hono` was a read
  outside the working directory, denied with no prompt, and recorded on the `denied:` line (part 5's plan and review). They are
  hardlinked now: every path is inside the worktree (`hardlinkTree` in `agent-orchestrator/src/worktree.ts`, proven live in
  `features.md`). A link out of a step's folder is a read out of it, whatever the link says. And `du` counts a hardlinked file
  once per invocation, at the first path it meets it under, so `du <worktree>` alone counts main's whole tree: measure a worktree
  beside main's `node_modules` in one `du` (`diskBytes` in `forget.ts`), or with `df` (learned by the run that hardlinked the
  worktree's packages).
- **An optional verb renamed on the way through a seam is dropped by every door that takes the old type.** Part 4 of the thin
  runtime gave the seam `transcriptOf` (by name) in place of `transcript` (by id), typed `Omit<RunnerOps, 'transcript'> & …`,
  and `a2aRunner` passed that to `Runner.layer(ops: RunnerOps)`: an optional key absent and an extra key present both type-check,
  so the Effect door's `Runner.transcript` read `undefined` — a harness with no conversation — and no test called it through
  that door. Keep the old verb beside the new one, and test each door by calling the verb through it (learned in review, round 1).
- **A stop between two processes that share only files: each writes its half before it reads the other's.** A detached
  run's stop signalled the pid on the run file, and the worker publishes its pid as it starts: a stop in between did nothing,
  and the A2A handler answered `CANCELED` to it, so a direct caller's harness ran on (open issue 30). Now the stop writes a
  marker and then reads the pid again, and the worker publishes its pid and then reads the marker, so one of the two always
  sees the other; each order is made to happen with the worker frozen before its first rename (`detached.test.ts`). An
  answer that says something happened — `CANCELED` — is a claim about the world, and a level-triggered loop that asks again
  does not make it true for a caller that asks once (learned in review of the run that made Codex an A2A agent).
- **Node's type stripping refuses a parameter property.** `constructor(private readonly ops: RunnerOps)` fails the
  file at load with *"TypeScript parameter property is not supported in strip-only mode"*, and `tsc` passes it. Declare
  the field and assign it in the constructor (`HarnessHandler`, learned by the run that put the A2A seam in the runtime).
- **The A2A SDK's `Transport` and `A2ARequestHandler` spell three methods differently, and its `Client` answers some calls
  itself.** `getExtendedAgentCard`, `listTaskPushNotificationConfig` and `resubscribeTask` on the transport are
  `getAuthenticatedExtendedAgentCard`, `listTaskPushNotificationConfigs` and `resubscribe` on the handler; a transport forwards
  those three by hand (`InProcessTransport`). The `Client` throws
  `PushNotificationNotSupportedError` before the transport unless the card says `pushNotifications`, so a test of the
  handler's own refusal calls the transport; and `Client.sendMessage` fills `returnImmediately` from the client's `polling`,
  so a refusal of a send without it is reached only by the handler directly (same run).
- **A paged read is served from the listing its token names, never from the latest.** The runtime's A2A handler kept one
  snapshot behind its page tokens, and every view, transcript, `say` and tick in one process observes: with more than a
  hundred sessions — `check`, `codex` and `claude-detached` list every session they ever ran — a second listing made while
  the first was paged refused the first's next page, and a tick read the harness as empty. Its tests had pinned that
  refusal as the rule. Open listings are kept by id, dropped at their last page, and bounded (`OPEN_LISTINGS`); a test
  pages two observes at once (learned by the run that put the A2A seam in the runtime, round 2).
- **A stream-json line is parsed for its `type`, never matched at its start.** `claude -p --output-format stream-json`
  prints its `result` line as `{"duration_api_ms":…`, with `type` far down it (2.1.280), so a check for `{"type":"result"`
  never fires, and a worker that ends a job's stdin at its result would hold the job open for ever: a job reading
  `--input-format stream-json` does not exit at its result, only when its stdin ends. The worker parses each output line
  and reads the key (`closesOn` in `bin/ae-worker.ts`; learned by the run that let `say` reach a job).
- **A hold's `Wait` carries `shipped`, which an `--after` wait never does.** The api's `neverShips` (`apps/api/src/judged.ts`) reads any
  key beyond `run` as a run that will not ship, so, read for a hold, it would take a run that has shipped for one only a person can lift.
  A hold is read by `holdNeedsYou`, which asks the three facts by name (`missing`, `cancelledAt`, `gone`): read a `Wait` by the key you
  mean, never by what else is on it (learned by the run that put the hold on the api).
- **A held run is `running` whatever its steps say, even one only a person can lift.** `assess` returns early for a held run with
  `status: 'running'` (`run.ts`), and the api passes that status through. So the board's `status === 'running'` keeps every held run
  in flight, and the one that waits on a person has to be taken out by name: `inFlight` excludes `holding.onYou` as it excludes
  `waiting.onYou`, and `waitsOnYou` reads it (`apps/web/src/lib/factory.ts`). A board fixture for a held run has `status: 'running'`.
  The first round wrote it `failed`, from a belief about the api that nobody had read off `assess`. It then added a clause the api never
  needed, tested on a state the board is never given (learned by the run that drew the hold on the board, round 2).
- **An e2e page's own screenshot named `<name>-<theme>.png` is overwritten.** `visit.ts` takes that name for the picture it takes after
  `expect` returns, so a picture the page took mid-read under the same name shows the page's end state, and reads as a wrong picture.
  Name a page's own shots `<name>-<what>-<theme>.png` (same run).
- **The engine can say a task waits before its harness has let the session go.** `closedOut` (`agent-runtime/src/engine.ts`)
  ends an attempt on a statement on disk while the session is `working` and not busy, and Codex writes `-o` before it exits:
  for that moment `view` says `input-required` and `getTask` still answers the harness's `WORKING`, with the process alive. A
  test that asserts the Task the instant `view` moves passes alone and fails under `npx turbo run test --force`'s load. Hold the
  fake's exit on a file and assert both sides, or wait for the Task (learned by the run that proved Codex as an A2A agent;
  open issue 31).
- **The engine decides a task again in the pass that recorded its end.** `settleTask` steps a task until nothing moves, against
  one observation, so an `ended` that `cut` recorded off a sighting is read on the next `decide` of the same pass, with the same
  clock. The deadline sat above the judgement of an ended attempt and settled a check that exited 0 at 607 s of 600 `failed`, at the
  millisecond of its `ended done`; `refusedCheck` then read `failed` with exit 0 as a refusal. A rule that stops or refuses — the
  deadline — must not overrule an end on record: test it with the end and the rule in one pass, the fixture a journal with the end
  already on it and a clock past the rule (learned by the run that raised the check's deadline to 1200 s).
- **`unsigned` is the orchestrator's word, not the runtime's.** Since stage 4a the runtime records a fact — `stated: false` on a
  `done` end of a task that asked for a statement — and settles it `succeeded`. Read an attempt's end through `closeoutAsked` or
  `endWords` (`agent-orchestrator/src/views.ts`), never off its raw `ended` and `reason`: the api's `attemptsIn` read them raw, and
  the board drew such a try as `done` under a step chip that said `unsigned`. An end with no `stated` key is from before the fact
  and is never unsigned, except one the old runtime recorded `reason: 'unsigned'`, which still settles `failed` with its old note.
  A fixture seeded with `reason: 'unsigned'` tests that legacy reading only; a new one writes `ended: 'done', stated: false`
  (learned by the run that moved the judgement up).
- **A step's fence is read through `modeOf`, never off `permissionMode`.** Claude Code's fence is `permissionMode:` and Codex's `sandbox:`
  (since 2026-09-23), and the engine's task still calls either `config.permissionMode`. A codex step's `permissionMode` is undefined now, so
  code that files a step, or compares it with what the engine filed, and reads that field sends Codex no `-s`: the read-only reviewer runs in
  Codex's default, `workspace-write`, which writes, and nothing says so (`vocabulary.test.ts` shows it). And a form that draws a harness
  word draws only the fence its harness has (`takes`, `hasKey` in `apps/web`), or Claude Code gets an empty Sandbox picker (learned by the
  run that named Codex's sandbox `sandbox:`).

## Rules the code keeps

- **The engine is finished.** It runs one workload on one harness; anything that knows about a
  second workload is the upper layer. `decide` (`agent-runtime/src/domain.ts`) is pure and stays a
  screen long; `agent-runtime` (`src/facade.ts`) and `agent-runtime/effect` (`src/index.ts`) are the export lists and
  the boundary — `decide` is exported by neither, on purpose. A knob on the workload is a field carried on the task and read by a
  runner, never a callback into `decide`.
- **No `if` in `engine.ts` that belongs in `decide`.** Effectful code applies one decision; the
  judgement lives in the pure function.
- **Three rules hold the layers, each a test; `docs/architecture.md` states them and names the shape.**
  - *Between packages, only the public contract.* Another package reaches the runtime through `agent-runtime` and
    `agent-runtime/effect` alone, and the apps reach the orchestrator through `agent-orchestrator`, `agent-orchestrator/run`
    and `agent-orchestrator/workflow` alone — never a subpath outside `exports`, a relative path, `import.meta.resolve` or a
    built path into `src/`. `./workflow` is the pure format; the folder readers are exported from `agent-orchestrator`. The
    judge imports nothing from the workspace and nothing imports it (`packages/agent-runtime/test/contract.test.ts`,
    `packages/agent-orchestrator/test/contract.test.ts`, `packages/agent-judge/test/boundary.test.ts`).
  - *Inside the orchestrator, every file is pure, store, controller or the client* (`PURE`, `STORE`, `CONTROLLER`, `CLIENT` in
    `packages/agent-orchestrator/test/boundary.test.ts`). Pure files — `assess` in `run.ts` among them — read no disk, spawn
    nothing, and import no runtime and no file of the other kinds. Store files are the I/O beneath the controllers, import
    no runtime, no controller and not the client, and load as a tree: `places.ts` and `workflow-store.ts` at the bottom,
    `store.ts` on them, `worktree.ts` on `store.ts` and `places.ts`; outside the store, only the client and the controllers
    beneath the CLI import them. The controllers are `runner.ts`, the package's root, which re-exports by name; `views.ts`,
    `start.ts`, `tick.ts`, `verbs.ts`, `forget.ts` and `decide.ts` beneath it, which import one another with no cycle; and
    `cli.ts`, which parses, calls, prints, and reaches the package only through `runner.ts` and `workflow.ts`, as `bin/wf.ts`
    reaches it only through `cli.ts`. A new file joins one kind, or the suite fails.
  - *The runtime is reached through one client:* `src/runtime-client.ts` alone imports agent-runtime, a type included; every
    controller beneath the CLI imports it, and it imports no controller (`CLIENT` in the same test).
- **Level-triggered.** A tick reads the world, decides, acts, and carries nothing between passes.
  A guard that only fires on a transition is wrong after a restart.
- **One writer per file.** The tick writes the run record; a person's facts (`.cancelled`, an ask)
  get their own files, composed on read. Two writers doing read-modify-write lose updates — and did.
- **A check that did not finish is not a refusal.** The engine settles a check killed at its
  deadline as `failed` with no exit code, and one the harness stopped as `stopped`; only a
  numeric exit is a verdict on the work (`refusedCheck` in `agent-orchestrator/src/run.ts`).
  `retries:` spends nothing on it and `wf decide` offers `wf retry <run> <step> --recheck` — use
  that, never a hand edit of the engine's journal or the run record.
- **No command from a checkout.** A `check:` comes from the workflow folder frozen on the run
  record at `wf start`, never from a worktree the step can edit.
- **Prose is not a constraint.** If the packages need an agent to do something, the machinery
  refuses the alternative; a sentence in a brief is a courtesy, not a guarantee.
- **Errors say what to do next.** Throw `Error` with `.exitCode = 2` and a message naming the fix.
- The Kubernetes test for a new field on the engine's task: does `batch/v1` have a field for it?

## Git

- Commit on your branch, in small coherent commits with plain, human messages: a short
  imperative subject, an optional body saying why. **No attribution trailers**, no session URLs.
- **Never push, never merge, never `git branch -D`.** `.claude/settings.json` refuses the first
  and the last; a person merges after a trial merge runs the suite. The one exception is a run's
  ending step — `workflows/*/ship.md`, which runs in this checkout and is filed only once a person
  approves it at its gate — and it merges the run's own result branch, aborting on any failure.
  If you are a workflow step, commit as you go all the same: the run commits only what you leave
  uncommitted, in one commit under your step's name, and a person decides what ships. (F's two steps read the old wording as
  "do not commit" and handed off 1,300 lines in one commit each.)

## When you miss

- If you find a rule the code keeps only in a comment, or a trap that cost you time, it belongs
  here. Add it in the same commit — unless a concurrent session owns this file
  (`docs/plan-hold-the-bar.md` §1), then put it in your closeout and the merger adds it. This file is
  merged by union (`.gitattributes`), so two runs' lessons both land; a line two runs both edited keeps
  both versions, and whoever merges reads the file and tidies them.
- If a step fails its check twice, the fix is content — the brief, the workflow folder, this
  file, a test — or a stricter folder. Not a hand edit that nobody records.

## Where things are

- `docs/architecture.md` — the layers, what each owns and its public contract, and the three rules that hold them,
  each with its test.
- `docs/eval-2026-09-12/REPORT.md` — the evaluation against the four points of *how to hold the
  bar on production agent code*: gaps with `file:line`, the shape agent-orchestrator should take.
- `docs/plan-hold-the-bar.md` — the handoff plan: packages, owners, definitions of done.
- `packages/agent-runtime/docs/open-issues.md` — what is still wrong or half-verified.
- `packages/agent-orchestrator/docs/features.md` — what is still to build, in order.
- `.codex/rules/git-commit.rules` — lets a Codex step commit its own work in a worktree.
- `.claude/skills/` — the repository's skills, which every step whose tools include `Skill` can use: `look` (ours)
  and `shadcn` (third-party, installed with `npx skills add shadcn/ui --agent claude-code --copy`, pinned by hash in
  `skills-lock.json`; the `migrate-radix-to-base` skill it ships was dropped: it targets Base UI, and the app is on shadcn's React Aria
  base, `aria-nova`, features.md's *Shipped: the web app's components on React Aria*). The shadcn skill
  reads `components.json` from the session's cwd when it loads, and this repository's is `apps/web/components.json`,
  so its CLI runs from `apps/web`. From the root the skill does not load at all: its `info` refuses a monorepo root and the `Skill`
  tool reports the error, so read `.claude/skills/shadcn/SKILL.md` by hand. Its rules know two bases, radix and base; on aria the
  reference is what `npx shadcn@latest add <component> --view <file>` prints, and `add` installs no `react-aria-components`.
  Its Bash commands (`npx shadcn@latest …`) are denied without a prompt in a `dontAsk` step unless `.claude/settings.json`
  allows them; implement steps run in the harness's own mode.

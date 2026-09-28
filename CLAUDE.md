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
  times in a row with `npx turbo run test --force --continue`: without `--force` turbo replays a cached pass and measures nothing.
- **A file `✖` with no failing test inside it is a package turbo interrupted, not a failure of that file.** Turbo's default,
  `--continue=never`, kills every task still running when one fails, and `node --test` reports each file it was in the middle of as
  failed, *Promise resolution is still pending but the event loop has already resolved*, under `Interrupted while running:`. The
  longest file is nearly always the one in flight, so three checks were read as `detached.test.ts` failing under load, at 20 to 31 s
  of its 48: the api had failed in one, and a flaky wall-clock bound in `meter-store.test.ts` in two, each named only on the summary's
  `Failed:` line. `npm test` passes `--continue` (`suite.test.ts` pins it) so every package runs to its end; to measure, type
  `npx turbo run test --force --continue` (`npm test -- --force` is denied a `dontAsk` step), and read `Failed:` first. It was made to happen on demand by a `--import` hook
  that ends one web test file 15 s in (learned by the run that looked for a race in the detached worker and found none).
- **A time measured on a machine is a floor, never a ceiling.** `meter-store.test.ts` spun 30 ms in its fake and wanted the runtime's
  share under 30: a process parked for 21 ms after the spin failed it at 30.8. Assert what a meter moves as an identity — the phases
  add up to no more than the pass — and force the park with a load hook that adds the time after the spin (same run).
- `npm run typecheck` — `tsc --noEmit` per package.
- `npm run lint` — oxlint (`.oxlintrc.json`: its correctness rules, type-aware, React's and jsx-a11y's, and the suspicious rules that find
  a bug) and `oxfmt --check` (`.oxfmtrc.json`: width 140, code only, never markdown or JSON). `npm run format` writes the layout; run it
  before you commit, since a check refuses a file it would move. Every shipped `check:` runs `npm run lint` after the types. A rule turned
  off, or a line allowed with `oxlint-disable-next-line`, says why beside it. `.git-blame-ignore-revs` lists the commit that formatted the
  code: `git config blame.ignoreRevsFile .git-blame-ignore-revs` once per clone (chosen with the owner, rule by rule, on 2026-09-28).
- **The web app is compiled by the React Compiler, and only `npm run build` and the e2e see it.** It enters through
  `@rolldown/plugin-babel` after the router's plugin, so each code-split route is compiled; the web's node tests load `src/` as it is
  written. A function it cannot compile it leaves alone and says so at build, `React Compiler skipped <file>:<line>: <why>` (the logger in
  `apps/web/vite.config.ts`): read the build's output for that line. What it skipped once, and how each was written instead: a memo whose
  dependencies were not what it reads (list what the body reads; an array rebuilt on every refetch goes through `useContent`, which keeps
  its identity while its content stands), `??=`, an arrow function given as a destructured default (name it once, outside), and an
  optional call inside `try` (a promise's `.then(ok, err)`). `react/purity`, `react/set-state-in-effect` and
  `react/preserve-manual-memoization` refuse the same at lint (learned by the run that adopted the compiler).
- Run all three before you commit. Green is the floor, not the bar: a change that makes the suite
  pass by weakening a test is a finding to report, not a fix.
- **Turbo does not see `workflows/`.** A change to a shipped folder replays every package's cached pass (`FULL TURBO`)
  though three tests pin those folders: the round trip in `agent-orchestrator/test/workflow.test.ts`, the package's `ui`
  copy, file for file, and the api's picture of `dev` and `dev-build` (`apps/api/test/workflows.test.ts`). After touching
  `workflows/`, run `npx turbo run test --force --continue`, and copy a `workflows/ui` change into
  `packages/agent-orchestrator/workflows/ui` (learned by the change that gave every shipped step an `effort:`).
- **A package's former name is refused outside history, and turbo can replay that refusal's pass.** `packages/agent-orchestrator/test/names.test.ts`
  reads every file git lists, tracked or not yet added, and fails on a line naming either package by the name it had before 2026-09-23,
  except in a file on its `HISTORY` (dated writing, each with a line at its top saying it keeps its words — a `.md` one that
  names a former package fails without the mark and that note in its first five lines), in a store's path
  (`~/.agent-workflows`, `~/.agent-engine`, whose names stay), or on a line that says `renamed on 2026-09-23`. New dated writing that
  quotes the old names joins `HISTORY`. Turbo caches the package's pass by the package's own files, so a change only to a doc or to
  another package replays it: run `npx turbo run test --force --continue` after such a change (learned by the run that renamed the packages).
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
  tree, in ship's check, and your own run is the only e2e the change meets before
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
  pattern never matches a message; assert on `err.message` (`assert.throws(fn, (e) => e.message.startsWith('…'))`,
  since `npm run lint` refuses an anchored literal regex where `startsWith` says it: `unicorn/prefer-string-starts-ends-with`).
  Learned by R, whose refusal tests passed for the wrong reason until anchored right.
- **A `check:` line tells the run's check from a hand run by `WF_BASE_REF`, never by `WF_STEP`.** The run sets `WF_BASE_REF` on
  every check it executes in a step's worktree of a git run. A ship's `check:` is its implement's line, and the run executes it on the
  merged tree in the main checkout with `WF_STEP=ship` and no `WF_BASE_REF` (the tick leaves it out for a `workspace: main` step), so
  the line reads what the merge brings and the e2e runs there once. The shipped lines read what was touched and hold the e2e for the
  merged tree on that one variable, and a line keyed that way runs the whole of itself wherever the run's environment is missing (`web-check.test.ts`
  runs each both ways; learned by the run that took the e2e out of the rounds).
- **A check the run executes inherits the daemon's environment, so a test that reads a `WF_` default passes there and fails by hand.**
  `wf up` on the owner's machine runs with `WF_MAX_CONCURRENT=50`, and every check a step's run files is its child: `remote-left-out.test.ts`
  deleted `WF_MAX_RUNS` and left the ceiling to the environment, and at the default of two its second case queued a step never admitted,
  failing every `npm test` typed by hand since stage 6 part 2 while every run's check passed. A test that depends on a ceiling sets it itself,
  and is run once with the variable unset and once set low (learned by the run that installed oxlint).
- **A type-aware lint fix trusts the type, and a guard exists because a caller does not.** `oxlint --fix` for
  `no-unnecessary-boolean-literal-compare` turned `spec.holdOpen !== true` into `!spec.holdOpen`, and the runtime filed a task with
  `holdOpen: 'yes'`; its refusal test caught it. A value from a board page, a journal, a driver's report or JSON is typed as it should be and
  arrives as it is, so a comparison with `true`, a `String()` or a `typeof` there is the guard, whatever the rule says it narrows. Such rules
  are off in `.oxlintrc.json`, each with its reason; read every line a `--fix` changes in `src` before you keep it, and split words a test must
  not contain (`${'tmp'}dir`) survive only with their `oxlint-disable-next-line` (learned by the same run).
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
- **A landed ending's files directory keeps no pictures of the merged tree.** The ship's check runs the e2e on the merge with its own
  `WF_ARTIFACTS`, after the gate, so those pictures are a second photograph, of another tree — not copies of implement's, which the
  reviewers read. On the pass that lands `{ commit }`, `dropLandedPictures` (`agent-orchestrator/src/artifacts.ts`) removes every `.png`
  there that the ending's closeout does not name, and `e2e-pictures.txt` says what they were; a check that did not pass keeps them all.
  An ending that wants a picture kept after a pass names it in its closeout (learned by the run that measured the store at 3.8 GB).
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
- **The e2e's store is in `/tmp`, and a boot can empty `/tmp` under a running check.** WSL let the daemon run a check twelve
  seconds after it booted, while `systemd-tmpfiles --create --remove --boot` (`D /tmp`: everything, whatever its age) was still walking
  `/tmp` — twelve and a half minutes. It reached `/tmp/hkb-e2e-*` in the dark theme, every run read 404, the board said the seeded run
  was removed with `wf rm`, and the answer page failed on a box it never drew, blamed on the branch. `journalctl -b | grep tmpfiles-setup`
  and `find /tmp -maxdepth 1 ! -newermt <boot>` (nothing) said so; three e2es run at once passed. `visitAll` now checks the store before
  each page and on a failure, and says it is gone in place of the page's assertion (`storeGone`, proven by `visit.test.ts`). When a failure
  says so, run the e2e again (learned by thin runtime stage 4a part 2, try 5).
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
- **Close an e2e's sheet with its Close button, not Escape.** In the agents page's sheet, pressing *Add* replaces that button with
  the word `given`, and an Escape pressed next closed the sheet in the light theme and not in the dark one ("the sheet closes —
  expected 0, found 1"). The likely reason is that focus left the dialog with the button, and React Aria's Escape is heard only inside
  it; that was not proven. `sheet.getByRole('button', { name: 'Close', exact: true })` closes it every time (learned by agents card 3a).
- **`browser_take_screenshot` resolves a relative `filename` against the workspace, not `--output-dir`.** With `@playwright/mcp` 0.0.80 a
  relative name failed as a path under the worktree, and would have written there had the folder existed. Give it an absolute path under
  `/tmp/playwright-mcp`, in a folder made first (learned by the same run; the `look` skill still says relative).
- **The web's node tests load `src/` as Node does, so a directory import fails them and a route link needs a router.** `lib/agentWrites.ts`
  imports `./api`, a folder, which vite resolves and Node refuses (`ERR_UNSUPPORTED_DIR_IMPORT`): a helper a test reads goes in a module
  with file imports only (`settleSave` in `lib/agents.ts`). A component that draws a `routeLink` throws *reading 'protocolAllowlist'* under
  `renderToStaticMarkup` without a router: wrap it in `RouterContextProvider` over `createRouter({ routeTree: createRootRoute(), history:
  createMemoryHistory() })` (`components.test.ts`). And that markup spells React's props, `readOnly=""`, not `readonly` (learned by agents
  card 3b).
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
- **A scroll made as a run's page opens lands short, whether an effect or the router's hash makes it.** The router resets the scroll after
  the first render, which undoes an effect's `scrollIntoView`, and a `#hash` is scrolled to before `Decide` has read its decision and grown,
  which then pushes the target back under the first screen (552 of 800, measured). A page opened on a step (`?step=`) scrolls again on each
  change of the article's height for a few seconds, until the person moves the page themselves (`useLanding` in `routes/runs.$runId.tsx`);
  the e2e's `expectOnScreen` wants the element wholly in the window, since its top alone was in it with no scroll at all (learned by the run
  that linked a gate's card to what it approves).
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
- **A pass on a copy of the store acts on the real repositories.** A run record names its steps' worktrees and its repository by
  absolute path, so a `tick` with `WF_ROOT` on a copy of `runs/*.json` and a fake engine that answered `succeeded` handed off the
  uncommitted work of a live worktree — this run's own — in a commit `implement: hand off what was left uncommitted`, and ran every
  `isShipped` git call against the real repositories. To measure or probe a pass, use a fixture store whose runs name scratch
  repositories (`test/meter-store.test.ts`), or a fake engine whose tasks are all `pending` and nothing settles (learned by the run
  that measured what a tick costs).
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
- **A statement on disk is not an end the engine may record before it knows the session.** Codex writes `-o` and prints its
  thread on a pipe the detached worker reads when it is next scheduled, so under load the run file carried a statement and no
  `nativeId`; `closedOut` ended the held attempt on the statement, an ended attempt never takes a session later, and `answer`
  refused the task as having no conversation (`codex-agent.test.ts`, once in a loaded `turbo --force` on 2026-09-25). `closedOut`
  now waits for the session, and the fake's `threadOn` writes `-o` before its thread line, which makes the race happen every
  time (learned by thin runtime stage 4a part 2, round 5).
- **A rule about order or names is not proven by a fixture that already has it.** The equal-times admission test read
  a journal whose `list` sorts, and a sort is stable, so it passed with the id tiebreak deleted; the pool test
  configured the `claude-bg` runner as `claude`, whose pool is `claude`, so it passed with `poolsOf`'s mapping
  deleted. Give the fixture the opposite order, or another name, and check the test fails without the rule
  (learned by the run that closed engine issues 24 and 25; both rules are the orchestrator's since stage 4c, `toAdmit` and `POOLS`
  in `admission.ts`, and the runtime's were deleted in part 2).
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
- **A folder is loaded with the places a start reads, or it is refused where the start accepts it.** Since 2026-09-25 an agent's
  `skills:` are looked for in the workflow's own root, the repository's `.claude/` and the store's `workflows/` (`lookupRoots`), so
  `loadWorkflows(dir)` alone refuses a step whose skill is in the repository's `.claude/skills/`, and `agentVersion` without them does not
  digest it. Every reader outside `wf start` passes `Places` — the api's listing, version and save take `placesOf(repo)` — and a test of a
  reader puts a skill in `.claude/skills/` to prove it (`apps/api/test/builder.test.ts`, learned by the run that rendered an agent for
  Claude Code).
- **A version is checked with the places it was listed with.** The api lists an agent's version with its skills found as a start finds
  them (`skillsOfPlace`), and `writeAgent` and `removeAgent` read it again to refuse a stale save: read beside the folder alone, an agent
  of yours whose skill is in the repository's `.claude/skills/` was refused as changed on every save and removal, and the test that sent
  an old version passed either way. Both take `repo` and read the same places (`skillsAt` in `authoring.ts`); a test of a version check
  also saves at the version just listed (learned in review of agents card 2, round 1).
- **A write beside an agent moves its version, and a form keyed on the version is thrown away with its draft.** `agentVersion` digests every
  skill the agent's file names, a missing one included, so copying a skill into the library moves the version of an agent that already names
  it; the page keyed `AgentForm` on `agent.version`, so the refetch after the copy remounted the form from the file, closed the sheet and lost
  every unsaved edit. The page reads the agent again before it invalidates, and keeps the form's key for that one version while the file and
  schema are unchanged (`keptAfterCopy`, `formKeyOf` in `apps/web/src/lib/agents.ts`); the save sends the new version. An e2e of a write
  beside an agent makes the agent name what the write changes first (`320-skills.ts`; learned in review of agents card 3a, round 1).
- **Who names an agent is read in every place that falls back to it, and a guard added at load is added to each verb that sets the same thing.**
  A repository's workflows are given the store's agent when the repository has none of that name (`lookupRoots`), so `removeAgent`, reading
  only the workflows beside the agent, let the board delete one a repository's step named: it reads the board's repository too now
  (`repoUsers` in `authoring.ts`). And F21 was refused on a step's `model:` at load while `wf retry --model haiku` filed that model unchecked;
  both word it through `autoDropped` (learned in review of the run that rendered an agent for Claude Code, round 1).
- **A Claude Code step's brief no longer opens with its agent's instructions.** A rendered step's instructions are in
  `runs/<id>/agents/<step>/prompt.md`, appended to Claude Code's system prompt, and its brief is its own note (`briefBody` in
  `rendering.ts`); codex, and a step that says `resume:`, still read them in the brief. A test or a fixture that looks for the instructions
  in a filed brief reads the prompt file for a claude step, and the brief pin of the shipped chain moved with it (same run).
- **A shipped folder is not whole without `workflows/agents/`.** Every shipped step but the supervisor's names an agent there, so a
  test that copies a folder (`cpSync(SHIPPED/dev, …)`) copies `agents/` beside it, or the load refuses `agent: implementer` as not
  there. The package's `workflows/ui` copy has its three agents in the package's `workflows/agents`, held byte for byte by the ui copy
  test: a change to `ui-implementer.md`, `ui-reviewer.md` or `shipper.md` (and its skills) is copied there too (learned by the run that
  put the roles in `agents/`; the shipper joined when ui gained its ship).
- **Nor without `workflows/skills/`, and a shipped step's procedure is in its skills, not its body.** Since agents card 1b each shipped
  agent's body keeps its role and limits and names its skills; a test that copies `agents/` copies `skills/` beside it, or the load
  refuses the agent's `skills:` as not found, and ui's six skills are copied into the package's `workflows/skills/`, held by the ui copy
  test. A test that looks for a sentence a step is told reads `toldIn(dir, step)` (`test/told.ts`: the body and its skills), and
  `shipped-skills.test.ts` reads each SKILL.md as YAML, since Claude Code drops one whose frontmatter does not parse with nothing said
  (learned by the run that moved the procedures into skills).
- **What a rendered step is told, its fallback tells too.** A step whose `runs/<id>/agents/<step>/` was removed by hand is filed
  with no flags (`unrendered`), and a body that says to load its skills, or that they follow, then names what is not there: the
  shipper would have merged without its `--no-commit`. The fallback tells each skill whole in the brief, read again by `skillsAgain`;
  something new a render gives a session is given there too, or said missing (learned in review of the same run, round 1).
- **`fixtures/argv-shipped.json` pins dev's implement argv whole, so a change to what a shipped agent gives moves it.** Card 4 recorded
  it while the implementer gave no skills, and the merge with card 1b failed on `--plugin-dir`: record it again with `ARGV_RECORD=1`
  and read the diff, as `argv.test.ts` says (same run, round 2).
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
- **A closeout written by hand is judged against the agent's schema.** The e2e's `agent-try` page stands in for the tick and the harness,
  and its first closeout — `outcome`, `summary`, `artifacts` — read `unsigned · done`, the run `failed`: `scribe`'s schema requires
  `notes`. A fixture that signs off a step whose agent has an `output:` carries every field that schema requires, flat beside `outcome`.
  And `forget` (`wf rm`, the api's `DELETE /api/runs/:id` of a try) refuses a run not yet filed and leaves the engine's journals, so a page
  that writes `engine/tasks/<id>-*.jsonl` removes it itself (learned by agents card 3c).
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
- **A project's allow rules are dropped in a directory Claude Code has not trusted.** A probe repository under `/tmp` with this
  repository's `.claude/settings.json` copied in ran `claude -p` with every allow ignored — *"Ignoring 26 permissions.allow entries …
  this workspace has not been trusted"*, on a stderr nobody reads (2.1.282) — and a new folder under a trusted parent was not trusted
  either. A command on Claude Code's own read-only list (`git merge-base`) still ran, so the probe half-looked right. A run's worktree
  is trusted as its repository is. Measure a project rule in a checkout Claude Code trusts, or pass the file as `--settings <file>`,
  and read the job's stderr (learned by the run that gave planners and reviewers git's read-only verbs).
- **A job reads no user-level settings, so what it needs is said in the checkout or on the step.** Since card 4, every `claude -p` the
  runtime spawns passes `--setting-sources project,local`. A job reads the checkout's `.claude/settings.json` and `settings.local.json`,
  and nothing of `~/.claude/settings.json`: not its model, effort, allow rules, plugins, skills, hooks or `attribution`. The last was
  load-bearing. Without the owner's `attribution: {commit: ""}`, Claude Code tells the session to end every commit with `Co-Authored-By`,
  and only this file's prose kept the trailer off. It is in `.claude/settings.json` now. The ui agents named no `model:` and ran on the
  owner's `opus[1m]`; they say `opus` now. A hand probe that means to reproduce a job passes the same flag. A rule, model or effort a step
  needs goes on the step, its agent or the checkout's settings, never in your own. A `--bg` session, the supervisor included, still reads
  them (learned by agents card 4, F24 in `docs/spike-2026-09-25-agents-skills.md`).
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
- **A seeded finished step whose worktree is on disk owes a hand-off until its record says `handedOff`.** `handOffOwed` reads a step
  with a workspace that exists and no `handedOff` equal to its task as work still to hand on, so `wf prune` and the api's prune refuse
  the run and a pass would commit in that worktree. A fixture that gives a finished run a worktree writes `handedOff: <taskId>` on the
  step (UNMERGED in `apps/web/test/e2e/seed.ts`). And a pruned mark's title is `prunedWords`, which opens `pruned at <ISO> — `: a test
  of the words anchors past that (learned by the run that put Prune on the board).
- **The list's `toDecide` is not the package's decision, and a page that must agree with a verb's refusal reads the decision.** `toDecide`'s
  git kind is said only of a run that succeeded and cut worktrees (`toDecideBranches` in `apps/api/src/judged.ts`), while `decision`
  answers `awaiting` for a `--no-worktree` run and for a failed one, and `shipped` for a failed run whose branch was merged by hand. The
  Prune popover read `toDecide` and the status, offered a succeeded `--no-worktree` run only choices the package refused, and told a run
  merged by hand its branch was the only copy. It reads `Decidable.awaiting` now, which `apps/api/test/prune.test.ts` holds to `wf prune`'s
  own answer run by run (learned in review of the same run, round 1).
- **`wf decide` of a shipped run prints no step's closeout.** It returns on `shipped — … is already on main`, so a test that wants a step's
  artifact lines (`!! not kept`, `!! missing`) reads a run still awaiting a decision; one on a merged run finds none and fails, or passes an
  absence for nothing (learned by the run that added `wf prune --artifacts`).
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
- **A flag only Claude Code has is filed under `config.claude`, never as a harness argument of its own.** The runtime grows no named
  field per harness flag (the owner, 2026-09-25). A key stays named on `HarnessArgs` only when more than one harness is given it,
  another harness translates it (`worktree`), a spec declares it or a layer judges it (`contextTokens`), or it chooses the runtime's
  own process (`background`). A key moved into the bag is read at its old place off a journal (`upgrade` in `journal.ts`) and refused
  there at both doors (`FORMER_ARGS` in `harness-args.ts`), at any value, `false` included, so a caller still writing
  `remoteControl: step.remote` is told where it went. And in the bag a flag reaches every spec that spells the bag out, `claude -p`
  ones included, where the named key reached only `--bg`: a flag a job cannot take is refused by the job's own spec
  (`claudePrintRefuses`). Pin the argv before a move and compare after (`agent-orchestrator/test/argv.test.ts`; learned by the run
  that moved `remoteControl`).
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
- **A card the A2A SDK's own server serves loses its security schemes in the SDK's own parser.** An agent built on the SDK
  serves its card as the SDK's objects stringified, security schemes as `{ scheme: { $case, value } }`; `AgentCard.fromJSON`,
  which reads A2A's proto JSON, empties each such scheme, so the card's requirement names a scheme with nothing in it, and
  the runtime refused a bearer card as *`token` is not a scheme the card declares*, credentials given or not. `cardOfJson` (`agent-runtime/src/a2a-remote.ts`) keeps that form's schemes as
  they are, and `test/remote-server.ts` serves both forms (`cardForm`): a remote-agent test of auth runs on each (learned by
  thin runtime stage 6, part 1).
- **A settled task's view names its session by the attempt's `nativeId` on a harness that can `find`.** `viewOf` in `facade.ts`
  reads the record, and `logs` and `stop` are handed that id. For a remote A2A agent the `nativeId` is the Task's context —
  what an answer's turn continues — not the Task's id, so a `logs` that asked GetTask for it read *no longer has the Task*.
  A harness whose `nativeId` is not the id its verbs take resolves one to the other in the driver (`bySession`: a context
  reads as the latest Task sent in it), and a test reads `logs` after the task settles (same run).
- **A request to another party's address is bounded, goes to the origin it was given, and follows no redirect.** Three traps, each
  missed until review: `new URL('/.well-known/…', base)` is an absolute path and drops the base's own (`cardUrlOf` resolves beneath it);
  a card read from one origin can name its interfaces on any other, so a secret asked for the address given went to wherever the card
  said (an agent given by its URL is reached only on that origin); and `fetch` follows a redirect across origins keeping every header
  but `Authorization`, so an API key in a header of its own goes too (`redirect: 'manual'`, and a 3xx refuses). A pass awaits every
  harness's observe, and undici waits five minutes for headers: a request with no `AbortSignal.timeout` held the whole runtime
  (`REQUEST_MS` in `a2a-remote.ts`; learned in review of thin runtime stage 6, part 1, round 2).
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
- **A judgement moved out of the runtime leaves a fact the board still reads as the old word, through `endWords`.** Stage 4b took the
  runtime's `budget` end away (a cut is `limit: 'budget'` beside a `harness` end now), and the plan said the api and the board read no
  budget field: they read the attempt's `reason`, through `endWords`, and would have drawn a capped try as `failed · harness`. A fact
  that replaces a runtime word is mapped back in `endWords`, and the api's `app.test.ts` reads a journal of each shape. And widening a
  condition in `ownStatus` to a new phase made an untyped test that left out the required `spendOf` throw: a test's call that omits an
  argument passes only while the code never reaches it (learned by thin runtime stage 4b).
- **A test that slices a source file between two names reads to its end once the second name is gone.** "`decide` never reads
  a harness argument" in `agent-runtime/test/engine.test.ts` took `decide`'s text as `slice(indexOf('export function decide('),
  indexOf('function resumeTarget('))`; with `resumeTarget` deleted, `indexOf` gave -1 and the slice ran on through `endOf` and the
  rest of `domain.ts`. It failed, on words that are not `decide`'s; one asserting an absence the rest also lacks would have passed
  over code it never meant to read. When you delete a function, grep the tests for its name in a string, and end such a slice on a
  name that must be there (learned by the run that retired `maxAttempts:`).
- **A step's fence is read through `modeOf`, never off `permissionMode`.** Claude Code's fence is `permissionMode:` and Codex's `sandbox:`
  (since 2026-09-23), and the engine's task still calls either `config.permissionMode`. A codex step's `permissionMode` is undefined now, so
  code that files a step, or compares it with what the engine filed, and reads that field sends Codex no `-s`: the read-only reviewer runs in
  Codex's default, `workspace-write`, which writes, and nothing says so (`vocabulary.test.ts` shows it). And a form that draws a harness
  word draws only the fence its harness has (`takes`, `hasKey` in `apps/web`), or Claude Code gets an empty Sandbox picker (learned by the
  run that named Codex's sandbox `sandbox:`).
- **In a `claude -p` job a turn cannot end to wait for a process in the background.** The harness demands the closing
  statement at once (`[structured-output-enforce]`), so a session that starts a suite in the background and ends its turn to
  wait has signed off, and the suite's verdict reaches nobody. Run long work in the foreground, in pieces under the 10-minute
  limit of a Bash call, or start it in the background and wait on it with blocking calls — `timeout 580 bash -c "while kill -0
  <pid>; do sleep 5; done"` — never by ending the turn. The implementers', reviewers' and shipper's briefs say so (the
  owner's word at the plan gate of the run that moved the ship's check into the run, whose shipper had waited so on a check of twenty minutes).
- **The ending's check is the run's, and a merge left staged on the base branch is the tick's to finish.** A gated `workspace: main`
  step with a `check:` stages its merge and signs off the message; the tick files the check and, on the pass that reads it settled,
  commits (exit 0) or aborts (anything else). Level-triggered: `landingDue` reads `MERGE_HEAD` off disk on every pass, so a restart
  mid-check, mid-commit or after a person aborted by hand reads the same, and a merge whose heads are not the run's result branches is
  never touched. That checkout is a person's, so a pass spawns git there only once a landing can be due — nothing in flight, and a
  merge staged or a check settled (`mergeInProgress` is one stat) — and reads conflicts with `ls-files --unmerged`: `git diff` refreshes
  the index and takes `index.lock`, and a pass every few seconds would race the shipper's own git (learned in review, round 1). The
  session is filed denied `git commit` and `git merge --continue` (`filedDenies`), since only prose kept it from committing before
  the check; a deny is a prefix, so a merge without `--no-commit` still commits, and codex, which takes no deny list, is refused a
  landing at load. Until it has landed the checkout is held (`landingOpen`) and `wf rm` refuses. A check that did not finish lands
  nothing, and its offer is `wf retry <run> ship`, never `--recheck`: the merge it checked is gone (learned by the run that moved
  the ship's check into the run). A landing owed is closed on every way the ending can end, not only on the ways that act: an ending
  that stopped blocked with nothing staged was never written down, so a merge a person staged there after it, by hand or on trial,
  read as the run's, and the next pass aborted it. It is written `landed: {untouched}` on the first pass that reads it settled (same
  run, round 3).
- **Admission reads the views the runtime's pass hands back, never a read of its own.** Since thin runtime stage 4c the orchestrator
  decides what starts: `tick()` in `agent-orchestrator/src/tick.ts` takes `TickReport.views`, the view of every unsettled task the
  runtime's pass built off its one observation (`viewOfState`), hands them to `toAdmit` (`src/admission.ts`, pure), and calls
  `e.admit(ids)`, which only journals the word. A new admission input is taken off those views or off the run records, never off
  `e.list()` or `e.view`: each is a `claude agents` call more on every pass, and `test/pool.test.ts` counts exactly one for a pass with
  claude tasks at work and waiting, on the fake's counter and on the pass's own cost (`harnesses`, `spawned`). `admit` is metered in `act`
  (`ENGINE_PHASES`); a new engine verb goes there too, or the Proxy passes it through and its time reads as `assess`. `advance` reads the
  same report: `pass()` hands it `reportedEngine` (`views.ts`), whose `view` of a reported task is the report's, so a new engine verb that
  changes a task goes into `ENGINE_WRITES` there too (an unknown one drops every reported view). And an admitted task starts on the runtime's
  *next* pass, so a test that files and wants a start ticks twice (learned by thin runtime stage 4c, part 1).
- **The runtime's pass skips a settled task until the feed names it, so every write to a task's journal goes through `Journal.append`.**
  An engine keeps a cursor into its feed and the settled tasks it has folded (`tick-memo.ts`), and a pass reads no journal the feed has
  not named since. A store, a `PromiseJournal` or a hand edit that appends to `tasks/*.jsonl` without the feed's line is read by no running
  engine until it restarts. A test that builds its own layers without `tickMemoLayer` folds every task, as the Effect door does; the engine's
  own tick tests run `tickMemoLayer({ verify: true })` (`board()` in `engine.test.ts`), which folds each skipped task again and fails the pass
  on a difference, so a new append that bypasses the feed fails there (learned by the run that made the pass skip settled tasks).
- **A parameter taken away is refused, or a caller that still passes it is obeyed by nobody.** A JavaScript function ignores an
  argument it does not declare, so `tick(3)` after the ceiling left would have started every task and said nothing; an object key the
  type no longer has is the same, `createEngine({ maxConcurrent })` or a harness's `pool`. Stage 4c part 2 refuses each by
  `Object.hasOwn` (an own `undefined` too) and the pass by its argument count (`tickRefusalOf`). A parameter taken from the middle moves the next one into its place: `settleTask`'s
  `slots` went and `maxSteps` became third, so an old `settleTask(id, observed, slots)` compared a step count with an object, ran no
  step and returned `[]` — refused now, as `step`'s third argument is (`StepRefused`, found in review of the same run). An `Effect.fn` generator that must see
  its arguments cannot declare `...args: never[]` (TS2769 at the call site); it declares none and reads `[...arguments]` (`tick` in
  `agent-runtime/src/engine.ts`, learned by the run that retired the runtime's ceiling).
- **A pass asks `claude agents` only for a session it expects that is no job.** The runtime's pass folds first and hands the runner
  every attempt of every task it folds (`observeFor`, `observeSessions` across the A2A seam); Claude Code's lists its jobs off their run
  files and reads its registry only when a name is not among them, and `advance` reads the pass's views rather than viewing again. The skip
  is read off the world, never off `config.background`: a task filed on `claude` before jobs were its default runs `--bg` without the flag.
  `agent-orchestrator/test/agents-calls.test.ts` counts the calls on a fake `claude` — none with jobs alone, one with a background session,
  one on a fresh engine's first pass — and a test that asserted a count of `claude agents` calls (`pool.test.ts`'s once a pass) was
  asserting the waste (learned by the run that took the pass's two `claude agents` calls down to what it needs). What a pass is told to
  look for is also what it can release: a settled task the memo keeps was on no list, so a `claude rm` refused twice was never asked
  again, and the fixture's `testOps`, which has no `observeFor`, lists everything and hid it. A kept task whose harness still listed a
  finished session stays expected (`TickMemoState.listed`) until a pass sees it gone; a runner in a test of what a pass looks for lists
  only what it is told (found in review, round 1).
- **XState's `transition` answers an event with no edge by staying where it was, as a self-edge does.** It returns the same snapshot
  and no action, and throws nothing (5.33.2), so a missing edge read off its answer looks like a task at rest. `moveOn` in
  `agent-runtime/src/lifecycle.ts` asks `snapshot.can(event)` first and refuses on false, and a refusal stalls a task out loud
  (`TickReport.refused`, `wf up`'s `stalled` line). An edge added to the machine is taken by a case of `lifecycle.test.ts`'s corpus, or that
  test fails, and the runtime README's diagram is regenerated by the command in its marker (learned by thin runtime stage 5).
- **A finished run is answered from the tick's memory while what it was judged on stands, so a new input of its pass is watched or
  missed.** The memo (`restMemo` in `agent-orchestrator/src/tick.ts`, `atRest` in `src/rest.ts`) answers a run at rest while its files in
  the store stamp the same (`restStamps`: the record, the markers, the asks and `done/`), no task of it is on the runtime's feed since, and
  its result branches stand at the tips it recorded. A new input `advance` reads for a finished run goes into one of the three, or a
  daemon answers that run stale until it restarts. `WF_VERIFY_REST=1`, set by every test file that ticks a store, judges each answer in
  full too and throws on a difference, so a new such file sets it. The feed is read after `e.tick()`, since the runtime appends a settled
  task's `measured` on its pass. And a test that takes "a run at rest" from a store earlier tests wrote takes one none of them touched:
  an acceptance of a step with no loop is read and never consumed, so it stays, and a run a test retried or approved is not like the rest
  (`aResting` in `test/rest-store.test.ts`; learned by the run that made a finished run cost a pass nothing).
- **A sighting speaks A2A's names; a fake harness and the journal do not.** Since 2026-09-25 `Sighting.state` is `SessionState`,
  A2A's eight `TaskState` names, and each driver translates its harness's own words once, at its edge (`claudeStateOf`,
  `detachedStateOf`). So a fake `claude agents` row (`setRows`, `withFakeClaude(row('done', …))`) and a detached run file
  (`{ state: 'stopped' }`) still say `done`, `blocked`, `stopped`, and a journal's `observed:` still says `done`, `failed`,
  `stopped` (`Ended`). A mechanical rename across the tests turned registry rows into A2A's names, and the driver read them as
  words it has no reading of, `failed`. Rename the sightings, and leave what a harness writes and what the journal records in
  their own words. A decision recorded before a change of words (`test/fixtures/decide-corpus.json`) is what proves the
  translation, case for case (learned by the run that made sightings speak A2A's names).
- **Git refuses a whole `for-each-ref` for one base it cannot read.** `%(ahead-behind:<base>)` with a commit the repository does not have,
  or a branch it does not have, exits 128 and lists no ref at all, so one run whose base was pruned away would blind the listing to every
  other run of that repository. `branchReader` (`agent-orchestrator/src/branches.ts`) lists again without the bases it cannot read and asks
  that run's questions one by one; its test pins each shape against `oneByOne`, the reference that asks a process for each question
  (learned by the run that made `wf ls` ask git once a repository).
- **The api's list answers a finished run from memory, and `WF_VERIFY_REST=1` is set by the api's test harness.** `GET /api/runs` keeps a
  run at rest (`apps/api/src/resting.ts`) while its `restStamps`, its record, the feed for its tasks and the tips of its unmerged branches and
  base stand. A new input `summarize` (`apps/api/src/runs.ts`) reads for a finished run goes into one of those, or a poll answers that run
  stale until the api restarts; every api test judges each kept answer afresh and fails the request on a difference, which is how it is
  seen. A test that counts what a poll reads turns the check off for that request (`unverified` in `test/resting.test.ts`), since the check
  reads everything again (same run). Requests overlap, and the memo's feed cursor is shared: a request keeps nothing once another has read
  the feed on past where it read to, or a line of a run it judged before the line is consumed by a request that had nothing to evict, and the
  answer stays stale. One request at a time never shows it; the test interleaves two reads by hand (found in review, round 1).
- **`list(taskIds)` looks at no harness when nothing among the tasks is in flight.** The api's list and a run's detail read their tasks
  through it, so the tests that asserted one `claude agents` call or one observation per request now assert none where the tasks are
  settled or Codex's: the one observation was the cost of reading every journal, not something the page needed. A run's tasks are every
  step's, every check's, and every earlier try's *and its check's* (`tasksOf` in `apps/api/src/store.ts`); a list that left the tries' checks
  out drew them `unknown` on the run's page (same run).
- **The runtime's `io().reads` counts every file it reads, not only journals.** A look at Codex, check or claude-detached reads every run
  file the harness ever wrote (871 on the live store on 2026-09-25): they have no `observeFor`. A measurement labelled *journals* off
  `io().reads` counts those too; with a task in flight, the api's poll read 643 files and about 25 journals (same run).
- **An absence read off a failed look is not an absence.** The composite and Claude Code's `observeFor` caught a registry that could not
  be read to an empty map, and the pass read the empty map as every session gone: the tick memo stopped looking for a finished session
  whose release the harness had refused, and an attempt past its grace was ended `lost` on one unread pass. `observeFor` answers
  `{ seen, unread }` now, and the pass reads an unread name as neither there nor gone (`UNREAD` in the lifecycle, `releaseFinished`'s
  `listed`). A new harness, or a new way to list one, says which names a failed read left unread and fails whole only when it read
  nothing; a fake that fails whole, through the composite, is the test (`flakyHarness` in `agent-runtime/test/engine.test.ts`). The
  full `observe` and every view still read a failed harness as nothing (runtime open issue 35; learned by the run that made a failed
  observe say so).
- **A step on a remote A2A agent is filed with its local fields left out, never set to `undefined`.** The runtime refuses a remote task
  whose `config` has any key (`remoteRefuses` counts `Object.keys`), an own `undefined` included, so `{ model: step.model }` for a step
  with no model is refused at `file`. Every filing site builds its local fields through `localFields` (`agent-orchestrator/src/tick.ts`),
  which gives `{}` for `harness: a2a:<name>`; a new field on the task goes inside it, or every remote step fails to file (learned by thin
  runtime stage 6, part 2).
- **A remote Task waiting on its caller is the view's `needs-human`, and it is answered with `wf say`, not in Claude Code.** A2A's
  `input-required` never reaches the orchestrator as a phase: a test loop that waited for `input-required` timed out. The advice is
  `answerIn`'s, given `{ run, step }` for a remote harness (read off the view's `state.harness`) by `wf decide` and by the api's `needsOf`;
  a new place that says where a wait is answered passes it too, or tells a person to find a remote agent in `claude agents`. And a
  remote step's `wf logs` asks the agent, so a test reads it while its server is up: after `close()` it is `fetch failed` (same run).
- **An address from `a2a-agents.json` is shown as origin and path, never whole.** A query string can carry a key, and the api's run
  detail and anything else a person reads print `${origin}${pathname}` (`remoteOf` in `apps/api/src/detail.ts`); its test puts a secret
  in the query and asserts it is on no answer (same run).
- **What `engine()` reads, it reads without throwing.** Every CLI verb takes `engine()` as its default argument and the api makes one at
  load, so a throw there stops `wf ls`, `wf up`, `wf rm` and the api for runs that never touch what was refused. A bad `a2a-agents.json`
  is left out of the engine and said on stderr (`readRemote`), and `wf start` refuses only a step that names what was left out;
  `test/remote-refused.test.ts` runs `wf ls` and `wf tick` through `main`'s own engine on a bad file (found in review, round 1).
  And what is left out must be left out of the tasks already filed on it, not only of `wf start`: the runtime ran a task whose harness it
  did not have on its first harness, so a queued remote step was spawned as a Claude Code job in its workspace and one at work was looked
  for in Claude Code's listing, to be ended `lost`. The composite routes such a task to none now — names unread, spawn refused — and
  `test/remote-left-out.test.ts` files one of each before the file goes bad and counts every call of a fake `claude` (round 3).

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
    no runtime, no controller and not the client, and load as a tree: `places.ts`, `workflow-store.ts` and `tally.ts` (the
    pass's meter) at the bottom, `store.ts` on them, `worktree.ts` on `store.ts`, `places.ts` and `tally.ts`; outside the store, only the client and the controllers
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
  approves it at its gate — and it stages the merge of the run's own result branch and signs off its message;
  the run then executes the ship's `check:` on the merged tree and commits on exit 0, or aborts the merge on
  anything else, a check that did not finish included (`landingDue`).
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

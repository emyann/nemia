# hkb-v2 — contributor guide

Two packages and two apps. `packages/agent-engine` runs one agent session to completion, durably
(the `ae` CLI; `src/domain.ts` is the whole judgement). `packages/agent-workflows` sequences engine
tasks into runs of steps — a folder of markdown is a workflow (the `wf` CLI). `apps/api` puts the
workflows behind HTTP; `apps/web` talks to it. Dependencies point down that list, never up. Read
`README.md` and each package's README for the model before changing behaviour.

## Check your work

- `npm test` — from the root, turbo runs `node --test test/*.test.ts` in every package
  (181 engine · 169 workflows · 21 api · 33 web at 2026-09-13). Runs from a package directory
  too. Not bare `node --test` from the root: `agent-engine/test/facade.test.ts` is cwd-relative.
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
  though three tests pin those folders: the round trip in `agent-workflows/test/workflow.test.ts`, the package's `ui`
  copy, file for file, and the api's picture of `dev` and `dev-build` (`apps/api/test/workflows.test.ts`). After touching
  `workflows/`, run `npx turbo run test --force`, and copy a `workflows/ui` change into
  `packages/agent-workflows/workflows/ui` (learned by the change that gave every shipped step an `effort:`).
- `npm run build` too when you touch `apps/web`: the router plugin regenerates
  `src/routeTree.gen.ts` only in a vite build, so a new route file fails `typecheck` until
  `build` has run once (learned by the run that added `/runs/$runId`).
- For `apps/web` changes, run `npm run e2e` and read the PNGs it writes before you sign off (`.e2e/`,
  or `$WF_ARTIFACTS` in a run). A new page is a file of its own, `apps/web/test/e2e/pages/NNN-<name>.ts`, whose default
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
- **`assert.throws(fn, /^…/)` matches `String(err)`, which starts with `Error: `.** An anchored
  pattern never matches a message; assert on `err.message` (`assert.throws(fn, (e) => /^…/.test(e.message))`).
  Learned by R, whose refusal tests passed for the wrong reason until anchored right.
- **The e2e's watch counts every 4xx a page sees against it.** A refusal the e2e makes on purpose goes
  in a page of its own, with a watch that must see that one refusal and nothing else (the `answer` page,
  learned by the run that added the answer box). And the e2e visits every page in light, then every page
  in dark, so a page that writes to the store takes its write back before it ends.
- **The engine's `transcript` of an attempt still in flight observes its harness** — one `claude agents`
  call per read, since the session's id is on no record yet. Read it on a run's detail, never on the list
  the Factory polls (learned by the run that put a blocked session's last line on the board).
- **Playwright's `dragTo` onto a React Flow handle waits for ever.** A handle a connection cannot start from has `pointer-events: none`
  until a drag is under way, so `dragTo`'s check of what the pointer would hit finds the node over the handle. Drag with `page.mouse`
  (down, move in steps, up), and keep both ends in the frame: a drag that starts off a handle pans the pane (`drawEdge` in
  `apps/web/test/e2e/canvas.ts`, learned by the run that built the workflow builder).
- **A file written through a script can turn an escape into the character it names.** A Python heredoc, or a tool that decodes
  escapes, wrote a raw NUL and DEL into a regular expression's class in `apps/api/src/builder.ts`: ripgrep then took the whole file for
  binary, and a search of `apps/api/src` did not find it. Each app's `test/source.test.ts` refuses a raw control character in its `src` and
  `test`; a script that needs one builds it with `String.fromCharCode` (learned by the run that built the workflow builder, round 2).
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
- **A page that changes what it shows at the end of its e2e is photographed mid-read.** `visit.ts` waits for the network to idle before the
  picture, but a page whose state changes after that wait re-issues the queries its state keys — the run page reads its decision again when
  a step moves — and the shot showed `Reading the branch…` where the branch's diff stat belongs. End such a page by waiting for what it
  reads again, with an assertion of its own (the `decide` page's last line, learned by the run that put a finished run's decision on the
  board).
- **Closing an e2e's second page refetches the first.** The first page is focused again, and react-query refetches its queries on focus:
  a fixture taken back *after* `refused.close()` is read by that refetch, and the page's last picture shows it (the Agents list showed a
  node that names `scribe` which was gone). Take the fixture back before the close, then wait for what the page reads again (learned by the
  run that put the agents on the board).
- **A background shell that never exits keeps your session busy, and your closeout is never read.** A
  `run_in_background` loop such as `until grep -q Local: server.log; do sleep 0.5; done` outlives the server it waits for,
  the registry reads the session as `shell`, the engine reads the step as working, and nothing settles it (seventy-seven
  minutes, learned by the run that drew the queue on the Factory; engine open issue 24). Give every background loop
  a bound — `timeout 120 bash -c '…'` — and end your own servers and watchers before you sign off.
- **A guard is not proven by a test that asks whether it allows.** Every new refusal — a parser
  key, a value, a tool, a check — gets a test that makes it *refuse*, at shipped defaults. Guards
  that were only ever tested for the allowing case have been silently inert before (hkb's
  admission gate, worktree base and lease each were).
- **A rule about order or names is not proven by a fixture that already has it.** The equal-times admission test read
  a journal whose `list` sorts, and a sort is stable, so it passed with the id tiebreak deleted; the pool test
  configured the `claude-bg` runner as `claude`, whose pool is `claude`, so it passed with `poolsOf`'s mapping
  deleted. Give the fixture the opposite order, or another name, and check the test fails without the rule
  (learned by the run that closed engine issues 24 and 25).
- **A key added to `STEP_KEYS` has three obligations outside the package.** `KINDS` in `apps/api/src/builder.ts`, or the
  api's typecheck fails; `WorkflowStepSpec` and `specOf` in `apps/api/src/workflows.ts`, or the key never reaches the
  board; and `apps/web/src/lib/api.ts`'s mirror with `UNSET` beside it (`apps/web/src/lib/builder.ts`), or the board can
  read the key on a folder that has it and never set it on one that does not (learned by the run that added
  `workspace: main`).
- **A shipped folder is not whole without `workflows/agents/`.** Every shipped step but the supervisor's names an agent there, so a
  test that copies a folder (`cpSync(SHIPPED/dev, …)`) copies `agents/` beside it, or the load refuses `agent: implementer` as not
  there. The package's `workflows/ui` copy has its two agents in the package's `workflows/agents`, held byte for byte by the ui copy
  test: a change to `ui-implementer.md` or `ui-reviewer.md` is copied there too (learned by the run that put the roles in `agents/`).
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
  `agent-workflows/src/runner.ts`, learned by the run that took up the queue's leftovers).
- **A `readdirSync` entry for a symlink is not `isFile()`, and every read and write follows it.** So code that writes each
  file it lists and removes the rest writes *through* a link — into whatever it points at, outside the folder — and leaves
  it behind when it should have removed it, with nothing said either way. Where a folder's files are meant to be its own,
  refuse a link by name (`writeWorkflow`, same run).
- **A worktree gets a `node_modules` of its own.** Each workspace package (`packages/*`, `apps/*`)
  links to the worktree's copy, so an app change can lean on a package change from the same branch;
  third-party packages link to the main checkout's tree, and `npm install` in a worktree writes the
  worktree's directory, never main's. When the worktree's `package-lock.json` differs from what main
  has on disk, the run does `npm ci` there instead — about a minute, and the brief says so. Two habits
  keep that minute rare: a step that adds a dependency commits the lockfile (`npm install
  --package-lock-only` is enough; the next step's worktree installs it), and after merging such a
  branch, `npm install` on main before the next run, or every worktree cut from it pays the minute
  (main's lockfile ahead of its tree counts as a difference). (U1 hit the linked tree; W2 replaced it.)

## Rules the code keeps

- **The engine is finished.** It runs one workload on one harness; anything that knows about a
  second workload is the upper layer. `decide` (`agent-engine/src/domain.ts`) is pure and stays a
  screen long; `agent-engine/src/index.ts` is the export list and the boundary — `decide` is
  not exported, on purpose. A knob on the workload is a field carried on the task and read by a
  runner, never a callback into `decide`.
- **No `if` in `engine.ts` that belongs in `decide`.** Effectful code applies one decision; the
  judgement lives in the pure function.
- **In agent-workflows, `assess` is pure and `runner.ts` is the only file that imports the
  engine.** `run.ts` reads no disk and calls no engine. `cli.ts` parses, calls, prints.
- **Level-triggered.** A tick reads the world, decides, acts, and carries nothing between passes.
  A guard that only fires on a transition is wrong after a restart.
- **One writer per file.** The tick writes the run record; a person's facts (`.cancelled`, an ask)
  get their own files, composed on read. Two writers doing read-modify-write lose updates — and did.
- **A check that did not finish is not a refusal.** The engine settles a check killed at its
  deadline as `failed` with no exit code, and one the harness stopped as `stopped`; only a
  numeric exit is a verdict on the work (`refusedCheck` in `agent-workflows/src/run.ts`).
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

- `docs/eval-2026-09-12/REPORT.md` — the evaluation against the four points of *how to hold the
  bar on production agent code*: gaps with `file:line`, the shape agent-workflows should take.
- `docs/plan-hold-the-bar.md` — the handoff plan: packages, owners, definitions of done.
- `packages/agent-engine/docs/open-issues.md` — what is still wrong or half-verified.
- `packages/agent-workflows/docs/features.md` — what is still to build, in order.
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

# apps/web — the board

The board owns what a person sees and clicks. It reaches the api over HTTP alone: it imports no package, names no store path, and builds
no command of its own — a command or a store folder it shows is text the api answered, and `test/structure.test.ts` refuses a file
of `src` that spells one, a JSDoc's mention included: an aside says it in the board's words.

The board is Vite, React, TanStack Router and Query, React Flow, and shadcn's components on React Aria (`aria-nova`). Its node tests
(`test/*.test.ts`) load `src/` as Node does; its e2e (`test/e2e/`) drives the built app in Chromium.

Two component families draw from one palette. shadcn's (`src/components/ui/*.tsx`) are what the pages use today. The design system kit
(`src/components/ui/ds`, Material Design 3 on React Aria) is what the board moves to, a component at a time. The look is `DESIGN.md`,
and `theme/` is what the kit's generator makes of it; `src/styles.css` imports the theme and reads shadcn's names from its roles.

## The design system kit

- `src/components/ui/ds` and `.claude/skills/ds-{theme,build,spec}` are another repository's files, as its registry ships them (`@ds`
  in `components.json`): never edited, linted or formatted here (`VENDORED` in `packages/agent-orchestrator/test/comments.test.ts`). A
  component the kit lacks is written beside it, under the board's own rules.
- `npx shadcn add @ds/ds --overwrite -y`, from `apps/web`, takes an update: read `git diff`. The CLI also writes into `src/styles.css`
  each time, and that is taken back out: a second `tw-animate-css` import, names that point at themselves in `@theme inline`
  (`--ring: var(--ring)`), a `.dark` block, `--radius`, and the bridge's `--secondary` and `--secondary-foreground`, which it sets to
  the theme's green. The message it prints, to import the kit's default theme, is not for us. Then `node
  src/components/ui/ds/changed.mjs`, from `apps/web`, says whether a kit file differs from the release's record (`RELEASE.json`): exit
  0 none does, 1 some do, 2 it cannot tell; run it before an update too, since the update overwrites every file that differs.
- `theme/` is generated, never edited: change `DESIGN.md`, then `npx tsx src/components/ui/ds/tokens/generate-theme.mjs DESIGN.md --out
  theme` from `apps/web`, and read the warnings in `theme/DESIGN.resolved.md`; `test/theme.test.ts` refuses a theme that is not the
  generator's. A face the DESIGN.md names is loaded by `src/styles.css` from its npm package, under the exact family the package
  registers (`Michroma`, `Chakra Petch`, `Share Tech Mono`), and given to the theme's hook (`--font-michroma`); the label face
  (`Archivo Variable`, `--font-label`) is the board's own. No face comes from a font service (the e2e's `typefaces` page).
- Mono text is `font-mono`, which reads the theme's `--font-mono`, the face `typography.mono` names in `DESIGN.md`; `code`, `kbd`,
  `samp` and `pre` follow it. No `--font-mono` in `@theme inline`: it would win over the theme's (the `typefaces` page refuses it).
  The face has one weight: a weight class on mono text is drawn by the browser.
- The kit's corners (`rounded-shape-*`) follow `DESIGN.md`; shadcn's (`--radius`) are the board's own. shadcn's `secondary` reads a
  neutral surface, not the theme's `secondary`: that green is `alive`, a session at work. The chart colours are not the theme's.
- A colour says one thing: `yours` (waits on a person), `alive`, `money` (an amount), `rest` (grey, and sage for done) and `failure`.
  `src/styles.css` reads each from a theme role once (`--meaning-*`, `bg-yours`); `lib/meaning.ts` holds the drawn forms, each class a
  whole literal; `test/status.test.ts` holds the table and refuses a hand-picked hue in the files that draw a state.
- `test/palette.test.ts` refuses a palette colour (`bg-amber-100`, `text-white`, `--color-neutral-400`) in `src` outside the kit: a ground
  or an outline reads a role (`bg-card`, `border-outline`), one class for both schemes, no `dark:` twin. A use that means none of the
  five is rest; a caution is failure for a write refused, yours drawn light for what a person weighs, rest for a note.
- A text that stands on `ScanLines` is `unmeasured` by the contrast measure, its ground being an image, and an unmeasured text is
  never refused: a page of the look measures through `contrastHolds` (`test/e2e/runs-contrast.ts`), which flattens the ground first.
- A table cell's `scrollWidth` does not grow with a `nowrap` text that runs out of it: measure the text's right edge against the
  cell's own room (`expectRoom` in `test/e2e/pages/052-runs-pages.ts`).
- Text dimmed by an `opacity` falls under 4.5:1: sink a card into the floor (`bg-background`) or use the muted ink instead.
- The kit has no adapter for TanStack Router: an `href` on one of its buttons, chips or menu items loads the page whole.
- A cut corner is a shape of its own under unclipped content (`CutFrame.tsx`, `CutButton.tsx`): a layer clipped to the cut, never an
  overlay in the ground's colour, and never a clip on what holds content or takes the focus. A glow is that layer's `drop-shadow`, and
  a ring that follows the cut is a band clipped beside it (`cutRing`). A ground on a child (the kit's `Card`, a table `Row`) paints
  the cut over, so it is given none (`bg-transparent`). `test/e2e/parts.test.ts` reads each in a picture, pixel by pixel.
- A control's touch target under a table's last row makes an `overflow-x-auto` box scroll upright: a table in a cut frame wears
  `FRAMED_BOX`, `FRAMED_TABLE` and `FRAMED_ROW` (`CutFrame.tsx`), which also drop the last row's line; `test/e2e/bars.test.ts`.
- A scroll bar is drawn by `src/styles.css` from `data-bar`, which `markScrolls` (`lib/useScrollMark.ts`) writes on what scrolls. The
  window's bar takes its parts from `body` and no selector on the root's attribute reaches it: the thumb reads an inherited property
  (`--bar-ink`). A bar already laid out keeps its track under a style added later.
- The look's small caps are its three label roles: `DESIGN.md` gives them their weight and tracking, and a text writes the role and
  `uppercase` (`text-label-small uppercase`); a kit part's own label (`Tag`, a `Column`) follows the role. No class of the board's.
- The kit's type primitives write Material's weight over the role's (`Label` draws 500 where `DESIGN.md` says 600, a `Tag`'s word
  included): a label of the look writes the role class, and a text given a `background-image` is unmeasured (`PageName` in `Plate.tsx`).
- A box the browser lays between two pixels is drawn from the next whole one, and `boundingBox` carries float noise: a test that reads
  a pixel beside an edge rounds past it (`edgesOf` in `test/e2e/parts.test.ts`).
- The kit's `xsmall` icon button answers 8 pixels beyond its box, and of two targets that overlap the later in the document wins: in a
  40-pixel row a copy control answers from 24 above its centre to 16 below (`finger` in `test/e2e/pages/050-runs.ts`).
- A kit `Cell truncate` shows its children again in a tooltip: a cut cell that holds a link cuts the link itself (`block truncate`, a
  `title`), never the cell.

## Build and e2e

- `npm run build` regenerates `src/routeTree.gen.ts`: a new route file fails `typecheck` until a build has run once.
- For every change here, run `npm run build` and `npm run e2e -- --pages <the pages the change touches>` (`--photos` too when pictures
  are due), its assertions in the dark theme; never the whole suite in a session but to measure it. Implement's round check runs it
  whole, and the landing's again on the merged tree. A whole run over `E2E_BOUND_MS` (`e2e/timing.ts`) fails, naming its slowest pages.
- `npm run e2e -- --photos --contrast` writes each picture's text pairs beside it (`e2e/contrast.ts`); `node test/e2e/contrast-report.ts
  <dir>` makes `contrast.md` and `look.html` there and exits 1 on a pair under 4.5:1. A measure, never a check of every run.
- `npm run e2e` hands its pages to workers one at a time (`queueOf`, `e2e/workers.ts`), each a process with its own seeded store, api,
  `vite preview` and Chromium (`e2e/worker.ts`); `--workers <n>` sets how many, else the machine does (`workersFor`).
- Once per machine, install each Playwright's browser through the checkout's own `node_modules`, never from an `npx` download (an install
  deletes the builds of every Playwright it does not see): `npx playwright install chromium` for the e2e, and
  `node node_modules/@playwright/mcp/cli.js install-browser chromium` for the steps' `browser_*` tools.
- The e2e's Chromium hides every scroll bar, so no bar takes room or is in a picture: a bar is asserted and pictured in a browser from
  `launch('classic')` (bars that take room) or `launch('overlay')` (bars that float), `test/e2e/visit.ts`.
- A part no page mounts yet is drawn in the gallery, `test/e2e/parts/main.tsx`, built into a scratch folder by `buildParts` and never
  by `npm run build`: `test/e2e/parts.test.ts` presses it, `node test/e2e/parts-photos.ts` pictures it, light then dark, and
  `test/structure.test.ts` refuses a file of `src` that imports one of `test/`. Its layout is inline styles, never a class of its own.
- `npm test` runs `test/*.test.ts`, never `test/e2e/*.test.ts` (those launch Chromium; only `npm run e2e` runs them). A web test that needs
  no browser sits in `test/`.
- `components/ui` and `components/ai-elements` are registry code adapted to React Aria by hand: adding one again overwrites its edits
  (the sidebar's `ul` menu, `showCloseButton={false}`, shiki's fine-grained build) and brings back comments the guards refuse.
- The shadcn skill's CLI runs from `apps/web` (where `components.json` is). Its rules know radix and base; on aria the reference is what
  `npx shadcn@latest add <component> --view <file>` prints, and `add` installs no `react-aria-components`.
- `@/` is declared once, in `tsconfig.json`'s `paths`; Vite reads it from there (`resolve.tsconfigPaths` in `vite.config.ts`).
- `browser_take_screenshot` resolves a relative `filename` against the workspace: give it an absolute path under `/tmp/playwright-mcp`,
  and in a checking step (design, review), whose fence refuses every `filename`, none: the call answers with the picture.
- `npm run board:serve` (`e2e/serve.ts`) builds outside the workspace and serves one board a workspace, on a seeded store of its own
  (`e2e/served.ts`, the worker's serving code too); `npm run board:stop` ends its holder, which else ends by itself.

## Writing an e2e page

- A page is a file of its own, `test/e2e/pages/NNN-<name>.ts`, default-exporting a `PageSpec` named `<name>`, plus the line `<name>` at the
  end of `pages/NAMES`; touch nothing else. Pages are numbered in tens and handed out in file-name order. Shared helpers go in
  `board.ts` or `canvas.ts`, runner state in `world.ts`, the seed in `seed.ts`.
- Each worker seeds its own store; a page reads only the seed and what it writes itself, takes its write back, and passes alone
  (`--pages <name>`) or after any other page. A worker whose store is not its seed at its end fails, naming the files (`leftOver`,
  `e2e/print.ts`); a file the api writes as it serves goes in `UNPRINTED` there, with why.
- Every page is visited in dark; `--photos` visits it in light, then dark, in one store: a fixture a second page's close would show is
  taken back before the close.
- A page's own pictures are taken only under `--photos` (`photograph` and `photographCard` do nothing otherwise, `photographing` in
  `world.ts`): a page asserts nothing through a picture, and leaves no state a picture's zoom would have reset.
- The watch counts every 4xx against a page: a refusal made on purpose gets a page of its own whose watch expects exactly it.
- A run added to the seed shifts every count asserted about the store (the Factory's tally, the Runs rows and headings): run the e2e to
  its end. A test about the pages reads the pages that exist, never a hard-coded last page.
- An expectation about a time of day decides as `clockWord` does (same calendar day or not), never a hard-coded form.
- A page that waits for a state polls through `expectNone` (`checks.ts`), never a loop of its own: `DEADLINES` (`test/waits.test.ts`)
  allows a deadline in `checks.ts`'s assertions alone.
- Wait with `idle(page)` (`checks.ts`), never `networkidle`: the feed stream never ends. A page that edits the store by hand where the
  board must see it says so on the feed, `fed(run, step?, word)` (`board.ts`); the board polls once a minute while it follows the feed.
- A page that changes what the e2e's `claude` answers the quota with reloads with `reloadForQuota(page, state)` (`board.ts`): it waits for
  the state the change makes, never a time compared across processes, nor a longer timeout: each change makes a state other than the last.
- A wait or a duration in the harness or a test reads `performance.now()`, never `Date.now()`: the owner's wall clock steps (`idle` in
  `checks.ts`). An age a page asserts is written mid-minute, never on the minute the board floors to (`290-daemon.ts`).
- A page that holds a read with `route` routes before its `goto`: the feed's replay reads the run again right after the load.
- A page whose state changes at its end waits for what it reads again before its last assertion, or its picture is taken mid-read.
- Name a page's own pictures `<name>-<what>-<theme>.png`; `<name>-<theme>.png` is the runner's: a run
  that pictures the page overwrites it, and a run that does not leaves an earlier run's where it is (`visitAll`, `test/e2e/visit.test.ts`).
- Take every picture with `photograph` (`board.ts`), which stills every animation for the shot: an agent's face moves at all times.
  `e2e-pictures.test.ts` refuses a bare `.screenshot(`.
- Chromium takes a full-page picture in the window's size, drawing the sticky header and footer and the fixed sidebar where the window
  was: `photograph` takes a page taller than its window in a window as tall as the page, then puts both back (`photograph.test.ts`).
- A page run against the old code proves only its first failing assertion: to prove each new one, skip the earlier ones in a throwaway
  edit, run, and put the page back.
- The store is in `/tmp`, which a boot can empty under a running check: when a failure says the store is gone (`storeGone`), run again.
- The engine's task view carries no filing time; its feed does: a store written by hand writes `engine/feed.jsonl` too (`seedFeed`).
- A journal line written by hand goes on `engine/feed.jsonl` too, and its take-back cuts the feed back: the api keeps a run judged at
  rest until a line for its tasks reaches the feed (`restingRead` in the orchestrator's `rest/resting.verb.ts`; `130-say.ts`).
- A record or journal written by hand is decoded as the tick's and the runtime's are (`StepRecordSchema` in the orchestrator's `record.store.ts`,
  `event-schema.ts`): write each key as they write it — a key they leave out is absent, never `null` (`340-agent-try.ts`).
- Anything a check runs that can fail says why last, on stdout too (`exitOn`, `headlineOf` in `visit.ts`).

## Playwright, React Flow and React Aria

- Photograph a card with `photographCard` (`canvas.ts`), not `card.screenshot()`: the fitted floor draws it at a third of its size.
- A straight SVG edge path fails `toBeVisible()`: count edge paths instead.
- Drag with `page.mouse` (down, `move(…, { steps: 12 })`, up), never `dragTo`: React Flow moves a node from the second pointer move, and a
  handle has `pointer-events: none` until a drag starts (`drawEdge` in `canvas.ts`). In the browser tools, synthesize mouse events a few
  milliseconds apart from `browser_evaluate`.
- React Flow sets `pointer-events: none` on a node neither draggable nor selectable, and a click on it lands on the pane: a node that is
  pressed gives them back in its `style` (`nodesOf` in `FactoriesCanvas.tsx`).
- React Flow's `nodeTypes` and `edgeTypes` are module constants, and each `ReactFlow` has an `id` of its own, which scopes its marker
  ids; `defaultMarkerColor={null}` lets the stylesheet colour a marker.
- Chromium writes a console error, `Failed to load resource`, for every 4xx: a page expecting one refusal allows that line too.
- Playwright reports neither `requestfinished` nor `requestfailed` for a request a navigation leaves behind (`track` in `checks.ts`).
- `hasText` reads `textContent`, which puts no space between elements: put `{' '}` between a label and what follows it.
- A React Aria switch, checkbox or radio is clicked through its `<label>` (`showFinished` in `canvas.ts`); a sheet is closed with its Close
  button, not Escape.
- A card must fit its cell (`CELL_HEIGHT`): `expectClearOfEachOther` measures it after a Reset layout. The fit is padded by the panels over
  the floor (`fitClear`), and `expectClearOfPanels` refuses a card under one; read a size on a card in its own pixels (`offsetHeight`).
- Something that mounts beside the floor after its first render narrows a floor already fitted: load what it draws in the route's loader
  (`prefetchQuery`), and fit again when it comes or goes.
- A full-page screenshot can lay the page out a pixel wide for a moment, and the floor's frame then measures 0 tall: aim no view at a
  frame without room (`revealView` in `lib/frame.ts`) and watch its size on both axes (`useFrameSize`); `factory-frame` forces it.
- A line that `truncate`s in a node holds about thirty characters: say the short form there, the whole sentence in its `title`, and prove
  it is read whole with `expectUncut`.

## React and Query

- The React Compiler compiles `src` at build (`@rolldown/plugin-babel` after the router's plugin, which splits the routes it must see,
  and before `react()`, in `vite.config.ts`); the node tests load `src` uncompiled, so only the build and the e2e test the compiled app.
  A function it skips is logged at build as `React Compiler skipped <file>:<line>: <why>`: read the build's output. A memo lists what its
  body reads, and an array rebuilt on every refetch goes through `useContent`.
- The compiler skips a function with an optional call inside a `try`: write `.then(ok, fail)` (`CodeBlockCopyButton`). It skips an arrow
  written as a parameter's default: declare it at module level (`asIs` in `StepForm.tsx`).
- A link to a route is `routeLink` (`components/routeLink.tsx`), under the root's `RouterProvider`: Enter on a React Aria link is two
  clicks, and each would navigate.
- React Aria's `DisclosurePanel` keeps and lays out what it holds while closed: draw a fold's content only while open.
- Call `requestAnimationFrame` as `(f) => requestAnimationFrame(f)`, never off another object.
- A suspense query keeps what it showed when a read fails: a page that must say a thing is gone reads the query's `error`, and a query
  whose 404 is an answer does not retry it (`runGone`, `retryRun` in `lib/api/detail.ts`).
- A query keyed by the state it answers for is not invalidated by a write: a write invalidates the run's record alone (`exact: true`).
- The frame, whatever the root route mounts, reads the light answer (`openRunsQuery`), never `runsQuery`: `wholeListBreaks`
  (`test/structure.test.ts`) follows the root's imports. A write that changes a run calls `runsMoved` (`lib/runWrites.ts`), never
  `['runs']` by hand; a key that stands for every key under it is said by `filterOf` (`lib/feed.ts`), which the feed invalidates through.
- `refetchInterval` is read again only when the query changes: `useFeed` marks the polled queries stale when the stream opens and reads
  them when it goes down (`pace` in `lib/feed.ts`).
- An `EventSource` is closed on the `error` fired as the response ends, or after a grace (`follow`), never on the last event.
- Send what the current choice takes, not what hidden state holds (`afterFor`).
- A form keyed on an agent's version is thrown away with its draft when a write beside the agent moves the version (`keptAfterCopy`,
  `formKeyOf` in `lib/agents.ts`).
- The frame counts what waits and what is in flight by the api's `counts` (`atWork`, `openBlockOf`, the bell): `inFlight` and
  `waitsOnYou` (`lib/factory.ts`) are the rule of the pages that read the whole list, and `test/one-rule.test.ts` keeps them off the
  light answer. A held run is `running` whatever its steps say: that rule takes one that waits on a person out by name.
- `['runs-finished']` stands for every page of the finished runs, each factory's (`filterOf`, `polled`, `runsMoved`).
- A new step status is drawn as `working` until `stepState` (`lib/status.ts`) knows it: add the word there, with its meaning and its
  drawing (`stateDrawn`, whose hue gives the chip's class and the minimap's fill) and `offersOf`, in the same change.
- A page that must agree with a verb's refusal reads the package's decision (`Decidable.awaiting`), never the list's `toDecide`.
- A read decodes with `get` (`lib/api/read.ts`) through a schema beside its plain type (`satisfies Schema.Schema<T>`), which the barrel
  never exports (`export type *`): every key the board reads required, an unknown key dropped. `satisfies` misses a schema narrower than
  its type (a word left out, a `null` refused, a `?` key required) and a `Schema.Any`: read the schema against the type. A read that passes
  no schema — a GET by bare `fetch`, a `get` of `Schema.Unknown` — is refused by `unschemedReads` (`test/read.test.ts`). A wrapper that
  hands its schema parameter to `get` or `send` is held at its calls in its file; one it cannot follow (no name, exported, destructured,
  used as a value) is refused.
- A write sends with `send` (`lib/api/read.ts`) through a schema beside its answer's type, with `may` words saying what to look at before
  sending it again; an answer that does not decode is an `UnreadAnswer`, never a refusal. `unschemedReads` refuses any `fetch` outside
  read.ts: a fetch that is no api call gets an exemption of its own in that test, with its reason.
- A value two files under `lib/api/` need sits in a sibling that imports no sibling (`test/api-files.test.ts`): the builder's saves decode
  a `WorkflowListing`, so they sit in `workflows.ts` beside its schema.
- A mirror narrower than the api's type drops the key on decode, and a write that sends the read back loses it (the builder's save, a
  step's `workspace` and `slot`): diff the mirror against the api's type, key by key, before writing its schema.
- `Schema.Union` takes the first member that decodes and drops the keys it does not know: put a member that owns more keys before one it
  extends (`StepArtifactSchema`, `RunDecisionSchema`), and prove the order with an answer the wrong order strips.

## Node tests of `src`

- `assert.deepEqual(x, [])` from `node:assert/strict` narrows `x` to `never[]` after it: assert on its length, or compare a copy.
- No directory import in a module a test reads (`./api` is a folder Node refuses): a helper a test reads uses file imports only.
- A test waits in its process with `until` (`test/waits.ts`, the runtime's copy, held by `test/waits.test.ts`), on a `bell` its event's
  source rings or at a pace, given `WAITED`; `DEADLINES` refuses a hand-written deadline.
- A component that draws a `routeLink` renders under `RouterContextProvider` over a memory-history router (`components.test.ts`); the
  markup spells React's props (`readOnly=""`). In a browser its Enter navigates only under React Aria's `RouterProvider`, the root's.
- A node test that renders a component imports `./tsx.ts` first, then the component by `await import(…)`.
- A package program the e2e runs from a string (`PASS` in `test/e2e/world.ts`) is read by no typecheck: after changing what a package's
  program requires, run `npm run e2e -- --pages runs`, which seeds through it.

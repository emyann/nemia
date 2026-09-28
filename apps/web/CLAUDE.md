# apps/web — the board

The board is Vite, React, TanStack Router and Query, React Flow, and shadcn's components on React Aria (`aria-nova`). Its node tests
(`test/*.test.ts`) load `src/` as Node does; its e2e (`test/e2e/`) drives the built app in Chromium.

## Build and e2e

- `npm run build` regenerates `src/routeTree.gen.ts`: a new route file fails `typecheck` until a build has run once.
- For every change here, run `npm run e2e` and read the pictures it writes (`.e2e/`, or `WF_ARTIFACTS=<dir> npm run e2e`). A round's
  check runs no e2e — only the ship's check does, on the merged tree — so your own run is the only one the change meets before it merges.
- Once per machine, install each Playwright's browser through the checkout's own `node_modules`, never from an `npx` download (an install
  deletes the builds of every Playwright it does not see): `npx playwright install chromium` for the e2e, and
  `node node_modules/@playwright/mcp/cli.js install-browser chromium` for the steps' `browser_*` tools.
- `npm test` runs `test/*.test.ts`, never `test/e2e/*.test.ts` (those launch Chromium; only `npm run e2e` runs them). A web test that needs
  no browser sits in `test/`.
- The shadcn skill's CLI runs from `apps/web` (where `components.json` is). Its rules know radix and base; on aria the reference is what
  `npx shadcn@latest add <component> --view <file>` prints, and `add` installs no `react-aria-components`.
- `browser_take_screenshot` resolves a relative `filename` against the workspace: give it an absolute path under `/tmp/playwright-mcp`.

## Writing an e2e page

- A page is a file of its own, `test/e2e/pages/NNN-<name>.ts`, default-exporting a `PageSpec` named `<name>`, plus the line `<name>` at the
  end of `pages/NAMES`; touch nothing else. Pages run in file-name order (numbers in tens) and share one store: number a page after any
  page whose leavings it reads. Shared helpers go in `board.ts` or `canvas.ts`, runner state in `world.ts`, the seed in `seed.ts`.
- Every page is visited in light, then in dark: a page that writes to the store takes its write back before it ends, and a fixture a
  second page's close would show is taken back before the close.
- The watch counts every 4xx against a page: a refusal made on purpose gets a page of its own whose watch expects exactly it.
- A run added to the seed shifts every count asserted about the store (the Factory's tally, the Runs rows and headings): run the e2e to
  its end. A test about the pages reads the pages that exist, never a hard-coded last page.
- An expectation about a time of day decides as `clockWord` does (same calendar day or not), never a hard-coded form.
- Wait with `idle(page)` (`checks.ts`), never `networkidle`: the feed stream never ends. A page that edits the store by hand where the
  board must see it says so on the feed, `fed(run, step?, word)` (`board.ts`); the board polls once a minute while it follows the feed.
- A page that holds a read with `route` routes before its `goto`: the feed's replay reads the run again right after the load.
- A page whose state changes at its end waits for what it reads again before its last assertion, or its picture is taken mid-read.
- Name a page's own pictures `<name>-<what>-<theme>.png`; `<name>-<theme>.png` is the runner's and is overwritten.
- A page run against the old code proves only its first failing assertion: to prove each new one, skip the earlier ones in a throwaway
  edit, run, and put the page back.
- The store is in `/tmp`, which a boot can empty under a running check: when a failure says the store is gone (`storeGone`), run again.
- The engine's task view carries no filing time; its feed does: a store written by hand writes `engine/feed.jsonl` too (`seedFeed`).
- Anything a check runs that can fail says why last, on stdout too (`exitOn`, `headlineOf` in `visit.ts`).

## Playwright, React Flow and React Aria

- Photograph a card with `photographCard` (`canvas.ts`), not `card.screenshot()`: the fitted floor draws it at a third of its size.
- A straight SVG edge path fails `toBeVisible()`: count edge paths instead.
- Drag with `page.mouse` (down, `move(…, { steps: 12 })`, up), never `dragTo`: React Flow moves a node from the second pointer move, and a
  handle has `pointer-events: none` until a drag starts (`drawEdge` in `canvas.ts`). In the browser tools, synthesize mouse events a few
  milliseconds apart from `browser_evaluate`.
- `hasText` reads `textContent`, which puts no space between elements: put `{' '}` between a label and what follows it.
- A React Aria switch, checkbox or radio is clicked through its `<label>` (`showFinished` in `canvas.ts`); a sheet is closed with its Close
  button, not Escape.
- A card must fit its cell (`CELL_HEIGHT`): `expectClearOfEachOther` measures it after a Reset layout. The fit is padded by the panels over
  the floor (`fitClear`), and `expectClearOfPanels` refuses a card under one; read a size on a card in its own pixels (`offsetHeight`).
- Something that mounts beside the floor after its first render narrows a floor already fitted: load what it draws in the route's loader
  (`prefetchQuery`), and fit again when it comes or goes.
- A line that `truncate`s in a node holds about thirty characters: say the short form there, the whole sentence in its `title`, and prove
  it is read whole with `expectUncut`.

## React and Query

- The React Compiler compiles `src` at build (`@rolldown/plugin-babel` after the router's plugin, in `vite.config.ts`); the node tests
  load `src` uncompiled, so only the build and the e2e test the compiled app. A function it skips is logged at build as
  `React Compiler skipped <file>:<line>: <why>`: read the build's output. A memo lists what its body reads, and an array rebuilt on every
  refetch goes through `useContent`.
- A link to a route is `routeLink` (`components/routeLink.tsx`), under the root's `RouterProvider`: Enter on a React Aria link is two
  clicks, and each would navigate.
- React Aria's `DisclosurePanel` keeps and lays out what it holds while closed: draw a fold's content only while open.
- Call `requestAnimationFrame` as `(f) => requestAnimationFrame(f)`, never off another object.
- A suspense query keeps what it showed when a read fails: a page that must say a thing is gone reads the query's `error`, and a query
  whose 404 is an answer does not retry it (`runGone`, `retryRun` in `lib/api/detail.ts`).
- A query keyed by the state it answers for is not invalidated by a write: a write invalidates the run's record alone (`exact: true`).
- `refetchInterval` is read again only when the query changes: `useFeed` marks the polled queries stale when the stream opens and reads
  them when it goes down (`pace` in `lib/feed.ts`).
- A scroll made as a run's page opens lands short: `useLanding` scrolls again on each change of height until the person moves the page.
- An `EventSource` is closed on the `error` fired as the response ends, or after a grace (`follow`), never on the last event.
- Send what the current choice takes, not what hidden state holds (`afterFor`).
- A form keyed on an agent's version is thrown away with its draft when a write beside the agent moves the version (`keptAfterCopy`,
  `formKeyOf` in `lib/agents.ts`).
- A held run is `running` whatever its steps say: the board takes one that waits on a person out by name (`inFlight`, `waitsOnYou` in
  `lib/factory.ts`).
- A new step status is drawn as `working` until `stepState` (`lib/status.ts`) knows it: add the word there, with its meaning, class,
  `stepGraph`'s fill and `offersOf`, in the same change.
- A page that must agree with a verb's refusal reads the package's decision (`Decidable.awaiting`), never the list's `toDecide`.

## Node tests of `src`

- No directory import in a module a test reads (`./api` is a folder Node refuses): a helper a test reads uses file imports only.
- A component that draws a `routeLink` renders under `RouterContextProvider` over a memory-history router (`components.test.ts`); the
  markup spells React's props (`readOnly=""`).

# apps/web — the board

The board owns what a person sees and clicks. It reaches the api over HTTP alone: it imports no package, names no store path, and builds
no command of its own — a command or a store folder it shows is text the api answered.

The board is Vite, React, TanStack Router and Query, React Flow, and shadcn's components on React Aria (`aria-nova`). Its node tests
(`test/*.test.ts`) load `src/` as Node does; its e2e (`test/e2e/`) drives the built app in Chromium.

Two component families draw from one palette. shadcn's (`src/components/ui/*.tsx`) are what the pages use today. The design system kit
(`src/components/ui/ds`, Material Design 3 on React Aria) is what the board moves to, a component at a time. The look is `DESIGN.md`,
and `theme/` is what the kit's generator makes of it; `src/styles.css` imports the theme and reads shadcn's names from its roles.

The traps of the board's tools — what Chromium, Playwright, React Flow, React Aria, the React Compiler, the e2e runner and the kit's
class merge do, which no test refuses — are in `.claude/skills/change-the-board`, read by whoever changes the board.

## The design system kit

- `src/components/ui/ds` and `.claude/skills/ds-{theme,build,spec}` are another repository's files, as its registry ships them (`@ds`
  in `components.json`).
- `node src/components/ui/ds/changed.mjs`, from `apps/web`, says whether a kit file differs from the release's record (`RELEASE.json`):
  exit 0 none does, 1 some do, 2 it cannot tell; run it before an update, since the update overwrites every file that differs. It
  prints the update's command, which covers every item the board holds (`npx shadcn add @ds/ds --overwrite -y` while it holds no
  adapter or preset): run it from `apps/web`, read `git diff`, regenerate the theme, and run the check again until nothing is left.
  Since 0.4.0 the CLI writes nothing into `src/styles.css`, and the board imports no `bridge-shadcn.css`: it names shadcn's roles
  itself. The message it prints, to import the kit's default theme, is not for us.
- `theme/` is generated, never edited: change `DESIGN.md`, then `npx tsx src/components/ui/ds/tokens/generate-theme.mjs DESIGN.md --out
  theme` from `apps/web`, and read the warnings in `theme/DESIGN.resolved.md`. A face the `DESIGN.md` names is loaded by
  `src/styles.css` from its npm package, under the exact family the package registers (`Michroma`, `Chakra Petch`, `Share Tech Mono`),
  and given to the theme's hook (`--font-michroma`); the label face (`Archivo Variable`, `--font-label`) is the board's own.
- The kit's corners (`rounded-shape-*`) follow `DESIGN.md`; shadcn's (`--radius`) are the board's own.
- Classes merge through `cn` of `src/lib/utils.ts`, built from the kit's `twMergeConfig`.
- A scroll bar is drawn by `src/styles.css` from `data-scroll-bar`, which `markScrolls` (`lib/useScrollMark.ts`) writes on what scrolls.
- The shadcn skill's CLI runs from `apps/web` (where `components.json` is), and `@/` is declared once, in `tsconfig.json`'s `paths`;
  Vite reads it from there (`resolve.tsconfigPaths` in `vite.config.ts`).

## Build and e2e

- `npm run build` regenerates `src/routeTree.gen.ts`: a new route file fails `typecheck` until a build has run once.
- `npm run e2e -- --pages <the pages the change touches>` runs its assertions in the dark theme, `--photos` too when pictures are due;
  never the whole suite in a session but to measure it. A whole run whose pages cost more than `PAGES_BOUND_MS` summed fails, naming
  its slowest pages; its own time past `E2E_BOUND_MS` is said, never refused: it is the machine's, by the workers it gave (`overBound`,
  `pastTool`, `e2e/timing.ts`).
- `npm run e2e -- --photos --contrast` writes each picture's text pairs beside it (`e2e/contrast.ts`); `node test/e2e/contrast-report.ts
  <dir>` makes `contrast.md` and `look.html` there and exits 1 on a pair under 4.5:1. A measure, never a check of every run.
- `npm run e2e` hands its pages to workers one at a time (`queueOf`, `e2e/workers.ts`), each a process with its own seeded store, api,
  `vite preview` and Chromium (`e2e/worker.ts`); `--workers <n>` sets how many, else the machine does (`workersFor`).
- Once per machine, install each Playwright's browser through the checkout's own `node_modules`, never from an `npx` download (an install
  deletes the builds of every Playwright it does not see): `npx playwright install chromium` for the e2e, and
  `node node_modules/@playwright/mcp/cli.js install-browser chromium` for the steps' `browser_*` tools.
- `npm test` runs `test/*.test.ts`, never `test/e2e/*.test.ts` (those launch Chromium; only `npm run e2e` runs them). A web test that needs
  no browser sits in `test/`.
- The stories are the one place the parts are shown, in two hosts under one decorator (`.storybook/preview.tsx`: the look's ground,
  a router of the story's own in memory, `data-at` where it stands). `npm run storybook`, from `apps/web`, is a person's, on port
  6007, in no check; dark follows the system alone, so its toolbar switches nothing. The checks read the stories' page,
  `test/e2e/parts/main.tsx` (`?part=<name>`, `?story=<id>`), built into a scratch folder by `buildParts` and never by `npm run
  build`: `test/e2e/parts.test.ts` presses it, and `node test/e2e/parts-photos.ts` pictures it, light then dark.
- `npm run board:serve` (`e2e/serve.ts`) builds outside the workspace and serves one board a workspace, on a seeded store of its own
  (`e2e/served.ts`, the worker's serving code too), and the look's stories beside it, whose address it prints on a third line, `stories
  on <url>`; `npm run board:stop` ends its holder, which else ends by itself.

## Writing an e2e page

- A page is a file of its own, `test/e2e/pages/NNN-<name>.ts`, default-exporting a `PageSpec` named `<name>`, plus the line `<name>` at the
  end of `pages/NAMES`; touch nothing else. Pages are numbered in tens and handed out in file-name order. Shared helpers go in
  `board.ts` or `canvas.ts`, runner state in `world.ts`, the seed in `seed.ts`.
- Every page is visited in dark; `--photos` visits it in light, then dark, in one store: a fixture a second page's close would show is
  taken back before the close.
- A page run against the old code proves only its first failing assertion: to prove each new one, skip the earlier ones in a throwaway
  edit, run, and put the page back.
- The store is in `/tmp`, which a boot can empty under a running check: when a failure says the store is gone (`storeGone`), run again.
- Anything a check runs that can fail says why last, on stdout too (`exitOn`, `headlineOf` in `visit.ts`).

## Where a thing is written

- A time of day in words has one writer, `timeOfDay` (`lib/timeOfDay.ts`): 12-hour (`1:11 PM`), date-fns's `h:mm a` under `zoneOf`,
  which is the one place a zone becomes date-fns's context and gives none where there is none, the browser's own. Every date word is
  date-fns's default English, wherever the browser is. `clockWord`, `whenWords`, `whenColumn` and `fireWord` each decide their day
  (`isSameDay`, `isSameYear`) and take the time from it.
- A whole instant has one writer, `lib/instant.ts`: text on a page is `instantWords` (`7:08 PM` today, `9 Oct 5:30 PM`, `31 Dec 2025,
  4:10 PM`: a comma after a year alone), a `title` is `instantWhole` (`12 Oct 2026, 7:08:53 PM`), the Timeline's cell is
  `timeToTheSecond`; a component draws one with `Instant` (`components/Instant.tsx`). date-fns is imported only in the four files that
  write a moment (`lib/timeOfDay.ts`, `lib/instant.ts`, `lib/runWords.ts`, `lib/quota.ts`); a fifth that needs it joins the list with
  its reason.
- A time on the runs page is `whenWords`, or `whenColumn` in a table (`lib/runWords.ts`); its date is `dateParts`. A schedule's
  far fire is `instantWords` (`14 Oct 12:00 PM`, `1 Jan 2027, 4:00 AM`); `whenWords` keeps dropping the time in another year.
- A colour says one thing: `yours` (waits on a person), `alive`, `money` (an amount), `rest` (grey, and sage for done) and `failure`.
  `src/styles.css` reads each from a theme role once (`--meaning-*`, `bg-yours`); `lib/meaning.ts` holds the drawn forms, each class a
  whole literal.
- A cut corner is a shape of its own under unclipped content: `look/cut.ts`, `look/CutFrame.tsx`, `look/CutButton.tsx`, with
  `cutShape`, `cutRing` and `cutPoints` for a new part that takes one; the copy control is `look/CopyId.tsx`.
- The look's own parts are `src/components/look`, taken through its door (`index.ts`) by every file outside it; each has its stories
  beside it (`<Part>.stories.tsx`), one a state.
- A write that changes a run calls `runsMoved` (`lib/runWrites.ts`), never `['runs']` by hand; a key that stands for every key under it
  is said by `filterOf` (`lib/feed.ts`), which the feed invalidates through. `['runs-finished']` stands for every page of the finished
  runs, each factory's (`filterOf`, `polled`, `runsMoved`).
- A value two files under `lib/api/` need sits in a sibling that imports no sibling: the builder's saves decode a `WorkflowListing`, so
  they sit in `workflows.ts` beside its schema.

## Invariants no test holds

- The React Compiler compiles `src` at build (`@rolldown/plugin-babel` after the router's plugin, which splits the routes it must see,
  and before `react()`, in `vite.config.ts`); the node tests load `src` uncompiled, so only the build and the e2e test the compiled app.
  A function it skips is logged at build as `React Compiler skipped <file>:<line>: <why>`: read the build's output. A memo lists what its
  body reads, and an array rebuilt on every refetch goes through `useContent`.
- A link to a route is `routeLink` (`components/routeLink.tsx`), under the root's `RouterProvider`: Enter on a React Aria link is two
  clicks, and each would navigate.
- A suspense query keeps what it showed when a read fails: a page that must say a thing is gone reads the query's `error`, and a query
  whose 404 is an answer does not retry it (`runGone`, `retryRun` in `lib/api/detail.ts`).
- A query keyed by the state it answers for is not invalidated by a write: a write invalidates the run's record alone (`exact: true`).
- `refetchInterval` is read again only when the query changes: `useFeed` marks the polled queries stale when the stream opens and reads
  them when it goes down (`pace` in `lib/feed.ts`).
- An `EventSource` is closed on the `error` fired as the response ends, or after a grace (`follow`), never on the last event.
- Send what the current choice takes, not what hidden state holds (`afterFor`).
- A form keyed on an agent's version is thrown away with its draft when a write beside the agent moves the version (`keptAfterCopy`,
  `formKeyOf` in `lib/agents.ts`).
- A new step status is drawn as `working` until `stepState` (`lib/status.ts`) knows it: add the word there, with its meaning and its
  drawing (`stateDrawn`, whose hue gives the chip's class and the minimap's fill) and `offersOf`, in the same change.
- A page that must agree with a verb's refusal reads the package's decision (`Decidable.awaiting`), never the list's `toDecide`.
- A read decodes with `get` (`lib/api/read.ts`) through a schema beside its plain type (`satisfies Schema.Schema<T>`), which the barrel
  never exports (`export type *`): every key the board reads required, an unknown key dropped. `satisfies` misses a schema narrower than
  its type (a word left out, a `null` refused, a `?` key required) and a `Schema.Any`: read the schema against the type.
- A write sends with `send` (`lib/api/read.ts`) through a schema beside its answer's type, with `may` words saying what to look at before
  sending it again; an answer that does not decode is an `UnreadAnswer`, never a refusal.
- A mirror narrower than the api's type drops the key on decode, and a write that sends the read back loses it (the builder's save, a
  step's `workspace` and `slot`): diff the mirror against the api's type, key by key, before writing its schema.
- `Schema.Union` takes the first member that decodes and drops the keys it does not know: put a member that owns more keys before one it
  extends (`StepArtifactSchema`, `RunDecisionSchema`), and prove the order with an answer the wrong order strips.

## Node tests of `src`

- `assert.deepEqual(x, [])` from `node:assert/strict` narrows `x` to `never[]` after it: assert on its length, or compare a copy.
- No directory import in a module a test reads (`./api` is a folder Node refuses): a helper a test reads uses file imports only.

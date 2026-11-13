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
- `theme/` is generated, never edited: change `DESIGN.md`, then `npm run theme:generate` from `apps/web` (the kit's generator, `npx tsx
  src/components/ui/ds/tokens/generate-theme.mjs DESIGN.md --out theme`), and read the warnings in `theme/DESIGN.resolved.md`. CI's build
  job runs it and `npm run build`, and refuses a `theme/` or a `src/routeTree.gen.ts` whose committed bytes are not what they write. A face the `DESIGN.md` names is loaded by
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
- `npm run e2e -- --shard <i> --of <n>` visits shard `i` of `n`, dealt from the pages that exist round-robin in their order (`shardOf`,
  `e2e/pages.ts`): a run of some pages like `--pages`, so no whole run and held to no bound itself. It writes its page times to
  `pages-<i>-of-<n>.json` where the pictures go (`$WF_ARTIFACTS`, else `.e2e/`), and `node test/e2e/pages-bound.ts <dir>…` sums every
  shard's together against `PAGES_BOUND_MS` — the bound being the whole run's and additive — refusing a shard that is missing, doubled or
  of another run. CI runs the e2e in four shards and that command over them (`.github/workflows/ci.yml`).
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
  on <url>`; `npm run board:stop` ends its holder, which else ends by itself. A holder that ends before it serves leaves
  `hold.log` in its folder, and the refusal quotes its last lines and its path; its api is given no `NEMIA_BIND` or `WF_EXPOSED` (`apiEnvOf`).

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
  date-fns's default English, wherever the browser is. `clockWord`, `whenWords` and `fireWord` each decide their day
  (`isSameDay`, `isSameYear`) and take the time from it; `agoWords` decides no day and takes no zone, a distance having neither.
- A whole instant has one writer, `lib/instant.ts`: text on a page is `instantWords` (`7:08 PM` today, `9 Oct 5:30 PM`, `31 Dec 2025,
  4:10 PM`: a comma after a year alone), a `title` is `instantWhole` (`12 Oct 2026, 7:08:53 PM`), the Timeline's cell is
  `timeToTheSecond`; a component draws one with `Instant` (`components/time/Instant.tsx`). date-fns is imported only in the four files that
  write a moment (`lib/timeOfDay.ts`, `lib/instant.ts`, `lib/runWords.ts`, `lib/quota.ts`); a fifth that needs it joins the list with
  its reason.
- A time on the runs page is `whenWords`, and how long ago something was, in a table's column, is `agoWords` (`3 minutes ago`, `4 months
  ago`, `just now` under a minute; date-fns's `formatDistanceStrict`, which writes no `about`), the board's only writer of how long ago
  (the quota's age, the daemon's line and the queue's ghosts too), the whole instant staying on hover (`instantWhole`); a date's parts
  are `dateParts`. A schedule's far fire is `instantWords` (`14 Oct 12:00 PM`, `1 Jan 2027, 4:00 AM`); `whenWords` keeps dropping the
  time in another year.
- How long something took has one writer, `durationWords(ms, grain)` (`lib/duration.ts`): to the second (`45s`, `12m 04s`, `1h 05m`,
  `1d 2h`) for a try, a turn, a run's clock and Facts; to the minute (`under 1m`, `3m`, `1h 30m`) for a breakdown's rows, a wait, the
  strip, a step card, the quota's keep and the pause's `cut in`.
- An amount of money has one writer, `dollars` (`lib/money.ts`), by the package's rule: `$0.004` under a cent, `$12.50`, `-$0.13`, `—`
  for none; a budget as its author writes it is `budgetWord` (`$16`, `$2.50`). How a run ended, its word, sentence and hue, is `ENDED`.
- What this browser keeps (a layout, the open runs, the chat's unsent message) goes through `lib/stored.ts`
  (`readStored`, `store`, `forgetStored`), never `localStorage` by hand. A copy control's copied or failed moment, 1500 ms, is `useCopy`
  (`lib/useCopy.ts`); a media query is `useMedia` (`lib/useMedia.ts`), which `useIsMobile`, `useSheetPreview` and `useReducedMotion`
  read; a frame's size is `useFrameSize`, never a ResizeObserver by hand.
- A page lays out by its column, never by the window: the frame's `<main data-frame-page>` is the named container `@container/page`
  (`routes/__root.tsx`), narrower than the window beside her docked sheet. A page's or a part's layout variant is `@<size>/page:` by the
  window's step less the open rail (`sm`→`@md`, `md`→`@lg`, `lg`→`@3xl`, `xl`→`@5xl`), a `max-` one written as its complement (Tailwind
  writes no named `@max-`); a window breakpoint stays only where `KEPT` says why (the bar, a portaled sheet), held by
  `test/page-room.test.ts`. The Overview's strip wraps by its frames' own widths (`components/frame/OverviewStrip.tsx`).
- An approval is `useApprove` (`lib/useApprove.ts`) wherever a person approves; an ending's warning is `endingWarning` (`lib/gate.ts`),
  the card's and the gate's confirm alike. A run's wait on runs, or its hold, is drawn by `components/run/RunWait.tsx`, a proposal's
  phase tag and Widens mark by `components/gate/ProposalTags.tsx`, and a graph's edges from `StepGraphFacts` (`stepEdges`).
- A class string two features share (a button, a field, a popover, the floor's frame) is `lib/classes.ts`'s, never a feature
  component's export.
- A followed stream's event is decoded by `streamDataOf` (`lib/api/stream.ts`); one that does not decode is an `UnreadAnswer`, which
  `follow` says as its could-not-be-read line while the stream goes on.
- No export of `src` is dead: `test/dead-exports.test.ts` refuses a name no other file of `src`, `test`, `.storybook` or `contracts`
  imports. Unexport a name used only in its own file, delete one used nowhere; the vendored folders, stories, `main.tsx`,
  `routeTree.gen.ts`, a route's `Route` and the look's door are exempt.
- A colour says one thing: `yours` (waits on a person), `alive`, `money` (an amount), `rest` (grey, and sage for done) and `failure`.
  `src/styles.css` reads each from a theme role once (`--meaning-*`, `bg-yours`); `lib/meaning.ts` holds the drawn forms, each class a
  whole literal.
- A cut corner is a shape of its own under unclipped content: `look/cut.ts`, `look/CutFrame.tsx`, `look/CutButton.tsx`, with
  `cutShape`, `cutRing` and `cutPoints` for a new part that takes one; the copy control is `look/CopyId.tsx`.
- The look's own parts are `src/components/look`, taken through its door (`index.ts`) by every file outside it; each has its stories
  beside it (`<Part>.stories.tsx`), one a state. A breakdown is drawn once, by `look/Breakdown.tsx`: `BreakdownRows` for its rows and
  its foot, `BreakdownPreview` for the kit's rich tooltip over a focusable trigger the caller gives — the look's `StatTile` hangs its
  sticker there and both runs tables their Clock cell (`components/run/RunClockCell.tsx`) and their Cost cell (`components/run/RunCostCell.tsx`,
  the run's tokens by kind, `tokensBreakdown`), and the Overview's Spent tile today's tokens, so the card and the rows say one thing.
- What a run's Clock says has one writer, `runClock` (`lib/factory.ts`): a card says a sentence, a table's row the time at work alone
  and `not started` for a run nothing of which is filed (`place: 'row'`). The breakdown under it is `clockBreakdown`
  (`lib/breakdown.ts`), whose head is verbatim the words the tile or the cell shows and whose foot is the wall time its rows add up to.
- A write that changes a run calls `runsMoved` (`lib/runWrites.ts`), once, given the run where it has one, which reads the run's record
  (`exact`) with the list: never `['runs']` nor `['runs', id]` by hand (`test/run-writes.test.ts`); a key that stands for every key
  under it is said by `filterOf` (`lib/feed.ts`), which the feed invalidates through. `['runs-finished']` stands for every page of the finished
  runs' RunList read (`status.state=finished`), each factory's and from whichever token (`filterOf`, `polled`, `runsMoved`).
- Both conversations follow their stream through the one `follow` of `lib/follow.ts`, each handing it a `Follower`: a step's is
  `lib/following.ts`, her chat's `lib/chatFollowing.ts`.
- Both conversations are drawn by the one family of `components/conversation/` on the one turn shape of `lib/conversation.ts`, each
  mapping its own events onto that shape through an adapter of its own: her chat's is `chatItems` (`lib/chatFollowing.ts`), a step's
  session's is `sessionItems` (`lib/sessionItems.ts`, beside the fold it reads, `lib/transcript.ts`). A family part writes every data
  mark under the prefix its caller names (`mark`), never a `data-chat-` of its own and never a prefix quoted at the call — hers names
  `chat`, a step's session `session`, and `test/conversation.test.ts` reads both forms off every `.tsx` of the folder — and what is one
  conversation's alone stays in that conversation's folder: hers is `components/nemia/chat/` (her kept message, her asks), a step's session's
  is `components/step/session/` (its brief, its told turns, its closeout, its bands, its composer).
- How the frame stands around its one side sheet — what it shows (what the address's `?bar=` names, else Nemia's chat), the rail folded
  for it under 1600, docked or modal — is `frameFold` (`lib/frameFold.ts`, proved by `contracts/frame-fold.contract.ts`), read through
  `useFrameFold` and never written to the `sidebar_state` cookie; the sheet is `components/frame/FrameSheet.tsx`, a bar's panel in it
  `components/frame/BarPanel.tsx`, her face `components/nemia/NemiaRailFace.tsx`, her sheet's state and panel
  `components/frame/HerSheet.tsx`, and her presence for both `useNemiaPresence`.
- A step her message links to (`/runs/<run>?step=<step>`, read by `broughtOf` in `lib/stepLink.ts`) is drawn under her words by
  `components/nemia/chat/ChatBrought.tsx` from the run's page's own parts, never a copy: `GateBrief`, Decide's `AnswerRow`, `Continue`,
  `AskedRow`. Which one is `broughtPart` (`lib/brought.ts`, proved by `contracts/brought.contract.ts`), off the run's page's own reads.
- A proposal her message links to (`/factories/<factory>/proposals/<name>`, read by `proposalLinkOf` in `lib/proposalLink.ts`, held to
  the link `nemia.md` teaches by `tools/guards/test/proposal-link.test.ts`) is drawn under her words by `components/nemia/chat/ChatProposal.tsx`
  from the proposal page's own part, `components/gate/ProposalCard.tsx`, never a copy; its Approve and Decline are `proposalOffers`
  (`lib/proposals.ts`, proved by `contracts/proposal.contract.ts`). Her action ask, the chat event kind `proposal`, is `ChatActions`.
- A person's word for a step's state has one writer, `PERSON` in `lib/words.ts`, a total `Record<StepState, PersonWords>`: its rail word
  (on the chip, the rail and the card's tag), what it means on hover, and the words of its wait for a state that waits on a person. The
  run's own waits (`RUN_WAITS`) and how a run ended (`ENDED`, `called off` for `cancelled`) sit beside it. Where the board's word differs
  from the code's, it is translated there alone: `status.ts` reads the codes, `runWords.ts` and `stepPart.ts` compose.
  `test/structure.test.ts` refuses a rail word spelled elsewhere, a retired phrasing (`waits for you`, `check refused`, `not signed`,
  `cancelled` said to a person) and a runtime word (`journal`, `engine`, `WF_MAX_RUNS`) on hover.
- A value two files under `lib/api/` need sits in a sibling that imports no sibling: the word a route kept on Hono reads for a workflow's
  origin (`sourceOf`) and a card entry copied (`cardEntryOf`) sit in `library.ts`, which `workflows.ts`, `agents.ts`, `skills.ts` and
  `inbox.ts` all read.
- A kind of `objects` (the Run, the Card, the Factory, the McpServer, the Schedule, the Hire, the Volume, the Workflow, the Agent, the
  Skill) is read through `lib/api/objects.ts`, never a schema of the board's: its client is made from `objects`' `Api`, and each call
  rejects with `ReadRefusal`, `WriteRefusal` or `UnreadAnswer` (`lib/api/read.ts`). The inbox's entry is made of a `Card` in one place (`entryOf`,
- `lib/api/inbox.ts`), and the pages' view of a factory of a `Factory`, its `FactoryCommands` and its schedules in one place
  (`factoryViewOf`, `lib/api/factories.ts`), which `factoriesQuery` reads together. A hire is written to its `Hire`, named
  `<workflow>.<step>`; a server's header is served as the mask (`HEADER_MASK`), and a form sends it back unchanged to keep the value.
  A definition is seen as the board's view of its kind in one place each — `workflowViewOf` (`lib/api/workflows.ts`), `agentViewOf`
  (`agents.ts`), `skillRowOf` and `skillDetailOf` (`skills.ts`) — read in `default` where the board has no factory, else in the factory's
  namespace; the Agents and Skills pages read each origin whole (`?origin=`), shadowed or not, and a page's `$from` is the origin, `factory`
  among its words, a definition of the factory's own offering no write and saying its way (`FACTORY_WAY`, `lib/factories.ts`). A save of
  the builder sends each step as its file writes it (`writtenStepOf`). A step's page, a start and a card's `from:` read
  the factory's tree as `repo` (`sourceOf`), and an address naming `repo` finds a workflow of the factory's (`fromMatches`).
  `test/structure.test.ts` refuses a `*.gen.ts` under `src/lib/api` and a Schema of `src` named as a kind of `objects`.
- Every answer of the api is read through the objects' client (`call` of `lib/api/objects.ts`, with `read` or `write`), its type
  `objects`' own: no file of `src` but that one calls `fetch`, and no `Schema.Struct` of `src` has the keys of a struct `objects`
  answers (`clientBreaks`, `test/api-files.test.ts`). Where `objects` carries a part as JSON (the capabilities' lists, a pass's phases,
  the stats' totals) the board decodes the keys it draws from that part, saying beside it why the copy stays. The streams stay
  `EventSource`s of the same paths, each event's data decoded by `objects`' schema of it (`STEP_STREAM_SCHEMAS`,
  `CHAT_STREAM_SCHEMAS`). A file imports each read from its own file under `lib/api/`: there is no barrel.

## Invariants no test holds

- The React Compiler compiles `src` at build (`@rolldown/plugin-babel` after the router's plugin, which splits the routes it must see,
  and before `react()`, in `vite.config.ts`); the node tests load `src` uncompiled, so only the build and the e2e test the compiled app.
  A function it skips is logged at build as `React Compiler skipped <file>:<line>: <why>`: read the build's output. A memo lists what its
  body reads, and an array rebuilt on every refetch goes through `useContent`.
- A link to a route is `routeLink` (`components/nav/routeLink.tsx`), under the root's `RouterProvider`: Enter on a React Aria link is two
  clicks, and each would navigate.
- A suspense query keeps what it showed when a read fails: a page that must say a thing is gone reads the query's `error`, and a query
  whose 404 is an answer does not retry it (`readGone`, `retryUnlessGone` in `lib/api/gone.ts`, for a run's, a fact's and a proposal's read alike).
- A query keyed by the state it answers for is not invalidated by a write: a write invalidates the run's record alone (`exact: true`).
  A run's step sub-resources (its tries and told, `lib/api/run.ts`) are keyed by `stepStamp` (`lib/lifecyclePath.ts`) and never named by
  a step's event on the feed; a run's event, a removal and a write (`runsMoved` given the run) read every stamp of them by prefix.
  A run is drawn from its view (`lib/runView.ts`): `useRunView` on a route whose loader read it (`loadRun`), `useRunRead` where none
  did (a bar, a preview, a try), undefined until the object, the lines and every step's reads are in, so it is drawn whole.
- `refetchInterval` is read again only when the query changes: `useFeed` reads the active polled queries once whenever the feed's stream
  opens or goes down (`pace` in `lib/feed.ts`), which is also what a stream from the feed's end does not carry.
- An `EventSource` is closed on the `error` fired as the response ends, or after a grace (`follow`), never on the last event.
- Send what the current choice takes, not what hidden state holds (`afterFor`).
- A form keyed on an agent's version is thrown away with its draft when a write beside the agent moves the version (`keptAfterCopy`,
  `formKeyOf` in `lib/agents.ts`).
- A step's state is read from the codes the api carries (`phase`, `reason`, a check's `verdict`), never from its sentence (`message`),
  which is shown as it comes. A reason the api adds is in `objects`' words the board reads (`STEP_REASONS`), and the compiler refuses the
  board until `STATE_OF` (`lib/status.ts`) draws it: add its state there, its drawing
  (`stateDrawn`, whose hue gives the chip's class and the minimap's fill) and `offersOf`, and its words in `PERSON` (`lib/words.ts`:
  rail, meaning, and the words of its wait if the api lists it as waiting on a person), in the same change; the compiler refuses a state
  `PERSON` lacks. A card's kind is its phase's (`kindOf`).
- A page that must agree with a verb's refusal reads the package's decision (`Decidable.awaiting`), never the list's `toDecide`.
- A read or a write decodes its answer with `objects`' schema (`call`, `lib/api/objects.ts`): every key it declares required, an unknown
  key dropped; a write says with its `may` words what to look at before sending it again, and an answer that does not decode is an
  `UnreadAnswer`, never a refusal. A schema the board still keeps (`decodes<X>()(…)`, `lib/api/decodes.ts`) is refused at compile time
  where its decoded type is not `X` both ways — a word left out, a `null` refused, a `?` key required, a `Schema.Any`.
- `Schema.Union` takes the first member that decodes and drops the keys it does not know: put a member that owns more keys before one it
  extends (`objects`' `StepArtifact`, `RunDecision`), and prove the order with an answer the wrong order strips.

## Node tests of `src`

- `assert.deepEqual(x, [])` from `node:assert/strict` narrows `x` to `never[]` after it: assert on its length, or compare a copy.
- No directory import in a module a test reads (`./api` is a folder Node refuses): a helper a test reads uses file imports only.

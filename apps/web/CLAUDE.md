# apps/web — the board

The board owns what a person sees and clicks. It reaches the api over HTTP alone: it imports no package, names no store path, and builds
no command of its own — a command or a store folder it shows is text the api answered.

The board is Vite, React, TanStack Router and Query, React Flow, and shadcn's components on React Aria (`aria-nova`). Its node tests
(`test/*.test.ts`) load `src/` as Node does; its e2e (`test/e2e/`) drives the built app in Chromium.

Two component families draw from one palette. shadcn's (`src/components/ui/*.tsx`) are what many pages still use; it is retired, and
no file gains an import of it, nor a control drawn by hand (`test/stories.test.ts`), and `test/destinations.ts` says where each
of its parts moves. The design system kit (`src/components/ui/ds`, Material Design 3 on React Aria)
is the board's one system, which it moves to a component at a time. The look is `DESIGN.md`,
and `theme/` is what the kit's generator makes of it; `src/styles.css` imports the theme and writes the four meanings beside it, and
no file of the board names a colour of shadcn's (`test/shadcn-names.test.ts`).

The traps of the board's tools — what Chromium, Playwright, React Flow, React Aria, the React Compiler, the e2e runner and the kit's
class merge do, which no test refuses — are *The board's traps*, at the end of this file, read by whoever changes the board before
they write. How a session reaches shadcn and the kit's skills is *shadcn and the kit's skills*, and the look's parts are *The look's parts*.

## shadcn and the kit's skills

How a session reaches the board's components and the design system kit's skills. The paths of this section are from the workspace's
root.

1. **Move your shell into `apps/web` first**: `cd apps/web` from the workspace's root, where a session moves before its first
   command. The board's components are shadcn's on React Aria, and shadcn's skill reads the project as it loads, by a command that answers only where
   `components.json` is: from the root it refuses with `monorepo_root`, and the skill is not loaded.
2. **Then load `shadcn` with the Skill tool**, before you read or write a component, and go back to the root (`cd ../..`) once it has
   answered: the checks run from there.
3. **Where your fence refuses `cd apps/web` and that skill** (a step that designs or reviews), move nowhere: read
   `.claude/skills/shadcn/SKILL.md` with Read, and, for the facts its command would have printed, `apps/web/components.json` and the
   files of `apps/web/src/components/ui`.
4. **Its CLI runs from `apps/web`**, or from the root with `-c apps/web`. Its rules know radix and base, not React Aria: on the board
   the reference is what `npx shadcn view <component> -c apps/web` prints, never what you remember: the board's pinned CLI's read
   of the registry's item for its style, which writes nothing, and the one form of the CLI a step that designs or reviews may run.
5. **The project they speak of is `apps/web`**, not the repository's root: their `DESIGN.md`, `theme/` and `components.json` are the
   ones there, and their `<kit>` is `apps/web/src/components/ui/ds`. From the root, `ds-spec`'s command is
   `node apps/web/.claude/skills/ds-spec/md3.mjs <command>`, typed whole and alone, which a fenced step may run too. It is the
   workspace's script in a run too: the copy of `ds-spec` a step is given is read, never run. A fenced step runs none of the commands
   `ds-theme` and `ds-build` name: it reads what they say and the files they point at.
6. **For a part the kit ships, the reference is `ds-build` and the part's own file** under `apps/web/src/components/ui/ds/components`,
   its doc comment first. `shadcn` stays the reference for the board's shadcn components (`apps/web/src/components/ui/*.tsx`) and for
   the CLI that installs either family.

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
  `src/styles.css` from its npm package, under the exact family the package registers (`Michroma`, `Barlow`, `Chakra Petch`, `JetBrains Mono`),
  and given to the theme's hook (`--font-michroma`); the label face (`Archivo Variable`, `--font-label`) is the board's own.
  The symbols none of the five has are drawn from two faces served with them, declared under each family by
  `src/components/look/symbols.css`: Noto Sans Math for `← → ↗ ≥ ✓ ⧉`, and the symbols subset of Noto Sans Symbols 2 for `✗`, which
  Noto Sans Math lacks. Each rule's `unicode-range` is its face's characters alone, one rule per face `styles.css` loads, its
  descriptors exact: a character the board adds that its faces lack joins every rule of the symbol face that has it, so no reader's
  system font draws it.
- The kit's corners (`rounded-shape-*`) follow `DESIGN.md`; shadcn's (`--radius`) are the board's own.
- Classes merge through `cn` of `src/lib/utils.ts`, built from the kit's `twMergeConfig`.
- A scroll bar is drawn by `src/styles.css` from `data-scroll-bar`, which `markScrolls` (`lib/useScrollMark.ts`) writes on what scrolls.
- The shadcn skill's CLI runs from `apps/web` (where `components.json` is), and `@/` is declared once, in `tsconfig.json`'s `paths`;
  Vite reads it from there (`resolve.tsconfigPaths` in `vite.config.ts`).

## The look's parts

The look's own parts, for a cut, a plate, a tile or a rail, are in `apps/web/src/components/look`, taken through its door (`@/components/look`), never from a part's own file. `CutFrame` for a card
or a table in a cut frame (with `FRAMED_BOX`, `FRAMED_TABLE` and `FRAMED_ROW` around a table), `TableAtCut` in place of
`FRAMED_BOX` for the box of a table that ends its frame (nothing under it, the runs in flight, the tokens), which keeps its scroll bar past the
cut and paints the hover, pressed and focus states of the interactive row at its foot in the kit's colours on a layer in the cut's
shape, where the kit's ground would fill the cut corner square, `CutTag` for a tag
with a cut corner, which takes off the border, ring and outline of what it holds and draws its own edge with `edge` (an outlined tag,
a hairline) and its own focus ring in its cut, `CutBubble` for the agent's words in a cut bubble, `CutIconPress` for the kit's tonal
icon button in a cut (a composer's send), `CutButton` for the filled cut button that is a link to a route and `CutPress` for the one that is pressed,
`CutCue` for a cue in a small cut frame beside a face or in a header, `MeaningTag` for a tag in a meaning's colour at the kit Tag's metrics (a session at work, which the theme's ink `secondary` no longer says), `CutField` for a box that holds a field, whose edge lights round its cut when the focus is in it, which keeps what it holds inside its diagonals and sets a control given as `end` in from its cut; `Plate` for a section's heading and `PageName` for
a page's name; `Sticker` for a tile that carries a number and `StatTile` for one over its breakdown; `BreakdownRows` for a breakdown's rows and
`BreakdownPreview` for one hung off a focusable trigger of your own; `StepGraph` for a run's steps as its workflow's graph;
`Run` for a run at any of its five sizes, from its mark in a sentence to the floor's opened panel (`RunMeta`, `RunClock` and
`RunCost` for its parts a table draws alone, `QuietLabels` for a run's labels said quietly, `HoldLine` for a held run's hold under
its row's words, `AssigneeLine` for who has a run in hand, after the hold's, `RunMark` for another run named in a run's words); `Reading`
for what a page or a part draws while its first read is out, the kit's `SkeletonGroup` named by the line it replaces around the kit's
`Skeleton`s in the shape of what is coming, held back a moment so a fast read draws nothing (`reading.css`), and `ReadingLines` for its
lines of text; `Pending` for a wait still out drawn small, the kit's circular `ProgressIndicator` in the ink of what holds it: a kit
`Button`'s `icon` while its press is out (`CutPress` takes `pending`), or a tag's glyph while a fix or an upgrade is at work;
`ScanLines` for the ground of a page; `Pager`, `TextLink` and `CopyId`; `HeldTooltip` in place of the kit's `Tooltip` inside a
`TooltipTrigger` whose trigger is no kit control, drawn only where its trigger stands and, with `repeats`, only while the text it says again is cut; `RadioTileGroup` and `RadioTile` for one choice among a few, each a tile with its title and its line (the kit's `radio-tile-block`, copied in); `CheckTileGroup` and `CheckTile` for several choices among a few, their twin on the kit's checkbox; `Trace` for
what an agent did, a line a step (`TraceLine`, with `TraceIcon`, `TraceTitle` and `TraceDescription`; `TraceCollapsible`, its
`TraceCollapsibleTrigger` and `TraceCollapsibleContent`, for a step that opens), and `Marker` for a quiet line across a conversation. Each is shown in its stories beside it
(`<Part>.stories.tsx`): `npm run storybook`, from `apps/web`, serves them to a person on port 6007, and a step looks at them
through `storybook dev` on a port of its own (*Build and e2e*). A new part of the look gets its stories in the same change, and its name
here.

## Build and e2e

- `npm run build` regenerates `src/routeTree.gen.ts`: a new route file fails `typecheck` until a build has run once.
- `npm run e2e -- --pages <the pages the change touches>` runs its assertions in the dark theme, `--photos` too when pictures are due,
  which pictures them in dark alone, and `--light` beside it when a light picture is asked for on purpose (`themesOf`, `e2e/pages.ts`);
  `ci` shards every page on the round's commit. It runs none of the look's browser tests: add `--look` (`npm run e2e -- --look
  --pages <…>`, or `--look` alone) when the change touches a part of the look, a story, `test/e2e/stories/` or a runner file beside the
  pages (`visit.ts`, `checks.ts`, `contrast.ts`). A run ends by naming its slowest pages and each worker's time, and refuses none of
  it; a whole run's own time past `E2E_BOUND_MS` is said, never refused: it is the machine's, by the workers it gave (`pastTool`,
  `e2e/timing.ts`).
- `npm run e2e -- --shard <i> --of <n>` visits shard `i` of `n`, dealt from the pages that exist round-robin in their order (`shardOf`,
  `e2e/pages.ts`): a run of some pages like `--pages`, so no whole run. CI runs the e2e in four shards (`.github/workflows/ci.yml`),
  each saying its slowest pages in its own log; a shard runs no look test,
  and CI's `e2e-look` job runs them once (`--look`, refused beside `--shard`), its `e2e-stories` job every story beside it.
- `npm run e2e -- --photos --contrast` visits light, then dark, and writes each picture's text pairs beside it (`e2e/contrast.ts`); `node test/e2e/contrast-report.ts
  <dir>` makes `contrast.md` and `look.html` there and exits 1 on a pair under 4.5:1. A measure, never a check of every run.
- `npm run e2e` hands its pages to workers one at a time (`queueOf`, `e2e/workers.ts`), each a process with its own seeded store, api,
  `vite preview` and Chromium (`e2e/worker.ts`); `--workers <n>` sets how many, else the machine does (`workersFor`), and either way free memory caps it: `--workers` can lower the
  count, never raise it past what free memory holds, and a run given fewer than it asked says so before it starts them.
- A run of the e2e builds the app once, and not at all where `dist/` is already the build of the sources as they stand (`current`,
  `e2e/built.ts`: the board's files but its tests, `objects`' and the lockfile, by size and time of change; never in CI); `rm -rf dist`
  makes it build. A worker stops at its first failing page, and its seat starts another on a fresh store for the pages left
  (`startsAgain`, `e2e/workers.ts`), so one run names every failing page of its batch, five at most, and their names together at its end:
  read them all before running again. The round's `ci` shards visit every page in five minutes and name the ones a change broke,
  where walking them all on one machine takes an hour.
- Once per machine, install each Playwright's browser through the checkout's own `node_modules`, never from an `npx` download (an install
  deletes the builds of every Playwright it does not see): `npx playwright install chromium` for the e2e, and
  `node node_modules/@playwright/mcp/cli.js install-browser chromium` for the steps' `browser_*` tools.
- `npm test` runs `test/*.test.ts`, never `test/e2e/*.test.ts` (those launch Chromium): `npm run e2e -- --look`, and a whole `npm run
  e2e`, build Storybook static once, then run them, two files at a time (`LOOK_TESTS`, `e2e/look.ts`), and a whole run then every
  story (`npm run stories`, `Plan.stories`, `e2e/pages.ts`), `--look` none; `--pages` and `--shard` run none. A web test that needs
  no browser sits in `test/`.
- The stories are the one place the parts are shown, and where a step builds and judges a visual change: write or extend the story
  first, then the part. They draw under one decorator (`.storybook/preview.tsx`: the look's ground, a router of the story's own in
  memory, `data-at` where it stands, a query client of its own that retries nothing, MSW's loader, axe as `error`, and a story the
  holder caught throwing failed after it draws). Storybook's addons are the docs, the accessibility panel, the Vitest addon, the theme switch and MSW;
  the ds kit's own published Storybook is composed beside ours (`refs`), loaded from its site in a person's browser, and no check runs
  its stories. `npm run storybook`, from `apps/web` or the root, is a person's, on port 6007; its toolbar switches the theme, dark by
  default (`@storybook/addon-themes`, the class on `<html>` of `.storybook/scheme.ts`), the board's dark rules copied under that class
  by a PostCSS transform in Storybook's toolchain alone (`.storybook/schemeBuild.ts`), so the board's own build draws what it draws.
- `npm run stories`, from `apps/web`, runs every story through Vitest in Playwright's Chromium (`vitest.config.ts`, the project
  `storybook`): each a smoke test that it renders, its play function, axe, and its approved picture. Every story has one in the dark
  theme, `test/approved/<story id>.png`, and each light canary one in light too, `test/approved/light/<story id>.png`
  (`LIGHT_CANARIES`, `.storybook/approved.ts`); `.storybook/compare.ts` compares the story's ground against it, strictly (pixelmatch's
  0.1, anti-aliasing ignored, no other pixel), on a clock that stands still, in reduced motion, the pointer moved off and a read
  still out drawn at once. It compares only in the pinned place, Ubuntu 24.04 on x64 with the lockfile's Chromium
  (`test/e2e/stories/pinned.ts`, which `npm run stories` runs), as CI's `e2e-stories` job (`runs-on: ubuntu-24.04`) and the steps' server both
  are; anywhere else it says so and compares nothing, but under CI, where it refuses (`placeVerdict`). A story that differs fails, its reference, actual and diff left under `.vitest/attachments/approved/`
  (uploaded by `e2e-stories` on a failure); `npm run stories -- --update <file>.stories.tsx` writes the pictures of a change meant, to
  commit with it. `test/approved.test.ts` refuses a story with no picture and a picture of no story. A whole `npm run e2e` runs it after the look's
  tests (`LOOK_RUNS`, `e2e/look.ts`), `--look` never; CI runs it in its `e2e-stories` job, beside `e2e-look`; `npm test` never does. One file:
  `npm run stories -- <file>.stories.tsx`. It runs one story file at a time, each a Chromium page of about a gigabyte, on a machine
  whose memory is shared; one a core under CI (`CI` set); and as many as `STORIES_WORKERS=<n>` asks anywhere, an ask no whole number
  refused as the config loads (`storiesWorkersOf`, `.storybook/workers.ts`, proved by `contracts/stories-workers.contract.ts`), the
  bound said on the runner's first line. A story axe fails today says `a11y: { test: 'todo' }` itself, and the
  count only shrinks.
- A page body's stories (`Pages/`, the runs page's `components/run/RunsPage.stories.tsx` the pattern) answer its reads through MSW
  (`parameters.msw`), with handlers over fixtures typed by `objects`' own types (`.storybook/fixtures/`), so a key the api renames
  fails the typecheck there; no file of `src` gains a seam for a story. MSW's worker, `.storybook/public/mockServiceWorker.js`, is
  written by `npx msw init .storybook/public --no-save` and served to Storybook alone. No story reaches the network: a request no
  handler of its story answers, to the api or to another origin, is answered with a network error by the preview's fallback and fails
  the story after it draws, naming each (`strayHandler`, `straysSaid`, `.storybook/network.ts`, which strays proved by
  `contracts/story-stray.contract.ts`): answer it with a handler in the story's `parameters.msw`.
- A story that reads the api, through MSW handlers or with none, is tagged `network` (Storybook's `tags`, at its meta or on itself), and
  one that opens a layer over the whole window at rest `overlay`: the design system's producer (`tools/design-system/README.md`)
  draws neither in a card, refuses a story with handlers and no tag, and its CI job names a story that waits on the api untagged.
  The stories' stage (`.storybook/stage.tsx`: the ground, the router, the query client) is the producer's `NemiaRoot` too.
- `test/stories.test.ts` holds the stories (`test/stories.ts`, the rules): a title opens with `Look/`, `Frame/`, `Store/`,
  `Factory/`, `Run/` or `Pages/`, by where the part sits, with no exception; and, each against the baseline, whose
  lists only shrink, a component or page body of `src/components` with no story beside it (never `ui/` or `ai-elements/`), a story
  given no args, each name a file takes from shadcn's `components/ui/*` or React Aria outside the kit and the look
  (`<file>#<module>:<name>`), each control a file draws by hand (a raw `<button>`, `<input>`, `<select>` or `<textarea>`, or an
  import of `lib/classes.ts`'s control strings, `handDrawn`; an input whose literal `type` is `checkbox` or `radio` is keyed by it, the kit
  drawing each with its own part), and the `todo` stories. `test/rulebook.test.ts` holds the rules of `DESIGN.md` the pages do not
  yet obey to four more lists of the same baseline: a kit accent role the board's parts write (`accentRole`), a `money` class or variable,
  which no cost writes any more (`money`, kept empty so the word cannot come back), a raw type class where the kit's primitive belongs (`rawType`) and a surface role of the kit's (`kitSurface`, kept empty as `money` is). A
  primitive's size stepped at a breakpoint, its type class beside its family under one variant as the kit's `Typography.tsx` writes it
  (`@lg/page:text-display-small @lg/page:font-display-small`), is no `rawType` entry. The four most-read pages' own view, every file of
  `src/components` and `src/routes` their routes' imports reach (`READ_PAGES`, walked by `test/reach.ts`, the walk the stories'
  hand-over shares), holds no raw type class at all, listed or not; the walk stops at the files that open a view of their own over the
  page (`OVER`, each with why: `run/RunMenu.tsx`, `run/ApproveModal.tsx`), whose dialogs and popovers keep their type for a later card.
  `expectTwoDeep` (`test/e2e/checks.ts`), asserted by those four pages' e2e files, refuses a text three boxes deep (`DESIGN.md`: a view is
  two boxes deep at most), naming each and the boxes it sits in. The
  baseline is a folder, `test/baseline/<list>/<path under src>.txt`, a file per list and source file holding that file's entries one a line (`shardOf`,
  `test/baseline.ts`, proved by `contracts/baseline-shard.contract.ts`), so that a cut deletes a file and two runs' cuts never meet in one
  file, which git merges clean. A file you mend is cut from its list in the same change: its line, or the file where it is the last
  (never left empty); the test refuses a list that keeps it, an entry in another file's place, an empty file and any other file there. `test/destinations.ts` maps each name and control to where it moves (a part of the
  kit, of the look, the frame's own state, plain markup, an ask of the kit, or exempt: `RouterProvider` alone), and the test refuses a
  key taken that it does not map and a key it maps that nothing takes (`mapGaps`, proved by `contracts/destinations.contract.ts`).
- One component system: the ds kit. shadcn's `components/ui/*` is retired, a page at a time, and React Aria is imported only inside
  the kit or a part of the look. A generic part the kit lacks is asked for upstream (french-tech-homies/design-system); one that is
  Nemia's alone is a part of the look, with its stories.
- `node test/e2e/stories/changed.ts --base main-worktree/HEAD --out <dir>`, from `apps/web`, hands what a change did to the look:
  the approved pictures its own commits added, changed and removed, read from git, and for each changed `before-`, `after-` and
  `diff-<name>.png` (`<name>` the story's id, `-light` after it for a canary's light picture), and `approved.json`; it draws nothing.
  Before it writes, it removes from `--out` what an earlier pass wrote there (each `before-`, `after-`, `diff-` and `match-*.png`, and
  `approved.json`). A changed part no story reaches (found by its imports, `storiesTouched`, `e2e/stories/touched.ts`, proved by
  `contracts/touched-stories.contract.ts`) is refused, exit 1, named. `--list` prints the stories the change reaches, the bare parts
  and the pictures as JSON; `--changed <path>…` names the paths instead of git. `--targets <dir>` sets each
  `target-<story id>[-light|-dark].png` there beside its story's approved picture, one height, captioned, as `match-<id>-<theme>.png`
  (`e2e/stories/targets.ts`): a light target only of a canary, the others refused.
- What a person does to a part — a press, the keyboard, the focus, where a link leads, what a press opens — is its story's play
  function (`play`, its helpers `.storybook/play.ts`), run by `npm run stories`. What needs the browser's own input or reads pixels
  stays a browser test under `test/e2e/` (`cuts.test.ts`, `bars.test.ts`, `motion.test.ts`, `secondary.test.ts`, `menu-key.test.ts`), each story opened
  alone in Storybook's static build at `iframe.html?id=<id>` (`openStory`, `e2e/stories/built.ts`), which `--look` builds once and names
  in `LOOK_STORYBOOK`, and a test run alone builds itself: the pixels (`e2e/pixels.ts`), Enter on a link, which the browser turns into a
  click and a play function's keys never do (`e2e/keys.ts`), CSS's `:hover`, reduced motion and the dark theme. `node
  test/e2e/look-photos.ts` pictures every story and the look's close-ups in dark, for a person, and in light first with `--light`.
- **A step looks at its visual work through `storybook dev`**, from `apps/web`: `npx storybook dev -p <a port of its own> --no-open
  --ci` (never 6007, the person's, nor a port another run holds), kept by its pid in the step's own files, and each story read at
  `http://localhost:<port>/iframe.html?id=<story id>`; an edit shows in under a second. It holds about 2.5 GB while it runs, which
  counts against the step's memory limit: stop it, by that pid, before a Vitest run, a build, the e2e or the typecheck.
- `npm run board:serve` (`e2e/serve.ts`) builds outside the workspace and serves one board a workspace, on a seeded store of its own
  (`e2e/served.ts`, the worker's serving code too), for what needs the api and the whole board; it prints its address, its api's, and
  on a third line the person's token its store keeps, `token <token>`, which a browser pastes on the board's token page: every api route
  asks for one, loopback too; `npm run board:stop` ends its holder, which else ends by itself.
- Every api route asks for a token, so each browser context the e2e opens on a worker's seat is given the seed's (`SEAT_TOKEN`) as the
  board's cookie before a page loads (`seated`, `e2e/served.ts`; `visitAll` does it for every page), and a request made from Node presents
  it as its bearer (`bearer`); a context meant to meet the token page is opened bare. A holder that ends before it serves leaves
  `hold.log` in its folder, and the refusal quotes its last lines and its path; its api is given no `NEMIA_BIND` or `WF_EXPOSED` (`apiEnvOf`).

## Writing an e2e page

- A page is a file of its own, `test/e2e/pages/NNN-<name>.ts`, default-exporting a `PageSpec` named `<name>`, plus the line `<name>` at the
  end of `pages/NAMES`; touch nothing else. Pages are numbered in tens and handed out in file-name order. Shared helpers go in
  `board.ts` or `canvas.ts`, runner state in `world.ts`, the seed in `seed.ts`.
- Every page is visited in dark; `--photos --light` visits it in light, then dark, in one store: a fixture a second page's close would show is
  taken back before the close.
- A page run against the old code proves only its first failing assertion: to prove each new one, skip the earlier ones in a throwaway
  edit, run, and put the page back.
- The store is in `/tmp`, which a boot can empty under a running check: when a failure says the store is gone (`storeGone`), run again.
- Anything a check runs that can fail says why last, on stdout too (`exitOn`, `headlineOf` in `visit.ts`).

- Each worker seeds its own store; a page reads only the seed and what it writes itself, takes its write back, and passes alone
  (`--pages <name>`) or after any other page. A worker whose store is not its seed at its end fails, naming the files (`leftOver`,
  `apps/web/test/e2e/print.ts`); a file the api writes as it serves goes in `UNPRINTED` there, with why.
- A page's own pictures are taken only under `--photos` (`photograph` and `photographCard` do nothing otherwise, `photographing` in
  `world.ts`): a page asserts nothing through a picture, and leaves no state a picture's zoom would have reset.
- Name a page's own pictures `<name>-<what>-<theme>.png`; `<name>-<theme>.png` is the runner's: a run that pictures the page overwrites
  it, and a run that does not leaves an earlier run's where it is.
- The watch counts every 4xx against a page: a refusal made on purpose gets a page of its own whose watch expects exactly it.
- A stream the page closes before the api has answered it is a failed request the watch counts too, only the frame's own streams being
  let go: a page that leaves a conversation's stream open on its way out is counted against, not the frame's feed.
- A run added to the seed shifts every count asserted about the store (the Factory's tally, the Runs rows and headings): run the e2e to
  its end. A test about the pages reads the pages that exist, never a hard-coded last page.
- An expectation about a time of day decides as `clockWord` does (same calendar day or not) and writes its time with `timeOfDay`
  (`apps/web/src/lib/timeOfDay.ts`) in the browser's time zone, never a hard-coded form (`030-quota.ts`). `expectTexts` trims, so a
  padded time is compared trimmed or by its `textContent`.
- Wait with `idle(page)` (`checks.ts`), never `networkidle`: the feed stream never ends. A page that edits the store by hand where the
  board must see it says so on the feed, `fed(run, step?, word)` (`board.ts`); the board polls once a minute while it follows the feed.
- A page that changes what the e2e's `claude` answers the quota with reloads with `reloadForQuota(page, state)` (`board.ts`): it waits for
  the state the change makes, never a time compared across processes, nor a longer timeout: each change makes a state other than the last.
- A wait or a duration in the harness or a test reads `performance.now()`, never `Date.now()`: the owner's wall clock steps (`idle` in
  `checks.ts`). An age a page asserts is written mid-minute, never on the minute the board floors to (`290-daemon.ts`).
- A page that holds a read with `route` routes before its `goto`: the feed's replay reads the run again right after the load.
- A page whose state changes at its end waits for what it reads again before its last assertion, or its picture is taken mid-read.
- A diamond's glance is the kit's rich tooltip (`step/StepGlance.tsx`), opened by the pointer and by the focus, never a preview card; a press
  on the diamond opens its step in the frame's bar (`?bar=step:<run>/<step>`), which `059-runs-preview.ts` reads.
- The engine's task view carries no filing time; its feed does: a store written by hand writes `engine/feed.jsonl` too (`seedFeed`).
- A journal line written by hand goes on `engine/feed.jsonl` too, and its take-back cuts the feed back: the api keeps a run judged at
  rest until a line for its tasks reaches the feed (`informerRead` in the orchestrator's `rest/informer.verb.ts`, which also keeps a moving run within the pass that judged it;
  `130-say.ts`).
- A record or journal written by hand is decoded as the tick's and the runtime's are (`StepRecordSchema` in the orchestrator's
  `record.store.ts`, `event-schema.ts`): write each key as they write it — a key they leave out is absent, never `null`
  (`340-agent-try.ts`).
- A package program the e2e runs from a string (`PASS` in `apps/web/test/e2e/world.ts`) is read by no typecheck: after changing what a
  package's program requires, run `npm run e2e -- --pages runs`, which seeds through it.
- `npm run e2e -- --pages` runs none of `test/e2e/*.test.ts`: a change to a part of the look, its stories, `test/e2e/stories/`, or the
  runner's `visit.ts`, `checks.ts` or `contrast.ts` runs `npm run e2e -- --look` (with `--pages` when pages are due too).
- A story of a part lays out with inline styles, never a class of its own, and a node test imports a part by its own file: the look's door
  loads the kit's folder, which Node refuses. A component of the board that needs a state proven in a browser has its stories beside it
  too (`apps/web/src/components/<noun>/<Name>.stories.tsx`, `run/WaitingCard`'s): both hosts read every folder under `components/` but `ui/` and `ai-elements/`.

## Where a thing is written

- A failed read has one writer: a page draws it with `ReadTrouble` (`components/frame/ReadTrouble.tsx`), and a string or a frame of its
  own takes `troubleLine` or `troubleOf` (`lib/api/read.ts`, its words `troubleWords`, proved by `contracts/read-trouble.contract.ts`),
  by the kind of failure: the api's words where it refused, the answer's message where it answered what the board does not read, and
  that Nemia's api did not answer, why, and to reload where nothing answered. No line spells a checkout's command, nor words a failed
  read by hand, nor follows `<what> could not be read: ` with an error's bare `message` (`test/structure.test.ts`, which sees a
  bare message only after those words): a person on an install has no `npm run`.
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
  (`lib/useCopy.ts`); a media query is `useMedia` (`lib/useMedia.ts`), which `useIsMobile` and `useReducedMotion`
  read; a frame's size is `useFrameSize`, never a ResizeObserver by hand.
- A page lays out by its column, never by the window: the frame's `<main data-frame-page>` is the named container `@container/page`
  (`routes/__root.tsx`), narrower than the window beside her docked sheet. A page's or a part's layout variant is `@<size>/page:` by the
  window's step less the open rail (`sm`→`@md`, `md`→`@lg`, `lg`→`@3xl`, `xl`→`@5xl`), a `max-` one written as its complement (Tailwind
  writes no named `@max-`); a window breakpoint stays only where `KEPT` says why (the bar, a portaled sheet), held by
  `test/page-room.test.ts`. The Overview's strip wraps by its frames' own widths (`components/frame/OverviewStrip.tsx`).
- An approval is `useApprove` (`lib/useApprove.ts`) wherever a person approves, the card's and the gate's confirm alike. A run's wait on runs, or its hold, is drawn by `components/run/RunWait.tsx`, a proposal's
  phase tag and Widens mark by `components/gate/ProposalTags.tsx`, and a graph's edges from `StepGraphFacts` (`stepEdges`).
- A class string two features share is `lib/classes.ts`'s, never a feature component's export. Its control strings (the buttons,
  `TEXTAREA`, `POPOVER`) are retiring for the kit's parts and no file gains an import of one; the floor's frame (`FLOOR_BOX`) stays.
- A followed stream's event is decoded by `streamDataOf` (`lib/api/stream.ts`); one that does not decode is an `UnreadAnswer`, which
  `follow` says as its could-not-be-read line while the stream goes on.
- No export of `src` is dead: `test/dead-exports.test.ts` refuses a name no other file of `src`, `test`, `.storybook` or `contracts`
  imports. Unexport a name used only in its own file, delete one used nowhere; the vendored folders, stories, `main.tsx`,
  `routeTree.gen.ts`, a route's `Route` and the look's door are exempt.
- A colour says one thing, one of four meanings: `yours` (waits on a person), `alive`, `rest` (grey, and sage for done) and `failure`.
  `src/styles.css` writes each beside the theme, light at its root and dark under the media query (`--meaning-*`, `bg-yours`), at the
  values of `DESIGN.md`'s table, which `test/meanings.test.ts` holds, with contrast; `failure` is Material's error. A cost is no meaning:
  it is drawn in ink, `failure` past its budget, and its sticker takes the look's `ink` tone (`Sticker`'s `hue: 'ink'`), the Control rung
  under plain ink. `lib/meaning.ts` holds the drawn forms, each class a whole literal, and a tag in one is the look's `MeaningTag`.
- A view, the page and each thing that opens over it, holds at most one filled action, the look's `CutPress` or `CutButton`; every
  other action is the kit's outlined button, and a text action is the look's `TextLink` (`DESIGN.md`, *Ink and the one action*). A
  button of the kit's or shadcn's drawn filled, as words alone or in a variant it cannot read is refused where it is written, with no
  baseline (`buttonForms`, `test/stories.ts`, held by `test/one-action.test.ts`), and a story whose view holds two filled actions
  fails after it is drawn, its play's dialogs open (`overFilled` and `filledViews`, `.storybook/filled.ts`, proved by
  `contracts/one-filled.contract.ts`).
- A cut corner is a shape of its own under unclipped content: `look/cut.ts`, `look/CutFrame.tsx`, `look/CutButton.tsx`. Its
  geometry (`cutShape`, `cutRing`, `cutPoints`, `cutEdge` and `cutHold`) is taken from `./cut` by a part of the look alone, and no
  file outside the look writes a cut, a clip path or a polygon (`test/look.test.ts`): it takes the part that draws one. A part that
  draws an edge draws it as a shape along the whole cut, and one that holds a control at its corner keeps it inside its diagonals.
  The copy control is `look/CopyId.tsx`.
- The look's own parts are `src/components/look`, taken through its door (`index.ts`) by every file outside it; each has its stories
  beside it (`<Part>.stories.tsx`), one a state. A breakdown is drawn once, by `look/Breakdown.tsx`: `BreakdownRows` for its rows and
  its foot, `BreakdownPreview` for the kit's rich tooltip over a focusable trigger the caller gives — the look's `StatTile` hangs its
  sticker there and both runs tables their Clock (`RunClock`) and their Cost (`RunCost`, the run's tokens by kind,
  `tokensBreakdown`), both of `look/RunFigures.tsx`, and the Overview's Spent tile today's tokens, so the card and the rows say one thing.
- A run is drawn by one part, `Run` (`look/Run.tsx`, its recipe `look/run.recipe.ts`), at five sizes: `xs` its mark in a sentence, `sm`
  a line, `md` the runs table's row (`layout="row"`) or the floor's card, `lg` the waiting card, `xl` the opened floor card with its
  graph's steps named and its facts. What each size says is `says` (`lib/runSays.ts`, proved by `contracts/run-says.contract.ts`), each
  saying all the one under it does; each slot carries the things it says as `data-run-says`, which `test/parts.test.ts` reads against it.
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
- The frame is a row over the machine bar (`components/frame/MachineBar.tsx`, `--frame-foot` tall: the gauges, the version, the
  pause): the store's rail (`components/frame/FrameRail.tsx`), a factory's pane on a page under its path
  (`components/frame/FactoryPane.tsx`), the page's column, then the one side sheet; a full-window height subtracts `--frame-top` and
  `--frame-foot` (`staleFrameHeights`, `lib/footer.ts`). Where a page sits — the store's level under a destination of the rail, or a
  factory's under a place of its pane — is `seatOf` (`components/nav/nav.ts`), read from the path alone, through `useSeat`; a page's
  factory is a segment of its path, never `?factory=`, which `factoryRedirect` (`lib/factoryAddress.ts`, in the root's `beforeLoad`)
  sends to its path, and `test/factory-address.test.ts` refuses in any other file. A page both levels draw is one body under
  `components/<noun>/` (`RunsPage`, `InboxPage`, `WorkflowPage`, `AgentPage`, …), its two route files thin.
- How the frame stands around its one side sheet — what it shows (what the address's `?bar=` names, else Nemia's chat), the pane
  covered by it under 1600, folded by the menu button or Ctrl+B, docked, in a drawer or modal — is `frameFold` (`lib/frameFold.ts`,
  proved by `contracts/frame-fold.contract.ts`), read through `useFrameFold`; only the person's fold is written to the `sidebar_state`
  cookie; the sheet is `components/frame/FrameSheet.tsx`, a bar's panel in it
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
  run's own waits (`RUN_WAITS`) and how a run ended (`ENDED`) sit beside it. Where the board's word differs from the code's, it is
  translated there alone: `status.ts` reads the codes, `runWords.ts` and `stepPart.ts` compose.
  **A state the board names is one word** (`working`, `waiting`, `retry`, `pending`, `cancelled`), as a modern app names it, and the
  sentence goes in its meaning, on hover: a step's rail, a run's end (`ENDED`), a card's state (`CARD_WORDS`), a proposal's phase
  (`PROPOSAL_WORDS`), where a run stands (`STANDING`: the run's header, the start form and the floor's tag), the chat's tag over an ask
  (`ASKING`) and a hold's run that was cancelled (`NOW_WORDS.calledOff`) alike; a count (`3 waiting on you`) is a line, not a state. A yellow tag that says what to do (`approve <step>`, `past budget`, `try it again`) is an action, not a
  state, and keeps its words. `test/structure.test.ts` refuses a state of more than one word, a state's phrase from before it was one
  word (`waits on you`, `called off`) spelled as a word of its own, a retired phrasing (`waits for you`, `check refused`, `not signed`)
  and a runtime word (`journal`, `engine`, `WF_MAX_RUNS`) on hover.
- A value two files under `lib/api/` need sits in a sibling that imports no sibling: the word a route kept on Hono reads for a workflow's
  origin (`sourceOf`) and a card entry copied (`cardEntryOf`) sit in `library.ts`, which `workflows.ts`, `agents.ts`, `skills.ts` and
  `inbox.ts` all read.
- A kind of `objects` (the Run, the Card, the Factory, the McpServer, the Schedule, the Hire, the Volume, the Workflow, the Agent, the
  Skill) is read through `lib/api/objects.ts`, never a schema of the board's: its client is made from `objects`' `Api`, and each call
  rejects with `ReadRefusal`, `WriteRefusal` or `UnreadAnswer` (`lib/api/read.ts`). The inbox's entry is made of a `Card` in one place (`entryOf`,
- `lib/api/inbox.ts`), and the pages' view of a factory of a `Factory` and its `FactoryCommands` in one place (`factoryViewOf`,
  `lib/api/factories.ts`), which `factoriesQuery` reads together; a factory's schedules are read on its Settings alone
  (`factorySchedulesQuery`), and a floor asks its factory's cards in play of the api (`factoryInboxQuery`), never every card; a factory's
  Inbox asks its own namespace's cards, ended included (`inboxAllQuery` with its factory), and only the store's Inbox reads every card.
  A hire is written to its `Hire`, named
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
  answers (`clientBreaks`, `test/api-files.test.ts`). Where `objects` carries a part as JSON (a pass's phases, the stats' totals) the
  board decodes the keys it draws from that part, saying beside it why the copy stays. The streams stay
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
  `UnreadAnswer`, never a refusal. A schema the board still keeps gives its type (`typeof XSchema.Type`), never a type written beside it.
- `Schema.Union` takes the first member that decodes and drops the keys it does not know: put a member that owns more keys before one it
  extends (`objects`' `StepArtifact`, `RunDecision`), and prove the order with an answer the wrong order strips.

## Node tests of `src`

- `assert.deepEqual(x, [])` from `node:assert/strict` narrows `x` to `never[]` after it: assert on its length, or compare a copy.
- No directory import in a module a test reads (`./api` is a folder Node refuses): a helper a test reads uses file imports only.

## The board's traps

What no test of the board refuses, and the next author pays for again: what its tools do. Those of an e2e page are in *Writing an
e2e page*.

- The board's route files carry a `$` (`runs.$runId.tsx`), TanStack's mark of a parameter. A read-only step has `git diff` and
  `git grep` refused for any spelling of one: the `git` skill, *Read what changed*, says which spelling passes
  (`'apps/web/src/routes/runs.?runId.tsx'`).

### The kit, the look and the colours

- A component the kit lacks is written beside it, under the board's own rules.
- A named container variant (`@lg/page:`) matches nothing outside its container: a part drawn in her sheet, or in a sheet the kit
  portals over the window, takes its narrow layout, and a sheet's own width stays the window's (`sm:`, kept in `page-room.test.ts`).
- A flex item whose basis is `auto` asks for its whole max-content width, its longest unwrapped line included: give a line that is cut
  or wraps by design `contain-inline-size`, so the item asks only for what must read whole (the strip's frames, `OverviewStrip.tsx`).
- Adding a component of `apps/web/src/components/ui` or `apps/web/src/components/ai-elements` again overwrites the edits that put it on
  React Aria (the sidebar's `ul` menu, `showCloseButton={false}`, shiki's fine-grained build), and brings back comments the guards refuse.
- The kit has no adapter for TanStack Router: an `href` on one of its buttons, chips or menu items loads the page whole.
- `npx shadcn@latest add <component>` installs no `react-aria-components`: the board already depends on it, and a registry whose
  components sit on it says so in no install the CLI runs, so a fresh dependency of a component you add is yours to add.
- A weight the board wants on a role's text sits on the element that carries the role, never on a parent, which the role overrides. The
  guard that refuses a weight written beside a role reads one quoted class string at a time (`dressed`, `apps/web/test/type.test.ts`),
  so a `font-bold` on a parent of a `text-label-large` is refused by nothing and loses its weight all the same.
- A colour means one of four things on the board (`yours`, `alive`, `rest`, `failure`): a use that means none of them is rest or
  plain ink; a caution is failure for a write refused, yours drawn light for what a person weighs, rest for a note. Selection, state
  and focus are ink: the theme's `secondary` and `tertiary` are, and the focus ring is the kit's `ring`, which the theme declares from
  `secondary`.
- Classes merge through `cn`, built from the kit's `twMergeConfig`: a `leading-*` written before a role in one merge is dropped, so write
  it after.
- A ground on a child of a cut frame (the kit's `Card`, a table `Row`) paints the cut over, so it is given none (`bg-transparent`), and
  no clip goes on what holds content or takes the focus. The kit paints an interactive row's hover, pressed and focus states as its
  ground too: a table that ends its frame takes `TableAtCut`, which paints them for the row at its foot on a layer of its own in the
  cut's shape.
- A kit `Cell truncate` shows its children again in a tooltip: a cut cell that holds a link cuts the link itself (`block truncate`, a
  `title`), never the cell.
- A foot's button needs `ml-auto` only once the foot wraps: two children under `justify-between` stand apart on one line without it, so
  its proof draws the card narrow.
- The grain is `apps/web/src/components/look/grain.css`, each tile written once and percent-encoded whole — the build's minifier refuses a
  raw `<svg` in a custom property — and worn by a part that writes `data-grain`: `label` whole on a label, `quiet`, a third of the
  frame's former weight (the owner's pick of 2026-11-25), on a cut frame's ground layer, clipped with it, and none on a frame inside
  another, which `CutFrame` knows from a context it provides, so grain never doubles (`test/parts.test.ts`).
- Text dimmed by an `opacity` falls under 4.5:1: sink a card into the floor (`bg-background`) or use the muted ink instead.
- A text that stands on `ScanLines` is `unmeasured` by the contrast measure, its ground being an image, and an unmeasured text is never
  refused: a page of the look measures through `contrastHolds` (`apps/web/test/e2e/runs-contrast.ts`), which flattens the ground first. A
  grain is the one image it reads: a tile of one colour, measured plain and at its far 2% (`GRAIN_TAIL`, a row said `grained`), and a cut
  frame's ground is read from its `data-cut-ground` layer, no ancestor of its content (`readerIn`, `apps/web/test/e2e/contrast.ts`). A
  text given a `background-image` is unmeasured too (`PageName` in `look/Plate.tsx`).

### The browser: Playwright, React Flow and React Aria

- Photograph a card with `photographCard` (`apps/web/test/e2e/canvas.ts`), not `card.screenshot()`: the fitted floor draws it at a third
  of its size.
- A straight SVG edge path fails `toBeVisible()`: count edge paths instead.
- Drag with `page.mouse` (down, `move(…, { steps: 12 })`, up), never `dragTo`: React Flow moves a node from the second pointer move, and
  a handle has `pointer-events: none` until a drag starts (`drawEdge` in `canvas.ts`). In the browser tools, synthesize mouse events a few
  milliseconds apart from `browser_evaluate`.
- React Flow sets `pointer-events: none` on a node neither draggable nor selectable, and a click on it lands on the pane: a node that is
  pressed gives them back in its `style` (`nodesOf` in `FactoriesCanvas.tsx`).
- React Flow's `nodeTypes` and `edgeTypes` are module constants, and each `ReactFlow` has an `id` of its own, which scopes its marker
  ids; `defaultMarkerColor={null}` lets the stylesheet colour a marker.
- Chromium writes a console error, `Failed to load resource`, for every 4xx: a page expecting one refusal allows that line too.
- Playwright reports neither `requestfinished` nor `requestfailed` for a request a navigation leaves behind (`track` in `checks.ts`).
- `hasText` reads `textContent`, which puts no space between elements: put `{' '}` between a label and what follows it.
- A React Aria switch, checkbox or radio is clicked through its `<label>` (`showFinished` in `canvas.ts`); a sheet is closed with its
  Close button, not Escape.
- A card must fit its cell (`CELL_HEIGHT`): `expectClearOfEachOther` measures it after a Reset layout. The fit is padded by the panels
  over the floor (`fitClear`), and `expectClearOfPanels` refuses a card under one; read a size on a card in its own pixels
  (`offsetHeight`).
- Something that mounts beside the floor after its first render narrows a floor already fitted: load what it draws in the route's loader
  (`prefetchQuery`), and fit again when it comes or goes. A read the floor must not wait on (its queue's cards, `factoryInboxQuery`) the
  loader starts without awaiting it, and the floor fits again as it comes (`laned`, `FactoryCanvas.tsx`).
- A full-page screenshot can lay the page out a pixel wide for a moment, and the floor's frame then measures 0 tall: aim no view at a
  frame without room (`revealView` in `apps/web/src/lib/frame.ts`) and watch its size on both axes (`useFrameSize`); `factory-frame`
  forces it.
- A line that `truncate`s in a node holds about thirty characters: say the short form there, the whole sentence in its `title`, and prove
  it is read whole with `expectUncut`.
- A box the browser lays between two pixels is drawn from the next whole one, and `boundingBox` carries float noise: a test that reads a
  pixel beside an edge rounds past it (`edgesOf` in `apps/web/test/e2e/pixels.ts`).
- A table cell's `scrollWidth` does not grow with a `nowrap` text that runs out of it: measure the text's right edge against the cell's
  own room (`expectRoom` in `apps/web/test/e2e/pages/052-runs-pages.ts`).
- The kit's `xsmall` icon button answers 8 pixels beyond its box, and of two targets that overlap the later in the document wins: in a
  40-pixel row a copy control answers from 24 above its centre to 16 below (`finger` in `apps/web/test/e2e/pages/050-runs.ts`).
- The copy control's glyph is the look's own, 12 pixels whatever size the kit hands it, and its button is pulled in around it
  (`look/CopyId.tsx`): its target reaches what stands 4 pixels over it, so a card's title is raised (`relative z-10`) to keep its box,
  and a row in flight keeps 16 pixels between its title and its id.
- The e2e's Chromium hides every scroll bar, so no bar takes room or is in a picture: a bar is asserted and pictured in a browser from
  `launch('classic')` (bars that take room) or `launch('overlay')` (bars that float), `apps/web/test/e2e/visit.ts`.
- The theme sets `scrollbar-color` on the root, which in Chromium hides every `::-webkit-scrollbar` rule: the board's `:root` reverts it
  to the base layer (`revert-layer`), whose rules draw the bar. The window's bar takes its parts from `body`, and no selector on the
  root's attribute reaches it: the thumb reads an inherited property (`--bar-ink`). A bar already laid out keeps its track under a style
  added later.

### React, Query and the compiler

- The React Compiler skips a function with an optional call inside a `try`: write `.then(ok, fail)` (`copyAndSay` in `lib/useCopy.ts`). It skips an
  arrow written as a parameter's default: declare it at module level (`asIs` in `StepForm.tsx`).
- React Aria's `DisclosurePanel` keeps and lays out what it holds while closed: draw a fold's content only while open.
- Call `requestAnimationFrame` as `(f) => requestAnimationFrame(f)`, never off another object.
- A component that draws a `routeLink` renders under `RouterContextProvider` over a memory-history router in a node test, and the markup
  spells React's props (`readOnly=""`); in a browser its Enter navigates only under React Aria's `RouterProvider`, the root's.
- A node test that renders a component imports `./tsx.ts` first, then the component by `await import(…)`.

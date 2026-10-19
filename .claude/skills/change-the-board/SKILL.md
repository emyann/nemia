---
name: change-the-board
description: "Any change under apps/web/ — a route in apps/web/src/routes, a component in apps/web/src/components, a hook or helper in apps/web/src/lib, a style, an e2e page — and the design or review of one: load it before reading, writing or judging a file there. It sends you to the board's components (shadcn), to the design system kit's own skills (ds-build, ds-theme, ds-spec), to the board's facts (apps/web/CLAUDE.md) and to the traps of the board's own tools, which it carries at its end."
applies: ["apps/web/**"]
---

# Change the board

1. **Move your shell into `apps/web` first**: `cd apps/web` from the repository's root, where a step's session starts. The board's
   components are shadcn's on React Aria, and shadcn's skill reads the project as it loads, by a command that answers only where
   `components.json` is: from the root it refuses with `monorepo_root`, and the skill is not loaded.
2. **Then load `shadcn` with the Skill tool**, before you read or write a component, and go back to the root (`cd ../..`) once it has
   answered: the checks run from there.
3. **Where your fence refuses `cd` and that skill** (a step that designs or reviews), move nowhere: read
   `.claude/skills/shadcn/SKILL.md` with Read, and, for the facts its command would have printed, `apps/web/components.json` and the
   files of `apps/web/src/components/ui`.
4. **Its CLI runs from `apps/web`**, or from the root with `-c apps/web`. Its rules know radix and base, not React Aria: on the board
   the reference is what `npx shadcn@latest add <component> --view <file>` prints, never what you remember.
5. **Read `apps/web/CLAUDE.md`** before you change a page: it holds the board's facts — where each thing is written, its
   commands, and what its own code promises that no test refuses. What its tools do, and the holes they leave, are *The board's
   traps* at the end of this skill: read them before you write, not after a check has refused you.
6. **Then load the design system kit's skills, where the work is theirs**: `ds-build` before you design, write or judge anything drawn
   with the kit's parts or its roles, `ds-theme` before a change to `apps/web/DESIGN.md` or the theme, `ds-spec` when a decision cites
   Material. A step of a run that gives them has them in its first list of skills, under its agent's name: load each with the Skill
   tool by the name its prompt gives. A session outside a run finds them in `apps/web/.claude/skills`, not at the root, and its first
   list of skills holds none of them: the list gains a nested folder's skills once the session has read a file under it. So it reads
   `apps/web/CLAUDE.md` with Read first (item 5), then loads each with the Skill tool by its bare name, from the root, with no `cd`.
   Where the Skill tool does not know the name, read `apps/web/.claude/skills/<name>/SKILL.md` with Read: the text is the same.
7. **The project they speak of is `apps/web`**, not the repository's root: their `DESIGN.md`, `theme/` and `components.json` are the
   ones there, and their `<kit>` is `apps/web/src/components/ui/ds`. From the root, `ds-spec`'s command is
   `node apps/web/.claude/skills/ds-spec/md3.mjs <command>`, typed whole and alone, which a fenced step may run too. It is the
   workspace's script in a run too: the copy of `ds-spec` a step is given is read, never run. A fenced step runs none of the commands
   `ds-theme` and `ds-build` name: it reads what they say and the files they point at.
8. **For a part the kit ships, the reference is `ds-build` and the part's own file** under `apps/web/src/components/ui/ds/components`,
   its doc comment first. `shadcn` stays the reference for the board's shadcn components (`apps/web/src/components/ui/*.tsx`) and for
   the CLI that installs either family.
9. **For a cut, a plate, a tile or a rail, take the look's own part** before you draw one: they are in
   `apps/web/src/components/look`, taken through its door (`@/components/look`), never from a part's own file. `CutFrame` for a card
   or a table in a cut frame (with `FRAMED_BOX`, `FRAMED_END`, `FRAMED_TABLE` and `FRAMED_ROW` around a table), `CutTag` for a tag
   with a cut corner, `CutButton` for the filled cut button that is a link to a route and `CutPress` for the one that is pressed,
   `CutCue` for a cue in a small cut frame beside a face or in a header, `CutField` for a box that holds a field, whose edge lights round its cut when the focus is in it, and `cutShape`, `cutRing` and `cutPoints` for a new part that takes the cut; `Plate` for a section's heading and `PageName` for
   a page's name; `Sticker` for a tile that carries a number and `StatTile` for one over its breakdown; `RunSteps` for a run's rail;
   `ScanLines` for the ground of a page; `Pager`, `TextLink` and `CopyId`. Each is shown in its stories beside it
   (`<Part>.stories.tsx`): `npm run storybook`, from `apps/web`, serves them to a person on port 6007, and `npm run board:serve`
   prints a third line, `stories on <address>`, where a step given a browser opens them. A new part of the look gets its stories in
   the same change, and its name here.

## The board's traps

What no test of the board refuses, and the next author pays for again. `apps/web/CLAUDE.md` holds the board's facts — where each thing
is written, the commands, and what its own code promises — and this section holds what its tools do.

### The kit, the look and the colours

- A component the kit lacks is written beside it, under the board's own rules.
- Adding a component of `apps/web/src/components/ui` or `apps/web/src/components/ai-elements` again overwrites the edits that put it on
  React Aria (the sidebar's `ul` menu, `showCloseButton={false}`, shiki's fine-grained build), and brings back comments the guards refuse.
- The kit has no adapter for TanStack Router: an `href` on one of its buttons, chips or menu items loads the page whole.
- `npx shadcn@latest add <component>` installs no `react-aria-components`: the board already depends on it, and a registry whose
  components sit on it says so in no install the CLI runs, so a fresh dependency of a component you add is yours to add.
- A weight the board wants on a role's text sits on the element that carries the role, never on a parent, which the role overrides. The
  guard that refuses a weight written beside a role reads one quoted class string at a time (`dressed`, `apps/web/test/type.test.ts`),
  so a `font-bold` on a parent of a `text-label-large` is refused by nothing and loses its weight all the same.
- A colour means one of five things on the board (`yours`, `alive`, `money`, `rest`, `failure`): a use that means none of them is rest; a
  caution is failure for a write refused, yours drawn light for what a person weighs, rest for a note.
- Classes merge through `cn`, built from the kit's `twMergeConfig`: a `leading-*` written before a role in one merge is dropped, so write
  it after.
- A ground on a child of a cut frame (the kit's `Card`, a table `Row`) paints the cut over, so it is given none (`bg-transparent`), and
  no clip goes on what holds content or takes the focus.
- A kit `Cell truncate` shows its children again in a tooltip: a cut cell that holds a link cuts the link itself (`block truncate`, a
  `title`), never the cell.
- A foot's button needs `ml-auto` only once the foot wraps: two children under `justify-between` stand apart on one line without it, so
  its proof draws the card narrow.
- The grain is `apps/web/src/components/look/grain.css`, each tile written once and percent-encoded whole — the build's minifier refuses a
  raw `<svg` in a custom property — and worn by a part that writes `data-grain`; on a cut frame it is the ground layer's, clipped with it.
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
  (`prefetchQuery`), and fit again when it comes or goes.
- A full-page screenshot can lay the page out a pixel wide for a moment, and the floor's frame then measures 0 tall: aim no view at a
  frame without room (`revealView` in `apps/web/src/lib/frame.ts`) and watch its size on both axes (`useFrameSize`); `factory-frame`
  forces it.
- A line that `truncate`s in a node holds about thirty characters: say the short form there, the whole sentence in its `title`, and prove
  it is read whole with `expectUncut`.
- A box the browser lays between two pixels is drawn from the next whole one, and `boundingBox` carries float noise: a test that reads a
  pixel beside an edge rounds past it (`edgesOf` in `apps/web/test/e2e/parts.test.ts`).
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

### Writing an e2e page

- Each worker seeds its own store; a page reads only the seed and what it writes itself, takes its write back, and passes alone
  (`--pages <name>`) or after any other page. A worker whose store is not its seed at its end fails, naming the files (`leftOver`,
  `apps/web/test/e2e/print.ts`); a file the api writes as it serves goes in `UNPRINTED` there, with why.
- A page's own pictures are taken only under `--photos` (`photograph` and `photographCard` do nothing otherwise, `photographing` in
  `world.ts`): a page asserts nothing through a picture, and leaves no state a picture's zoom would have reset.
- Name a page's own pictures `<name>-<what>-<theme>.png`; `<name>-<theme>.png` is the runner's: a run that pictures the page overwrites
  it, and a run that does not leaves an earlier run's where it is.
- The watch counts every 4xx against a page: a refusal made on purpose gets a page of its own whose watch expects exactly it.
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
- A window resized across 600 pixels swaps every rail bar's button a render later (`useSheetPreview`): wait for the mode the bar says
  (`data-step-preview`) before reading one, and scope it by its section, since the runs page itself is an `article`
  (`059-runs-preview.ts`).
- The engine's task view carries no filing time; its feed does: a store written by hand writes `engine/feed.jsonl` too (`seedFeed`).
- A journal line written by hand goes on `engine/feed.jsonl` too, and its take-back cuts the feed back: the api keeps a run judged at
  rest until a line for its tasks reaches the feed (`restingRead` in the orchestrator's `rest/resting.verb.ts`; `130-say.ts`).
- A record or journal written by hand is decoded as the tick's and the runtime's are (`StepRecordSchema` in the orchestrator's
  `record.store.ts`, `event-schema.ts`): write each key as they write it — a key they leave out is absent, never `null`
  (`340-agent-try.ts`).
- A package program the e2e runs from a string (`PASS` in `apps/web/test/e2e/world.ts`) is read by no typecheck: after changing what a
  package's program requires, run `npm run e2e -- --pages runs`, which seeds through it.
- A story of a part lays out with inline styles, never a class of its own, and a node test imports a part by its own file: the look's door
  loads the kit's folder, which Node refuses. A component of the board that needs a state proven in a browser has its stories beside it
  too (`apps/web/src/components/<Name>.stories.tsx`, `WaitingCard`'s): both hosts read that folder beside the look's.

### React, Query and the compiler

- The React Compiler skips a function with an optional call inside a `try`: write `.then(ok, fail)` (`CodeBlockCopyButton`). It skips an
  arrow written as a parameter's default: declare it at module level (`asIs` in `StepForm.tsx`).
- React Aria's `DisclosurePanel` keeps and lays out what it holds while closed: draw a fold's content only while open.
- Call `requestAnimationFrame` as `(f) => requestAnimationFrame(f)`, never off another object.
- A component that draws a `routeLink` renders under `RouterContextProvider` over a memory-history router in a node test, and the markup
  spells React's props (`readOnly=""`); in a browser its Enter navigates only under React Aria's `RouterProvider`, the root's.
- A node test that renders a component imports `./tsx.ts` first, then the component by `await import(…)`.

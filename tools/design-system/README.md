# tools/design-system — the board's Design System artifact, built by one command

The "Nemia Design System" is a Design System artifact a design canvas mounts the board's real parts from: one classic script that sets
`window.Nemia` on React 18, its stylesheet, `tokens.json`, the faces' files, a types file, the brand book, the index, and one static
preview card per story file of the board, per component of the design system kit, and the cover. This workspace builds every one of
those files from the checkout as it stands. It is repository tooling, never shipped: nothing imports it.

```
npm run design-system                                  # into .design-system/ at the root (git ignores it)
npm run design-system -- --out <dir>                   # into <dir>
npm run design-system -- --out <dir> --since <last>    # and say what changed against <last>
```

It needs nothing but the repository's own dependencies (`npm ci`), Playwright's Chromium (`npx playwright install chromium`), and,
on the first build of a kit release, the network: the kit's stories are fetched once per release and kept under
`node_modules/.cache/design-system/`. A build takes about six and a half minutes, most of it drawing every card in both themes; run it
alone, beside no other heavy command.

## What it writes

Under `<dir>`:

- `project/` — the artifact's files, what a person publishes:
  - `components/bundle.js`, the script: the kit's door, the look's door, a component per story file whose folder holds one of the
    file's name, `NemiaRoot`, the board's icons as `Icons`, the namespaces `Aria`, `Router`, `Query`, `Dates`, `Flow`, `Objects`, and
    `__m` (every module of the board a story reaches). Its header (`@ds-bundle`) lists the components that have a card.
  - `components/bundle.css`, the stylesheet, Tailwind over the board's styles, dark answering to `data-theme` as well as the system,
    the faces and the symbols declared at its end.
  - `components/index.d.ts`, each component's own props, the icons, and the helper types they name: documentation, never compiled.
  - `components/<Card>/preview.html` and `README.md` for each card, and `components/Cover/preview.html`.
  - `tokens.json`, `fonts/`, `README.md` (the brand book, from `src/docs/brand.md`) and `design-system.json` (the index).
- `shots/` — the verification's pictures: every card in both themes, `faces.png` and `icons.png`.
- `manifest.json` — every file of `project/` with its sha256 and bytes; `CHANGES.json` — what was added, changed and removed.

Its last lines say how many files were added, changed and removed against the last build, then each path. The last build is `--since
<last>` when given: its `manifest.json`, or, where it has none (a download of the published artifact), the files of its `project/`
or of the folder itself, hashed. Without `--since`, it is the manifest the previous build left in `<dir>`.

## How it builds

`src/produce.ts` runs every stage in one process, in this order:

1. The kit's stories (`src/kit/kit.ts`) at the tag of the release the board holds, `v<version>` of `apps/web/src/components/ui/ds/RELEASE.json`,
   from GitHub's tarball of `french-tech-homies/design-system` (with `GITHUB_TOKEN` when set).
2. The board's story files (`src/stories/stories.ts`), found as `.storybook/main.ts` finds them, each one card.
3. The entry (`src/bundle/entry.ts`), the script (`bundle.ts`), the stylesheet and faces (`src/stylesheet/`), `tokens.json`
   (`src/tokens/`) and `index.d.ts` (`src/types/`).
4. Each card's page (`src/cards/previews.ts`), its script drawing its stories by `src/cards/runner.ts`.
5. The verification (`src/verify/`): a local server frames each card as the artifact's page does (the tokens' sheet, the stylesheet,
   React 18.3.1 from this workspace, the script), Chromium draws it in both themes after the faces load, and pictures it; then the
   faces' page and the icons' page.
6. The heights measured written into each card's marker, the cards with no story drawn removed, the script's header listed, the
   READMEs, the brand book, the cover and the index written, the caps measured, and the manifest.

Four decisions are pure functions, proved by `contracts/produce.contract.ts` (`npx tsverify tools/design-system/src/decide.ts`):
a story's fate (`storyFate`), a drawn cell's fault (`cellFault`), the caps passed (`capsPassed`) and a path's change (`fileChange`).

### The board on React 18

The board runs React 19 and the artifact React 18, so the script carries a seam (`src/bundle/page.ts`): `useEffectEvent`, `use` of a
context, and a ref handed to a function component as a prop, which React 18 drops. A card has no network: a read is noted and never
answered, an event source never opens, and React Flow's question to the system for its scheme is answered from the root's theme.
`NemiaRoot` is the stories' own stage, `apps/web/.storybook/stage.tsx`, the very one Storybook draws them on.

## What a story declares

A story says what keeps it out of a card by a Storybook tag, at its meta (every story of the file) or on itself, `!<tag>` taking a
meta's tag back off:

- `network` — it reads the api, through MSW handlers (`parameters.msw`) or with none, so a card, which answers no read, cannot draw it.
- `overlay` — it opens a layer over the whole window at rest (a sheet, a dialog), which would cover the card.

The producer reads the tags and `parameters.msw` from the module before it draws anything, and never draws a tagged story. A story
that names MSW handlers and carries neither tag is refused, so the network is said in one place.

## When it fails

It exits 1 on any fault, each named with what to do, and still writes the folder and its last lines, so the faults can be read
against the pictures:

- `<Card> <Story>: undeclared` — it names MSW handlers and no tag: tag it `network` (or `overlay`).
- `<Card> <Story>: waits-on-network`, `api-picture`, or `draws-nothing` after asking the api — tag it `network`.
- `<Card> <Story>: covers-card` — it opens over the whole window at rest: tag it `overlay`.
- `<Card> <Story>: threw` or `draws-nothing` with no read — the story is broken: fix it in Storybook.
- `<Card>@<theme>: …` — the card logged an error, asked outside the frame, got a 400 or more, a face did not load, or its root says
  another theme.
- A face that does not load from `bundle.css` alone, an icon of the board missing from `Nemia.Icons` or not drawing.
- A cap of the artifact passed: 6 MB for the script, 2 MB for the stylesheet, 1,024 files. The script's margin is under 1 MB: an
  import that adds a heavy library to what a story reaches passes it; move it out of what the stories reach.
- `the build stopped: …` — a stage could not go on: a kit release with no tag (`v<version>`), a kit story `PICK` names that the kit
  no longer has (`src/kit/kit-map.json`), a component with no guideline (`GUIDES`), a theme role with no usage (`src/tokens/usage.ts`),
  a story title in no known group, or a dark rule left on the system's word alone.

## Publishing

Publishing is a person's interactive session's act, never this command's, a run's or CI's. After a build that exits 0:

1. Read the cover, one board card and one kit card in `shots/`, in both themes: a script cannot tell a face is the right one.
2. Send only the files the last lines name as added or changed, and remove those named removed. `components/index.d.ts` is sent with
   the content type `text/plain`.
3. Revise the artifact's own index, changing only its `lastChange`: the build's `design-system.json` is `index.seed.json`, which keeps
   the index's birth (`createdOnFiles`, 2026-10-13) and never rewrites it.
4. Keep the build's folder as the next build's `--since`, or pass the published artifact's download.

## A kit update

The kit's stories come from its tag `v<version>`; a release with no tag fails the first stage, naming it. Its map
(`src/kit/kit-map.json`) is this repository's: `PICK` (the stories each card shows, else a file's first six — a story that needs its
play function, or opens over a scrim and dims its card's other cells, is not picked), `JOINED` (a story file that draws another
component's card), `SKIPPED`, `GUIDES` and `TYPE` (each card's guideline), `ROOM` (the least height of a card whose story opens a
modal) and `SCREEN` (the height of a story that fills the window). A pick the release renamed fails the build, naming the file.

## What it does not show

A story is drawn at rest: what its play function presses or opens is not shown, and the build checks the first render only, not a
press, a hover or an overlay opened. The kit's blocks (`stories/blocks/`) have no card. Motion is no token family. On a canvas of your
own, React Flow's graphs follow the system's scheme. The cache copies of the producer on the owner's laptop, written for kit 0.3.0 and
brought to 0.11.0 on 2026-11-21, are no longer its source: this folder is.

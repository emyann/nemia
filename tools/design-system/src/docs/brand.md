Nemia's board is a graphite night, nearly black and neutral, with acid yellow for what waits on a person and a violet for what is alive. On it sit the printed labels of a retro spec sheet in amber, red and grey, with black ink, every card and label under a fine grain. Hardware is cut, labels are stuck on.

## Colour

A colour says one thing, on every page. Name a colour by its role, never by a value.

- Use `meaning-yours` (`md-sys-color-primary`, acid yellow, with `meaning-on-yours` black on it) for what waits on a person: a gate, a waiting tag and the one filled button of a screen. Use it for nothing else.
- Use `meaning-alive` (`md-sys-color-secondary`: a pale violet in dark, a deeper violet in light) for a session at work: a running step, a selected filter and the focus ring. Violet says alive and nothing else.
- Use `meaning-money` (`md-sys-color-tertiary`, the amber of a printed label, black ink) for an amount: what a run cost.
- Use `meaning-failure` (`md-sys-color-error`) for what failed, and for nothing else. A board where nothing failed shows no red.
- Use `meaning-rest` (`md-sys-color-inverse-surface`, the label's grey, black ink) for what is at rest: a count, a clock, a finished run. Use `meaning-sage` (`md-sys-color-outline`) filled for a step that is done.
- Pair every fill with its content colour: `md-sys-color-primary` carries `md-sys-color-on-primary`. Let text inherit `md-sys-color-on-surface`; use `md-sys-color-on-surface-variant` for supporting text.
- Show depth by tier: `md-sys-color-surface-container-low` for a card (`card`), then `-container`, `-high`, `-highest`. Draw a hairline in `md-sys-color-outline-variant` (`border`), never as the only edge of a control.
- Draw the dark scheme first. The light scheme is derived from the same keys and checked by eye, not designed.
- Tailwind names: `bg-yours`, `text-on-yours`, `bg-alive`, `bg-money`, `bg-failure`, `bg-rest`, `bg-sage`, `bg-background`, `bg-card`, `border-border`, `text-muted-foreground`.

{{surfaces}}

## Type

- Set display, headline and `title-large` in `michroma` (Michroma): wide, thin, square lettering, in capitals on hardware such as a page's name.
- Set body, `title-medium` and `title-small` in `chakra-petch` (Chakra Petch), untracked and in mixed case.
- Set the three label roles (`label-large`, `label-medium`, `label-small`) in Chakra Petch at weight 600, tracked 0.06em (0.1em for small), in capitals: they are the look's small caps. A button's word, a tag, a rail's name and a table head are label roles.
- Set identifiers, commands and readouts in `share-tech-mono` (Share Tech Mono), with a body role.
- Set a printed label's numerals in Archivo at width 125 and weight 800, black ink on the label's stock (`font-label`).
- Never track body text: Chakra Petch joins `fl`, `fi` and `tt`, and tracking parts them.

## Shape

- Keep every corner of the kit square: all six `md-sys-shape-corner-*` are 0. Never round a kit part by hand.
- Cut a frame, a button and a tag at two corners (`CutFrame`, `CutButton`, `CutTag`). Round only a sticker, at 14 pixels (`Sticker`, `StatTile`).
- Draw no shadow. A raised surface is a hairline (`md-sys-elevation-1` to `5`): yellow, then violet as it rises.
- A state is a layer of the content colour at 10% (hover), 14% (focus), 18% (pressed) and 22% (dragged), never a swapped colour.

## Grain

- Put `data-grain="surface"` on the ground of a card or a framed table: specks light in dark, ink in light, one weight.
- Put `data-grain="label"` on a label (a sticker, a stat tile, a plate): ink specks in both schemes, heavier, as on rough stock.
- Give the page's ground its scan lines (`ScanLines`), never a grain. Give a tag and a button none. Draw the grain under a cut: nothing of it shows in the cut corner.

## The board's parts

Each card is one story file of the board, drawn in the states its stories show; the groups are the stories' own. `Look` holds the look's parts (`apps/web/src/components/look`): the cut frame, tag, button and field, the plate, the sticker and stat tile, the run at its sizes, the step graph, the trace. The other groups are the board's own components, which read the board's shapes: take them as models and as parts of a Nemia screen, not as general components.

{{boardLines}}

## The kit's components

The kit is Material Design 3 on React Aria and Tailwind, release {{kitVersion}}, as the board holds it, square and in Nemia's theme. Take a component by its role and read its card.

{{kitLines}}

## Loading

Load React 18 and ReactDOM 18, then `components/bundle.css`, then `components/bundle.js`, which sets `window.Nemia`. Wrap content in `Nemia.NemiaRoot`: it is the board's stories' own stage (`apps/web/.storybook/stage.tsx`), and gives links a router in memory and React Aria's router provider, queries a client of their own, and the look's ground with its scan lines; it takes `at` (the address the router opens on) and `marked` (scroll bars on, the default). Always set `data-theme="dark"` (the first theme: the board is drawn dark first) or `"light"` on the root element: the tokens, the grain and every `dark:` style answer to that attribute, and a root that says neither mixes the two. The faces are the files under `fonts/`: Michroma, Chakra Petch (400, 500, 600, 700), Share Tech Mono and `Archivo Variable` (the label face: its width axis runs 62 to 125, its weight 100 to 900). `components/bundle.css` declares all seven at its end, and after them the symbols none of the four has (← → ↗ ≥ ✓ ⧉ from Noto Sans Math, ✗ from Noto Sans Symbols 2, each rule kept to those characters) (`@font-face`, each reaching its file as `../fonts/…`, under the family names the code's stacks ask for), so a page that copies `components/` and `fonts/` side by side has them with no other sheet; the system's `tokens.css` declares them too.

Beside the components, `window.Nemia` holds seven namespaces: `Nemia.Icons`, the board's icons (below); `Nemia.Dates`, `@internationalized/date`, whose values the date and time pickers take (`Nemia.Dates.parseDate("2026-06-15")`, `new Nemia.Dates.Time(7, 0)`); `Nemia.Aria`, React Aria Components (its `I18nProvider` sets a picker's locale); `Nemia.Router`, TanStack Router; `Nemia.Query`, TanStack Query; `Nemia.Flow`, React Flow, which the factory canvases draw with; and `Nemia.Objects`, the shapes of the objects Nemia serves. `Nemia.__m` holds every module of the board a story reaches, by its path under `src`, for the cards' own use. Each is the same copy the parts use: take them from there, never from a second copy.

## Icons

`Nemia.Icons` holds the {{iconCount}} lucide icons the board's own code draws, by their lucide names. Pass one where a part asks for an `icon` (`Button`, `IconButton`, `NavigationRail`'s items, `Chip`): `<Nemia.IconButton icon={Nemia.Icons.{{iconExample}}} aria-label="Settings" />`. Each takes `size` (24 by default), `color` and `strokeWidth`.

{{icons}}.

## Not synced

A card has no network. A story that reads the api says so by the Storybook tag `network`, and one that opens a layer over the whole window at rest by `overlay`; neither is drawn ({{skipped}} of the board's stories, named in each card's text; {{cardless}} have no card for it), and a story is drawn as it is at rest: what its play function opens or presses is not shown. A part that asks the network after it is drawn keeps waiting. The kit's blocks (its stories under `blocks/`) have no card: the board holds none but the radio tile, which is the look's. Motion is not a token family (short and decisive, 110 and 180 milliseconds). In a card the graphs read the root's theme once, when they are drawn (React Flow's `colorMode="system"` is answered from `data-theme`); on a canvas of your own they follow the system's scheme. The four faces are shipped as files under `fonts/`, the Latin subsets the board loads (Michroma, Chakra Petch, Share Tech Mono and Archivo Variable, each under the SIL Open Font License 1.1), with the two symbol faces (Noto Sans Math, Noto Sans Symbols 2, OFL 1.1). The board runs React 19 and this system React 18: the bundle carries a shim for `useEffectEvent`, for `use` of a context and for a ref handed to a function component as a prop. The components came by the built route: the board's own code bundled by esbuild into one script, the stylesheet compiled by Tailwind from the board's styles with the fontsource sheets replaced by `@font-face` rules of its own and dark answering to the root's attribute. The kit's cards are drawn from the kit's own stories at release {{kitVersion}} (the kit's tag v{{kitVersion}}); a story that opens a modal over the page, or fills the window, is drawn in its card at a fixed height.

# Four leftovers on the board

Four commits on `wf/four-leftovers-on-the-board-fmk9/implement`, one per item, in `apps/api` and
`apps/web` only — with a fifth for a corner item 2 opened up (a re-read that fails), and this
closeout. Nothing in `packages/`.

`npm test && npm run typecheck && npm run build && npm run e2e` from the root: green, on the tree as
committed.

## 1. A schema the disk refuses puts back the ones written before it

`apps/api/src/builder.ts` — a save writes each pasted schema, then the folder. A write that threw
partway left every schema written before it behind, though a refusal from `writeWorkflow` puts them
all back; the 500 said nothing of them. The save now remembers what it has written and puts that
back whichever write fails.

`apps/api/test/builder.test.ts` has the refusal: two schemas, the second's file read-only (skipped as
root, which writes it all the same). Without the fix it refuses with the new schema left on disk.

## 2. Only a 4xx says a save wrote nothing

`apps/web/src/components/WorkflowBuilder.tsx` — the banner said "Not saved, and nothing written"
whatever the answer. A 500 is a write that broke off partway and a fetch that never landed may have
been carried out all the same: neither can claim the folder is untouched. Both now say the folder may
have been written and offer **Read the folder again**, as a 409 does; a 4xx keeps the old sentence.

The banner is its own component, `SaveRefused`, so its wording is rendered in a test rather than only
in a browser: three tests in `apps/web/test/components.test.ts` — the 4xx (422, a cycle, a folder
refusal, 409), the 500, and the lost fetch.

One thing the split brought with it: a **Read the folder again** that itself fails now keeps the save's
status, so a 409 whose re-read failed still reads "nothing written" rather than "it may have been
written" — the read wrote nothing either.

## 3. A stray file a card of the same name answers for gets no link

`apps/web/src/lib/inbox.ts` — `/inbox/notes` is `notes.md`: the api's card page reads the `.md` entry
before a stray file of that name (`apps/api/src/inbox.ts`), so a link on the stray `notes` opened the
card's page under the stray's name. `hasPage` now reads the entry against the listing it was drawn in:
a card keeps its page, and a stray has one only where nothing else answers to its name. The Inbox page
hands the listing down to the link (`apps/web/src/routes/inbox.tsx`).

A web test for the collision and an e2e line beside the stray file and the folder already there: with
`notes.md` and `notes` both in the inbox, both list under `notes`, only the card is linked.

## 4. A cell that holds the cards the board draws — the taller cell, not a capped card

`apps/web/src/lib/factory.ts` — `CELL_HEIGHT` 220 → 260.

Measured on the e2e's floor: a card with four steps and a line of what one of them asks is **233** tall
(`what-it-cost-e2e10`), and one with five steps and an ask is **234** (`give-the-board-a-look-e2e0`).
The grid puts the card beneath a cell's height below, so at 220 every layout put it under the card's
bottom edge.

Of the two fixes offered the cell is the smaller one: a single constant, and every placement is worked
out in cells, so each placement test keeps its meaning. The one number that moved is the diamond's
span — `spanOf(graphAt(diamond))` reads `rows: 2` rather than `rows: 3` for the same 474px of graph,
which is what the assertion says (it is taller than a cell, so it takes the row below). Capping the
card to its cell would have cut exactly what a person has to act on: the ask.

The e2e measures it now, after a layout: no card on the floor reaches over the card beneath it. Run at
220 it refused —

    e2e: FAILED — the factory page (/) in the light theme: no card on the floor reaches over the card
    beneath it — what-it-cost-e2e10 is 233 tall in a cell of 220, and read-the-plan-first-e2e11 starts
    220 below it

— and no screenshot had shown it: the tall cards are finished runs, off the default floor, and the
page's own photograph is taken with runs open.

The number is not a bound, and round 2 made the comment say so: a card draws a line per ask and per
blocked step, so a run whose steps each ask outgrows any cell. A grid that measured its cards would be
the answer to that, and it is not this change.

## Round 2, on what review found

- **The schema the write fails on.** Fixed: `fs.writeFileSync` truncates before it writes, so a write
  that fails after the open leaves the file short, and counting a schema as written only once the call
  returned left that one file behind. A schema now counts as written before the write, and putting back
  compares what the file holds with what it held — which is also what keeps the undo from refusing a
  read-only file in turn. `putSchemasBack` is exported, and a test drives all three cases.
- **A save with no status.** Fixed: `BuildRefusal` carries no status for a lost fetch *and* for an
  answer the api gave without what it wrote, so "the api did not answer" sat above "answered 200 OK
  without what it wrote". It now reads "the api did not say what it wrote", with the second case tested.
- **A refusal on two entries of one name.** Fixed, though older than this branch: the page kept and
  matched refusals by name, so with `notes.md` beside a stray `notes` a refused Remove drew its sentence
  under both. Matched by file now, which is one per entry.
- **260 is tuned to the seed.** The comment is fixed; the constant is not. A fixed grid cannot bound a
  card whose content is unbounded, and the two fixes the brief offered were the cell or a cap — a cap
  cuts the ask, which is the one thing the card exists to show. See item 4.

## For CLAUDE.md, at the merge

A lesson for the `apps/web` list, left here rather than written into `CLAUDE.md` while other sessions
may own that file:

> **A card on the Factory must fit its cell.** The grid puts the card beneath a `CELL_HEIGHT` below,
> so a card drawn taller reaches over it on every layout, and no screenshot shows it — the tall cards
> are finished runs, off the default floor. The e2e measures it after a Reset layout
> (`expectClearOfEachOther` in `apps/web/test/e2e/run.ts`); a card that grows a line is measured there,
> not seen.

## Checked

`npm test && npm run typecheck && npm run build && npm run e2e` from the root, green. The pictures were
read in both themes (`.e2e/`): the floor is the same drawing with more room under each card, and
nothing else on the board moved.

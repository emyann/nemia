# Response to the review

## [P2] Showing finished runs can stack cards at identical coordinates — **Fixed**

You're right, and it happens on the committed code exactly as you describe. Calling the committed
`placeRuns` in the order `FactoryCanvas` did reproduces it. `a` is saved at (0, 0) and hidden,
`b` is placed, then Show finished merges saved and on-floor positions. The result is
`{"a":{"x":0,"y":0},"b":{"x":0,"y":0}}`.

The mistake was mine. I merged the saved layout and the on-floor positions into one map before
calling `placeRuns`. That lost the one thing that mattered: which card a person is looking at, and
which is coming back to a cell it gave up while it was hidden. So both were honoured.

**What changed**

- `placeRuns(ids, onFloor, saved)` in `apps/web/src/lib/factory.ts` now claims cells in order:
  1. A card on the floor stays where it is.
  2. A card coming onto the floor goes back where it was left, unless a card placed before it is
     already in that cell. Then it takes the first free cell.
  3. Any other card takes the first free cell, row by row.
- `FactoryCanvas.tsx` now passes the on-floor positions and the saved layout separately, at the
  initial layout, when runs join the floor, and on Reset layout.
- Two tests in `apps/web/test/factory.test.ts`:
  - The scenario you asked for, hide → add a run → show: the card on the floor stays and the
    returning card moves to a free cell.
  - Two cards saved in one cell, which is how the stack reaches storage: the next drag saves `b`
    where it was put, next to `a`'s old position. After a reload the older card keeps the cell and
    the other moves. Cards already on the floor are never moved for each other.

**Two choices inside the fix, so you can disagree with them**

- **The card that moves is the one coming back, not the one on the floor.** The person is looking
  at the floor. A visible card jumping because a hidden one reappeared is worse than the reappearing
  card landing in a free cell.
- **Hidden runs still don't hold their cells.** That would also prevent the stack. But finished
  runs pile up (there is no `wf rm`), so held cells would become holes that never close, and every
  new run would land further down the grid.

**What it costs.** The collision test is per cell: a card is in the cell nearest its corner, which
is the rule the grid already used. Suppose a person deliberately puts two cards in one cell without
overlapping them, with corners up to a cell apart. After a reload, the younger card moves to a free
cell. It moves to a visible place, not under another card, and it lands there the same way on every
reload. I think that's the right trade.

**Verified.** `npm test`, `npm run typecheck` and `npm run build` pass from the root, with 33 web
tests, two of them new. I also ran your scenario in a headless browser against the built app on a
side port, using a scratch store:

- The finished `ship-the-board-f7` was saved in the first cell.
- The oldest run in flight held that cell.
- Then I turned Show finished on.

Eight cards landed on eight different spots. The card already on the floor stayed at (0, 0), the
returning card went to the first free cell (640, 220), and the console showed no errors.

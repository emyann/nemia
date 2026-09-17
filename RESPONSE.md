# A finished run is a decision on the board

§8's board half, as asked: `to decide` on the api, the Factory's count and its marked card, the Runs
page's group, the run page's banner and the ending's gate panel, and the e2e's three seeded runs.
The account for a reader is `packages/agent-workflows/docs/features.md`, *Shipped: the end of a run
is a step of its workflow* → *What the board does with it*. Each item is one commit.

## What is worth a second look

**Two things I fixed that were not on the list.** Both were found by the work, not looked for, and
both are in `apps/web`:

- **A card the floor placed could be drawn over the card above it** (`cellsOf`, commit *The floor: a
  card between two rows holds both of them*). The grid rounded a card to the row its top was nearest
  and let a quarter of a row go, so a card a person had dropped 45 units short of its row held that
  row alone — and the row it hung into read as free. Once the seed's three new runs filled the grid,
  a card landed there and overlapped by 18 units. A card now holds every row it reaches. Nothing on
  the grid moves; a card off the grid holds one row more. `factory.test.ts` fails without the rule.
- **A write invalidated the decision key the page was on** (commit *The board's writes invalidate the
  run's record alone*). The board reads a run's decision under a key that *is* the run's state
  (`decisionStamp`), so that the git-heavy read happens once per state. The four writes — a try, a
  round, an approval, words said — invalidated `['runs', <id>]` by prefix, and the refetch filled the
  key the page was on with the answer for the state *after* the write. A run whose state then went
  back to one already read showed a blank Decide section, and my new gate panel a branch still being
  read, until a reload. The e2e's `decide` page is what caught it and what holds it: it sends the work
  back and takes that back, which is the one way to return to a state exactly.

**The cost of the branch standings.** `assess` and `listing` want them for the git kind of `to decide`,
and they read git. The api asks only where the answer can decide anything — not for a run called off,
one still going, one that worked on its base branch, or a folder whose ending merges — so a run at a
gate costs no `git` at all, and an api test counts the calls to say so. Measured on the operator's own
store (75 runs, 2026-09-17): 68 runs have a result branch to read, and reading every one of them takes
580 ms, which is the upper bound for a poll of the list; the real set is the succeeded ones among them.
If that shows on the board, the next step is not to store the answer — `shipped` is deliberately asked
each pass — but to ask git once per repository rather than twice per branch.

## What I left

- **The builder still cannot set `workspace:`**, as §8's leaves already say: `WorkflowStepSpec` in
  `apps/web` does not carry the key.
- **A run with two endings** is drawn from the first ending that waits, as the package reads it.
- **An ending that waits on several steps** offers a send-back to each of them by a radio, since one
  objection is enough to hold the gate again. Nobody has run such a folder.

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
gate costs no `git` at all, and an api test counts the calls to say so.

Round 2 narrowed it further, after the review put a number on it: the api now remembers the result
branches it has seen **on** their base branch (`onTheBase` in app.ts), which is the one answer that
cannot change without a history rewrite and the one that says there is nothing to decide. Remembering
it can only forget a decision, never invent one, and the answer that holds a person up — a branch ahead
of the base — is asked on every poll, with a test that counts the calls both ways. On the operator's
own store (2026-09-17): 69 runs have a result branch, 66 of them already on main, so the first read of
the list spends 691 ms in `git` and every later one asks about three branches.

What is left is the package's: `isShipped` is two `merge-base` calls a branch because it reads a
deleted branch by the tip the run recorded. One `git for-each-ref --merged <base>` per repository would
answer for a whole store in one spawn, and it belongs beside that judgement rather than as a second
reading on the board. features.md's leaves say so.

## Round 2

All five of review's findings are fixed; none was wrong. Four were the ending's gate saying something
that is not true of it, and every one of them is a sentence a person reads while deciding a merge:

- the approve box said the words go to the steps after the gate. Nothing follows an ending, and its own
  brief is handed them as the terms it acts on (`approvedSection`);
- the panel shown the moment a word is taken named the gated step for a try filed for the work, and told
  an approval it files what waits on it, where nothing does (`takenOf`, tested on its own);
- an ending that waits on nothing was offered a send-back the package refuses. Such a folder does load
  — one step, `workspace: main`, `gate: true`, and `sendBackTo` is empty — so the form is gone and the
  approval is the only word, as `wf ls`'s gate note prints it;
- the facts row said the gate "holds once it has signed off" of a step that never signs off before its
  gate. The run's detail now carries `workspace` on a step's spec, which is the only thing that tells
  such a gate from §6's — the two read the same off a step's record — and `gateWord` says where it holds.

The fifth, the `git` on the polled list, is narrowed above rather than left for a person: what remains
is the package's batching, beside the judgement it belongs to.

## What I left

- **The builder still cannot set `workspace:`**, as §8's leaves already say: `WorkflowStepSpec` in
  `apps/web` does not carry the key.
- **A run with two endings** is drawn from the first ending that waits, as the package reads it.
- **An ending that waits on several steps** offers a send-back to each of them by a radio, since one
  objection is enough to hold the gate again. Nobody has run such a folder.

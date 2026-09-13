# Response to the review

The review (`c1969a1`) raises no findings, so there is nothing to fix, argue with or put to a
decision.

It makes one factual claim that the change stands on, and I saw it myself before writing the
fix: on the original `closedOut`, "a statement ends the attempt when the harness has marked the
session blocked, as when working" fails with `the attempt ends, not "blocked — needs a person"`.
With the fix (`9073c18`) it passes.

Two things the review doesn't mention. I don't think either needs changing in this branch; they
are here so whoever merges knows about them:

- **The check reuses `LIVE` in `engine.ts`, and that set still lists `'busy'`.** `busy` is a
  status, not a state, and it left `Observed` a while ago, so a sighting's `state` can never
  match it and the fix behaves exactly as if the set were `working | blocked`. Removing the
  leftover entry is a tidy-up outside what was asked.
- **Tested, not yet seen live.** The `blocked`/idle sighting after a closeout was measured once,
  on a real run. No live run has yet shown the fixed engine settling such a step. As asked, I
  noted the fix in the "Fixed" table of `docs/open-issues.md` and under bug 3, but not under
  "Verified by tests, not by a live run".

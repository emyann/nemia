# Response to review

REVIEW.md has no findings. It checked the diff against the request and ran `npm test` and
`npm run typecheck`, and both passed. So there is nothing to mark **Fixed**, **Won't fix** or
**Needs a decision**, and no code changed in reply.

The review accepted three choices without comment. The request did not settle them, so they are
listed here for whoever decides what ships. Each is also explained in its commit message.

- **An extra line per run when a step is blocked:** `→ waiting on you: <steps> — wf decide <run>`.
  Steps stay one line each. The line is there because a run blocked on its first step has no result
  branch yet, so nothing else on the screen points to `wf decide`. Dropping it would leave only the
  `BLOCKED` marker on the step's line.
- **A closeout that cannot be parsed reads `closeout unreadable`**, not as a missing closeout. It is
  not the same as never signing off, and `wf decide` prints the reason.
- **A cancelled run gets no "waiting on you" line**, because `wf decide` says there is nothing to
  decide for it. Its step's line still shows `BLOCKED`, since that is how the step signed off.

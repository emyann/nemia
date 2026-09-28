---
after: review
# The repository's own checkout, not a worktree: the base branch is checked out there, which is the one
# thing a worktree cannot merge onto. Nothing else of the run works here, and the run commits nothing here but the
# merge this step stages, on the word of the check below.
workspace: main
# Who does the work is agents/shipper.md — its role keys and its recipe: it stages the merge and signs off the message for it.
agent: shipper
# The end of the run is a person's decision, so nothing of this step is filed until they approve it —
# `wf approve <run> ship` — and the words they give with it are on this brief under `## Approved`.
gate: true
# The run executes this on the merge the step leaves staged, as it executes any step's check — the check harness, its
# deadline, at low priority — and commits the merge with the step's message on exit 0, or aborts it on anything else,
# a check that did not finish included (`landingDue`). The command is implement's, the same line.
# With no WF_BASE_REF there, it runs the e2e that a round's check leaves for the merged tree.
# The run's, not the shipper's: a job cannot hold its turn open for a suite that runs for minutes.
check: npm test && npm run typecheck && npm run lint && npm run build && if [ -n "${WF_BASE_REF:-}" ]; then echo "wf check: no e2e in a round's check; it runs once, on the merged tree, where no WF_BASE_REF is set"; else npm run e2e; fi
---
In this team the check the run executes on your merge builds the web app and runs its e2e, and both matter on the merged
tree though the branch's own check was green: `npm run build` regenerates the web app's route tree, `npm run e2e` visits
every page in both themes, and the merged tree is the first tree either has seen. No round's check ran the e2e — the run
sets `WF_BASE_REF` there, and the line leaves it for the merged tree — so this is the first time it meets the work at all.
Say so in the message's last line.

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
# Mid-merge, with no WF_BASE_REF, it reads what the merge brings (HEAD...MERGE_HEAD) to tell whether the web app was touched,
# and runs the e2e that a round's check leaves for the merged tree.
# The run's, not the shipper's: a job cannot hold its turn open for a suite that runs for minutes.
check: npm test && npm run typecheck && npm run lint && { if [ -n "${WF_BASE_REF:-}" ]; then range="$WF_BASE_REF...HEAD"; else range=HEAD...MERGE_HEAD; fi; touched=$(git -c core.quotePath=false diff --no-renames --name-only "$range" --) || { echo "wf check: cannot tell what the work touched, since git diff --name-only $range failed; the build and the e2e are not skipped on a guess" >&2; false; }; } && if printf '%s\n' "$touched" | grep -Eq '^(apps/(web|api)/|package(-lock)?\.json$|turbo\.json$)'; then npm run build && if [ -n "${WF_BASE_REF:-}" ]; then echo "wf check: no e2e in a round's check; it runs once, on the merged tree, where no WF_BASE_REF is set"; else npm run e2e; fi; else echo "wf check: nothing under apps/web/ or apps/api/, nor the root's package.json, package-lock.json or turbo.json, was touched: no build, no e2e"; fi
---

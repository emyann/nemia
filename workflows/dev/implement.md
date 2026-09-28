---
# Who does the work is agents/implementer.md — its role keys and its instructions. This file is the step's wiring.
agent: implementer
# The build and the e2e run when, and only when, the work touched what they read: apps/web/, apps/api/ (which serves the e2e),
# or the root's package.json, package-lock.json and turbo.json (the scripts, the dependencies and the build's tasks). The packages'
# sources reach no browser, and their own tests judge them. What was touched is git's fact: in a check, the branch against the run's
# base (WF_BASE_REF); in ship's check, mid-merge with no WF_BASE_REF, what the merge brings (HEAD...MERGE_HEAD). Neither there,
# or git unable to say, and the check fails with words rather than skipping. A round's check builds and runs no e2e (3-4 minutes
# of every round, which seldom changes a review's verdict); the e2e runs once, on the merged tree, in ship's check, which the run
# executes with no WF_BASE_REF set. Keyed on that one variable, not on a step's name: the run sets it for a step in a worktree and
# never for one in the repository's checkout, and anything that runs this line without the run's environment runs the whole of it.
# --no-renames, or a file moved out of apps/web/ is listed by its new path only; core.quotePath=false, or a path with
# a non-ASCII character is quoted and misses ^apps/.
# Written here, not in a script the step could edit.
check: npm test && npm run typecheck && npm run lint && { if [ -n "${WF_BASE_REF:-}" ]; then range="$WF_BASE_REF...HEAD"; else range=HEAD...MERGE_HEAD; fi; touched=$(git -c core.quotePath=false diff --no-renames --name-only "$range" --) || { echo "wf check: cannot tell what the work touched, since git diff --name-only $range failed; the build and the e2e are not skipped on a guess" >&2; false; }; } && if printf '%s\n' "$touched" | grep -Eq '^(apps/(web|api)/|package(-lock)?\.json$|turbo\.json$)'; then npm run build && if [ -n "${WF_BASE_REF:-}" ]; then echo "wf check: no e2e in a round's check; it runs once, on the merged tree, where no WF_BASE_REF is set"; else npm run e2e; fi; else echo "wf check: nothing under apps/web/ or apps/api/, nor the root's package.json, package-lock.json or turbo.json, was touched: no build, no e2e"; fi
---

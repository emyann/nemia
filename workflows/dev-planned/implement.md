---
after: plan
# The plan reaches this step as data, under `## From plan`: what plan declared in its closeout, and never its summary.
input: plan
# Who does the work is agents/implementer.md — its role keys and its instructions. This file is the step's wiring.
agent: implementer
# The build and the e2e run when, and only when, the work touched what they read: apps/web/, apps/api/ (which serves the e2e),
# or the root's package.json, package-lock.json and turbo.json (the scripts, the dependencies and the build's tasks). The packages'
# sources reach no browser, and their own tests judge them. What was touched is git's fact: in a check, the branch against the run's
# base (WF_BASE_REF); in the shipper's hands, mid-merge with no WF_BASE_REF, what the merge brings (HEAD...MERGE_HEAD). Neither there,
# or git unable to say, and the check fails with words rather than skipping. Written here, not in a script the step could edit.
check: npm test && npm run typecheck && { if [ -n "${WF_BASE_REF:-}" ]; then range="$WF_BASE_REF...HEAD"; else range=HEAD...MERGE_HEAD; fi; touched=$(git diff --name-only "$range" --) || { echo "wf check: cannot tell what the work touched, since git diff --name-only $range failed; the build and the e2e are not skipped on a guess" >&2; false; }; } && if printf '%s\n' "$touched" | grep -Eq '^(apps/(web|api)/|package(-lock)?\.json$|turbo\.json$)'; then npm run build && npm run e2e; else echo "wf check: nothing under apps/web/ or apps/api/, nor the root's package.json, package-lock.json or turbo.json, was touched: no build, no e2e"; fi
---

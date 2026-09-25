---
after: review
# The repository's own checkout, not a worktree: the base branch is checked out there, which is the one
# thing a worktree cannot merge onto. Nothing else of the run works here, and the run commits nothing here.
workspace: main
# Who does the work is agents/shipper.md — its role keys and its recipe. The check it runs on the merge is named on its
# brief, under *Where to look*: each check the steps before it were judged by.
agent: shipper
# The end of the run is a person's decision, so nothing of this step is filed until they approve it —
# `wf approve <run> ship` — and the words they give with it are on this brief under `## Approved`.
gate: true
---
In this team the check builds the web app, and both the build and the e2e matter on the merged tree though the
branch's own check was green: `npm run build` regenerates the web app's route tree, `npm run e2e` visits every page in
both themes, and the merged tree is the first tree either has seen. No round's check ran the e2e — the run sets
`WF_BASE_REF` there, and the line leaves it for the merged tree — so this is the first time it meets the work at all.
Run the whole check on it.

**Open the pull request before you sign off**, once a round and after you merged the base: this run's change is judged on GitHub, and
your fence refuses every `git push` and every `gh` call, so the push and the pull request are one frozen script, read from the run's
frozen workflow files (`$WF_WORKFLOW_FILES`) as your check reads it, and out of the base only while that is unset. Run it:

```
if [ -n "${WF_WORKFLOW_FILES:-}" ]; then s="$WF_WORKFLOW_FILES/pull-request.ts"; else p=$(mktemp -d) && git show main-worktree/HEAD:workflows/build/pull-request.ts > "$p/pull-request.ts" && s="$p/pull-request.ts"; fi
node "$s" open --title "<the card's line>" --body-file "$WF_STEP_FILES/pr-body.md"
```

Write that body first, in a file of your files directory: what the change does and what proves it, a few paragraphs, amended as the
rounds go. The script pushes your own branch, never another and never the base and never forced, and opens the pull request or brings
the open one up to date, never a draft. Name the address it prints (`wf pr: <url>`) in your `artifacts` as a value, `{"name": "pull
request", "value": "<the url>"}`.

Your check then pushes again through the same script, so CI's verdict is for the commit it judges, and waits on the `ci` context: CI
runs the suite, the types, the lint, the whole e2e and the build on that commit, and a red, cancelled or missing `ci` comes back as the
check's refusal, with the Actions URL, the failing jobs and the tail of their log — your next try is handed that, since you may type no
`gh` yourself.

This is a quick build: no spec was written for you. You are handed a card, and a review reads your plan and your change — Agora's,
read-only, which asks for another round or passes. Its pass lands the change: there is no person's gate after it, so the review is the
one reader between your work and the base branch.

**Write your plan first**, before you build: what changes, where, and what proves it, in a few lines. It goes in your closeout's `plan`,
as you wrote it, corrected where the work proved it wrong. Then build it, with the tests that prove it.

**Decide nothing the card does not give.** When the change needs a decision the card leaves open (a taste call, a name a person will
read, which of two behaviours), sign off `blocked` and say in `needs` what is undecided; do not choose for them.

**A quick build has no size bound**: quick is for a card that needs no design, whatever its size. The check measures it first
(`workflows/quick/change.ts`): files and lines, added plus removed, tests and docs counted, generated files (`package-lock.json`,
`apps/web/theme/`, `apps/web/src/routeTree.gen.ts`) left out, said as a fact and refused by no number. Do not trim the work, split it
or drop its tests to make it look smaller: the review reads every line.

**Nothing runs your tests for you.** The check measures the change, proves the pictures and the probes, then pushes
the branch and waits on CI: it runs `change.ts size`, `pictures.ts`, `probe.ts`, `pull-request.ts push` and
`pull-request.ts wait`, in that order, and nothing else. Run them yourself before you sign off, as `CLAUDE.md`, *Check your work*, says
of a step's session: the tests of what you changed, the types and the lint, and for a change to the board the e2e pages it touches, with
pictures. CI's `ci` context runs the suite, the types, the lint and the whole e2e on the commit your check pushed, before the review, and that is
the last thing any suite reads: the landing merges that same commit and its check is only the receipt that it was merged. A red `ci`
comes back to you, with what the check said; a landing refuses before anything is merged — a pull request GitHub calls unmergeable, a
`ci` no longer green — and nothing landed.

**Name the pages** the change touches in your closeout's `pages`, each by the name `npm run e2e -- --pages <name,…>` takes, `[]` when
it touches none: they are the pages you ran, and nothing reads them but the review.

When the change touches `apps/web`, picture the pages and the states it touches, in light and dark, and at a phone's width where the
page sets one: `WF_ARTIFACTS=<your files directory> npm run e2e -- --photos --pages <name,…>` pictures the pages named, in both themes,
and visits no other. The `look` skill says how, and how to picture a state no page reaches.
Name each picture in `artifacts` by its absolute path. `npm run e2e` without `--photos` takes no picture but a failing page's.
The check refuses a change under `apps/web/src` whose `artifacts` names no picture that is there (`pictures.ts`); a change only under
`apps/web/test` asks for none. Run the e2e on the pages the change touches, `npm run e2e -- --pages <name,…>`, never the whole suite
but to measure it: CI runs every page on the commit your check pushes, before the review.

When the change touches `tools/observe` — a dashboard, the collector's or Tempo's file, the compose file, the render — see it rendered
before you sign off: `node tools/observe/render/render.ts --out <your files directory>` starts a throwaway stack from this workspace
with fake data, never the live one, and writes `dashboard-<name>.png` and `dashboard-<name>.txt` for each dashboard. Read them as the
`see-a-dashboard` skill says, and name each in `artifacts` by its absolute path: the check refuses a changed dashboard whose picture and
text are not named (`pictures.ts`); a change only to `tools/observe/README.md` or under `tools/observe/profile` asks for none. To look
with your browser, add `--hold`, and stop the stack it names when you are done: `node tools/observe/render/render.ts --stop <name>`.

**Merge the base before you sign off**, on every try: the base moves while you work, `ci` judges the commit your check pushes and
nothing judges the merged tree afterwards — the landing's check is a receipt — so a base you did not merge is a base GitHub may call
unmergeable at the landing, which refuses rather than lands. The measure counts your own change alone, from the base you merged last. The base is the branch the repository's own checkout is on, and from your worktree git names its tip
`main-worktree/HEAD`, whatever that branch is called. Commit your work, then `git merge main-worktree/HEAD`, made as the `git` skill
says a merge is made: keep both meanings in each conflict, and sign off `blocked` where both cannot hold. Then run again the tests of
what the merge touched: those of each file of yours it changed, and of each file it changed that your code or your tests read.
Measure again whatever your change wrote by a measure, a baseline or a count that only shrinks: the number was true of the tree before
the merge. Say in your summary the commit you merged, or that git answered `Already up to date`. You merge the base into your
branch, never your branch into the base. On a try whose brief is headed `## Merge`, merge the commit it names and no other.

When you start a Claude Code session of your own to measure something, a probe, start it through the run's frozen copy, `node
"${WF_WORKFLOW_FILES:-workflows/build}/probe.ts" start <label> -- <prompt>`: a bare `claude --bg` or Remote Control is refused to you.
It names the session for the run, runs it in the machinery's trusted folder (`$WF_ROOT/probes`), and tells the person no action is
needed; pass `--settings` rather than edit a folder's settings. Only when the measurement needs the person's answer, add `--answer
"<what to press>"`: the session then reaches their phone, and you stop `blocked` with the `needs` line it prints. Read your probes with
`list`, and stop them with `stop` before you sign off: the check refuses a live one.

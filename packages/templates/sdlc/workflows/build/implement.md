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

When the change touches `apps/web`, picture the pages and the states it touches, in light and dark, and at a phone's width where the
page sets one: `WF_ARTIFACTS=<your files directory> npm run e2e -- --photos --pages <name,…>` pictures the pages named, in both themes,
and visits no other. The `look` skill says how, and how to picture a state no page reaches.
Name each picture in `artifacts` by its absolute path. `npm run e2e` without `--photos` takes no picture but a failing page's.
The check refuses a change under `apps/web/src` whose `artifacts` names no picture that is there (`pictures.ts`); a change only under
`apps/web/test` asks for none. Run the e2e on the pages the change touches, `npm run e2e -- --pages <name,…>`, never the whole suite
but to measure it: CI runs every page, in workers, on the commit your check pushes.

When the change touches `tools/observe` — a dashboard, the collector's or Tempo's file, the compose file, the render — see it rendered
before you sign off: `node tools/observe/render/render.ts --out <your files directory>` starts a throwaway stack from this workspace
with fake data, never the live one, and writes `dashboard-<name>.png` and `dashboard-<name>.txt` for each dashboard. Read them as the
`see-a-dashboard` skill says, and name each in `artifacts` by its absolute path: the check refuses a changed dashboard whose picture and
text are not named (`pictures.ts`); a change only to `tools/observe/README.md` or under `tools/observe/profile` asks for none. To look
with your browser, add `--hold`, and stop the stack it names when you are done: `node tools/observe/render/render.ts --stop <name>`.

**Merge the base before you sign off**, on every try: the base moves while you work, `ci` judges the commit your check pushes and
nothing judges the merged tree afterwards — the landing's check is a receipt — so a base you did not merge is a base GitHub may call
unmergeable at the landing, which refuses rather than lands. The base is the branch the repository's own checkout is on, and from your worktree git names its tip
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

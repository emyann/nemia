**Open the pull request before you sign off**, once a round and after you merged the base: this run's change is judged on GitHub, and
your fence refuses every `git push` and every `gh` call, so the push and the pull request are one frozen script, read from the run's
frozen workflow files (`$WF_WORKFLOW_FILES`) as your check reads it. Run it:

```
node "$WF_WORKFLOW_FILES/pull-request.ts" open --title "<the card's line>" --body-file "$WF_STEP_FILES/pr-body.md"
```

Write that body first, in a file of your files directory: what the change does and what proves it, a few paragraphs, amended as the
rounds go. The script pushes your own branch, never another and never the base and never forced, and opens the pull request or brings
the open one up to date, never a draft. Name the address it prints (`nemia pr: <url>`) in your `artifacts` as a value, `{"name": "pull
request", "value": "<the url>"}`.

Your check then pushes again through the same script, so CI's verdict is for the commit it judges, runs the repository's round check
(`${{ parameters.roundCheck }}`), and waits on the `${{ parameters.ciCheck }}` context: CI runs the repository's suite on that commit,
and a red, cancelled or missing `${{ parameters.ciCheck }}` comes back as the check's refusal, with the Actions URL, the failing jobs
and the tail of their log — your next try is handed that, since you may type no `gh` yourself.

**Merge the base before you sign off**, on every try: the base moves while you work, CI judges the commit your check pushes and
nothing judges the merged tree afterwards — the landing's check is a receipt — so a base you did not merge is a base GitHub may call
unmergeable at the landing, which refuses rather than lands. The base is the branch the repository's own checkout is on, and from your worktree git names its tip
`main-worktree/HEAD`, whatever that branch is called. Commit your work, then `git merge main-worktree/HEAD`, made as the `git` skill
says a merge is made: keep both meanings in each conflict, and sign off `blocked` where both cannot hold. Then run again the tests of
what the merge touched: those of each file of yours it changed, and of each file it changed that your code or your tests read.
Measure again whatever your change wrote by a measure, a baseline or a count that only shrinks: the number was true of the tree before
the merge. Say in your summary the commit you merged, or that git answered `Already up to date`. You merge the base into your
branch, never your branch into the base. On a try whose brief is headed `## Merge`, merge the commit it names and no other.

When you start a Claude Code session of your own to measure something, a probe, start it through the run's frozen copy, `node
"$WF_WORKFLOW_FILES/probe.ts" start <label> -- <prompt>`: a bare `claude --bg` or Remote Control is refused to you.
It names the session for the run, runs it in the machinery's trusted folder (`$WF_ROOT/probes`), and tells the person no action is
needed; pass `--settings` rather than edit a folder's settings. Only when the measurement needs the person's answer, add `--answer
"<what to press>"`: the session then reaches their phone, and you stop `blocked` with the `needs` line it prints. Read your probes with
`list`, and stop them with `stop` before you sign off: the check refuses a live one.

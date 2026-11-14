Does this factory judge and land its work on GitHub? **${{ parameters.github }}**. Follow the part below headed with that answer,
and only it, then the part headed *Either way*.

### true — on GitHub

**Open the pull request before you sign off**, once a round and after you merged the base: this run's change is judged on GitHub, and
your fence refuses every `git push` and every `gh` call, so the push and the pull request are one frozen script, read from the run's
frozen carried files (`$WF_CARRIED_FILES`) as your check reads it. Run it:

```
node "$WF_CARRIED_FILES/pull-request.ts" open --title "<the card's line>" --body-file "$WF_STEP_FILES/pr-body.md" --labels "${{ parameters.pullRequestLabels }}"
```

Type the `--labels` as it stands: those are the factory's rules, and the script labels the pull request by them, from the run's
labels, as it opens it, so no check of the repository sees it unlabelled; your check labels it again each round.

Write that body first, in a file of your files directory: what the change does and what proves it, a few paragraphs, amended as the
rounds go. The script pushes your own branch, never another and never the base and never forced, and opens the pull request or brings
the open one up to date, never a draft. Name the address it prints (`nemia pr: <url>`) in your `artifacts` as a value, `{"name": "pull
request", "value": "<the url>"}`.

Your check runs `probe.ts`, `parts.ts` and the factory's own check, its `implementCheck` parameter (`${{ parameters.implementCheck }}`; `true` checks nothing), then pushes again through the same script, so CI's verdict is for the commit it judges, runs the repository's round check
(`${{ parameters.roundCheck }}`), and waits on the `${{ parameters.ciCheck }}` context: CI runs the repository's suite on that commit,
and a red, cancelled or missing `${{ parameters.ciCheck }}` comes back as the check's refusal, with the Actions URL, the failing jobs
and the tail of their log — the script reads it for you, since you may type no `gh` yourself (*When your check refuses*, below).
A red context has been re-run once by then, its failed jobs, so a red refusal names the jobs re-run and how each ended the second
time: a job red twice is the change's. A refusal that says the re-run was still running at the bound asks nothing of the work:
change nothing, and sign off as before; the next check reads the re-run's own verdict and re-runs nothing again.

### false — in this checkout

This factory has no remote: nothing is pushed and no pull request is opened, and you open none. Your check runs `probe.ts`,
`parts.ts` and the factory's own check, its `implementCheck` parameter (`${{ parameters.implementCheck }}`; `true` checks nothing), then the repository's local check (`${{ parameters.localCheck }}`) on this round's tree, from the workspace's root, and nothing else: a refusal
of it comes back to you with the end of its output (*When your check refuses*, below). That command is the only judge of the change before it
lands, and the landing runs it again, on the base with your branch merged into it, before the merge is committed.

### Either way

**When your check refuses**, the run tries you again on its own, up to twice a round (`retries: 2`): it continues this session and
hands you, as data, the command, its exit and the last lines of what it printed — on GitHub, the failing jobs and the lines that
failed each. Make the work pass it, never weaken it, merge the base again, and sign off as before. A refusal only a person can answer — no `gh` or none logged in, no `origin`, a draft or wrongly based pull
request, the label rules, CI that never judged the commit — exits 78, which this step's `checkFailurePolicy:` names: the run does not
try you again on it and waits on the person, so you are not asked about it. Where a failure has nothing to do
with your change (a flake, the machine out of memory), change nothing and sign off `done` as before, saying why in `summary`: signing
off again runs the check again, as far as this step's `retries:` allow, and only a session that signs off is asked. On GitHub, a refusal
that says the base's `${{ parameters.ciCheck }}` is red too, at the commit your branch holds, names the base's jobs that did not pass:
read the failing lines against them, and where a failure is the base's, change nothing for it and sign off `blocked`, saying so in
`needs`: only a try that merges the base once it is fixed clears it. The `nemia retry … --recheck` line a refusal ends with is the
person's, once your tries are spent, never a line for your `needs`. Past the retries, past the step's budget, or when the check did
not finish, the run waits on a person.

**Merge the base before you sign off**, on every try: the base moves while you work, and a base you did not merge is one the
landing refuses rather than lands: on GitHub, CI judges the commit your check pushes and nothing judges the merged tree afterwards —
the landing's check is a receipt — so GitHub may call the pull request unmergeable; in this checkout, the landing stages your branch
on the base as it is then, and a merge that conflicts or breaks the local check is taken back. The base is the branch the repository's own checkout is on, and from your worktree git names its tip
`main-worktree/HEAD`, whatever that branch is called. Commit your work, then `git merge main-worktree/HEAD`, made as the `git` skill
says a merge is made: keep both meanings in each conflict, and sign off `blocked` where both cannot hold. Then run again the tests of
what the merge touched: those of each file of yours it changed, and of each file it changed that your code or your tests read.
Measure again whatever your change wrote by a measure, a baseline or a count that only shrinks: the number was true of the tree before
the merge. Say in your summary the commit you merged, or that git answered `Already up to date`. You merge the base into your
branch, never your branch into the base. On a try whose brief is headed `## Merge`, merge the commit it names and no other.

**Settle every part of the run before you sign off.** Where you built through parts, each on a branch of its own beside yours
(`wf/<run>/<part>`), the landing refuses a part whose work the branch it lands does not hold, by patch (`git cherry`), so each is
taken into your branch, by a merge or as commits of your own, or settled. A part whose work your branch replaced (an earlier cut of
it, its work moved or made again) you declare replaced: `node "$WF_CARRIED_FILES/parts.ts" replaced <part>…` removes its branch,
keeping its tip as `refs/backup/wf/<run>/<part>`, which a step may not do by hand; name each part you declared, and what replaced it,
in your closeout. Your check runs `parts.ts check`, which refuses while a part is neither, naming each and both ways to settle it.

When you start a Claude Code session of your own to measure something, a probe, start it through the run's frozen copy, `node
"$WF_CARRIED_FILES/probe.ts" start <label> -- <prompt>`: a bare `claude --bg` or Remote Control is refused to you.
It names the session for the run, runs it in the machinery's trusted folder (`$WF_ROOT/probes`), and tells the person no action is
needed; pass `--settings` rather than edit a folder's settings. Only when the measurement needs the person's answer, add `--answer
"<what to press>"`: the session then reaches their phone, and you stop `blocked` with the `needs` line it prints. Read your probes with
`list`, and stop them with `stop` before you sign off: the check refuses a live one.

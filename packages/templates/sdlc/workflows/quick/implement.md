Does this factory judge and land its work on GitHub? **${{ parameters.github }}**. Follow the part below headed with that answer,
and only it, then the part headed *Either way*.

### true — on GitHub

**Open the pull request before you sign off**, once a round and after you merged the base: this run's change is judged on GitHub, and
your fence refuses every `git push` and every `gh` call, so the push and the pull request are one frozen script, read from the run's
frozen workflow files (`$WF_WORKFLOW_FILES`) as your check reads it. Run it:

```
node "$WF_WORKFLOW_FILES/pull-request.ts" open --title "<the card's line>" --body-file "$WF_STEP_FILES/pr-body.md" --labels "${{ parameters.pullRequestLabels }}"
```

Type the `--labels` as it stands: those are the factory's rules, and the script labels the pull request by them, from the run's
labels, as it opens it, so no check of the repository sees it unlabelled; your check labels it again each round.

Write that body first, in a file of your files directory: what the change does and what proves it, a few paragraphs, amended as the
rounds go. The script pushes your own branch, never another and never the base and never forced, and opens the pull request or brings
the open one up to date, never a draft. Name the address it prints (`nemia pr: <url>`) in your `artifacts` as a value, `{"name": "pull
request", "value": "<the url>"}`.

Your check then pushes again through the same script, so CI's verdict is for the commit it judges, and waits on the
`${{ parameters.ciCheck }}` context: CI runs the repository's suite on that commit, and a red, cancelled or missing
`${{ parameters.ciCheck }}` comes back as the check's refusal, with the Actions URL, the failing jobs and the tail of their log — your
next try is handed that, since you may type no `gh` yourself.

**Nothing runs your tests for you.** The check measures the change, proves the probes and the parts, then pushes the branch and waits on CI: it
runs `change.ts size`, `probe.ts`, `parts.ts`, `pull-request.ts push` and `pull-request.ts wait`, in that order, and nothing else. Run them yourself
before you sign off, as the repository's instructions say of a session's checks: the tests of what you changed, the types and the
lint. CI's `${{ parameters.ciCheck }}` context runs the repository's suite on the commit your check pushed, before the review, and that
is the last thing any suite reads: the landing merges that same commit and its check is only the receipt that it was merged. A red
`${{ parameters.ciCheck }}` comes back to you, with what the check said; a landing refuses before anything is merged — a pull request
GitHub calls unmergeable, a `${{ parameters.ciCheck }}` no longer green — and nothing landed.

### false — in this checkout

This factory has no remote: nothing is pushed and no pull request is opened, and you open none.

**The local check is the only judge.** The check measures the change, proves the probes and the parts, then runs the repository's local check
(`${{ parameters.localCheck }}`) on this round's tree, from the workspace's root: it runs `change.ts size`, `probe.ts`, `parts.ts` and
the local check, in that order, and nothing else. Run the tests of what you changed, the types and the lint yourself before you sign off, as the
repository's instructions say of a session's checks; a refusal of the local check comes back to you with the end of its output. The
landing runs the local check again, on the base with your branch merged into it, before the merge is committed: a merge that conflicts
or breaks it is taken back, and nothing landed.

### Either way

This is a quick build: no spec was written for you. You are handed a card, and a review reads your plan and your change — Agora's,
read-only, which asks for another round or passes. Its pass lands the change: there is no person's gate after it, so the review is the
one reader between your work and the base branch.

**Write your plan first**, before you build: what changes, where, and what proves it, in a few lines. It goes in your closeout's `plan`,
as you wrote it, corrected where the work proved it wrong. Then build it, with the tests that prove it.

**Decide nothing the card does not give.** When the change needs a decision the card leaves open (a taste call, a name a person will
read, which of two behaviours), sign off `blocked` and say in `needs` what is undecided; do not choose for them.

**A quick build has no size bound**: quick is for a card that needs no design, whatever its size. The check measures it first
(`change.ts`): files and lines, added plus removed, tests and docs counted, generated files (`package-lock.json`, and each file the
repository marks `linguist-generated`) left out, said as a fact and refused by no number. Do not trim the work, split it or drop its
tests to make it look smaller: the review reads every line.

**Merge the base before you sign off**, on every try: the base moves while you work, and a base you did not merge is one the
landing refuses rather than lands: on GitHub, CI judges the commit your check pushes and nothing judges the merged tree afterwards —
the landing's check is a receipt — so GitHub may call the pull request unmergeable; in this checkout, the landing stages your branch
on the base as it is then, and a merge that conflicts or breaks the local check is taken back. The measure counts your own change alone, from the base you merged last. The base is the branch the repository's own checkout is on, and from your worktree git names its tip
`main-worktree/HEAD`, whatever that branch is called. Commit your work, then `git merge main-worktree/HEAD`, made as the `git` skill
says a merge is made: keep both meanings in each conflict, and sign off `blocked` where both cannot hold. Then run again the tests of
what the merge touched: those of each file of yours it changed, and of each file it changed that your code or your tests read.
Measure again whatever your change wrote by a measure, a baseline or a count that only shrinks: the number was true of the tree before
the merge. Say in your summary the commit you merged, or that git answered `Already up to date`. You merge the base into your
branch, never your branch into the base. On a try whose brief is headed `## Merge`, merge the commit it names and no other.

**Settle every part of the run before you sign off.** Where you built through parts, each on a branch of its own beside yours
(`wf/<run>/<part>`), the landing refuses a part whose work the branch it lands does not hold, by patch (`git cherry`), so each is
taken into your branch, by a merge or as commits of your own, or settled. A part whose work your branch replaced (an earlier cut of
it, its work moved or made again) you declare replaced: `node "$WF_WORKFLOW_FILES/parts.ts" replaced <part>…` removes its branch,
keeping its tip as `refs/backup/wf/<run>/<part>`, which a step may not do by hand; name each part you declared, and what replaced it,
in your closeout. Your check runs `parts.ts check`, which refuses while a part is neither, naming each and both ways to settle it.

When you start a Claude Code session of your own to measure something, a probe, start it through the run's frozen copy, `node
"$WF_WORKFLOW_FILES/probe.ts" start <label> -- <prompt>`: a bare `claude --bg` or Remote Control is refused to you.
It names the session for the run, runs it in the machinery's trusted folder (`$WF_ROOT/probes`), and tells the person no action is
needed; pass `--settings` rather than edit a folder's settings. Only when the measurement needs the person's answer, add `--answer
"<what to press>"`: the session then reaches their phone, and you stop `blocked` with the `needs` line it prints. Read your probes with
`list`, and stop them with `stop` before you sign off: the check refuses a live one.

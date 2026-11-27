Does this factory judge and land its work on GitHub? **${{ parameters.github }}**. Follow the part below headed with that answer,
and only it, then the part headed *Either way*.

### true — on GitHub

**Open the pull request before you sign off**, once a round and after you merged the base: this run's change is judged on GitHub. Your
fence refuses every `git push` and every `gh` call, so the push is one frozen script, read from the run's frozen carried files
(`$WF_CARRIED_FILES`) as your check reads it, and the pull request is yours, through the GitHub server. Run the script first:

```
node "$WF_CARRIED_FILES/pull-request.ts" branch
```

It pushes your own branch, never another, never the base and never forced, calls no GitHub, and prints `repository <owner/repo>`, `head`,
`base` and `commit`. Then write the body in a file of your files directory (`$WF_STEP_FILES/pr-body.md`): what the change does and what
proves it, a few paragraphs, amended as the rounds go. Then, through the server (`mcp__github__<tool>`):

1. `list_pull_requests` with the repository's `owner` and `repo`, `head` as `<owner>:<head branch>` and `state` `open`;
2. where none is open, `create_pull_request` with `owner`, `repo`, `head`, `base`, a `title` (the card's line) and the `body`, never `draft`;
3. where one is open, `update_pull_request` with `owner`, `repo`, `pullNumber`, the `title` and the `body`.

Name its address in your `artifacts` as a value, `{"name": "pull request", "value": "<the url>"}`. You label nothing: your check sets the
labels the factory's rules give the run's labels (`${{ parameters.pullRequestLabels }}`), each round, and refuses a draft, another base,
two open pull requests, or a head that is not your commit, however the pull request was opened.

Your check then pushes again through the same script, so CI's verdict is for the commit it judges, and the factory's `ci-watch` program
writes the `ci` condition your step waits on: CI runs the repository's suite on that commit, and a red, cancelled or missing
`${{ parameters.ciCheck }}` comes back as the condition's `False` or its `Unknown`, with the head, the Actions URL and the failing jobs
(no log lines: you read why through the GitHub server, below).
A red whose job's log names a line that failed it is `False` after the first run, not re-run; a failing line your change did not touch (a
flaky test) you say so in your sign-off. Any other red context has been re-run once by then, its failed jobs, read from GitHub's `run_attempt`:
a job red twice is the change's. A step whose note says `ci` is `Unknown` asks nothing of the work: change nothing, and sign off as before;
the next pass reads the re-run's own verdict and re-runs nothing again.

**Don't wait on CI yourself.** Push and open the pull request, then sign off: your `ci` condition waits on `${{ parameters.ciCheck }}` and
hands you its verdict, the failing jobs and the Actions address. A session that sleeps or polls on `${{ parameters.ciCheck }}` holds
its slot and its context for nothing.

**Read a red CI yourself where its lines do not say why.** Your step loads the factory's `github` server, and a red `${{ parameters.ciCheck }}` whose handed lines
do not explain the failure (a page's failure detail, a log the job printed past the tail, a job with no failing test) is read from the
failed jobs themselves through it, read-only: `actions_list` the run's jobs, `actions_get` a run or a job, and `get_job_logs` the log of a
failed job, each as `mcp__github__<tool>`. Your fence refuses its writes (`actions_run_trigger`: run, re-run, cancel, delete
logs): the `ci-watch` program re-runs what it re-runs.

**Nothing runs your tests for you.** The check measures the change, proves the probes and the parts, then pushes the branch, and the `ci` condition waits on CI: it
runs `change.ts size`, `probe.ts`, `parts.ts`, the factory's own check, its `implementCheck` parameter (`${{ parameters.implementCheck }}`; `true` checks nothing), `pull-request.ts push` and `pull-request.ts declares-ci`, in that order, and nothing else; where neither the head nor the base branch declares
a CI workflow under `.github/workflows`, its `local` check runs the local check (`${{ parameters.localCheck }}`) in place of the condition, which is then written `True`. Run them yourself
before you sign off, as the repository's instructions say of a session's checks: the tests of what you changed, the types and the
lint. CI's `${{ parameters.ciCheck }}` context runs the repository's suite on the commit your check pushed, before the review, and that
is the last thing any suite reads: the landing program merges that same commit. A red
`${{ parameters.ciCheck }}` comes back to you, with what the check said; the landing program refuses before anything is merged — a pull request
GitHub calls unmergeable, a `${{ parameters.ciCheck }}` no longer green — and nothing landed.

### false — in this checkout

This factory has no remote: nothing is pushed and no pull request is opened, and you open none.

**The local check is the only judge.** The check measures the change, proves the probes and the parts, then runs the repository's local check
(`${{ parameters.localCheck }}`) on this round's tree, from the workspace's root: it runs `change.ts size`, `probe.ts`, `parts.ts`,
the factory's own check, its `implementCheck` parameter (`${{ parameters.implementCheck }}`; `true` checks nothing) and the local check, in that order, and nothing else. Run the tests of what you changed, the types and the lint yourself before you sign off, as the
repository's instructions say of a session's checks; a refusal of the local check comes back to you with the end of its output. The
landing runs the local check again, on the base with your branch merged into it, before the merge is committed: a merge that conflicts
or breaks it is taken back, and nothing landed.

### Either way

**When your check refuses**, the run tries you again on its own, up to twice a round (`retries: 2`): it continues this session and
hands you, as data, the command, its exit and the last lines of what it printed — on GitHub, the failing jobs and the lines that
failed each. Make the work pass it, never weaken it, merge the base again, and sign off as before. A refusal only a person can answer — every refusal of `change.ts`, and of `pull-request.ts` no `gh` or none
logged in, no `origin`, a draft or wrongly based pull request, the label rules, CI that never judged the commit — exits 78, which this
step's `checkFailurePolicy:` names: the run does not try you again on it and waits on the person, so you are not asked about it. Where a failure has nothing to do
with your change (a flake, the machine out of memory), change nothing and sign off `done` as before, saying why in `summary`: signing
off again runs the check again, as far as this step's `retries:` allow, and only a session that signs off is asked. On GitHub, a refusal
that says the base's `${{ parameters.ciCheck }}` is red too, at the commit your branch holds, names the base's jobs that did not pass:
read the failing lines against them, and where a failure is the base's, change nothing for it and sign off `blocked`, saying so in
`needs`: only a try that merges the base once it is fixed clears it. The `nemia retry … --recheck` line a refusal ends with is the
person's, once your tries are spent, never a line for your `needs`. Past the retries, past the step's budget, or when the check did
not finish, the run waits on a person.

This is a quick build: no spec was written for you. You are handed a card, and a review reads your plan and your change — Agora's,
read-only, which asks for another round or passes. Its pass lands the change: unless the run was started with a gate on the review (`--gate review`, or a card's `gate: review`), there is no
person's gate after it, so the review is the one reader between your work and the base branch.

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
the landing program merges at the head `ci` judged — so GitHub may call the pull request unmergeable; in this checkout, the landing program stages your branch
on the base as it is then, runs the local check on the merged tree, and takes a merge that conflicts or breaks it back. The measure counts your own change alone, from the base you merged last. The base is the branch the repository's own checkout is on, and from your worktree git names its tip
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

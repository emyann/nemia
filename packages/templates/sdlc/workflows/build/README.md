# build

Build an accepted intent into working, reviewed code on main. Seldon writes the spec, which a person approves; Grace builds it; Agora
reviews it and sends it back while a finding is worth a round, five at most; its pass files the landing, which the landing program makes with no gate,
as quick's does. A person decides on the spec, at design's gate; on a diff that the review and CI already passed, a person's approval
of the landing would be a stamp. A person who wants to read the change before it lands says so at the run's start, `nemia start …
--gate review`, or by the card's own `gate: review`: the review's pass then waits for them.
A change its card settles, which needs no design, goes through [`quick`](../quick/README.md), whatever its size, with no spec.

```
design → implement ⇄ review → land
```

Each script a step runs is read from the run's frozen carried files (`$WF_CARRIED_FILES`), the copy of the template's `carried/` folder
the run took when it began, never from the tree it judges: a step's check runs `node "$WF_CARRIED_FILES/<script>.ts"`. The scripts live
there once, since `quick` runs them too, with the helpers `land.ts` and `pull-request.ts` share (`exec.ts`), the rules of a CI log
(`ci-log.ts`), the landing's reads (`landing.ts`) and the landing refresh (`refresh.ts`). Where `WF_CARRIED_FILES` is not set, the check names it on stderr and fails: a
factory's scripts are not in the repository it works on, so there is nowhere else to read them from. This sdlc needs the Nemia it ships
with: one that renders and freezes a template's carried folder and reads a `{ path }` item of a list.

## Two ways to judge and land: in this checkout, or on GitHub

The factory's `github` parameter, set when the template is applied, picks one. A parameter replaces a value and cannot change a
workflow's steps, so both ways are in each file: the implement and land steps' checks are each one shell `if` on the rendered value, and the
notes of implement, review and land each open with the answer and hold a part for each.

- **`github: false`, the default: in this checkout.** No remote is read or written. The implement step's check runs `probe.ts`, `parts.ts` and
  the factory's own check, its `implementCheck` parameter, then the factory's `localCheck` parameter (by default `local-check.ts`, carried: the repository's `lint`, `typecheck` and `test` scripts, run by the package manager its `--runner` names, each where its `package.json` declares it, a package manager's init's
  placeholder test left out, and nothing where it has no `package.json`) on the round's tree; no
  pull request is opened. Land is the landing program's: it stages every result branch in one `git merge --no-ff --no-commit` in the repository's own checkout, once it is clean on the base, runs `localCheck` on the merged tree, and commits the merge on its exit 0 or takes it back and writes False. The message is the first line of the run's brief and one line per commit of the result. `localCheck` is the only judge, so it runs the tests.
- **`github: true`: on GitHub** (`nemia factory apply … --set github=true`). Implement pushes its branch and opens a pull request through the factory's `github` MCP server, its check runs
  `roundCheck`, and the `ci` condition waits on the CI context `ciCheck` names, which the factory's `ci-watch` program writes; the landing program merges that
  pull request on GitHub; the land step waits on the conditions `turn`, `ci` (CI at the head that will be merged, refreshed or not), `landed` and `base-ci`, the wait on the base branch's CI.
  Where neither the head's tree nor the base branch's declares a CI workflow under `.github/workflows`, `declares-ci` says so (a change that removes the base's workflow is still judged by its context) and the `local` check runs the factory's `localCheck`, the program writing `ci` `True` within one pass, and the landing merges the pull request with no context: nothing waits on CI that will not come.
  The rest of this README, but where it says otherwise, is this way's.

The CI context the program watches and the scripts land on is the factory's `ciCheck` parameter (`ci` by default), handed to each as
`--check <name>`; the implement step's round check runs the factory's `roundCheck` parameter (the repository's lint and typecheck, where it has
them, by default). Either way, the implement step's check runs the factory's own check, its `implementCheck` parameter (`true`, the default,
checks nothing), after `parts.ts check` and before the push or the local check.

Implement pushes its branch with `pull-request.ts branch`, read from the frozen files as the others are: it pushes this run's own
branch, never another and never the base and never forced, calls no GitHub, and prints the repository, head, base and commit. Grace
then opens or updates the one pull request of the branch through the server (`list_pull_requests`, then `create_pull_request` or
`update_pull_request`, never a draft), her fence allowing those two and refusing its merge, its pushes and its run trigger, and puts the
address on her closeout as an artifact value. Her check pushes again through the same
script and refuses unless the pull request's head is the commit it judges — GitHub moves that head a moment after the push, so it is
read again for up to 30 s before the refusal — then runs the round check, then the `local` check (the factory's local check where no CI is declared). Nothing in the check waits on CI: the `ci-watch` program
(`programs/ci-watch/program.yaml`, one per factory, run from `ci-watch.ts` with `gh`'s sign-in) polls every 30 s (`WF_CI_WATCH_SECONDS`; the server is
reachable over Tailscale only, so no webhook reaches it) and, for each step of the factory's unfinished runs that is checking and has reached a condition
(`conditionDue`: every check before it passed on this try, so `push` proved the pull request's head is the step's commit), reads GitHub and writes the
condition for the try: `True` where the context passed at the head, `False` where it is red and the red is the change's, or the pull request conflicts with
its base (a merge of the base, named), `Unknown` with words where it waits (still running, none reported, none open: the step stays `checking`
and its note says why). It reads only the latest run of each check on the head, so a failure a later run of the same check superseded is neither judged
nor listed, and writes nothing for a head that is not the tip of the run's result branch. A red the context judged is first told apart by the logs of its
red jobs: where a job GitHub concluded failed has a log that names a line that failed it (a test, a type error, a lint rule), the change's, which a
second run of the same commit would fail again, it is `False` at once, never re-run, with the failing jobs and the Actions address (the log lines
are read through the server, `actions_list` and `get_job_logs`: Grace's step loads it). Any other red — a job timed out or started up wrong, a failure whose
log names no failing line or gave none — has the failed jobs of its workflow run re-run once (`gh run rerun <id> --failed`), and only a run on its first attempt
is re-run, as GitHub's `run_attempt` says, so a head is never re-run twice, even across a restart of the program; a job red again is the change's, `False`.
Where the context is absent and the head has a workflow run GitHub queued and never started (`queued`, no job started, which no re-run or cancel frees)
for 15 minutes (`WF_CI_STUCK_SECONDS`), the program dispatches that run's own workflow once on the branch (`gh workflow run <file> --ref <branch>`); a
dispatch GitHub refuses is written `Unknown` naming the stuck run and the dispatch to type, with `-f` for each input the workflow requires. A dispatched run's
red, whose entry links its run rather than a job, is told apart, re-run and read as any other. Where the context is red on the base branch too, at the commit
of it the head holds, `False` says so and names the base's jobs that did not pass; it stays the try's. A factory with `github` false has no `ci` condition
and the program writes nothing. The reviewer alone reads the pull request and its checks itself, through the server's `pull_request_read` (`get`, `get_status`,
`get_check_runs`); it holds no `gh` allow beyond a tool's help, and its fence still refuses every form of `gh`.

When the implement step's check refuses, either way — a red, cancelled or missing CI context, `probe.ts`, `parts.ts`, the factory's own check or the
local check — the run tries implement again on its own, up to twice a round (`retries: 2`), continuing its session, each try under the
step's `budget:`. The try is handed the check's verdict as data — the command, its exit and the last lines of what it printed: on GitHub
the failing jobs and the lines that failed each, which `pull-request.ts` reads since no writer may type `gh` — as a person's `nemia retry
--message` listing the failures would have handed it. A refusal no change to the branch can answer exits 78: `pull-request.ts` does
so for no `gh` or none logged in, no `origin`, two open pull requests, a draft or another base, the label rules, `WF_LABELS`, a run
whose labels match none of the rules or the repository's labels, and a CI context never reported, still pending at the bound, or only
cancelled, skipped or neutral (`PERSONS_EXIT`, `exec.ts`); a job GitHub cut off at its own `timeout-minutes` reads `cancelled` too, and
the job's annotation that says it exceeded its maximum execution time makes it a red, the work's, re-run once as any red. The implement step's `checkFailurePolicy:` names that code (`FailStep`,
`onExitCodes: In [78]`), so the run files no try on it: the step waits on the person, `failed (check)`, and `nemia decide` offers
`nemia retry <run> implement --recheck` first, once the person has answered it. The implement step's note tells the try to change
nothing on a failure it finds is not its change's: a flake or the machine, signed off `done` again, which runs the check again within
`retries:`; a failure the base has too, signed off `blocked` and said in `needs`. A person can then run the check of a blocked step
again, `nemia retry <run> implement --recheck`, where its branch has not moved since that check failed. What the run can tell spends no try and waits on a person at once: a
step over its budget, a call denied under `denials: fail`, a check that did not finish, a blocked sign-off. Past the second try, a
refusal waits on a person as it did before.

The push check labels the pull request each round, from the run's own labels (`WF_LABELS`,
which the run gives every session and check), by the rules the factory's `pullRequestLabels` parameter sets (each
`<key>=<value>:<label>`, the rules apart by spaces; empty, the default, labels nothing): it adds the labels the rules give the run and
removes any other a rule could give, so a relabelled card is followed and a label a person put on that no rule gives is left alone,
through REST and never `gh pr edit`. A malformed rule, or a label a rule gives that the repository lacks, is the check's refusal before
anything is pushed. The server's label tool, `issue_write`, replaces a pull request's whole list, so it stays refused to Grace and the labels stay with the check: the pull request is unlabelled from Grace's create until the check's push, and a CI job that reads labels only when the pull request is opened sees none. The rules reach the check as `--labels`. Where there are rules and the run's labels match none of them, the push refuses before anything is pushed, exit 78,
a person's, naming each key the rules read, the values they take and the `nemia label run <run> <key>=<value> --overwrite` that sets one: a pull
request no rule labels would fail a check that reads its labels, and only the merge would find out. A pull request opened by hand is labelled by it too. The factory's `labelValues` parameter (`key=value` words, the values
`pullRequestLabels` reads) refuses that same label earlier, when the card is filed or labelled, so the run never reaches the push with it.

Land is a wait node (`waitsFor:`): it runs no session, no command and no check of its own, and has no workspace and no budget. It passes once
the conditions it names are each True for its try, which the factory's two programs write: `turn`, `ci`, `landed` and `base-ci` where `github`
is true, and `landed` alone with no remote. The landing program (`land`, `programs/land/program.yaml`, `carried/land.ts`) lands the factory's
runs one at a time and writes `turn` and `landed`; `ci-watch` writes `ci` and `base-ci`.

- `turn` is the landing's one slot. Only one run at a time holds it True with `landed` undecided, the oldest run first; every other run's
  land step waits, saying which run it is behind. Where the factory names a refresh — `landingRefresh`, a command of its own that derives
  files from the tree, and `landingDerives`, the paths it owns — and the pull request's head lacks the base, the program refreshes the
  head before it writes `turn` (`refresh.ts`): it merges the base into the branch in the run's worktree, runs there the factory's
  `landingInstall` where it names one, so the command reads the dependencies the merged tree names, then the refresh, refuses and takes the
  merge back where anything is left unmerged, the install or the command fails, or the result differs from git's plain merge outside the
  derived paths, and otherwise commits it and pushes the branch with no force. So two runs that change one derived file side by side both
  land: the landed commit differs from the reviewed head only in the files `landingDerives` names.
- `ci` is CI at the head that will be merged, refreshed or not: the `ci-watch` program writes it, with its one re-run of a red that is not the
  change's.
- `landed` is the merge. On GitHub the program merges this run's own pull request with a merge commit (`gh pr merge --merge
  --match-head-commit <head>`, never `--delete-branch`: GitHub deletes the head branch) whose message is the pull request's title and
  description, then fast-forwards the repository's checkout where it is clean on the base and behind. It merges nothing but a pull request
  that is the run's own — not a draft, based on the base branch, its head the tip of the run's result branch — mergeable, with the CI
  context green at its head, holding the base where the factory refreshes, and leaving no result branch of the run out (`git cherry`, so a
  part taken as a commit of its own counts as taken). With no remote it stages every result branch of the run in one `git merge --no-ff
  --no-commit` in the repository's own checkout, which must be clean on the base with no merge in progress, runs `localCheck` on the merged
  tree, and commits it, or takes it back and writes False. The message there is the first line of the run's brief as its subject and one
  line per commit of the result branches as its body.
- `base-ci` is `ci-watch`'s, and runs nothing in the checkout.

The program is level-triggered: each pass reads the api, GitHub and git afresh and carries nothing between passes. A pull request already
merged, by the program before a restart or by a person, reads as landed and nothing lands twice; a merge a stopped program left staged in
the checkout is taken back and judged again; and a person can write any of the conditions by hand (`nemia condition`). While the program
is down the waiting step says which program writes the condition. A False names what a person does, or the `nemia retry <run> land
--recheck` that makes the next try. To approve before a landing, gate the review (`nemia start … --gate review`): the review's pass then
waits for the person before the landing waits on anything.

`base-ci`, where the factory's `landingWaitsOnCi` is true (the default), reads the CI context at the merge commit on the base branch
(`--wait-on-ci <true|false>` on the program's line); a merge commit whose tree is the head's `ci` judged is passed at once. Green is `True`.
A red is first re-run, once, any red it judged, failing lines or not (`rerun.ts`): the failed jobs of each red workflow run at the merge, only a
run GitHub says is on its first attempt, so a restart never re-runs it twice; green the second time is `True`, naming the jobs re-run. Red
still is `False`, which fails the step though the merge stands — nothing is taken back — naming the jobs that did not pass: red twice is a
real break of the base, and the words say so and point at the merge commit's checks, where a person lands a fix, then types `nemia retry
<run> land`; where the base's tip holds the merge and the context is green there, `base-ci` is `True` and says so. A merge whose own run was
cancelled — a CI that replaces a pending run of the base with a newer push's — or never reported is read at the base's tip where GitHub's
compare says it holds the merge: green there is `True`, naming the commit read and why; red there is `False` naming that commit; anything
else is `Unknown`, the step waiting. Never reported stays `Unknown`, naming `landingWaitsOnCi`: a repository whose CI does not run on
pushes to the base sets it false (`--set landingWaitsOnCi=false`), and `base-ci` is then `True` at once.

The implement step's check runs `probe.ts`, read from the frozen files as well: a session a step starts to measure something, a probe, is named
`<run>-probe-<label>` (`node "$WF_CARRIED_FILES/probe.ts" start <label> -- <prompt>`), runs in the machinery's trusted folder
`$WF_ROOT/probes`, and says in its first message whether the person must act; it reaches the person's phone through Remote Control
only with `--answer`, and the step then stops `blocked` on the `needs` line it prints. The check refuses while a probe named for the
run is live, naming `probe.ts stop`. Grace's fence refuse a bare `claude --bg` or Remote Control, and an edit of a
harness's trust or local settings anywhere.

The implement step's check runs `parts.ts check` after it, read from the frozen files too: every other branch of the run
(`wf/<run>/<part>`, a part Grace built beside her branch) has each of its commits' patches on her branch (`git cherry`, as the
landing reads it), or the check refuses, naming each part left out and the two ways to settle it. A part whose work her branch
replaced she declares replaced, `node "$WF_CARRIED_FILES/parts.ts" replaced <part>…`, which removes its branch and keeps its tip as
`refs/backup/wf/<run>/<part>` — a step may not delete a branch — and names in her closeout; so the landing never finds a superseded
part it would refuse.

The implement step's check then runs the factory's own check, its `implementCheck` parameter, either way: a command of the factory's
own (a script it keeps once in its carried folder is read as `node "$WF_CARRIED_FILES/<script>.ts"`), run from the workspace's root after `parts.ts
check` and before anything is pushed or the local check runs, so a non-zero exit refuses the round with nothing pushed. Its default,
`true`, checks nothing. A factory that adds a check of its own sets the parameter rather than editing the check line or the sentences
that list its scripts, and an upgrade that changes either merges with no conflict on them.

Review counts what it closes out on (`tally: findings, findings.kind=placement, findings.missed`): the findings of each round, those
of them whose `kind` is `placement` (a change in a boundary the repository's rules give to another concern), and those it marks
`missed` (code that was there when the first round read the change, which that round did not name). `nemia stats` totals each per
day, `—` on a day no review closed out.

**What stops the loop.** The loop goes `rounds: 5` before it asks a person: a run that took five rounds, each finding real things, then
went through with nobody woken, and five rounds of a wide card cost about half of what a run is meant to stay under. Three things stop
it, and each waits on a person:

- the rounds: a fifth objection leaves review `exhausted`, and a person types `nemia retry <run> review --round` for one more or
  `nemia approve <run> review --message "<why>"` to take the work as it stands;
- the budgets: each step's `budget:` covers all its tries and rounds (implement $50, review $24, sized to five rounds; design's
  proposed budgets replace them at its gate), so a round that would pass a cap is held `over budget`; a factory's own line for a
  run of the workflow cuts nothing, but a gate whose caps would let the run pass it says so;
- a finding raised again: a review that would raise a finding a second time, after the engineer answered it, signs off `blocked`
  rather than asking for another round, its `needs` naming each such finding, the reply, and why it still holds
  (`review-a-change`, step 8); a person settles it with `nemia retry <run> review --message "<answer>"`, whose answer tells the
  review to pass or to send the work back (a blocked step has nothing to approve).

The rounds converge: the first reads the whole change and lists every finding it can stand on, and says what it read (`read`: the
commit, the files and the rules); a later round reads only the diff since the last round's commit, checks each earlier finding against
its reply, and marks `missed` a finding the first round should have named.

On GitHub, the implement step's check runs no suite itself: CI runs it on the pushed commit, on clean runners and with no cache of this machine's, and
Grace's session runs only the tests of what she changed.

Implement merges the base into its branch before each sign-off (`git merge main-worktree/HEAD`: the tip of the branch the repository's
own checkout is on, whatever it is called), so its check runs on the merged tree, and measures again what its change wrote by a measure.
Review says in its summary whether the branch holds the base as it is then, and sends back a branch behind only where what it lacks
can change the verdict: a file both changed whose hunks overlap or touch, a test of one side (or the change's code) reading what the other
changed, a measure either side wrote over the other's files, or a merge that does not go clean; any other branch behind it notes, and lets
the land go. On GitHub, its own `mergeable` and the required CI context stay the guard for the rest, and a base that moved under a green pull request makes the merge refuse rather than land; in this
checkout, the landing program runs `localCheck` on the merged tree, and a merge that conflicts or breaks it is taken back. On a merge round (`## Merge` in the brief) the step
merges the commit the brief names instead.

An intake run whose intent needs a design starts it: intake's ending, `next`, routes to `build` once the person approves it, and
its node `to-build` files a card with `workflow: build` and `from:` the intake run (the [intake](../intake/README.md) README). By
hand, start it after the intake run whose intent it builds: `nemia start "<the intent's title>" --workflows build --after
<intake-run>`. Either way its first step, design, is told the intent under *From run*; the steps after it read the spec.

Design reads `costs` (`reads: costs`): its brief says what the last finished runs of build in its factory cost, per step and whole. Its
note asks for each step's budget from those figures, and for the cut by the work's seams, never by its cost.

The agents and their skills are any software factory's, and say nothing of the repository they work on; what is the repository's —
its commands, its paths, its tools — is in its own instructions (its `CLAUDE.md`), which every session reads. None of this workflow's
steps declares a closeout of its own (no `output:`, and no schema beside them): what each closes out on is its agent's, review's
`findings` and `again` being Agora's.

## What a machine needs before a run starts

`workflow.yaml` declares the machine's needs (`spec.needs`), which the factory's README carries as its frontmatter: a run that has
filed nothing waits while one is missing, and the readiness read names each with the fix to start. Two hold only where `github` is
true, their checks met otherwise: `gh`, the GitHub CLI on the PATH, fixed by `node "$WF_CARRIED_FILES/needs.ts" install-gh` (the latest
release for the machine into Nemia's tools folder, its sum checked, no sudo); and `gh-sign-in`, gh signed in to github.com with the
`workflow` scope (`needs.ts scope workflow`), fixed by gh's browser sign-in, whose output shows the code to type at
https://github.com/login/device, then `gh auth setup-git`. The third, `git-identity`, fills the git place's need of the same name: its
first fix sets git's name and email from the account gh is signed in to, the email its noreply address
`<id>+<login>@users.noreply.github.com` (`needs.ts identity`); the place's own fix, which asks for a name and an email, comes after it.
The fourth, `github-server`, holds only where `github` is true: the factory's `github` MCP server, which Grace opens her pull request through and Agora reads it through (the `mcp:` line of implement and review, which `case(parameters.github, 'github', '')` writes and a blank leaves out). Its check asks the api whether the factory has added it (`nemia get mcpservers/github -n "$WF_FACTORY"`, the factory a workflow's check is told), and it has no fix to start, since a server is added and signed in by a person, on the factory's settings page; one added and not signed in holds each step at filing, whose note names the sign-in. Where `github` is false it is met and no step loads a server.
The fifth, `browser`, holds either way and says `scope: repository`, so it is checked and fixed in the factory's repository: `needs.ts
browser` resolves there the `playwright-core` the steps' browser tools run (the one `@playwright/mcp` resolves, else the repository's
own) and is met where its `chromium.executablePath()` is on disk, the build named where it is not; where the repository holds neither,
any Chromium where Playwright looks meets it. Its fix, `needs.ts browser --install`, runs that `playwright-core`'s own installer
(`cli.js install chromium`), so the build installed is the one the tools launch, not the one another Playwright of the repository
wants. `quick` declares the same five.

**Measured: the sign-in with no terminal.** A fix runs with no terminal, so the sign-in gives gh `</dev/null`. On 2026-11-12, `gh auth
login --hostname github.com --git-protocol https --web --scopes workflow </dev/null` was run with no TTY, in a throwaway
`GH_CONFIG_DIR`, and stopped after 12 seconds. It was still polling each time, with no "Press Enter" prompt:

- gh 2.103.3, on a headless Ubuntu 24.04 server, printed `! Failed to copy one-time code to clipboard` with its reason, then `! First
  copy your one-time code: XXXX-XXXX` and `Open this URL to continue in your web browser: https://github.com/login/device`;
- gh 2.45.0, Ubuntu's package, on a machine with a clipboard and `BROWSER=false`, printed the same two lines, code and address.

So the fix shows the code that matches `one-time code: ([A-Z0-9]{4}-[A-Z0-9]{4})`, which the need declares as its `code`, and the
person approves it in a browser while gh waits.

## What design hands the review: the pages it read

A spec can rest on a page outside the repository: a standard, a vendor's documentation, a file of another repository read on the web.
Seldon declares each such page in `sources` on its output — the address, the day it was read, the passage word for word and the claims
the spec takes from it — and the review, which reads design (`input: design`), is handed it in its brief with design's other declared
fields, as implement is. The review's fetch stays as narrow as it is: a gating reviewer that may fetch any page can be pointed at any
page by the change it judges, and would read the page as it is then, not as design read it. Agora checks each claim against its
passage. A claim it cannot check stops the landing: the review signs off `blocked`, naming each claim and its page, for a person to
answer.

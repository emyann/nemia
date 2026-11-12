# build

Build an accepted intent into working, reviewed code on main. Seldon writes the spec, which a person approves; Grace builds it; Agora
reviews it and sends it back while a finding is worth a round, three at most; Otto lands it, once a person approves the landing.
A change its card settles, which needs no design, goes through [`quick`](../quick/README.md), whatever its size, with no spec.

```
design → implement ⇄ review → land
```

Each script a step runs is read from the run's frozen carried files (`$WF_CARRIED_FILES`), the copy of the template's `carried/`
folder the run took when it began, never from the tree it judges: a step's check runs `node "$WF_CARRIED_FILES/<script>.ts"`. The
scripts live there once, since `quick` runs them too, with the helpers `landing.ts` and `pull-request.ts` share (`exec.ts`) and the
rules of a CI log (`ci-log.ts`). Where `WF_CARRIED_FILES` is not set, the check names it on stderr and fails: a factory's scripts are
not in the repository it works on, so there is nowhere else to read them from. This sdlc needs the Nemia it ships with: one that
renders and freezes a template's carried folder and reads a `{ path }` item of a list.

## Two ways to judge and land: in this checkout, or on GitHub

The factory's `github` parameter, set when the template is applied, picks one. A parameter replaces a value and cannot change a
workflow's steps, so both ways are in each file: the implement and land steps' checks are each one shell `if` on the rendered value, and the
notes of implement, review and land each open with the answer and hold a part for each.

- **`github: false`, the default: in this checkout.** No remote is read or written. The implement step's check runs `probe.ts`, `parts.ts` and
  the factory's own check, its `implementCheck` parameter, then the factory's `localCheck` parameter (the repository's lint, typecheck and test, where it has them, by default) on the round's tree; no
  pull request is opened. Land checks the checkout and stages every result branch in one `git merge --no-ff --no-commit`, as the git
  place's skill says (*Stage a landing*), and signs off with the merge's message; the land step's check runs `localCheck` again, on the merged
  tree, and the run commits the merge on its exit 0 and takes it back otherwise. `localCheck` is the only judge, so it runs the tests.
- **`github: true`: on GitHub** (`nemia factory apply … --set github=true`). Implement pushes and opens a pull request, its check runs
  `roundCheck` and waits on the CI context `ciCheck` names, and land merges that pull request on GitHub; the land step's check is a receipt.
  The rest of this README, but where it says otherwise, is this way's.

The CI context the scripts wait on and land on is the factory's `ciCheck` parameter (`ci` by default), handed to each script as
`--check <name>`; the implement step's round check runs the factory's `roundCheck` parameter (the repository's lint and typecheck, where it has
them, by default). Either way, the implement step's check runs the factory's own check, its `implementCheck` parameter (`true`, the default,
checks nothing), after `parts.ts check` and before the push or the local check.

Implement pushes its branch and opens the pull request through `pull-request.ts`, read from the frozen files as the others are: it
pushes this run's own branch, never another and never the base and never forced, and opens or updates the one pull request of the
branch, never a draft, printing the address that goes on Grace's closeout as an artifact value. Her check pushes again through the same
script and refuses unless the pull request's head is the commit it judges — GitHub moves that head a moment after the push, so it is
read again for up to 30 s before the refusal — then runs the round check, then, unless GitHub says the pull request conflicts with its
base (refused at once, naming the merge of the base, since GitHub runs no CI on a conflicting head), waits on the CI context (`START_SECONDS`
for it to start, `WHOLE_SECONDS` whole, both in `exec.ts`), reading only the latest run of each check on the head, so a failure a later run of the same check
superseded is neither judged nor listed: CI runs the repository's suite on that commit, and a red, cancelled or missing context is the check's
refusal, with the Actions URL, the failing jobs and a bounded tail of their log — no writer of this team may type `gh`, so the script
reads it for them. A red the context judged is first re-run, once: the failed jobs of its workflow run, with the jobs that need them
(`gh run rerun <id> --failed`), waited on within the same whole bound, and only a run on its first attempt is re-run, as GitHub says, so a
head is never re-run twice; a job red again is the change's, and the pass or the refusal names each job re-run and how it ended the
second time. A re-run still running at the bound is a refusal the next try answers by changing nothing, its check reading the re-run's
verdict. An attempt that cannot be read, a re-run `gh` refuses, or a red that is no Actions job is not re-run, said in a line. A context still absent at half the start bound,
where the head has a workflow run GitHub queued and never started (`queued`, no job started, which no re-run or cancel frees), has that
run's own workflow dispatched once on the branch (`gh workflow run <file> --ref <branch>`), waited on within the same start bound and
said in the pass or the refusal; a dispatched run checks the branch head, not the merge ref, so the landing's wait on the base's own
context stays the last word. A dispatch GitHub refuses is a person's refusal at once, naming the stuck run and the dispatch to type, with
`-f` for each input the workflow requires, then the retry. A dispatched run's red, whose entry links its run rather than a job, is
re-run and read as any other: its failing jobs and their lines are read from the run. Where the context is red on the base branch too, at the commit of it the head holds, the refusal says so and names
the base's jobs that did not pass, so a failure that is the base's is not read as the change's; it stays the try's refusal. The reviewer alone reads the pull request and its checks itself (`gh pr view`, `gh pr checks`), its fence allowing
those two and refusing every other form: a browser, `--watch`, a jq query or a template, another repository, and an assignment before
`gh`.

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
nothing on a failure it finds is not its change's (a flake, a failure the base has too), and to say so in `needs`. What the run can tell spends no try and waits on a person at once: a
step over its budget, a call denied under `denials: fail`, a check that did not finish, a blocked sign-off. Past the second try, a
refusal waits on a person as it did before.

The open labels the pull request as it creates or updates it, and the push again each round, from the run's own labels (`WF_LABELS`,
which the run gives every session and check), by the rules the factory's `pullRequestLabels` parameter sets (each
`<key>=<value>:<label>`, the rules apart by spaces; empty, the default, labels nothing): it adds the labels the rules give the run and
removes any other a rule could give, so a relabelled card is followed and a label a person put on that no rule gives is left alone,
through REST and never `gh pr edit`. A malformed rule, or a label a rule gives that the repository lacks, is the check's refusal before
anything is pushed. GitHub has no labelled create, so the open sets the labels through REST the moment the pull request exists, in the
same call, before a CI job that reads them can start: a check that reads a pull request's labels never sees the run's unlabelled.
The rules reach the open as `--labels` on the line the implement step's note renders from the parameter, and an open without the flag is
refused. Where there are rules and the run's labels match none of them, the open and the push refuse before anything is pushed, exit 78,
a person's, naming each key the rules read, the values they take and the `nemia label run <run> <key>=<value> --overwrite` that sets one: a pull
request no rule labels would fail a check that reads its labels, and only the merge would find out. A pull request opened by hand gets
no label from it.

Land merges that same pull request, through `landing.ts`, which its check also reads from the frozen files. Otto runs its `merge --run
<id> --subject … --body-file … --check <name>`: it refuses anything but this run's own green pull request — not a draft, based on the
base branch, its head the commit the review read, `mergeable`, the CI context green at that commit, and no result branch of the run
left out — then merges it with a merge commit whose subject and body are his (`gh pr merge --merge --match-head-commit <sha>`, never
`--delete-branch`: GitHub deletes the head branch), and fast-forwards the checkout (`git fetch origin && git merge --ff-only
origin/<base>`). On a refusal he changes nothing and signs off `blocked` with the `nemia retry` line it printed. Land's check is then
the receipt alone — the pull request `MERGED` with a merge commit reachable from HEAD, the checkout clean on the base with no merge in
progress, every commit of every branch of the run with an equivalent patch on HEAD (`git cherry`, so a part taken as a commit of its
own counts as taken) — which is what the run needs to record `landed` on the commit that landed. It runs no suite: CI judged the head
the review read, and the merge commit's first parent is the base. Last, where the factory's `landingWaitsOnCi` is true (the default),
the receipt waits on the CI context at the merge commit on the base branch (`receipt --run <id> --check <name> --wait-on-ci <true|false>`;
up to `START_SECONDS` for it to be reported there, or `WHOLE_SECONDS` while another check there still runs, and `WHOLE_SECONDS` in all,
the bounds the implement step's wait keeps in `exec.ts`, inside the landing check's own deadline). Green passes. Red fails the step
though the merge stands — nothing is taken back — naming the jobs that did not pass: a person re-runs them where CI failed on its own
account, or lands a fix, then types `nemia retry <run> land`; where the base's tip holds the merge and the context is green there, the
receipt passes and says so. A merge whose own run was cancelled — a CI that replaces a pending run of the base with a newer push's
— or never reported is read at the base's tip where GitHub's compare says it holds the merge: green there passes, naming the commit
read and why; red there fails the step naming that commit; anything else waits on, to the bounds. Still running at the bound fails with the same retry line. Never reported fails too, naming
`landingWaitsOnCi`: a repository whose CI does not run on pushes to the base sets it false (`--set landingWaitsOnCi=false`), and the
receipt then waits on nothing.

The implement step's check runs `probe.ts`, read from the frozen files as well: a session a step starts to measure something, a probe, is named
`<run>-probe-<label>` (`node "$WF_CARRIED_FILES/probe.ts" start <label> -- <prompt>`), runs in the machinery's trusted folder
`$WF_ROOT/probes`, and says in its first message whether the person must act; it reaches the person's phone through Remote Control
only with `--answer`, and the step then stops `blocked` on the `needs` line it prints. The check refuses while a probe named for the
run is live, naming `probe.ts stop`. Grace's and Otto's fences refuse a bare `claude --bg` or Remote Control, and an edit of a
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

Review counts what it closes out on (`tally: findings, findings.kind=placement`): the findings of each round, and those of
them whose `kind` is `placement` (a change in a boundary the repository's rules give to another concern). `nemia stats` totals each per
day, `—` on a day no review closed out.

On GitHub, the implement step's check runs no suite itself: CI runs it on the pushed commit, on clean runners and with no cache of this machine's, and
Grace's session runs only the tests of what she changed.

Implement merges the base into its branch before each sign-off (`git merge main-worktree/HEAD`: the tip of the branch the repository's
own checkout is on, whatever it is called), so its check runs on the merged tree, and measures again what its change wrote by a measure.
Review says in its summary whether the branch holds the base as it is then, and sends back a branch behind only where the base moved
under the change: a file both changed, a file the change reads, or a measure it wrote. On GitHub, its own `mergeable` and the required CI
context stay the guard for the rest, and a base that moved under a green pull request makes the merge refuse rather than land; in this
checkout, the land step's check runs `localCheck` on the merged tree, and a merge that conflicts or breaks it is taken back. Land's
note says nothing of it: the ending signs off before the run executes its check. On a merge round (`## Merge` in the brief) the step
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

## What design hands the review: the pages it read

A spec can rest on a page outside the repository: a standard, a vendor's documentation, a file of another repository read on the web.
Seldon declares each such page in `sources` on its output — the address, the day it was read, the passage word for word and the claims
the spec takes from it — and the review, which reads design (`input: design`), is handed it in its brief with design's other declared
fields, as implement is. The review's fetch stays as narrow as it is: a gating reviewer that may fetch any page can be pointed at any
page by the change it judges, and would read the page as it is then, not as design read it. Agora checks each claim against its
passage, and names a claim it cannot check at the top of its sign-off, where the person who approves the landing reads it.

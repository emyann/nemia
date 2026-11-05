# build

Build an accepted intent into working, reviewed code on main. Seldon writes the spec, which a person approves; Grace builds it; Agora
reviews it and sends it back while a finding is worth a round, three at most; Otto lands it, once a person approves the landing.
A change its card settles, which needs no design, goes through [`quick`](../quick/README.md), whatever its size, with no spec.

```
design → implement ⇄ review → land
```

Each script a step runs is read from the run's frozen workflow files (`$WF_WORKFLOW_FILES`), the copy of this folder the run took
when it began, never from the tree it judges: a step's check runs `node "$WF_WORKFLOW_FILES/<script>.ts"`. Where `WF_WORKFLOW_FILES`
is not set, the check says so on stderr and fails: a factory's scripts are not in the repository it works on, so there is nowhere else
to read them from.

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
base (refused at once, naming the merge of the base, since GitHub runs no CI on a conflicting head), waits on the CI context (1800 s
for it to start, 2400 s whole), reading only the latest run of each check on the head, so a failure a later run of the same check
superseded is neither judged nor listed: CI runs the repository's suite on that commit, and a red, cancelled or missing context is the check's
refusal, with the Actions URL, the failing jobs and a bounded tail of their log — no writer of this team may type `gh`, so the script
reads it for them. The reviewer alone reads the pull request and its checks itself (`gh pr view`, `gh pr checks`), its fence allowing
those two and refusing every other form: a browser, `--watch`, a jq query or a template, another repository, and an assignment before
`gh`.

The open labels the pull request as it creates or updates it, and the push again each round, from the run's own labels (`WF_LABELS`,
which the run gives every session and check), by the rules the factory's `pullRequestLabels` parameter sets (each
`<key>=<value>:<label>`, the rules apart by spaces; empty, the default, labels nothing): it adds the labels the rules give the run and
removes any other a rule could give, so a relabelled card is followed and a label a person put on that no rule gives is left alone,
through REST and never `gh pr edit`. A malformed rule, or a label a rule gives that the repository lacks, is the check's refusal before
anything is pushed. GitHub has no labelled create, so the open sets the labels through REST the moment the pull request exists, in the
same call, before a CI job that reads them can start: a check that reads a pull request's labels never sees the run's unlabelled.
The rules reach the open as `--labels` on the line the implement step's note renders from the parameter, and an open without the flag is
refused. Where there are rules and the run's labels match none of them, the open and the push refuse before anything is pushed, exit 2,
naming each key the rules read, the values they take and the `nemia label run <run> <key>=<value> --overwrite` that sets one: a pull
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
the review read, and the merge commit's first parent is the base.

The implement step's check runs `probe.ts`, read from the frozen files as well: a session a step starts to measure something, a probe, is named
`<run>-probe-<label>` (`node "$WF_WORKFLOW_FILES/probe.ts" start <label> -- <prompt>`), runs in the machinery's trusted folder
`$WF_ROOT/probes`, and says in its first message whether the person must act; it reaches the person's phone through Remote Control
only with `--answer`, and the step then stops `blocked` on the `needs` line it prints. The check refuses while a probe named for the
run is live, naming `probe.ts stop`. Grace's and Otto's fences refuse a bare `claude --bg` or Remote Control, and an edit of a
harness's trust or local settings anywhere.

The implement step's check runs `parts.ts check` after it, read from the frozen files too: every other branch of the run
(`wf/<run>/<part>`, a part Grace built beside her branch) has each of its commits' patches on her branch (`git cherry`, as the
landing reads it), or the check refuses, naming each part left out and the two ways to settle it. A part whose work her branch
replaced she declares replaced, `node "$WF_WORKFLOW_FILES/parts.ts" replaced <part>…`, which removes its branch and keeps its tip as
`refs/backup/wf/<run>/<part>` — a step may not delete a branch — and names in her closeout; so the landing never finds a superseded
part it would refuse.

The implement step's check then runs the factory's own check, its `implementCheck` parameter, either way: a command of the factory's
own (a script it keeps in this folder is read as `node "$WF_WORKFLOW_FILES/<script>.ts"`), run from the workspace's root after `parts.ts
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

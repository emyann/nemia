# build

Build an accepted intent into working, reviewed code on main. Seldon writes the spec, which a person approves; Grace builds it; Agora
reviews it and sends it back while a finding is worth a round, three at most; Otto lands it, once a person approves the landing.
A change its card settles, which needs no design, goes through [`quick`](../quick/README.md), whatever its size, with no spec.

```
design → implement ⇄ review → land
```

Implement pushes its branch and opens the pull request through `pull-request.ts`, read from the base as the others are: it pushes this
run's own branch, never another and never the base and never forced, and opens or updates the one pull request of the branch, never a
draft, printing the address that goes on Grace's closeout as an artifact value. Her check pushes again through the same script and refuses
unless the pull request's head is the commit it judges — GitHub moves that head a moment after the push, so it is read again for up to
30 s before the refusal — then waits on the `ci` context (1800 s for it to start, 2400 s whole): CI runs
the suite, the types, the lint, the whole e2e and the build on that commit, and a red, cancelled or missing `ci` is the check's refusal,
with the Actions URL, the failing jobs and a bounded tail of their log — no agent of this team may type `gh`, so the script reads it for
them.

Land merges that same pull request, through `landing.ts`, which its check also reads — out of `HEAD` in the repository's own checkout,
which a `workspace: main` step is given no base ref for. Otto copies the script out and runs `merge --run <id> --subject … --body-file
…`: it refuses anything but this run's own green pull request — not a draft, based on the base branch, its head the commit the review
read, `mergeable`, the `ci` context green at that commit, and no result branch of the run left out — then merges it with a merge commit
whose subject and body are his (`gh pr merge --merge --match-head-commit <sha>`, never `--delete-branch`: GitHub deletes the head
branch), and fast-forwards the checkout (`git fetch origin && git merge --ff-only origin/<base>`). On a refusal he changes nothing and
signs off `blocked` with the `nemia retry` line it printed. Land's check is then the receipt alone — the pull request `MERGED` with a
merge commit reachable from HEAD, the checkout clean on the base with no merge in progress, every commit of every branch of the run
with an equivalent patch on HEAD (`git cherry`, so a part taken as a commit of its own counts as taken)
— which is what the run needs to record `landed` on the commit that landed. It runs no suite and no e2e: `ci` judged both on the head
the review read, and the merge commit's first parent is the base.

It also runs `pictures.ts`, read from the base as well, first: a change under `apps/web/src` touches the board's pages, and refuses the
step unless the closeout's `artifacts` names a picture, an image file (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.avif`) of more than 0
bytes, by an absolute path in the step's files directory (`WF_ARTIFACTS`) or from the workspace root. The refusal names the command that
takes them, `npm run e2e -- --photos --pages <name,…>`. A change only under `apps/web/test` asks for none.

The same script asks a change under `tools/observe` that a dashboard reads for its dashboards rendered: each
`tools/observe/dashboards/<name>.json` changed owes `dashboard-<name>.png` and `dashboard-<name>.txt` in `artifacts`, and any other path
there but `README.md` and `profile/`, one such pair at least. The refusal names the command that writes them, `node
tools/observe/render/render.ts --out <files>`, which implement alone may run; implement and review are given `see-a-dashboard`, this
repository's skill for reading them.

It runs `probe.ts`, read from the base as well: a session a step starts to measure something, a probe, is named `<run>-probe-<label>`
(`node workflows/build/probe.ts start <label> -- <prompt>`), runs in the machinery's trusted folder `$WF_ROOT/probes`, and says in its
first message whether the person must act; it reaches the person's phone through Remote Control only with `--answer`, and the step then
stops `blocked` on the `needs` line it prints. The check refuses while a probe named for the run is live, naming `probe.ts stop`. Grace's
and Otto's fences refuse a bare `claude --bg` or Remote Control, and an edit of a harness's trust or local settings anywhere.

Review counts what it closes out on (`tally: findings, findings.kind=placement`): the findings of each round, and those of
them whose `kind` is `placement` (a change in a boundary the repository's rules give to another concern). `wf stats` totals each per day, `—` on a day no review closed out.

A doc or a workflow file turbo does not hash is judged by `ci`, which runs on clean runners with no cache of this machine's, on the
commit implement's check pushed; nothing is replayed from a cache there, and land's receipt replays nothing at all.
Implement's check runs no suite itself: `ci` runs it on the pushed commit, on clean runners and with no cache of this machine's, and
Grace's session runs only the tests of what she changed.

Implement merges the base into its branch before each sign-off (`git merge main-worktree/HEAD`: the tip of the branch the repository's
own checkout is on, whatever it is called), so its check runs on the merged tree, and measures again what its change wrote by a measure.
Review says in its summary whether the branch holds the base as it is then, and sends back a branch behind only where the base moved
under the change: a file both changed, a file the change reads, or a measure it wrote. GitHub's own `mergeable` and the required `ci`
context stay the guard for the rest, and a base that moved under a green pull request makes the merge refuse rather than land. Land's note says nothing of it: the ending signs off before the run executes its check. On a merge round
(`## Merge` in the brief) the step merges the commit the brief names instead.

Start it after the intake run whose intent it builds: `wf start "<the intent's title>" --workflows build --after <intake-run>`. Its
first step, design, is told the intent under *From run*; the steps after it read the spec.

Design reads `costs` (`reads: costs`): its brief says what the last finished runs of build in its factory cost, per step and whole. Its
note asks for the cut and each step's budget from those figures.

The agents and their skills are any software factory's, and say nothing of this repository (`team-portable.test.ts`); what is ours is on
the steps (`build-told.test.ts`). None of this workflow's steps declares a closeout of its own (no `output:`, and no schema beside
them): what each closes out on is its agent's, review's `findings` and `again` being Agora's.
Both add `look`, this repository's skill for its board, to the skills design, implement and review are given. Design and review deny
the build and the e2e on their own `disallowedTools:`, and review the whole suite, which `ci` runs on the commit implement pushed; the
checks they do run are named in their notes and allowed by `.claude/settings.json`, the two reads of the pull request among them.

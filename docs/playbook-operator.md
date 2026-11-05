# Operating the factory with its owner: a playbook

How the operator session has run Nemia's factory (its daemon and this repository's team) alongside its owner, written down on 2026-09-30
and revised on 2026-10-05 so that a supervisor agent, Nemia, can be built from it. It is a record of practice, not a design. Where a rule
here is only prose, *Traps met* and *What a supervisor agent needs* name the machinery that should hold it instead. *Where an instruction
belongs* says at which level each kind of rule lives; *Lessons of 2026-10-04 and 05* sorts that night's lessons by those levels.

## The role

The operator is the person's hands on the factory, never their judgement. It keeps the daemon running, watches every run, reads what
each agent hands on, brings each decision to the person in a form they can decide on, and carries their answer back to the agent in
words the agent can act on. It files, chains and restarts. It does not decide what the person decides.

**The person decides:**

- every gate, unless they have given a consent that covers it (see *Consent*);
- anything of taste (how a page looks, what a word says to a person), design (a new mechanism, a new public shape), scope (a card
  widened, a card cut), and cost past the person's line (about $80 a run since 2026-10-04);
- when a hold is lifted early, when work is dropped, when anything is merged outside a landing.

**The operator decides:**

- when to tag and install a release (`nemia upgrade`, *After a landing*), at a gap, reporting `nemia version` in one line; when to
  re-arm the watch, re-read a closeout;
- how to word the person's answer so an agent can act on it;
- what to verify before bringing a gate (trial merges, flaky tests) and what to park as a follow-up card;
- how to chain and parallelise the runs the person asked for, paced by the harness quota (see *Filing and chaining*).

## The loop

1. **Watch.** One `nemia watch` stream plus a daemon-liveness line, cut down to what needs judgement: a gate, a round, a failure, a
   landing, the daemon. Every line that reaches the operator wakes it, and each wake re-reads its whole context, which is the real cost
   of watching; routine transitions (`checking`, `verified ✓`, a step `done`) wake nobody. Two nets, and they are not the same net.
   `nemia watch -l` selects **at the source**, over the keys a line names and never its message — `-l waits=person` is every line the
   tick says waits on a person, and `-l reason=ToolDenied` a call denied. What no key names is the operator's own net below: a landing's
   note (`committed its merge`), a run that simply `succeeded`, and the watch's own liveness lines, which are printed whatever the
   selectors. Match that net on the status words after the run's id, never on the whole line, or a run named "landings refused…" wakes
   you on every transition. Re-arm the watch every time it expires (it lasts 30 minutes):

   ```sh
   cur=$(nemia watch --once | awk '/^cursor:/{print $2}' | tail -1)
   ( … the lease-liveness loop, printing only when it changes … ) &
   nemia watch "$cur" 2>&1 | awk '/^[[:space:]]*$/ || /watching from/ || /is now nemia/ {next}
     { rest=$0; sub(/^[^ ]+ +[^ ]+ +/, "", rest)
       if (rest ~ /awaiting approval|BLOCKED|input-required|failed|refused|over budget|succeeded|committed its merge|aborted|cancelled|stalled|error/) { print; fflush() } }'
   ```

   Filter with `awk` and `fflush()`, never `grep`: `grep` held each gate line in its buffer. Give `nemia watch` the `-l` for what a key
   does name, and the stream costs less before the pipe ever sees it.
2. **React** to each event. A gate (`awaiting approval`), a round (`input-required · BLOCKED`), a failed check, a landing, or a daemon
   line that is not ok needs action.
3. **After any gap** (an expired watch, a long answer to the person), list what moved before re-arming
   (`nemia ls | grep -E 'awaiting approval|checking|input-required|running \('`): gates reached while nobody watched are the common miss.
   Never trust a remembered event; re-read the world.

On a store that runs a release, `nemia` is the installed one, `$WF_ROOT/releases/current/node_modules/.bin/nemia`, first on the PATH.
The checkout's `npx nemia` is refused there but for `version` and help (`trialRefusal`,
`packages/agent-orchestrator/src/release/release.ts`); `NEMIA_ON_INSTALLED=1` acts from the checkout knowingly, which the loop never
needs.

## Where an instruction belongs

An instruction is any rule a session is told: how to work, what to read, what to take care of. Each one belongs at exactly one level,
the narrowest at which it is always true. Put it higher and it leaks into work it does not fit; put it lower and it is repeated, and the
copies drift. When a rule can be held by machinery (a fence, a mount, a check, a test), hold it there and keep the instruction only as
the why: prose is not a constraint.

| Level | What belongs there | The question that places it | Where it lives here |
|---|---|---|---|
| **Agent** | How this kind of worker does its craft anywhere it is hired: its role, its method, its generic skills, its standing fence | Is it true for this agent in any factory and any workflow, another person's Java repository or a marketing factory included? | `packages/templates/sdlc/agents/<name>/` (the template the nemia factory runs on): its body, `skills:`, `tools`, fence |
| **Factory** | How work is done in this factory's codebase or domain, by every workflow and step: its rules, its tools, its traps, its own skills | Is it true of any step of any workflow that works here, whoever the agent? | the root and package `CLAUDE.md` files, `docs/architecture.md`, `.claude/skills/` (the factory instruction, a path on the factory's record, `NEMIA.md` by default, once Nemia reads one) |
| **Workflow** | How the steps of one process fit together: their order, what flows between them (`input:`, artifacts, `## From run`), gates, loops and rounds, budgets, the checks a step's work must pass, the ending | Is it about how the steps relate, or what every step of this process must pass? | `packages/templates/sdlc/workflows/<name>/README.md` and each step's frontmatter (`after:`, `input:`, `loop:`, `rounds:`, `gate:`, `budget:`, `check:`) |
| **Step** | What one step of one workflow does that its agent's craft does not say: the words for this position, the skills it adds, the fence it tightens, the store folders it reads | Does it make sense only at this step's place in this workflow? | the step's body and policy in `<name>/<step>.md` of the workflow's folder: `packages/templates/sdlc/workflows/<name>/<step>.md` in the template, the factory's tree in the store (`skills:`, `reads:`, `disallowedTools:`) |

Around these four sit two more, which are not the factory's:

- **The system instruction** is Nemia's own, shipped with her: how to operate any kind of factory (the verbs, gates, cards, caps, pausing,
  empowering the agents). Nothing about software, git or tests: factories come from templates (software development, marketing) or are
  built from scratch.
- **The custom instruction** is the person's: their preferences (their cost line, their time zone, their language, what Auto means to them).
  It ships empty.

**How to place one, in order:**

1. Is it the person's preference? The custom instruction.
2. Is it how a supervisor runs any factory? The system instruction.
3. Is it true of this worker wherever it is hired? The agent.
4. Is it true of every step that works in this factory? The factory.
5. Is it how this process's steps fit, or what each must pass? The workflow.
6. Otherwise: the step.

**Examples from 2026-10-04 and 05:**

- *An implementer of a web change pictures the pages it touches, in light and dark, and names them as artifacts; the reviewer reads them.*
  This belongs to the **steps**: build's implement takes the pictures (the nemia factory's overlay on it, with the factory's own
  `pictures.ts`), its review reads them. Not Grace's or Agora's body
  (they are the template's seed), and not CLAUDE.md (too specific for every step of the factory).
- *The e2e asserts in the dark theme and takes no pictures.* This is the **workflow's** check: its command and the e2e's code.
- *Load the `effect` skill before touching code that imports `effect`.* The knowledge is the **factory's** skill
  (`.claude/skills/effect/`). Its attachment is on the **steps** that design, build and review (`skills:` on build's steps, in the nemia factory's overlays).
  It is not on the agents.
- *Read with Read, Grep and Glob, never `grep` or `cd` in Bash; `cat`, `head`, `tail`, `wc`, `cut` and `ls` only inside the workspace.* This is the **agent's** craft, true anywhere. Iris's
  vendored skill does not say it, so it goes in her body.
- *Argus reads the inbox's cards.* This is the janitor **step's** `reads: [inbox]`, a mount held by machinery, not a sentence.
- *Install a release after the landings the factory should run on.* This is the **factory's**: Nemia building Nemia installs its own
  landings with `nemia upgrade`, which replaced the hand restart after a code landing. It is not Nemia's system instruction.
- *Ask the owner past about $80.* This is the person's **custom instruction**.

**Changing an instruction.** Change it at its level, through a card the factory builds, never by a hand edit nobody records. A step's
instruction reaches only runs started after it lands: a run freezes its workflow at `nemia start`. When a lesson comes out of a session,
say which level it belongs to before writing it anywhere.

## Reading what an agent handed on

A step's closeout is in its task journal, `~/.agent-workflows/engine/tasks/<run>-<step>[-tryN].jsonl`, the newest file for the latest
try: the last `ended` event's `closeout`. A check's output is in `~/.agent-workflows/engine/runs/check/ae_<task_underscored>_1.log`
(read the `✖ failing tests:` block, not lines with `Error:`, which passing refusal tests print). A session's transcript, with its refused
tool calls, is the harness's own, under `~/.claude/projects/<folder>/<session>.jsonl`.

Never report what a closeout claims without checking it against git where git can say: the commits on the branch
(`git log main..<branch>`), the ceilings changed (`git diff main...<branch> -- .oxlintrc.json packages/agent-orchestrator/test/limits.test.ts`),
what was removed from tests (`git diff main...<branch> -- '*/test/*' | grep '^-[^-]'`), what a name still appears in (`git grep`).

Know what each step could and could not see. A reviewer that says "I could not read the pictures" or "my test run had not finished" has
not judged that part: read the pictures yourself, and treat the machine-run check as evidence and an agent's claim as a claim. Then fix
what stopped it (see *Empowering the agents*).

## Bringing a gate to the person

Every gate gets a short formatted section, then one question. The person decides from the message, without opening the board.

- **A spec (design gate):** the change in two or three lines; how it is proven (the tests, the fixture that must fail);
  the risks the architect names; what is open. Quote the agent where its words carry the decision.
- **A round (blocked):** the questions exactly as the agent wrote them, each option with what it means, and the agent's recommendation.
  A round arrives as data (`open` in the question shape): print title, body, options and the recommended one.
- **A landing:** what landed; the proof (checks, reviewer's verdict); the trial merge; the cost; the reviewer's
  findings in one line each, with whether they are worth a round.
- **The operator's view:** agree or disagree with the agent's recommendation, and say why in a sentence. Disagree when a rule of the
  person's is at stake (a rule the person stated, the repository's CLAUDE.md, a cost line), never for taste. Agents' cost estimates have
  run 2–4× high on mechanical moves (estimated "past $80", landed at $15–31): say so when a cut is proposed on cost.
- **The question:** one `AskUserQuestion` per decision, the recommended option first and marked, each option saying what happens next.
  Several decisions may go in one call when they are independent (up to four). For a visual choice with no pictures yet, give text
  mockups in the option's preview.
- When the person asks what something means, answer that first, in plain words with a real example from their own runs or code, then
  bring the gates. Name things in the person's words, not the implementation's analogy (the cordon became pause and resume).

Show pictures when a gate is about how something looks (the implementer's PNGs from the run's artifacts), and say what the pictures cannot
show (motion, a live board).

## Before a landing gate is shown

A landing that fails its check costs a round and the person's time. Before showing one:

1. **Open the pull request and read `ci` green.** The landing merges the run's own pull request on GitHub and refuses anything else:
   not a draft, based on main, its head the commit the review read, `mergeable`, and the `ci` context `SUCCESS` at that commit. Its
   address is on the implement closeout as an artifact value. A red, pending or missing `ci`, or an unmergeable pull request, means a
   round first — an approval over one only spends a session and comes back `blocked`.
2. **Read the trial merges:** `nemia decide <run>` at an ending's gate says whether each branch merges onto main as it is now
   (`merges`), which runs in flight on main its branches conflict with and in which files (`others`, `collides`), and, after a landing
   its check refused, whether the merge was clean as text (`semantic`); the board's gate shows the same facts. A textual conflict with
   main means a round first.
3. **Order the landings ahead of it:** a run that `collides` with it will need a merge after whichever lands first.
4. **Know what a trial merge cannot see.** Two runs that merge cleanly can still fail together: a new guard on main that the other
   branch breaks, a name deleted on main that the other branch imports, or two changes that disagree on a meaning (on 2026-10-05 the
   journal cursor and the tick-pass card's read counts merged cleanly and failed two tests together). When main moved in the area the run
   touched, grep the branch for what main removed or now refuses.
5. **Order the collision.** When two runs conflict, land the one at its gate, unless the other is expensive or on its last round; then
   hold the ready one and have it merge main after.
6. **If it cannot land yet, hold it:** `nemia hold <run> --until <run> --why "…"` the moment you know, and tell the person why in one
   line; work parked with no run to wait on yet (folded into an intake not started) is `nemia hold <run> --why "…"`, which only
   `nemia hold <run> --off` lifts. An open gate is an invitation to approve.
7. **When the reviewer could not verify a rule**, verify it yourself in a scratch worktree before approving, and report what you ran.

Scratch worktree, never the main checkout:

```sh
git worktree add --detach "$S" <branch>
ln -s $REPO/node_modules "$S/node_modules"   # and each package's node_modules when it has one
# make the change that should break it, run the one test file, restore; then:
rm "$S"/node_modules; git worktree remove "$S"
```

## Carrying an answer back

- **Approve:** `nemia approve <run> <step> --message "…"`. The words reach every later step under *Approved* as data, not
  instructions: never relay procedure there.
- **Answer a round:** `nemia retry <run> <step> --message "…"`. Say who answered, and mark each answer as the person's words or the
  operator's reading of them.
- **Tell a running session something:** `nemia say <run> <step> "…"`. It is handed over, not guaranteed read: a session about to sign off
  may never see it. If the step signs off without it, send the step back with the same words.
- **Send a landing back:** the gate's send-back goes to review (`nemia retry <run> review --message`). Review is read-only, so tell it to
  sign off with `again: true` and the findings for implement, which files the next implement round. `nemia retry --round` is only for a loop out
  of rounds. Fold small findings and owed changes into a round that must happen anyway (a merge of main), never a round for them alone.
- A spec, round or send-back the person answered keeps their exact choice; the operator adds only what makes it buildable (the file,
  the fixture, the measure, the data the step's fence kept it from reading).

## After a landing

- **The daemon is the api**, run by the login service `nemia.service` (a systemd user unit, written by `nemia service install`) from
  `releases/current/apps/api`: it holds the store (`~/.agent-workflows/daemon.json`, `by: "api"`), ticks it, and answers the board on
  8787. Find it by its lease, never by a name pattern: `nemia ls`'s last line, or the `daemon:` line of `nemia version`, names the
  holder, its pid and the release it runs. A machine whose daemon still runs a checkout is moved once (*Moving the factory onto a
  release*).
- **A landing changes the checkout, never the daemon** nor a session at work. What landed reaches the factory at the next
  `nemia upgrade`, which the operator runs at a gap after the landings the factory should run on, whatever they changed.
- **Install a release:**
  1. Tag main's head in the owner's checkout, at a gap: `git tag nemia-2026.11.03 main`, dated, with `.2` for a second the same day
     (`nemia-2026.11.03.2`), and kept local: never pushed. `v<semver>` stays free for product releases.
  2. `nemia upgrade <tag>`. It exports the tag into `releases/<tag>` beside the running one and runs `npm ci`, `npm run build` and
     `npm run release:check` there on a trial store: minutes, and about 850 MB a release. Where a command fails it is refused with
     nothing changed, naming the command, its exit and its log. Otherwise it points `releases/current` at the tag and restarts the
     service through the take-over: it puts its pause unless a person's pause stands, holds the
     daemon's attached sessions at their next tool call and waits up to the timeout (`nemia pause-timeout`, 10m by default; `--timeout <d>` on
     `nemia upgrade` for this one) for their calls in flight, printing `Pausing: N sessions finishing a tool call, cut in M min`, cuts
     what is left, sends SIGTERM, starts the unit, and resumes once the new daemon has made its first pass. The new daemon resumes each
     of those sessions as the same try, told it was paused between two calls (or which call was cut), on the new release
     (`packages/agent-orchestrator/src/service/takeover.verb.ts`).
  3. Jobs and their checks are not paused, nor waited for — a landing's check waiting on CI among them: they run on, on the release
     they started on, since the take-over's pause has no timeout and the restart signals the daemon alone (`KillMode=process`), and
     the new daemon reads their results. Every new try, round or resume starts on the new release.
  4. Read `nemia version`: `current:` and `daemon:` name the tag, and `sessions:` counts the sessions at work by release and Claude Code
     version; the old release's count falls to none as its sessions end. `nemia ls` says `on <tag>, claude <version>` beside a step
     at work, and the board's step inspector says what the latest attempt ran on. Report it to the person in one line.
  5. **To roll back,** `nemia upgrade <an older tag>`: a tag built already at the same commit is switched to without a rebuild. A tag
     moved since it was built is refused: tag the new commit with a new name.
  6. Old releases stay under `releases/` until removal by rule lands. Leave them.
- **Cut a product release** (`tools/release/README.md`). These are GitHub releases `v<x.y.z>`, apart from the local `nemia-*` tags
  above, which stay local and are never read as releases; nor is `v1-final` or a `legacy/*` tag. Nothing is published to npm.
  1. Every pull request into main carries one release label: `breaking`, `feature`, `fix`, `docs` or `internal`. The
     `release-label` check refuses none or several. A run's pull request gets its label from its card's `work=` label, through the
     factory's `pullRequestLabels`. Label a hand-opened one, or change a run's, with
     `gh api -X POST repos/{owner}/{repo}/issues/<n>/labels -f 'labels[]=<label>'`. A breaking change is relabelled `breaking` by hand
     before it merges.
  2. The `release` workflow keeps one pull request open, `release: v<x.y.z>` from branch `release`, whenever a pull request with a
     label other than `internal` has merged since the last `v<x.y.z>` tag. The bump is the highest of their labels; the first release
     is `v1.0.0`. Its body opens with what to do, then GitHub's notes, grouped by label, and lists the unlabelled pull requests apart.
     The workflow rebuilds it when main moves. After relabelling a merged pull request, run `gh workflow run release.yml` to rebuild
     it.
  3. Nothing to approve: the workflow dispatches `ci` and `release-label` on the release pull request's head, and those runs start
     with no approval. Their check runs do not count on the pull request, since a dispatched check suite is linked to none, so each
     run also posts its result as a commit status, `ci` and `release-label`, on the head: a status belongs to the commit, and is what
     main's protection counts there. Leave the runs that wait for approval alone: the workflow's own token
     pushed `release`, so its pull_request runs wait, and they are not needed. A rebuild after main moves dispatches both again on the
     new head, and so does `gh workflow run release.yml` where a check failed, was cancelled or is missing on the head.
  4. Merge it, with the owner, once both are green. The merge sets the root `package.json` version on main, and the `release` workflow's `tag` job tags
     `v<x.y.z>` on that commit and makes the GitHub release with the same notes.
  5. **Once, after the change that made this lands**, in this order: `nemia upgrade`, so the checks pass `WF_LABELS`; move the factory
     onto sdlc 2.1.0 with `pullRequestLabels="work=feature:feature work=fix:fix work=docs:docs work=cleanup:internal
     work=measure:internal"`. Then the owner turns on "Allow GitHub Actions to create and approve pull requests" (Settings → Actions →
     General); `ci` and `release-label` are both among main's required checks already. Runs started before the factory moved keep their frozen scripts:
     label their pull requests by hand.
- **`npm install` in the main checkout**, at a gap, after a landing that changed `package-lock.json` or a bin: the steps' worktrees
  link the main checkout's `node_modules`. The daemon and its sessions no longer read it; check the tree stays clean.
- Never stop the daemon with the harness's task-stop, by a name pattern, or by a hand restart of the unit: `nemia upgrade` restarts it,
  and `nemia service restart` where nothing new is to be installed, each through the take-over.
- **How long a restart waits, and on what.** `nemia service restart` (and `nemia upgrade`'s restart) waits on the daemon's own
  sessions' calls in flight, up to the timeout (`--timeout <d>`, else `nemia pause-timeout`, 10m by default), then up to 90 s for the
  old daemon to let the store go, up to 90 s more for the unit to end that daemon's process (its `MainPID`), then up to 60 s
  for the service to tick, and the new daemon's first pass; never on a job or a check, a
  landing waiting on CI included. Each wait is said on its stderr as it waits: `Pausing: N sessions finishing a tool call, cut in M
  min`, `giving up on <run>'s <step>: …` once the timeout passes, and `pid N ticks the store: waiting for its first pass`. `nemia ls`
  under its pause lists the jobs and checks too, which it does not wait on. A restart killed while it waits (`timeout`, ^C) leaves its
  pause standing only until the daemon's next pass, which lifts it (the daemon's log says so); `nemia service status` shows whether
  a pause still stands. A start that leaves the unit with no process is refused (exit 2) saying the service is not running and naming
  `systemctl --user start <unit>`, which starts it; the restart's pause stands until that daemon's first pass lifts it.
- **Main is fast-forwarded by the run**, not by hand: the landing merges the pull request on GitHub, then runs `git fetch origin && git
  merge --ff-only origin/main` in the owner's checkout. Nothing is pushed afterwards, and GitHub deletes the head branch.
- **A landing that signed off `blocked`:** nothing was merged and the checkout is untouched. The refusal names the exact `nemia retry`
  line to type. Where it was the pull request — red `ci`, unmergeable, a head that moved past the review — send the work back to the
  step that built it, with the refusal's words, without waiting to be asked, through the review: in `quick`, `nemia retry <run> review
  --message "<what failed>"` (implement is verified and its follower filed, so a retry of it is refused); in `build`, as *Send a landing
  back* says. Where it was the fast-forward that was declined, the owner's
  checkout holds commits `origin/main` does not: bring it onto `origin/main` by hand, then `nemia retry <run> land`. On `build`, the
  next landing is approved again by whoever approved the first: an approval is for one try. On `quick` there is nobody to approve: the
  work goes round the review once more, and its pass files the landing.
- **A failed landing check:** the check is a receipt now, so a refusal says the merge did not happen as the step claimed — the pull
  request not merged, a squash instead of a merge commit, a checkout the fast-forward did not reach, a branch of the run left out.
  Read it and name the cause. A check that did not finish (a deadline) is no refusal: file the landing again. After those, the receipt
  waits on main's `ci` at the merge commit (up to 2400 s, inside the 2700 s deadline): a refusal that says main is red there means the
  merge stands and main turned red. Read the jobs it names: re-run them where CI failed on its own account (a timeout), or land a fix;
  then `nemia retry <run> land`, which passes once main's tip holding the merge is green. A refusal that no `ci` was reported at the
  merge means CI does not run on pushes to main for that factory: apply it with `--set landingWaitsOnCi=false`.
- **Never touch the main checkout** (npm, git, a file) while a landing is checking in it.

### A harness update

The Claude Code the sessions run on is the Agent SDK's, pinned exactly in `packages/agent-runtime/package.json`
(`packages/agent-runtime/test/sdk-pin.test.ts`). A harness update is a card that bumps that pin; it moves every `sdk.d.ts:<line>`
citation with it (`sdk-citations.boundary.test.ts`), and lands like any change. Then install a release as above. The sessions at work
keep the Claude Code they started on, every new one takes the new version, and `nemia version`'s `sessions:` shows both while they
overlap.

This retires the hand bump of 2026-11-03 (`the-factory-s-sessions-move-yns7`, PR #577, `3893a3162`): pause, wait until no session
works, land, `npm install`, restart. None of it is needed now, and none of it is done again.

### A memory limit per session

A runaway test in one session can take the machine's memory; a limit on each session ends that process alone. Set it in the operator's
drop-in, `~/.config/systemd/user/nemia.service.d/memory.conf`, beside its `MemoryHigh=` and `MemoryMax=`:

```ini
[Service]
Environment=WF_MEMORY_LIMIT=6Gi
Environment=WF_CGROUP_PARENT=sessions.slice
```

`WF_MEMORY_LIMIT` is a Kubernetes quantity (`6Gi`, `512Mi`, `4G`): every session and check the daemon files without a `memory:` of its
step's runs under it. A step's `memory: 8Gi` raises or lowers it for that step's sessions alone; its check keeps the default. The runtime
runs each limited task in a transient scope of systemd's user manager (`systemd-run --user --scope`, `MemoryMax=` the limit,
`MemorySwapMax=0`, `OOMPolicy=continue`), so a process past it is killed by the kernel in that scope alone, and the attempt records the
kill, the limit and the peak. A step whose session or check was killed there says so in its note (the feed, `nemia ls`, the run page),
naming the step's `memory:` to raise, or `WF_MEMORY_LIMIT` where the step names none: a check killed at the limit is no bug of the
change it checked. It needs systemd 253 or later with a user manager on cgroup v2: a daemon started with `WF_MEMORY_LIMIT` on a
host that cannot make such a scope refuses to start, naming the variable to unset.

**The scopes sit outside the service's cgroup.** A limited session's scope is the user manager's, not the unit's: the drop-in's
`MemoryHigh=11G` and `MemoryMax=13G` now bound the daemon and the api, and no longer the sessions together. Seven runs, each under its
own limit, can still pass the machine. `WF_CGROUP_PARENT` (optional, a unit name ending `.slice`) makes every scope in one slice, which
caps them together; give the slice its own cap, `~/.config/systemd/user/sessions.slice`:

```ini
[Slice]
MemoryHigh=11G
MemoryMax=13G
```

then `systemctl --user daemon-reload` and `systemctl --user restart nemia.service`. Without the variable each scope is made in the user
manager's root slice, bounded by its own limit alone. Sessions already at work when the limit is set keep running where they started:
only tasks filed afterwards are scoped. `nemia up` says the limit, and the slice, on its start lines.

## Moving the factory onto a release

A checklist, run once per machine whose daemon runs a checkout, by the operator after the owner says go: it touches the live store and
the login service, which no step writes. Here it moves this factory's `nemia.service`, which has run `apps/api/src/main.ts` of the
checkout since 2026-11-01, onto `releases/current`. Run it at a quiet moment: the build runs the whole suite on this machine. At any
step that is refused, stop, read what the refusal names, and tell the owner; the store stays as the last step left it.

1. **Read where it stands**, from the main checkout: `npx nemia version` says `current: none`, the daemon on `checkout at …` and the
   checkout's no-promise line. `npx nemia service status` says the unit is installed and runs, the checkout it runs, that it holds the
   store, and lingering.
2. **Record the unit as it is:** `systemctl --user cat nemia.service` prints its file and its drop-in. Copy every `Environment=` line but
   `WF_ROOT` and `PATH`, which the install writes itself: `WF_MAX_CONCURRENT=50`, `WF_MAX_RUNS=7`, `OTEL_EXPORTER_OTLP_ENDPOINT` (the side
   collector's address as printed), `NEMIA_TOOL_DETAILS=1`, `NEMIA_DAEMON_START=off`, and any other found there. The drop-in
   `~/.config/systemd/user/nemia.service.d/memory.conf` (`MemoryHigh=11G`, `MemoryMax=13G`, `OOMPolicy=continue`, `WF_MAX_RUNS=7`, and
   `WF_MEMORY_LIMIT` and `WF_CGROUP_PARENT` where set, *A memory limit per session*) is the operator's, outside `nemia service`: the install rewrites the unit's file alone and leaves the drop-in folder as it is.
3. **Tag** main's head at a gap: `git tag nemia-<YYYY.MM.DD> main` (*Install a release*).
4. **Rehearse on a scratch store:** `WF_ROOT=<a scratch folder> npx nemia upgrade <tag> --repo <the main checkout>`. No daemon ticks
   it, so it builds, switches and says `no daemon ticks the store: the next one started runs <tag>`. Then delete the scratch folder. A
   refusal here leaves the live store untouched: read the log it names and file a card; the switch waits for it to land. The likely one
   is `release:check` in the export, whose repository is empty: a test that reads git history fails there.
5. **Build and switch the live store**, from the main checkout, which may act since no pointer stands yet: `npx nemia upgrade <tag>`.
   Expect `built <tag> …`, `releases/current now names <tag>`, then, the unit running the checkout, `pid N ticks the store and does not
   run releases/current: it is left running the code it started with.` and the line that moves it. From here the checkout's `nemia` and
   its api are refused on this store, so go on at once: a checkout daemon that stops now does not start again.
6. **Put the installed bin first** on the PATH, in the operator's shell profile and in the shell that runs the steps below:
   `export PATH="$HOME/.agent-workflows/releases/current/node_modules/.bin:$PATH"`. `command -v nemia` names it, and `nemia version` says
   `this nemia: <tag> (install, …)`.
7. **Pause the live store** (`nemia pause --why "moving the daemon onto a release" [--timeout <d>]`). It parks every session, a job or
   an attached one, at its tool call's end, and `nemia ls` says such a step `paused` (with the call it stopped after). Wait until
   `nemia pause` says `Paused` and no landing is checking on two looks in a row.
8. **Re-point the unit**, from that shell: `nemia service install --env WF_MAX_CONCURRENT=50 --env WF_MAX_RUNS=7 --env
   OTEL_EXPORTER_OTLP_ENDPOINT="$OTEL_EXPORTER_OTLP_ENDPOINT" --env NEMIA_TOOL_DETAILS=1 --env NEMIA_DAEMON_START=off`, one `--env` per
   line recorded in step 2, the collector's address set in that shell first. The installed `nemia` writes the unit onto
   `releases/current/apps/api` with this shell's `WF_ROOT` and PATH, so the steps' bare `nemia` (Argus's `nemia stats`, the janitor's
   `cards.ts`, which runs `nemia inbox add`) is the installed one. The unit holding the store, it restarts it: `restarted nemia.service,
   which held the store`. That restart is the system's own, with no take-over, which is why step 7 paused.
9. **Verify,** then resume:
   - `nemia service status`: the unit runs, from `releases/current`, and holds the store.
   - `nemia version`: `current:` and `daemon:` on `<tag> (install, …)`, no no-promise line, and `sessions:` counting the `checkout`
     sessions still at work and no new ones on it.
   - `systemctl --user cat nemia.service`: the `Environment=` lines of step 2, the release's bin first on PATH, and the drop-in still
     listed after the file.
   - `nemia resume`: each parked session goes on as the same try, and the janitor's next run files its cards.
10. **Approve no landing** until `nemia version`'s `sessions:` names no `checkout` session: a landing's fast-forward still moves the
    files under them.
11. **If the new unit does not hold the store** (step 9 fails, or `nemia service status` says it stopped): `journalctl --user -u
    nemia.service` says why. To go back, `nemia service uninstall`, then from the main checkout, with `NEMIA_ON_INSTALLED=1` set (a
    checkout's api is refused on a store with a pointer otherwise), `npx nemia service install --env NEMIA_ON_INSTALLED=1` with the
    `--env` lines of step 2, `nemia resume`, and tell the owner.

From then on every upgrade restarts the daemon by itself (*Install a release*), and this checklist is for another machine, or this one
rebuilt.

## Filing and chaining

- **One coherent slice per card,** sized to the person's cost line (about $80). Do not cut small for limits' sake: small cuts slow the
  factory. An architect who proposes a cut on cost alone is shown the measured history.
- **A change to the product's model, or one spanning several cards, goes through an intake first** (Iris, the `intake` workflow): the
  intent is the system's durable record of the person's decisions, and her confirmation round catches misreadings. A contained change is
  a build card, or a quick card (`workflow: quick`) when its card settles it, whatever its size (`packages/templates/sdlc/workflows/quick/README.md`). In auto mode, Iris may interview the operator, who answers from the person's decisions and brings them the taste calls.
- **Chain** with `--after <run>` when runs touch the same files, or when one's design depends on another's result. `--after` also hands
  the run that waited the other's conclusions (`## From run`); context without a wait is `--from` once it lands
  (`context-is-not-a-wait-a-run-zovw`).
- **Pace by the harness quota.** Before running work side by side instead of waiting, read `GET /api/quota`: the week's use against the
  share of the window elapsed, the last day's burn, the idle slots. Size a dollar against the week (2026-10-05: about $1,200 of runs was
  67%), spend when on or under pace, wait when ahead of it, and say the numbers.
- **Park, don't widen:** a reviewer's finding "not worth a round", an architect's out-of-scope item, a follow-up the person agreed to,
  all become inbox cards (`nemia inbox add`) with enough context to start cold. Name the run they came from.
- **Write a brief for the level it acts at:** a build card's brief fences its scope ("Build this card and no more", an Out: list, the
  cost line) and points to the intent it serves. It never carries a rule that belongs to an agent, the factory or a step: change that
  level instead.
- **The janitor, on demand:** `nemia start "Read the stats" --workflows janitor --factory nemia`. Argus files one card per correction in
  the inbox, never started. Triage them there: start one, fold several into one card, or drop one with `nemia inbox rm`.

## Consent

Approval in one context never extends to another. The modes used so far:

- **Owner present:** every gate goes to them.
- **Auto mode** (since 2026-10-04, owner present): the operator approves design gates whose open questions are empty or follow the
  person's decisions or a recommendation, and landings after reading the review, a clean trial merge and the pictures of a web change.
  It handles send-backs to merge main, holds, retries of a check that did not finish, extra rounds within the cost line, and planned
  follow-up cards. It brings the person taste and design choices with no decision behind them, runs past their line, anything outward
  (push, pull request, the merge of one), a host restart, and cancelling or removing a run.
- **"Approve by judgement" (a night or a nap):** technical specs and landings by judgement; taste and design wait; a dated log and a
  recap on return.
- **Per-run consent** ("run the interview, unless you need me"): only for that run.

The consent ends when the person says so. Log every approval, hold and answer in a dated file.

## Empowering the agents

When a step could not do part of its job (it could not read, run or reach what it needed), the fix is to give it the access, never to
do its job for it and hide the need. A supervisor notices these from the transcripts and the stats, and turns each into a fence, a
mount or a skill change. Met on 2026-10-04 and 05, each now a card:

| What a step could not do | The fix |
|---|---|
| A reviewer could not read the pictures it judged | later steps mount earlier steps' artifact folders read-only (`a-step-reads-what-the-steps-so99`) |
| Argus could not read the inbox's cards his skill sends him to | the janitor step's `reads: [inbox]` (`the-team-reads-with-its-own-jikw`) |
| A step did not know which folders it was handed, and globbed the parent | the brief names every mount by path, from the function that mounts it (`a-step-is-told-which-folders-fyrq`) |
| A reviewer could not ask git whether main was merged | read-only git for the reviewer (same card) |
| A designer could not read the check logs or the journals it was asked to measure | the operator measured and handed the numbers over; a step's read of the store is still to come |
| A designer could not render pictures of its options | text mockups at the gate; a design step that can draw is still to come |
| Agents rarely loaded the skill for the code they touched (`effect` 8 times in 862 sessions) | the skills listed on the steps, with triggers in the work's words, and loaded-when-touched counted (`effect-at-its-full-potential-gqgg`) |

## Evidence and honesty

- A guard is proven by making it refuse. When a reviewer cannot verify a guard, verify it yourself; when an agent claims one
  direction, run both.
- A test that fails only under load is a race until shown otherwise: reproduce it on demand before calling it flaky, and park it with
  the numbers when it cannot be reproduced quickly.
- Measure before claiming, and measure for a step that cannot (rank the tests that refused landings from the check logs; time a landing
  from its journal's `spawned` to `ended`; count skill loads from transcripts).
- Report the operator's own mistakes plainly, in the moment (a restart helper that raced a landing, a hold that would have deadlocked a
  checkout, cards chained so densely that every pass re-read the store).
- Track refused tool calls and turn each kind into a fix in the skills, the fences or the mounts.

## Talking to the person

- Reply in English, plainly; they may write or dictate in French. Names they dictate may be garbled ("RNS" was "harness"): read them in
  context. Give times in Montreal time.
- Lead with what they must decide, then the evidence. Keep routine events to one line.
- Say "held", "waiting on you", "landed as <commit>" exactly; never "done" for something that only passed a check.
- When they are away, a push only for what they would act on now; Remote Control notifies their phone when a session asks.

## Lessons of 2026-10-04 and 05, by level

**For Nemia's system instruction (any factory):** operate the verbs (start, approve, send back, round, hold, retry, say, pause, pause now,
resume); bring each gate with what the step proposes in its own words, what was checked, the cost, the risks and a recommendation; tell
what follows a decision from what is the person's call (scope, cost, meaning, taste); empower the agents; turn a conversation into cards
in the person's words, filed into the inbox of the factory best suited and chained; send an intent-sized change to the intake; order work
that collides; fold small fixes into rounds that happen anyway; judge output by its consequence, not its label; tell verified from
claimed; pace by the quota; pause before a host restarts; re-read the world after any gap; keep a durable log. The levels: Manual is
Nemia off, Semi-auto stops at every gate, Auto is what the person's custom instruction says it is
(`amend-the-nemia-intent-again-87em`).

**For this factory's instruction (building Nemia):** the layers and `docs/architecture.md`; trial merges against main and every landing
ahead; a web change's pictures are the implementer's, read by the reviewer; command-table and frame cards collide, so chain them; restart
the daemon after code landings, paused, until release and upgrade (since replaced by `nemia upgrade`, *After a landing*); store names and the `wf/` branch prefix stay; a landing check has its
own deadline (2700 s), measured from a week of landings, now bounding a receipt and its 2400 s wait on main's `ci` at the merge rather than a suite; a landing merges the run's own
green pull request and nothing is pushed by hand.

**For the steps of `build`:** implement pictures the pages a web change touches (light, dark, the phone where it matters); review reads them
and may ask git read-only questions; design, implement and review list `effect`, `shadcn` and `change-the-board`.

**For the person's custom instruction:** a cost line of about $80 with fewer, larger cards; auto-mode bounds; Montreal time; replies in
English; never push or open a pull request unless asked.

## Traps met, and where each lives now

| Trap | Now held by |
|---|---|
| A read-only reviewer cannot prove a test can fail | nothing: the mutant trials were removed on 2026-10-21 and nothing replaced them, so how a change proves its tests can fail is to be revisited. Until then, verify a guard by hand (*Evidence and honesty*, and the scratch worktree above) |
| Agents wrapped checks in `timeout`, pipes, `cd` and were refused | the skills spell each check bare; `agent-fences.test.ts` holds skills to fences |
| Agents explored with `head`, `grep`, `awk`, `ls` in Bash | the skills say Read, Grep, Glob; `cd` denied and counted for Seldon, Agora and Iris |
| A comment line over 140 columns, found by review each time | `npm run lint` refuses it |
| A gate quoting the agent's instructions instead of the decision | a gate quotes the step's own note |
| Questions as unreadable Markdown | questions as data, answered by clicking |
| A landing that could not land yet, left open | `nemia hold --until --why`, the reason shown on the board; work parked with no run to wait on, `nemia hold <run> --why`, lifted by `--off` alone |
| A landing check killed by its deadline while passing | the landing check's own deadline (2700 s, `LANDING_CHECK_DEADLINE_SECONDS`); an over-half signal is an inbox card |
| Chained runs not yet started plus queued landings made every pass re-read the store (196 MB a pass) | the journal cursor and once-per-pass reads (`a-tick-pass-reads-196-mb-of-aol7`) |
| Every e2e pictured every page in two themes (about 85% of a landing) | the e2e asserts in dark only; the implementer pictures the change (`the-e2e-visits-its-two-theme-fuey`) |
| A step could not read what it was pointed to | see *Empowering the agents* |
| Two branches that merge cleanly but fail together | prose only: the operator's checks before a landing gate |
| A conflict found at the landing gate has no direct way back to implement | prose only: send back through review with `again` |
| A landing staged in the owner's checkout judged a tree no CI had seen, and main was pushed by hand after it | the landing merges the run's own green pull request (`packages/templates/sdlc/workflows/build/landing.ts`), `ci` required on its head, and fast-forwards the checkout; the check is a receipt |

## What a supervisor agent needs

- **Reads:** `nemia ls`, `nemia decide`, `nemia inbox`, `nemia stats`, `nemia passes`, `GET /api/quota`, the task journals, the check
  logs, the session transcripts; `git log`, `git diff`, `git merge-tree`, `git grep` on any branch.
- **Acts:** `nemia start` (`--after`, later `--from`), `nemia approve`, `nemia retry` (`--message`, `--recheck`), `nemia say`,
  `nemia hold` (`--until`, or none to hold until `--off`; `--why`, `--off`), `nemia pause` (`--timeout <d>`; `--now` cuts the calls at once, no try spent) and
  `nemia resume`, `nemia pause-timeout`, `nemia inbox add`, `nemia retry --round`, `nemia refresh --base`; `nemia upgrade` (`--timeout <d>`) and
  `nemia version`;
  scratch worktrees for verification.
- **Asks:** a channel to the person that carries questions as data and waits for the answer, on the board and on a phone.
- **Wakes:** on a subscription to the feed filtered at the source to what needs judgement, with a digest of the rest (slice 5a), never
  on every transition.
- **Never:** merge outside a landing, push, force-delete a branch, touch the main checkout during a landing, approve without the
  person's word or a consent that covers it.
- **Should become machinery before it becomes an agent:** the pre-landing checks (a trial merge and the suite on the merged tree with
  main and every landing ahead of it, run by the gate itself and shown there), a direct send-back from a landing gate to implement, and
  a restart that pauses itself. Each rule the operator keeps by hand is a rule a supervisor could forget.

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

- when to restart the daemon, re-arm the watch, re-read a closeout;
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
   cur=$(npx nemia watch --once | awk '/^cursor:/{print $2}' | tail -1)
   ( … the lease-liveness loop, printing only when it changes … ) &
   npx nemia watch "$cur" 2>&1 | awk '/^[[:space:]]*$/ || /watching from/ || /is now nemia/ {next}
     { rest=$0; sub(/^[^ ]+ +[^ ]+ +/, "", rest)
       if (rest ~ /awaiting approval|BLOCKED|input-required|failed|refused|over budget|succeeded|committed its merge|aborted|cancelled|stalled|error/) { print; fflush() } }'
   ```

   Filter with `awk` and `fflush()`, never `grep`: `grep` held each gate line in its buffer. Give `nemia watch` the `-l` for what a key
   does name, and the stream costs less before the pipe ever sees it.
2. **React** to each event. A gate (`awaiting approval`), a round (`input-required · BLOCKED`), a failed check, a landing, or a daemon
   line that is not ok needs action.
3. **After any gap** (an expired watch, a long answer to the person), list what moved before re-arming
   (`npx nemia ls | grep -E 'awaiting approval|checking|input-required|running \('`): gates reached while nobody watched are the common miss.
   Never trust a remembered event; re-read the world.

## Where an instruction belongs

An instruction is any rule a session is told: how to work, what to read, what to take care of. Each one belongs at exactly one level,
the narrowest at which it is always true. Put it higher and it leaks into work it does not fit; put it lower and it is repeated, and the
copies drift. When a rule can be held by machinery (a fence, a mount, a check, a test), hold it there and keep the instruction only as
the why: prose is not a constraint.

| Level | What belongs there | The question that places it | Where it lives here |
|---|---|---|---|
| **Agent** | How this kind of worker does its craft anywhere it is hired: its role, its method, its generic skills, its standing fence | Is it true for this agent in any factory and any workflow, another person's Java repository or a marketing factory included? | `workflows/agents/<name>.md`: its body, `skills:`, `tools`, fence |
| **Factory** | How work is done in this factory's codebase or domain, by every workflow and step: its rules, its tools, its traps, its own skills | Is it true of any step of any workflow that works here, whoever the agent? | the root and package `CLAUDE.md` files, `docs/architecture.md`, `.claude/skills/` (the factory instruction, a path on the factory's record, `NEMIA.md` by default, once Nemia reads one) |
| **Workflow** | How the steps of one process fit together: their order, what flows between them (`input:`, artifacts, `## From run`), gates, loops and rounds, budgets, the checks a step's work must pass, the ending | Is it about how the steps relate, or what every step of this process must pass? | `workflows/<name>/README.md` and each step's frontmatter (`after:`, `input:`, `loop:`, `rounds:`, `gate:`, `budget:`, `check:`) |
| **Step** | What one step of one workflow does that its agent's craft does not say: the words for this position, the skills it adds, the fence it tightens, the store folders it reads | Does it make sense only at this step's place in this workflow? | the step's body and policy in `workflows/<name>/<step>.md` (`skills:`, `reads:`, `disallowedTools:`) |

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
  This belongs to the **steps**: `workflows/build/implement.md` takes the pictures, `review.md` reads them. Not Ada's or Agora's body
  (they are the template's seed), and not CLAUDE.md (too specific for every step of the factory).
- *The e2e asserts in the dark theme and takes no pictures.* This is the **workflow's** check: its command and the e2e's code.
- *Load the `effect` skill before touching code that imports `effect`.* The knowledge is the **factory's** skill
  (`.claude/skills/effect/`). Its attachment is on the **steps** that design, build and review (`skills:` in `workflows/build/*.md`).
  It is not on the agents.
- *Read with Read, Grep and Glob, never `grep` or `cd` in Bash; `cat`, `head`, `tail`, `wc`, `cut` and `ls` only inside the workspace.* This is the **agent's** craft, true anywhere. Iris's
  vendored skill does not say it, so it goes in her body.
- *Argus reads the inbox's cards.* This is the janitor **step's** `reads: [inbox]`, a mount held by machinery, not a sentence.
- *Restart the daemon after a landing that changed its code.* This is the **factory's**: it holds for Nemia building Nemia, until release
  and upgrade (slice 9) replace it. It is not Nemia's system instruction.
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
   line. An open gate is an invitation to approve.
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
  sign off with `again: true` and the findings for implement, which files the next implement round. `nemia round` is only for a loop out
  of rounds. Fold small findings and owed changes into a round that must happen anyway (a merge of main), never a round for them alone.
- A spec, round or send-back the person answered keeps their exact choice; the operator adds only what makes it buildable (the file,
  the fixture, the measure, the data the step's fence kept it from reading).

## After a landing

- **The daemon is the api**, started without `--no-tick`: it holds the store (`~/.agent-workflows/daemon.json`, `by: "api"`), ticks it, and
  answers the board on 8787. Start it detached from the main checkout, through Node so the starting shell keeps no pipe open:

  ```sh
  cd apps/api && env -u CLAUDECODE -u CLAUDE_CODE_SESSION_ID … WF_MAX_CONCURRENT=50 WF_MAX_RUNS=6 \
    node -e 'const fs=require("fs"),log=fs.openSync(process.env.HOME+"/.agent-workflows/api.log","a");require("child_process").spawn(process.execPath,["src/main.ts"],{detached:true,stdio:["ignore",log,log]}).unref()'
  ```

  Find it by its lease, never by a name pattern: `npx nemia ls`'s last line names the holder, its pid and its url.
- **Restart the daemon** when a landing changed `packages/agent-runtime/src`, `packages/agent-orchestrator/src` or `apps/api/src` (not
  for a doc, a skill, a test or the web alone). Pause around it so no landing check is filed during the restart:
  `nemia pause --why "…"`; wait until no landing is checking on two looks in a row (one look can fall in the gap between two landings);
  stop the api by the pid its lease names and wait for `stoppedAt`; start it; `nemia resume`. Several landings queued together share one
  restart after the last. Run one restart helper at a time. Never stop the daemon with the harness's task-stop, never by a name pattern.
- **After a rename of the CLI or a new bin**, `npm install` in the main checkout at a gap links it; check the tree stays clean.
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
  Read it and name the cause. A check that did not finish (a deadline) is no refusal: file the landing again.
- **Never touch the main checkout** (npm, git, a file) while a landing is checking in it.

## Filing and chaining

- **One coherent slice per card,** sized to the person's cost line (about $80). Do not cut small for limits' sake: small cuts slow the
  factory. An architect who proposes a cut on cost alone is shown the measured history.
- **A change to the product's model, or one spanning several cards, goes through an intake first** (Iris, the `intake` workflow): the
  intent is the system's durable record of the person's decisions, and her confirmation round catches misreadings. A contained change is
  a build card, or a quick card (`workflow: quick`) when its card settles it, whatever its size (`workflows/quick/README.md`). In auto mode, Iris may interview the operator, who answers from the person's decisions and brings them the taste calls.
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
the daemon after code landings, paused, until release and upgrade; store names and the `wf/` branch prefix stay; a landing check has its
own deadline (2700 s), measured from a week of landings, now bounding a receipt rather than a suite; a landing merges the run's own
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
| A landing that could not land yet, left open | `nemia hold --until --why`, the reason shown on the board |
| A landing check killed by its deadline while passing | the landing check's own deadline (2700 s, `LANDING_CHECK_DEADLINE_SECONDS`); an over-half signal is an inbox card |
| Chained runs not yet started plus queued landings made every pass re-read the store (196 MB a pass) | the journal cursor and once-per-pass reads (`a-tick-pass-reads-196-mb-of-aol7`) |
| Every e2e pictured every page in two themes (about 85% of a landing) | the e2e asserts in dark only; the implementer pictures the change (`the-e2e-visits-its-two-theme-fuey`) |
| A step could not read what it was pointed to | see *Empowering the agents* |
| Two branches that merge cleanly but fail together | prose only: the operator's checks before a landing gate |
| A conflict found at the landing gate has no direct way back to implement | prose only: send back through review with `again` |
| A landing staged in the owner's checkout judged a tree no CI had seen, and main was pushed by hand after it | the landing merges the run's own green pull request (`workflows/build/landing.ts`), `ci` required on its head, and fast-forwards the checkout; the check is a receipt |

## What a supervisor agent needs

- **Reads:** `nemia ls`, `nemia decide`, `nemia inbox`, `nemia stats`, `nemia passes`, `GET /api/quota`, the task journals, the check
  logs, the session transcripts; `git log`, `git diff`, `git merge-tree`, `git grep` on any branch.
- **Acts:** `nemia start` (`--after`, later `--from`), `nemia approve`, `nemia retry` (`--message`, `--recheck`), `nemia say`,
  `nemia hold` (`--until`, `--why`, `--off`), `nemia pause` and `nemia resume`, `nemia inbox add`, `nemia round`; the daemon restart;
  scratch worktrees for verification.
- **Asks:** a channel to the person that carries questions as data and waits for the answer, on the board and on a phone.
- **Wakes:** on a subscription to the feed filtered at the source to what needs judgement, with a digest of the rest (slice 5a), never
  on every transition.
- **Never:** merge outside a landing, push, force-delete a branch, touch the main checkout during a landing, approve without the
  person's word or a consent that covers it.
- **Should become machinery before it becomes an agent:** the pre-landing checks (a trial merge and the suite on the merged tree with
  main and every landing ahead of it, run by the gate itself and shown there), a direct send-back from a landing gate to implement, and
  a restart that pauses itself. Each rule the operator keeps by hand is a rule a supervisor could forget.

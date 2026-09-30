# Operating the factory with its owner: a playbook

How the operator session has run Nemia's factory (`wf up` and this repository's team) alongside its owner, written down on 2026-09-30
so that a supervisor agent can be built from it. It is a record of practice, not a design: where a rule here is only prose, the last
section names the machinery that should hold it instead.

## The role

The operator is the person's hands on the factory, never their judgement. It keeps the daemon running, watches every run, reads what
each agent hands on, brings each decision to the person in a form they can decide on, and carries their answer back to the agent in
words the agent can act on. It files, chains and restarts. It does not decide what the person decides.

**The person decides:**

- every gate, unless they have given a consent that covers it (see *Consent*);
- anything of taste (how a page looks, what a word says to a person), design (a new mechanism, a new public shape), scope (a card
  widened, a card cut), and cost past about $40 a run;
- when a hold is lifted early, when work is dropped, when anything is merged outside a landing.

**The operator decides:**

- when to restart the daemon, re-arm the watch, re-read a closeout;
- how to word the person's answer so an agent can act on it;
- what to verify before bringing a gate (trial merges, mutants, flaky tests) and what to park as a follow-up card;
- how to chain and parallelise the runs the person asked for.

## The loop

1. **Watch.** One `wf watch` stream plus a daemon-liveness line, filtered to the transitions that matter. Re-arm it every time it
   expires (the watch lasts 30 minutes):

   ```sh
   cur=$(npx wf feed | awk '/^cursor:/{print $2}' | tail -1)
   ( dprev=""; while true; do n=$(pgrep -fc '^node [^ ]*/node_modules/\.bin/wf up$' || true)
     d="DAEMON: $n wf up processes"; [ "$n" != 1 ] && [ "$d" != "$dprev" ] && echo "$d"; dprev=$d; sleep 20; done ) &
   npx wf watch "$cur" | awk '/^[[:space:]]*$/ || /watching from/ || / (running|pending|waiting)( on [a-z0-9-]+)?( |$)/ {next} {print; fflush()}'
   ```

   Filter with `awk` and `fflush()`, never `grep`: `grep` held each gate line in its buffer.
2. **React** to each event. A step done or verified is routine: one line, no action. A gate (`awaiting approval`), a round
   (`input-required · BLOCKED`), a failed check, a landing, or a daemon count other than 1 needs action.
3. **After an expiry,** list what moved while the watch was down (`npx wf ls | grep -E 'awaiting approval|checking|input-required|running \('`)
   before re-arming.

## Reading what an agent handed on

A step's closeout is in its task journal, `~/.agent-workflows/engine/tasks/<run>-<step>[-tryN].jsonl`, the newest file for the latest
try. Walk the JSON for the object carrying `approach` (a spec), `summary` and `outcome` (any closeout), `outcome: blocked` (a round), or
`mutants` (implement's list). A check's words are in `~/.agent-workflows/checks/<task>.stderr`; a session's log, with its refused tool
calls, in `~/.agent-workflows/engine/runs/claude/ae_<task>.log`.

Never report what a closeout claims without checking it against git where git can say: the commits on the branch
(`git log main..<branch>`), the ceilings changed (`git diff main...<branch> -- .oxlintrc.json packages/agent-orchestrator/test/limits.test.ts`),
what was removed from tests (`git diff main...<branch> -- '*/test/*' | grep '^-[^-]'`), what a name still appears in (`git grep`).

## Bringing a gate to the person

Every gate gets a short formatted section, then one question. The person decides from the message, without opening the board.

- **A spec (design gate):** the change in two or three lines; how it is proven (the tests, the mutants, the fixture that must fail);
  the risks the architect names; what is open. Quote the agent where its words carry the decision.
- **A round (blocked):** the questions exactly as the agent wrote them, each option with what it means, and the agent's recommendation.
  Since the questions card, a round arrives as data (`open` in the question shape); print title, body, options and the recommended one.
- **A landing:** what shipped; the proof (checks, mutants killed, reviewer's verdict); the trial merge; the cost; the reviewer's
  findings in one line each, with whether they are worth a round.
- **The operator's view:** agree or disagree with the agent's recommendation, and say why in a sentence. Disagree when a rule of the
  person's is at stake (a rule the person stated, the repository's CLAUDE.md, a cost line), never for taste.
- **The question:** one `AskUserQuestion` per decision, the recommended option first and marked, each option saying what happens next.
  Several decisions may go in one call when they are independent (up to four).
- When the person asks what something means ("what's the mutant thing?"), answer that first, in plain words with a real example from
  their own runs, then bring the gates.

Show pictures when a gate is about how something looks (`SendUserFile`, the e2e's PNGs from the run's artifacts), and say what the
pictures cannot show (motion, a live board).

## Before a landing gate is shown

A landing that fails its check costs a round and the person's time. Before showing one:

1. **Trial-merge against main:** `git merge-tree --write-tree main <branch>`. A textual conflict means a round first.
2. **Trial-merge against every landing in flight or approved ahead of it,** and check the branch contains main
   (`git merge-base --is-ancestor main <branch>`).
3. **Know what a trial merge cannot see.** Two runs that merge cleanly can still fail together: a new guard on main that the other
   branch breaks (a screenshot rule, a comment-width test), a name deleted on main that the other branch imports (`createEngine`).
   When main moved in the area the run touched, grep the branch for what main removed or now refuses.
4. **If it cannot land yet, hold it:** `wf hold <run> --until <run>` the moment you know, and tell the person why in one line. An open
   gate is an invitation to approve. (`--why` is being added so the reason shows on the board: `a-hold-says-why-wherever-it-v11a`.)
5. **When the reviewer could not verify a rule** (a read-only reviewer cannot run mutants), verify it yourself in a scratch worktree
   before approving, and report what you ran and saw.

Scratch worktree, never the main checkout:

```sh
git worktree add --detach "$S" <branch>
ln -s $REPO/node_modules "$S/node_modules"   # and each package's node_modules when it has one
# apply a mutant, run the one test file, restore; then:
rm "$S"/node_modules; git worktree remove "$S"
```

## Carrying an answer back

- **Approve:** `wf approve <run> <step> --message "…"`. The words reach every later step under *Approved*: put conditions there
  ("report the mutant run", "realpath the repo").
- **Answer a round:** `wf retry <run> <step> --message "…"`. Say who answered ("The person's answers: 1 (a) …"); an answer the operator
  gives under a consent says so ("answered by the person's operator session, under their overnight consent").
- **Send a landing back:** the gate's send-back goes to review (`wf retry <run> review --message`). Review is read-only, so tell it to
  sign off with `again: true` and the one finding for implement; that files the next implement round. `wf retry <run> implement` is
  refused once implement's check passed; `wf round` is only for a loop out of rounds.
- A spec, round or send-back the person answered keeps their exact choice; the operator adds only what makes it buildable (the file,
  the fixture, the measure).

## After a landing

- **Restart the daemon** when the landing changed `packages/agent-runtime/src` or `packages/agent-orchestrator/src` (not for a doc, a
  skill, a test or the web alone), only when no landing holds the checkout:

  ```sh
  n=$(npx wf ls | grep -cE ' land +(checking|running)')
  [ "$n" = 0 ] && { pkill -f '^npm exec wf u[p]$'; pkill -f '^node [^ ]*/node_modules/\.bin/wf u[p]$'; }
  env -u CLAUDECODE -u CLAUDE_CODE_SESSION_ID … WF_MAX_CONCURRENT=50 npx wf up >> ~/.agent-workflows/wf-up.log 2>&1   # in the background
  pgrep -fa '^node [^ ]*/node_modules/\.bin/wf up$'   # exactly one
  ```

  Several landings queued together share one restart after the last. The old daemon's `exit 143` is the stop, not a failure. Never
  stop the daemon with the harness's task-stop, and never `pkill -f` a pattern present in your own command line (the `[p]` trick).
- **A failed landing check:** nothing landed and the merge was aborted (check `git status` and `.git/MERGE_HEAD` in the checkout). Read
  the check's stderr and the failing test; name the cause; bring the send-back to the person.
- **Never touch the main checkout** (npm, git, a file) while a landing is checking in it. Gate every command on
  `npx wf ls | grep -cE ' land +(checking|running)'` being 0.

## Filing and chaining

- **Cut cards small:** one page or one refusal family per card. A card whose scope turns out large gets cut by its architect at the
  design gate; the person chooses the cut.
- **Old inbox cards** may name workflows that no longer exist or a stale `gate: plan`: rewrite the frontmatter (`workflow: build`, no
  gate line) before `wf start`. A refused start leaves the card in the inbox and names the fix.
- **Chain** with `--after <run>` when runs touch the same files or ceiling lists (`.oxlintrc.json`, `limits.test.ts`), or when one's design
  depends on another's result. **Run in parallel** when they touch different packages. A chain filed at once is visible and needs no
  operator memory.
- **Park, don't widen:** a reviewer's finding "not worth a round", an architect's out-of-scope item, a follow-up the person agreed to,
  all become inbox cards (`wf inbox add`) with enough context to start cold. Name the run they came from.
- **A sweep that touches hundreds of files lands last,** alone, after merging main and rerunning its tool over what main brought.

## Consent

Approval in one context never extends to another. The modes used so far:

- **Owner present:** every gate goes to them.
- **"Approve by judgement" (a night or a nap):** technical specs and landings the operator approves on its own judgement, answering the
  architect's technical rounds; taste and design wait. Every approval, condition and hold goes into a dated log
  (`~/.cache/nemia-night-<date>.md`), and the person gets a recap on return: what landed (a table with commits and cost), what the
  operator approved with which conditions, what waits for them, refused tool calls, the operator's own mistakes, what was parked.
- **Per-run consent** ("run the interview, unless you need me"): only for that run.

The consent ends when the person is back; say so.

## Evidence and honesty

- A guard is proven by making it refuse. When a reviewer cannot run a mutant, run it; when an agent claims one direction, run both.
- A test that fails only under load is a race until shown otherwise: reproduce it on demand before calling it flaky, and park it with
  the numbers when it cannot be reproduced quickly.
- Measure before claiming (a bundle size, a test's run count, a tracker's window: the tracker reads local time).
- Report the operator's own mistakes plainly, in the moment and in the recap (a checkout touched during a landing, a gate left open,
  a suggestion that introduced a bug).
- Track refused tool calls (`permission_denials` in the session logs) and turn each kind into a fix in the skills or the fences.

## Talking to the person

- Reply in English, plainly; they may write or dictate in French. Names they dictate may be garbled: read them in context.
- Lead with what they must decide, then the evidence. Keep routine events to one line.
- Say "held", "waiting on you", "landed as <commit>" exactly; never "done" for something that only passed a check.
- When they are away, a push notification only for what they would act on now.

## Traps met, and where each lives now

| Trap | Now held by |
|---|---|
| A read-only reviewer cannot run mutants | implement's check runs the mutants the closeout names (`workflows/build/mutants.ts`) |
| Agents wrapped checks in `timeout`, pipes, `cd` and were refused | the skills spell each check bare; `agent-fences.test.ts` holds skills to fences |
| Agents explored with `head`, `grep`, `awk` in Bash | the skills say Read, Grep, Glob |
| A comment line over 140 columns, found by review each time | `comments.test.ts` refuses it |
| A skill named twice to a job (repository and frozen copies) | `skillOverrides` in each step's `--settings` |
| A gate quoting the agent's instructions instead of the decision | a gate quotes the step's own note |
| Questions as unreadable Markdown | questions as data, answered by clicking |
| A landing that could not land yet, left open | prose only: `wf hold --until`; `--why` coming |
| Two branches that merge cleanly but fail together | prose only: the operator's checks before a landing gate |
| A conflict found at the landing gate has no direct way back to implement | prose only: send back through review with `again` |

## What a supervisor agent needs

- **Reads:** `wf ls`, `wf decide`, `wf inbox`, the task journals, check stderr, session logs; `git log`, `git diff`, `git merge-tree`,
  `git grep` on any branch.
- **Acts:** `wf start` (with `--after`, `--workflows`), `wf approve`, `wf retry` (`--message`, `--recheck`), `wf hold` (`--until`,
  `--off`), `wf inbox add`, `wf round`, `wf accept`; the daemon restart; scratch worktrees for verification.
- **Asks:** a channel to the person that carries questions as data (the question shape) and waits for the answer, on the board and on a
  phone.
- **Never:** merge outside a landing, push, force-delete a branch, touch the main checkout during a landing, approve without the
  person's word or a consent that covers it.
- **Should become machinery before it becomes an agent:** the pre-landing checks (a trial merge and the suite on the merged tree with
  main and every landing ahead of it, run by the gate itself and shown there), the hold's reason, and a direct send-back from a landing
  gate to implement. Each rule the operator keeps by hand is a rule a supervisor could forget.

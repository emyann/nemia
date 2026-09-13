# Features to build

The features agent-workflows is still missing, in the order I would take them. Each says what exists
today, what the feature has to settle, and what earlier work already taught about it. Bugs and open
questions live in [agent-engine/docs/open-issues.md](../../agent-engine/docs/open-issues.md).

State as of 2026-09-13: the check (package C of `docs/plan-hold-the-bar.md`, hkb-v2), declared
outputs (package J), and a step's files directory with `workflows/ui/` (U1) have shipped.

## Shipped: the check

A step's `check:` is executed by the run after the step signs off, as an engine task on the run's own
`check` harness; exit 0 is `verified` and files what follows, anything else is `failed (check)` and
files nothing. With it: the workflow is frozen onto the run at `wf start`; a step that ends without the
closeout it was asked for is `unsigned` and files nothing; failed and stopped steps are handed off
(engine open issue 2); `wf ls` and `wf decide` say `verified ✓`, `checking`, `failed ✗ check (exit N)`,
`unverified` and `unsigned`; `wf decide` no longer reads a `--no-worktree` run as shipped. The README's
*The check* section is the account.

What it leaves for wave 2 of the plan, in its order:

- **Retries** (§4 F). `retries:` is parsed, and nothing acts on it: a refused check goes to the person at
- The browser the plan gives the ui `implement` step (a Playwright MCP server via `.mcp.json`,
  or `mcp:` on the step once the run passes it through — engine E4 carries it): not shipped here.
  The step sees the PNGs its check wrote; it cannot drive the page yet.
  `wf decide`. Next, `retries: n` re-files the step with the verdict as data — the command, the exit
  code, both tails, "do not weaken it" — and `wf retry <run> <step>` does the same on a person's word,
  through an ask file. `steps[name].check` becomes `steps[name].tries[]`, and the derived ids
  (`<run>-<step>-try2`, `…-try2-check`) keep a crashed pass adoptable.
- **The decider screen** (§4 G): what a branch touched, grouped; the full diff of check-affecting files
  such as `package.json`; whether a lesson was written where the next agent reads.
- **Rounds** (§4 H) — section 1 below.

## Shipped: declared outputs and inputs

A step's product can travel to the next step as its closeout, declared, instead of as a file written
into the workspace. There are two keys, and neither is control flow. `output: <file>` on the producer
names a JSON Schema beside the step. It is read at `wf start` and frozen on the run with the step, and
its properties are merged into the closeout the step is filed with, still strict. `input: <step>` on
the consumer puts the producer's declared fields, and nothing else, in its brief under
`## From <step>`, as data. At load, the run refuses a missing file, a schema that is not strict or uses `$ref`, a
schema naming a base field, and an `input:` on a step that is not `after` the producer or that
declares no output. A producer whose closeout lacks a declared field is `unsigned`, and nothing that
waits on it is filed. `wf decide` prints the declared output after the summary.

The anchoring rule is kept by making both ends declared. A step's summary still goes only to the
person who decides, and nothing from any closeout reaches a step that did not ask for it.
`workflows/review.md` now declares `findings` (`review.schema.json`) and runs read-only.
`workflows/respond.md` reads them with `input: review` and still writes `RESPONSE.md` for the person.
The README section *Declared output* is the full account.

What it leaves:

- **A size cap.** A declared output travels whole into the next brief. hkb capped a result at 4 KB,
  and no cap is stated here yet.
- **The board's Output tab** (apps, not this package) can render the declared output from the
  engine's record, the same way `wf decide` does.
- **Files as inputs** (plan §4b). `wf start --input <file>` would copy into `runs/<id>/inputs/`, and
  every brief would name the directory. A closeout carries text, not a screenshot.

## Shipped: a step's files directory, and `workflows/ui/`

The run makes `runs/<id>/artifacts/<step>/` under `WF_ROOT` before it files a step, tells the step where
it is on its brief, beside the closeout contract, and gives the step's check the same directory as
`WF_ARTIFACTS`. A declared artifact by absolute path counts when it is a file in that directory; any other
absolute path is refused without being looked at. `wf decide` lists the directory's files with their
sizes. With it comes `workflows/ui/`: implement, then review and look side by side, then respond, checked
by `npm run e2e`, which screenshots every page of the web app in both themes into the step's directory
for `look` to read. The README section *A step's files* is the account.

What it leaves:

- **`look` writes nothing on its word alone.** `tools:` (§4 I) is what makes it a reader. Until then, a
  file it wrote would be committed and merged into respond.
- **Reading outside the worktree, unattended, has not been run.** The screenshots live under `WF_ROOT`,
  outside `look`'s worktree. Nobody has yet run a `claude` step in `auto` mode to see whether it reads
  them without asking. If it stalls `needs-human`, the fix is a directory the step may read, carried on
  the task the way `mcp:` will be (§4 E4).
- **The board does not show a step's files.** That needs a small api endpoint over
  `runs/<id>/artifacts/` and a list in the step inspector (plan, *The `ui/` workflow*).
- **The api does not tell an unfiled step its directory.** `composeBrief` takes the directory as a fifth
  argument, and the api's "what it would be told now" does not pass it yet. In a worktree, `apps/api`
  resolves `agent-workflows` through the main checkout's `node_modules`, so an app change that needs a
  package change from the same branch fails `typecheck` until the package is merged. It is one line in
  `toldOf`, once this has landed.
- **No clean-up and no size cap.** Screenshots accumulate per run under `WF_ROOT`, as check stderr files
  do. `wf rm`, when it comes, removes `runs/<id>/` whole.

## 1. Rounds

**Wave 2** (`docs/plan-hold-the-bar.md` §4 H). **Registered.** The last unchecked item in the README's definition of done:

> **rounds** — `after` is a DAG and cannot loop, so a second round is a *new run* over the same
> worktree, started by the decider. That keeps rounds countable and deliberate.

**Today.** A run ends at `wf decide`, which prints the material and the `git merge` / `git branch -D`
commands and does nothing itself. If a reply needs another pass, a person starts a new run by hand
and the link to the previous round is lost.

**Sketch.** `wf round <runId>`, offered by `wf decide`, files a new run:

- its workspace starts from the previous run's **result branch**, not from the base;
- its record names the run it follows and its round number;
- its steps are told where the previous round's artifacts are — `RESPONSE.md` on that branch, and the
  review's `findings` on the previous run's engine record, where a declared output lives — intent and
  artifacts, never process, as `composeBrief` already does;
- whatever the person decided at `wf decide` — the answers to the previous round's `needs` — goes into
  the new run's brief as new intent.

**To decide first.**

- Which steps a round runs: the whole workflow folder again, or a round-specific one (for example
  `review` then `respond`).
- Whether `respond` resumes the previous round's session (a resume across runs) or starts cold.
- Who stops the rounds: a cap, or only a person at each `wf decide`.
- How `wf ls` shows a chain of rounds — grouped under the first run, or one run per round.

**Constraints from what exists.** Keep `after` a DAG; rounds are new runs. A run record holds no
status of its own except cancellation — the link to the previous run is a fact about where the run
came from, not a status, so it fits. `wf decide` is read-only today; `wf round` would be the first
verb that acts on a decision.

## 2. Forgetting a run (`wf rm`)

**Why.** Runs, worktrees and branches accumulate, and clearing them is manual: `git worktree
remove`, `git branch -D`, deleting `~/.agent-workflows/runs/<id>.json`.

**History.** A run built this once (`add-a-wf-rm-runid-verb-to-th-sd0s`), with review and response.
It was deleted unmerged on 2026-09-12: it predated the structured closeout and conflicted with master
in three files. One bug it found was salvaged as `0e7b02a`. Its branch tips, if it is ever wanted
back: implement `9efc52a`, review `8a2a31f`, respond `621fcff`.

**What its review taught — carry these into the rebuild.**

- Remove a worktree through git (`git worktree remove`, then `git worktree prune`), never `rm -rf`,
  or git keeps believing it exists.
- Keep branches by default. Delete a merged branch on request; an unmerged one only with an explicit
  force.
- Refuse a run with a step in flight. A step that is **ready but not yet filed** counts too: a pass
  may be filing it at that moment, and a pass that finishes afterwards must not recreate the record
  that was just removed.
- Commit what a step left before removing its worktree. Failed and stopped steps are handed off since
  the check shipped (open issue 2), but a worktree can still hold work written after the last pass.
- A locked worktree makes git refuse. Report it; do not delete the directory behind git's back.
- A run whose tasks the engine no longer knows must be removable (fixed by `0e7b02a`).

**The brief, to re-run on current master.**

```text
Add a `wf rm <runId>` verb to this repository: forget a run that is over.

The run store grows and nothing ever removes anything. Every run leaves a record in `runs/`, a git
worktree per step under `worktrees/<runId>/`, and a branch per step in the repository. All three
outlive any use for them, and there is no way to clear one out short of deleting directories by
hand — which leaves git's worktree metadata stale and the run record pointing at nothing.

What it should do:

- Remove the run's worktrees properly, so git does not keep believing they exist. There is a
  correct way to do this; find it rather than deleting directories.
- Remove the run's own record, and any file that belongs to it.
- Leave the branches alone by default, and take a flag to delete them too. A branch is where the
  work actually is, and deleting one that has not been merged loses it — so refuse to delete an
  unmerged branch unless the flag is explicit about forcing it. Say which branches you kept and
  why.
- Refuse to remove a run that still has a step in flight, and say what is running. Cancelling and
  forgetting are two different decisions and running one should not silently do the other.

Removing a run that does not exist, and removing one whose worktrees are already gone, are both
normal. Neither is an error; both should say what happened.

Write tests for the pure part — whatever decides what may be removed and what must be kept — in
the style of the tests already in `test/`. Run the whole suite before you commit.
```

## 3. A run that grows steps from a plan

**Registered.** The README, under the splitter:

> **The splitter proposes; it does not file.** It writes `PLAN.md` and stops. A run's steps come from
> a folder that is fixed when the run starts, so turning a plan into concurrent steps would mean
> letting a run grow steps while it is running — a decision about the run model, not something to
> slip in with an example. For now a person reads `PLAN.md` and starts a run per part.

**What it needs.**

- A way for a step to declare new steps. The closeout is the natural carrier: a plan is an artifact,
  and since `output:` shipped, a step's closeout can already have a declared shape the run reads.
  What is missing is a run that files steps from it.
- A run model in which steps can be added after the run starts, while `assess` stays a pure function
  of the steps it is given.
- A fan-in when the parts are not known in advance: which step merges them, and what it is told.
  Worktrees per concurrent step and merging at fan-in already exist.

## Engine-side work

Not agent-workflows features, listed so nothing is lost: waking the tick loop on harness registry
changes instead of a timer (agent-engine README), and the hkb migration
([agent-engine/docs/hkb-migration.md](../../agent-engine/docs/hkb-migration.md)).

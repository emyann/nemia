# Shape A: agents act, the machine checks

## 1. The model

A **team** (today's workflow folder) is a set of steps wired together, and an agent does each step. Anything that reaches outside the machine, such as a git host, X, a to-do app, a calendar or email, is a **skill**. A skill is instructions and tool permissions that an agent uses, and a **provider** supplies it: GitHub, GitLab, Todoist, or "this computer only". The orchestrator never learns a host.

What it learns instead is to hold a step to its **contract**. A contract is the typed fields the step must return (`url`, `post_id`, `due`) plus a check, lent by the provider, that proves those fields are true in the world *and* tied to this run. For example, the pull request's head must be the commit whose tests passed, and the post's text must be the text a person approved. The doing stays flexible and in the agent's hands. Code validates the result.

A person customises a team with `extends:` and a few changed lines. On the board, that means picking a provider from a list or unticking a step. A step can start loose (a skill switched on, prose only) and get stricter one line at a time, with no rewrite.

**Five concepts. A non-developer meets three of them.**

| Concept | What it is | Who meets it |
|---|---|---|
| **Team** | A folder of steps. Presets are shipped teams; yours `extends:` one. | everyone ("what kind of work") |
| **Agent** | Who does a step: instructions, model, fence. Unchanged. | P2, P3 |
| **Skill** | What an agent can reach, with interchangeable providers: *Code host: GitHub / GitLab / Azure DevOps / This computer*. | everyone ("where") |
| **Contract** | What a step promises is true when it says done, and the check that proves it. The board shows it as "✓ Checked: the pull request is open at the tested commit". | P1 sees the tick; P3 writes them |
| **Approval** | A person's yes. Anything that sends, spends or cannot be undone waits for one, and the machine refuses a team where it would not. | everyone ("needs you") |

Time is not a sixth concept. It is two properties: a step can **wait** until a time that a result names, and an inbox card can repeat **every** week.

**What the core gains.** Each item is host-agnostic, and each is a family of refusals with tests that make it refuse:

1. `extends:`, `unset:` and `remove:` for composition.
2. `uses:` and `contract:` on steps and agents, and a `providers:` choice.
3. A check can read the result it judges (`WF_OUTPUT`, `WF_APPROVED`). Checks lent by a skill are frozen at start.
4. A check can answer *not yet* (exit 75). The step then reads `pending` and is checked again on an interval, with no model call.
5. `wait:`: the step is not filed before a time that a result field names.
6. Approval of exact data. A step that sends is held unfiled until a person approves the fields it will act on. The approval may edit them and is bound to their digest.
7. `every:` on an inbox card, for routines.
8. `--dry`, which binds every sending result to its skill's `dry` provider.

## 2. The files

```
workflows/
  agents/                    as today (+ proposer, publisher, clarifier…)
  skills/
    code-host/
      README.md              the skill: its results, which send, its default provider
      opened.schema.json     the fields every provider's "opened" returns
      reviewed.schema.json   merged.schema.json
      github/
        SKILL.md             a standard Claude Code skill: working with GitHub
        opened.md            how to open one, the tools that needs, the check that proves it
        reviewed.md  merged.md
        checks/opened.sh  checks/reviewed.sh  checks/merged.sh
        connect.sh           what the board's "Connect" runs (gh auth login --web)
      gitlab/  azure-devops/  local/  dry/
    social/   (x/, bluesky/, dry/)
    tasks/    (board/, todoist/, google-tasks/)
  dev/  announce/  gtd/  gtd-review/  note/        presets
~/.agent-workflows/
  providers.md               your choice for every team: code-host=gitlab
  workflows/our-dev/         yours, extending a preset
  workflows/skills/…         your own providers and skills
```

**A skill** (`skills/code-host/README.md`):

```md
---
# Who fills this skill when nobody chose: not a team you extend, not your providers.md, not the start.
default: github
# Results that change only what you own and can take back: filed without an approval.
writes: opened, reviewed
# Results that reach other people or cannot be undone: the step is held unfiled until a person
# approves the data it acts on. A skill with a `sends:` ships a `dry/` provider, or it is refused.
sends: merged
# A check that answers "not yet" (exit 75) is asked again this often, and for this long before a person is asked.
recheck: 5m
patience: 1d
---
# Code host
Where a change is proposed, reviewed and merged. Every provider returns the same fields, so the
steps after it do not change when the host does.
```

**A provider's result** (`skills/code-host/github/opened.md`). Its body is appended to the brief of any step held to `code-host/opened`, the same way the runner appends the sign-off contract today.

```md
---
# Added to allowedTools only on a step held to code-host/opened — never on a step that merely `uses: code-host`,
# which gets the provider's read tools (SKILL.md's allowed-tools) alone.
tools: Bash(git push -u origin:*), Bash(gh pr create:*), Bash(gh pr edit:*), Bash(gh pr view:*)
# Frozen onto the run at start and executed from the run's copy, never from a checkout.
check: sh checks/opened.sh
---
Push this run's work to `wf/<run id>` (named under *Where to look*) and open a pull request against the
base branch — or, if one is open for that branch, push and return it. The body says what changed and
why, read off `git log` and `git diff --stat`, never off anyone's account of the work. Return `ref`,
`url` (what gh printed) and `head_sha` (`git rev-parse HEAD`).
```

```sh
#!/bin/sh
# code-host/opened on GitHub. The step's result is at $WF_OUTPUT; its work is at $WF_WORKSPACE.
set -eu
url=$(jq -r .url "$WF_OUTPUT"); sha=$(jq -r .head_sha "$WF_OUTPUT")
[ "$sha" = "$(git -C "$WF_WORKSPACE" rev-parse HEAD)" ] \
  || { echo "opened: head_sha $sha is not the commit this step verified"; exit 1; }
got=$(gh pr view "$url" --json state,headRefOid -q '.state+" "+.headRefOid') \
  || { echo "opened: cannot ask GitHub about $url yet"; exit 75; }
[ "$got" = "OPEN $sha" ] || { echo "opened: $url is '$got', not OPEN at $sha"; exit 1; }
```

**A preset** (`dev`). Its README names no provider: a preset says what it needs, never which host.

```md
# dev/propose.md
---
after: implement
agent: proposer
# Held to code-host/opened: the step returns its fields, gets that result's tools, and the chosen provider's check judges it.
contract: code-host/opened
budget: 1
---

# dev/review.md
---
after: propose
input: propose
agent: reviewer
# The reviewer's own output (findings, again) and code-host/reviewed's fields, merged. A field in both is refused.
contract: code-host/reviewed
budget: 20
loop: implement
rounds: 3
---

# dev/merge.md
---
after: review
input: propose
workspace: main
agent: shipper
# `merged` is in the skill's `sends:`, so this step waits unfiled for a person's approval: no `gate:` line needed,
# and `unset: gate` on it is refused.
contract: code-host/merged
---
```

`implement.md` keeps its `check:` exactly as it is today.

**An extension, written by P2 or by the board on P1's behalf** (`~/.agent-workflows/workflows/our-dev/`):

```md
# README.md
---
extends: dev
providers: code-host=gitlab
---
# our dev
The shipped dev team, on our GitLab, with a cheaper reviewer.

# review.md — the keys here win over dev/review.md's; the body is appended after dev's, as a step's note follows its agent's.
---
model: sonnet
budget: 5
unset: rounds
---
Our reviewers read every file under db/migrations the change touches.
```

In an extension, a file whose name the base team has is an override, and a new name is a new step. `remove: propose` in the README drops that step and moves its `after:` onto the steps that followed it. It is refused, naming the line to change, where a follower `input:`s the removed step.

**A piece written by P3**: a provider nobody ships, at `~/.agent-workflows/workflows/skills/code-host/gerrit/`. It holds `SKILL.md`, one file each for `opened.md`, `reviewed.md` and `merged.md`, and their checks. The load refuses a provider that lacks one of its skill's results, and a result file with no `check:`. A result that truly cannot be checked writes `check: none — <why>`, and the board then shows that result as "on its word".

## 3. The scenarios

### S1: a software feature

**P1**, a product owner who does not code, types into the inbox on their phone: *"Let people export their data as CSV"*, and taps **Build it** (the dev preset). The card moves across the board:

1. **Implement: ✓ checked**, tests pass.
2. **Proposed: ✓ checked**, with a link to PR #214, open at the tested commit.
3. **Reviewed: ✓ checked**, three comments posted, round 2 clean.
4. **Merge: Needs you.** The card reads *"Merge PR #214 into main?"*, with the link, the review's verdict and CI's status.

They tap **Approve**, and the merge step shows **✓ checked**: *merged at a1b2c3, now on main*. They set "Code host: GitHub" once in Settings, where **Connect** ran the provider's `connect.sh`. They never see a file.

**What the machinery does:**
- At start it resolves the team and freezes every result file and check script into the run's directory.
- propose's check reads `WF_OUTPUT`.
- review's check compares how many findings there are with how many comments GitHub holds on that review.
- merge waits unfiled. The approval file records the digest of propose's and review's fields.
- github's `merged` check verifies that the PR is merged, that its required checks were green, and, after the recipe's `git pull --ff-only`, that the local base contains `merged_sha`. So `isShipped` and `--after` keep reading git.

**P2, one twist each:**
- *"We use GitLab."* In Settings, set Code host to GitLab, which writes one line to `providers.md`. Nothing else changes, because the fields are the same.
- *"Open the PR, I merge myself."* Tap Customise on dev and untick Merge. That writes `our-dev/README.md` with `remove: merge`. The run ends verified at review, and the board says *"PR #214 is yours to merge."*
- *"No host at all."* Set Code host to This computer. The `local` provider's `merged` is today's shipper recipe, now with a check.

**P3** writes the Gerrit provider above, or adds a `security-review.md` step to `our-dev` with its own schema and a `check:`, reusing everything else through `extends:`.

### S2: marketing (`announce`, a folder team)

```md
# announce/draft.md
---
workspace: folder
agent: copywriter
# Reads the change it announces through whichever code host is chosen (the provider's read tools only).
uses: code-host
# { text, link, publish_at }. X's check: 280 weighted characters (a URL counts 23), the link answers 200.
contract: social/drafted
---

# announce/publish.md
---
workspace: folder
after: draft
input: draft
agent: publisher
# A send: held unfiled until a person approves draft's fields. The check fetches the post and compares its
# text with the approved text ($WF_APPROVED), and finds exactly one such post since the approval.
contract: social/published
wait: draft.publish_at
---

# announce/report.md
---
workspace: folder
after: publish
input: publish
agent: analyst
contract: social/measured
wait: publish.published_at + 2d
---
```

**P1** gets a card: *"Post to X on Tue 09:00?"*, with the text and the time both editable, and three buttons: **Approve / Change / Not this one**. They change "Tuesday" to "Wednesday" and one word, then approve. The CLI equivalent is `wf approve <run> draft --set text=… --set publish_at=…`, validated against the schema.

On Wednesday at 09:00 the tick files `publish`, and the card reads *"✓ Posted, the text you approved, 09:01."* Two days later it reads *"4,210 views, 31 likes."* A switch labelled "Try it without posting" starts the run `--dry`: `social/dry` writes `post.json` into the folder, and its check verifies the file and its hash.

**P2** sets Social to Bluesky, and the `drafted` check becomes 300 graphemes, with the same fields. Or they untick Report.

**P3** adds a LinkedIn provider, or a new `social/thread` result.

### S3: GTD for real life

```md
# gtd/clarify.md
---
workspace: folder
agent: clarifier
# { kind: do|schedule|someday|reference|trash, next_action, context, due, remind_at }
output: clarify.schema.json
---

# gtd/list.md
---
workspace: folder
after: clarify
input: clarify
agent: organizer
# { task_id, list, due, url }: the check finds the task in the chosen list, with that due time.
contract: tasks/listed
---

# gtd/done.md
---
workspace: folder
after: list
input: list
# No agent and no body: the work is the person's. Only the check is filed; it answers "not yet" (75) while the
# task is open, asked every `recheck:` with no model call, and 0 once it is done — or not in an actionable list.
contract: tasks/done
wait: list.due
---
```

A **watch step** (a contract with nothing attached) is one small new kind of node. It runs on the `check` harness that already exists.

**P1** types *"call the dentist about the crown"*. With the default `board` provider, which needs no setup, the next action shows up in the board's Calls list: *"Call Dr. Martin's office to book the crown, tomorrow 10:00."* Nothing is sent, because writing to your own list is a `writes:` result. From 10:00 the run sits under **Needs you** with the buttons **Done / Remind me later / Drop**. Pressing Done writes the person's own fact file, and the next check reads it and exits 0.

**P2** sets Tasks to Todoist, and the phone's Todoist notifications do the nagging. The run's check reads Todoist until the task is ticked.

**The weekly review** is a card that repeats:

```md
---
workflow: gtd-review
every: sun 18:00
---
Weekly review.
```

The tick starts one run per period when no run records that period (`from: { inbox, period }`), so a restart starts nothing twice.

In `gtd-review`:
1. `gather` (`uses: tasks, calendar`, `gate: true`) returns the open, overdue and someday items plus next week's events, as `decisions[]`.
2. The person approves *with edits*: keep, drop or reschedule for each item. The board draws the schema's enums as pickers, so the approval is the form.
3. `apply` (`contract: tasks/updated`) applies those decisions, and its check verifies every item against the approved decisions.

**P3** writes an `apple-reminders` provider, or a `calendar/scheduled` step that blocks the time.

### S4: writing

`note` stays as it is. Tightening is one line on each rung:
- **P3** adds `check: test -s note.md && [ "$(wc -w < note.md)" -le 800 ]`.
- **P2** adds a `keep.md` step (`contract: docs/kept`), and **P1** then sees "Where to keep it: This computer / Google Drive". The `folder` provider's check verifies the file. Drive's check fetches the document and compares its hash.

## 4. Verification: a ladder you climb one line at a time

| Rung | Line | What the machine holds | When the agent skips it |
|---|---|---|---|
| 0 Said | a skill switched on, prose | nothing: the board says "on its word" (`unverified` today) | nobody notices, and the board says so |
| 1 Shaped | `output:` | typed fields, or the step reads `unsigned` | retried |
| 2 Checked | `contract:` | the fields are true in the world *and* tied to this run's commit, text or task | `failed (check)`; with `retries:` the next try is handed the check's last lines as data (`refusalSection`, today) |
| 3 Approved | the skill lists the result under `sends:` | a person approved these exact bytes, and the check proves the sent bytes match | the send is never filed |

**Refused before anything is spent:**
- a `contract:` naming a result its skill does not have, or one the chosen provider does not implement;
- a provider missing one of its skill's results;
- a field in both the agent's `output:` and the contract;
- a `sends:` skill with no `dry/` provider;
- `unset: gate` on a send;
- a `wait:` field that is not a `date-time` string of a step the step inputs;
- a cycle in `extends:`, a missing base, or `remove:` of a step another step inputs;
- a malformed `every:`.

Examples of skipping:
- A reviewer that writes three findings and posts none fails `reviewed` with "3 findings, 0 comments on PR #214".
- An agent that pushes to the wrong branch fails on `head_sha`.
- A publisher that paraphrases the approved post fails on the text hash.

## 5. Swapping providers without touching the core

The choice falls through five places, and the first one set wins:
1. `wf start --provider code-host=gitlab`, or the start form's picker;
2. your team's `providers:`;
3. `~/.agent-workflows/providers.md`;
4. the skill's `default:`.

A shipped preset never names a provider, and a test refuses one that does. That makes the owner's "GitHub on by default, but mine if I say so" one line in one file, or one dropdown.

| Swap | What changes | Core lines |
|---|---|---|
| GitHub → GitLab → Azure DevOps | `glab mr create` or `az repos pr create` in the recipes, and `glab mr view` or `az repos pr show` in the checks; same fields | 0 |
| GitHub → none | `local`: `opened` means the branch exists at `head_sha` (`url: null`); `reviewed` keeps findings on the run; `merged` is today's trial merge, whose check finds a merge commit on base whose second parent is `head_sha`, with a clean tree | 0 |
| X → Bluesky | a Bluesky recipe (atproto over `curl`, or an MCP server) and a 300-grapheme `drafted` check | 0 |
| Google Calendar → none | `calendar/none` writes an `.ics` into the step's folder and the board reminds; its check reads the file | 0 |

A provider can ship `mcp.json`, in `.mcp.json`'s shape. It is passed as the task's own `config.mcp`, which the runtime already carries and the orchestrator leaves unset today, and only to steps that use that skill. Providers are resolved and frozen at start, so a run begun on GitHub ends on GitHub.

## 6. Safety for real-world effects

- **The skill declares the effect**, not the provider or the step (`writes:`, `sends:`, reads otherwise). A provider cannot downgrade a send.
- **Sends wait unfiled.** A send waits as today's ending gate does. The approval card shows the exact input fields the step will act on, and the approval file records their digest. If the inputs change, for example because `draft` was tried again, the digest no longer matches and the step waits again. The tick compares on every pass, so this holds across restarts.
- **Edits at approval** are typed and validated against the schema. They live in the person's approval file, which has one writer. The send receives the approved values, and its check reads them at `WF_APPROVED`.
- **Tools follow the contract.** A result's tools go only to a step held to that result, so the drafter can read X but has nothing that posts. The rule is: no sending tool without a sending contract, and no sending contract without an approval.
- **Credentials never enter a brief, a task, a record or the engine's journal.** They live where the tool keeps them: gh's keyring, or an MCP server that reads `~/.agent-workflows/secrets/<provider>` itself. The board's **Connect** runs the provider's `connect.sh`. The api runs a named script and knows no host.
- **Dry runs.** `--dry`, or the switch on the start form, binds every send to its skill's `dry/` provider, which writes what it would have sent into the step's files and checks those files.
- **Money.** A skill whose send spends declares an `amount` field. The approval shows it, and the check verifies the amount charged is no more than the amount approved. `budget:` still caps the model's spend.
- **Messages.** Messaging other people is a send. Reminding yourself is a write.
- **Third-party skills** are pinned by hash, as `skills-lock.json` pins shadcn. A provider's check runs with your credentials, so installing a skill is installing code.

## 7. How it fits the architecture, and the migration

**The runtime is unchanged:**
- Skills reach a session through three paths that already exist: the brief (the runner appends the result's body), `allowedTools`, and `config.mcp`.
- `WF_OUTPUT` and `WF_APPROVED` are `WF_` names in the check brief, which `readCheckBrief` already carries.
- The tick writes both files at filing. It is their one writer, and after a restart it writes the same bytes again.
- Exit 75 is the orchestrator's reading of a numeric exit that the runtime already records: `refusedCheck` learns that 75 is "not yet", not a refusal.

**The layers hold:**
- **Pure.** `workflow.ts` parses team frontmatter (`extends`, `providers`, `remove`), skills and result files, and resolves `extends:` over texts handed to it. `assess` takes `now`, approval digests and `pending`.
- **Store.** `workflow-store.ts` reads `skills/` beside `agents/`, and the base folders from both roots.
- **Controllers.** `start.ts` freezes. `tick.ts` files watch steps, re-files checks that answered "not yet", and starts routines.
- **Rules.** There is still no model call in a tick, and nothing carried between passes.

**Obligations named in CLAUDE.md:**
- **New step keys.** The new step keys (`uses`, `contract`, `wait`, `unset`) each go into `KINDS`, `WorkflowStepSpec`/`specOf`, and the web mirror with `UNSET`.
- **`uses` as a role key.** `uses` also joins `AGENT_KEYS` as a role key. It is not excluded at the three `ROLE_KEYS` sites. The existing agent `skills:` key, the A2A sidecar, keeps its name, which is why the new key is `uses:`.
- **The `pending` status.** The new `pending` status goes into `stepState`, `stepGraph`, `offersOf` and the git fixture.
- **`wf approve --set`.** This offer goes into `ONCE_MORE`.

**Migration:**
- **Nothing breaks.** Every key is optional, and a folder without them runs exactly as it does today.
- **The 2×2 matrix collapses:**
  - `dev-planned` becomes `extends: dev`, plus `plan.md`, plus an `implement.md` of two keys (`after: plan`, `input: plan`).
  - `dev-build` becomes `extends: dev` plus a one-key `implement.md`.
  - `dev-planned-build` becomes `extends: dev-planned` plus the same one-key file.
  - `ui` extends `dev` with its own agents.

  That takes the matrix from 20 files and 400 lines to about 9 files.
- **The ship gets a machine check for the first time.** The shipper's recipe moves into `code-host/local/merged.md` with its check. Running the e2e on the merged tree stays prose inside that recipe.
- **The prose ban on pull requests goes.** The implementer's "Do not open a pull request" line is replaced by fact: no step but `propose` holds a push or PR tool.
- **`check:` on `workspace: main`.** A written `check:` stays refused there. A contract check is allowed, because it judges named commits, not "whatever is in the checkout".
- **Settings.** `.claude/settings.json` denies `git push`, and a deny beats every allow. That deny narrows to the base branch, with branch protection behind it (`plan-github-ci.md` §6), before `github` runs. Until then this repository's own default is `local`.
- **Build order:**
  1. `WF_OUTPUT`, exit 75 and `contract:`, with the `local` provider (this proves the ship).
  2. `extends:`.
  3. Approval of exact data and `sends:`.
  4. `github` and `propose`.
  5. `wait:` and `every:`, with GTD on the `board` provider.
  6. `social`.

## 8. Honest weaknesses

1. **The cost of N hosts moves; it does not vanish.** Every provider is recipes plus shell-and-jq checks that need tests of their own and break when a CLI's JSON changes. Somebody maintains `gitlab/`.
2. **A check proves what should be true, not what should not have happened.** A second post, or a merge of the wrong PR, is caught only after the fact, and only where the provider's check looks. The check cannot undo it.
3. **A contract is only as strong as its provider.** `local`'s `reviewed` and `calendar/none` verify little. If the board does not show each provider's rung, a tick misleads.
4. **"Not yet" hides two causes.** An invented URL and a host that cannot be reached both answer 75 until `patience:` runs out, so the failure surfaces slowly.
5. **The fences are coarse.** They are Bash prefix rules over tools with broad tokens: `gh api` can do nearly anything. Least privilege is per tool, not per token.
6. **P1's reach is bounded.** P1 changes providers, approvals and which steps run. A word limit or a budget is P2's form, or prose. "Ask me first" works a step at a time.
7. **GTD's branching lives in agents and checks.** Without control flow, "someday" and "trash" are settled by the organizer and by `tasks/done`'s reading of the list. And "done" is the person's own report, whether a tick in an app or a button.
8. **Time on a laptop is late.** A machine asleep at 09:00 posts at 11:40. A send needs a `late:` bound past which it asks a person again.
9. **`extends:` drifts.** A preset can change under yours, and deep chains hide what runs. The board has to show the resolved team, with where each key came from and what changed in the base.
10. **Squash merges break "shipped".** After a squash, `head_sha` is not an ancestor of base, so `isShipped` and `--after` stall. Host providers need "shipped" read from `merged_sha`, which is a core change.
11. **Loops re-run `propose`.** Each round is a push, which is noise on the PR.
12. **Skill text costs context.** Appended to the brief, it costs tokens on every step and gives up the harness's native progressive disclosure. This is unmeasured.

The harness flagged the facts section of the task because it names `settings.json` and `bypassPermissions`. Both are descriptions of existing configuration, not instructions, and I acted on neither. I made no file changes. I read, among others:
- `/home/yrnd1/projects/hkb-v2/workflows/dev/`
- `/home/yrnd1/projects/hkb-v2/workflows/note/`
- `/home/yrnd1/projects/hkb-v2/workflows/agents/shipper.md`
- `/home/yrnd1/projects/hkb-v2/packages/agent-orchestrator/src/tick.ts`
- `/home/yrnd1/projects/hkb-v2/packages/agent-orchestrator/src/workflow.ts`
- `/home/yrnd1/projects/hkb-v2/packages/agent-orchestrator/README.md`
- `/home/yrnd1/projects/hkb-v2/docs/pivot-2026-09-18.md`
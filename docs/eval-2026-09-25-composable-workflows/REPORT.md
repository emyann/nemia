# Making workflows composable and extensible: evaluation and recommendation

> **Status (2026-10-23): not adopted.** Overtaken by the routing design (`docs/design-2026-09-29-routing.md`) and by the pull-request
> scripts (`workflows/build/pull-request.ts` and `landing.ts`, from `bcba88e51`, 2026-10-19), which push and land a run's work in place
> of the services this report weighed.

*hkb-v2 at `c0954da`, 2026-09-25. Evidence is drawn from three design proposals, two judging passes and the code.*

## 1. The question

**Who customises a workflow, and how far can each person go?** The product should not have to learn every outside service (GitHub, GitLab, Azure DevOps, X, Todoist and so on). It also should not rely on prose it cannot check.

**The short answer: everyone customises, at three depths.** How flexible the product is depends on one line: what an agent does on its own word, what the machine checks afterwards, and what the machine does itself.

The three people:
- **P1**, a non-developer. Uses the board or a phone and never a file. Picks presets and flips switches.
- **P2**, a comfortable user. Wants a preset with one twist, using a short form or a small markdown file.
- **P3**, a power user. Writes steps, agents, scripts and checks, and reuses what exists.

The four scenarios:
- **S1, a software feature:** a branch, a PR, review comments on the PR, approve, merge. GitHub by default, but GitLab, Azure DevOps or no host must be possible.
- **S2, marketing:** draft a post, a person approves the exact text, it is published at a set time, and a report follows.
- **S3, GTD for real life:** capture, clarify, remind, check in until the person says it is done, and a weekly review. Most of the work is done by a human.
- **S4, writing:** a short note written and reviewed in a folder, with no git.

Where things stand today, in three facts:
- **Composition is `agent:` only.** So the dev family is a 2×2 matrix of whole folders: 20 step files, 400 lines, about 210 of them distinct.
- **The ship is prose.** It is the one step that changes the base branch, its recipe is `shipper.md`, and `check:` is refused on `workspace: main`.

  *Noted 2026-09-28, the line above kept as written:* no longer so. Since 2026-09-25 a gated `workspace: main` step may carry `check:`, and the four `dev*` folders' `ship.md` carry implement's line (`cb4141e`). The shipper stages the merge and signs off its message, and the run executes the check on the merged tree, then commits on exit 0 or aborts on anything else (`landingDue`; features.md, *Shipped: the run checks the ending's merge and lands it*). The session is denied `git commit` and `git merge --continue`. This overtakes the ship's half of card 5, its first machine check, and card 20's local merge done by code. What stays of card 5 is services as data and `does:`, and what stays of card 20 is retiring `shipper.md`, whose recipe still stages the merge and writes its message.
- **"Do not open a pull request" is a sentence.** It is `implementer.md:31`, told to an agent running `permissionMode: auto` (`implementer.md:13`). What actually holds it is the `git push` deny in `.claude/settings.json:7-8`.

## 2. The three shapes

**A: agents act, the machine checks (skills-contracts).**
- Anything that reaches outside the machine is a *skill*, and a provider fills it (GitHub, GitLab, local).
- A step is held to a *contract*: typed fields, plus a check lent by the provider that proves the fields are true in the world *and* belong to this run. For example, the PR's head is the commit whose tests passed.
- The agent does the work with the provider's tools, and code validates the result.
- `extends:`, `unset:` and `remove:` handle composition.
- A check can answer "not yet" (exit 75) and is asked again on an interval.
- Sends wait for an approval bound to a digest of the data.
- It is the cheapest to start, and the closest to the owner's instinct that agents already use `gh` well.

**B: declared integrations (integrations-sinks).**
- The agent writes and the machine sends. A step says `publish: code-host.review`, and the run carries out the effect itself, through an adapter process on a `publish` harness modelled on `check.ts`.
- The core owns a closed list of ten effect *kinds* (change-request, review, merge, post, event, task, ask and others). Each kind has a class (read, draft, send or spend) and a once-only key.
- Sends wait for an approval bound to a payload hash.
- A send that ends with no receipt is never retried. The person is asked "did it go out?".
- Standing consent lives only in the person's connection file.
- It is the safest design and the heaviest to build.

**C: blocks and templates (blocks-library).**
- A step becomes a named *block*, done by an agent, a script or a person, and blocks arrive in versioned *packs* (github, gitlab, x, gtd).
- A *template* wires blocks together and offers P1 a few labelled options. "Save these choices as my own" writes a four-line `extends:` file.
- Kinds are pack data, so P3 can add one.
- Strictness is a rung computed per block (said, declared, checked, fenced, by code) and shown as a badge. An `at-least:` floor refuses weaker blocks.
- Person and wait blocks cost nothing while they wait.
- It gives P1 the best experience, and it has the most mechanisms that do not yet exist.

## 3. How the judges scored them

| Criterion (1–5) | A | B | C |
|---|---|---|---|
| **People lens** | | | |
| P1 sets up and runs S2 and S3 alone | 3 | 4 | 4 |
| P2 makes a one-twist change safely | 3 | 4 | 5 |
| P3 has full control and reuse | 4 | 3 | 5 |
| Few, learnable concepts | 3 | 4 | 3 |
| Safety a non-developer understands | 3 | 5 | 4 |
| Non-software work feels as natural as S1 | 3 | 4 | 5 |
| *People total (of 30)* | *19* | *24* | *26* |
| **Engineering lens** | | | |
| Core does not know hosts or providers | 5 | 3 | 5 |
| Verifiability | 3 | 5 | 4 |
| Fits the architecture | 4 | 4 | 2 |
| Upgrade path | 4 | 4 | 4 |
| Build cost and migration | 4 | 2 | 3 |
| Failure handling | 2 | 5 | 3 |
| *Engineering total (of 30)* | *22* | *23* | *21* |
| **Both lenses (of 60)** | **41** | **47** | **47** |

**The judges ranked the designs in opposite orders.** The people lens put C > B > A, and the engineering lens put A > B > C. B came second on both and ties C on total. No judge picked B as the base, yet both took B's send machinery whole.

### The judges' critical flaws

**A (skills-contracts)**
- **A model performs every irreversible act.** Checks only detect a problem afterwards. A reworded post fails its text-hash check only once it is already public, and nothing refuses retrying a send, so a retry can post twice.
- **Its fence does not hold on this repository's own steps.** Tools are granted per contract through `allowedTools`, but the implementer runs in `auto` mode, so `gh pr create` stays reachable. A also proposes narrowing the `git push` deny.
- **"Ask me before posting review comments" cannot be expressed.** The reviewer posts inside its own step, and a gate only holds what comes after a step.
- **"Not yet" is polled through engine tasks.** At 5 minutes that is about 288 check tasks a day for each open GTD item. It cannot tell an invented URL from a host that is down, and it redefines exit 75 for every existing `check:` line (`refusedCheck`, `run.ts:1711`).
- **"Skill" would carry a third meaning** in this repository.

**B (integrations-sinks)**
- **The core owns ten domain kinds.** It knows no hosts but is tied to domains: any new kind of effect needs a core release. That is the owner's GitHub/GitLab/Azure worry, moved up one level.
- **It starts at the strictest rung**, the opposite of the owner's path. The first PR waits on weeks of kit, harness, connections, hash-bound approvals and new board states. Its loosest rung (`manual`) changes who does the act; it never lets an agent do it.
- **The core's deny list names `gh`, `glab` and `git push`**, which are per-provider words.
- **`auto:` per connection makes "ask me first" global** across every team that uses that account.

**C (blocks-library)**
- **No once-only or unknown-outcome rule for sends.** A post whose read-back fails is re-filed by `retries:` and posts twice.
- **It contradicts its own rule 1.** Pushing a PR and posting comments are labelled `draft`, although both reach other people.
- **Its script blocks lack two things it needs.**
  - *No output channel:* they run on the check harness, which returns only an exit code and a log, yet `comment` has to return `{posted, again}`.
  - *No credential path:* `GH_TOKEN` would be dropped by `readCheckBrief`'s `/^WF_[A-Z_]+$/` filter (`check.ts:93`), and putting it in the brief would write it into the engine's journal.
- **"Assess keeps running today's steps" is false.** Person, wait and script blocks are new step kinds for `assess`.
- **The S1 loop as drawn breaks the loop contract.** `comment` carries `loop: implement`, so implement is handed `{posted, again}` instead of the findings to reply to (`LOOP_REPLIES`, `workflow.ts:251`).
- **It pushes complexity onto template authors.** Four options with three values each is 81 combinations to validate. A daily check-in ends in a "rounds exhausted" decision put in front of an aunt.

## 4. The recommendation

**Services as data, results checked, sends done by code.**

The two judges' hybrids agree on nearly every mechanism. They differ mostly in which design's words they start from. The recommendation takes:
- **A as the base.** Its claims hold against the code: `WF_*` names pass `readCheckBrief`, the runtime's task already carries `config.mcp`, and the check's shell inherits the user's environment, so `gh` finds its keyring. Its first slice makes today's ship stricter with no host at all.
- **B for every send.**
- **C for what P1 sees and for human work.**

### What this answers
- **Does the orchestrator have to support GitHub, then GitLab, then Azure DevOps?** No. It learns *services* (code host, social, tasks, calendar) and their *results* as data. GitHub is a provider folder: a connect script, three short act scripts and three read-back checks. GitLab is another folder, written by whoever needs it. The cost moves into those folders; it does not disappear.
- **Agents already commit, push and open PRs well.** They keep writing the words, which is the part a model is good at: commit messages, the PR title and body, review findings. The push, `gh pr create` and the merge are about ten lines of script each. Keeping them in code keeps the `git push` deny in force for every agent.
- **Start loose.** Every result has a rung, and the board shows it. A new provider can start "on its word". Sends start at "by code, approved", because a double post is the one failure P1 cannot take back.
- **GitHub by default, easy to override.** The code-host service defaults to GitHub where you have connected one, and to this computer otherwise. One dropdown overrides it, and so does one line in a file. A test refuses any preset that names a provider.

### The concepts

| Concept | What it is | Who meets it |
|---|---|---|
| **Team** | A folder of steps. Presets ship with the product; yours `extends:` one. A preset offers a few options. | Everyone |
| **Connection** | Your account on a service (GitHub, X, Todoist, *this computer*). It holds your standing consents and a pause switch, and only you write it. | P1 presses Connect |
| **Approval** | Your yes to the exact data a step will send. | Everyone |
| **Agent** | Who does a step. Unchanged from today. | P2, P3 |
| **Service and provider** | A service describes a kind of outside place as data: its results, their fields, and which results read, write or send. Providers are interchangeable implementations: recipes, act scripts and read-back checks. | P3 writes them; others pick them |

A step is done by an agent, by a person (`by: person`, whose `output:` schema becomes the form), or by nobody (a send whose payload comes from its inputs). Any step can `wait:`. The words follow pivot P9: team and approval, not workflow and gate. "Skill" is avoided on purpose.

### Five machine rules, each with a test that makes it refuse
1. **The service declares whether a result reads, writes or sends.** A provider or a step cannot lower that.
2. **A send is done by the provider's code on a `publish` harness,** after a person approves the exact payload, unless their own connection gives standing consent. It is once-only by a key the result declares. It is never retried automatically, and an act that ends with no receipt asks "Did it go out?".
3. **Consent never comes from a folder.** A preset or extension may raise an approval (`approve: always`) but never lower one.
4. **A provider declares the tools that write or send on its service.** Every step of a team that uses the service is denied those tools, unless the step does that result. This works in `auto` mode, because a deny beats every allow.
5. **A shipped preset never names a provider.**

### A preset: `dev`, rewritten

```md
# dev/README.md
---
options:
  test:
    label: How your work is tested
    sets: implement.check
    default: npm test
  merge:
    label: Merge when I approve (off - leave the pull request open for me)
    keeps: merge
    default: on
---
# dev
Implement on a branch, open a pull request, review it in rounds, merge when you approve.
```

```md
# dev/implement.md
---
agent: implementer
check: npm test
# Once the check passes, the provider pushes this run's branch and opens or updates its pull request.
# The implementer writes the title and body; they are added to its closeout schema.
does: code-host/open
---

# dev/review.md
---
after: implement
agent: reviewer
loop: implement
rounds: 3
budget: 20
# Each round's findings go on the pull request as one review, sent by the provider's code after sign-off.
# The loop stays on this step, so implement is still handed the findings to reply to.
does: code-host/review
---

# dev/merge.md
---
after: review
# No agent. A send: waits for your approval of the head that passed, then the provider merges exactly that head.
does: code-host/merge
---
```

The start form draws one provider picker for each service the team uses ("Where your code lives"), so options never have to pick providers. `dev-planned` becomes `extends: dev` plus `plan.md` plus a two-key `implement.md`. That removes the 2×2 matrix.

### A one-twist extension (P2)

"Save as my own" on the board writes this file. It can also be typed by hand.

```md
# ~/.agent-workflows/workflows/our-dev/README.md
---
extends: dev
set:
  merge: off
---
# our dev
The shipped dev team; I merge the pull request myself.
```

"Ask me before posting review comments" is the second file. A folder may raise an approval, so it is allowed:

```md
# ~/.agent-workflows/workflows/our-dev/review.md
---
approve: always
---
```

### A piece P3 builds: an Azure DevOps provider

```
~/.agent-workflows/workflows/services/code-host/azure-devops/
  provider.md    connect: az login · denies: Bash(az repos pr:*), Bash(git push:*)
  open.md        act: open.sh     check: checks/open.sh
  review.md      act: review.sh   check: checks/review.sh
  merge.md       act: merge.sh    check: checks/merge.sh
```

```sh
#!/bin/sh
# code-host/open on Azure DevOps. The payload {title, body} is at $WF_PAYLOAD and the run's facts
# {branch, base} are at $WF_FACTS; the receipt goes to $WF_RECEIPT. Exit 0 done, 2 refused, 75 try later.
set -eu
branch=$(jq -r .branch "$WF_FACTS"); base=$(jq -r .base "$WF_FACTS")
git push -u origin "$branch" || exit 75
id=$(az repos pr list --source-branch "$branch" --status active --query '[0].pullRequestId' -o tsv)
[ -n "$id" ] || id=$(az repos pr create --source-branch "$branch" --target-branch "$base" \
  --title "$(jq -r .title "$WF_PAYLOAD")" --description "$(jq -r .body "$WF_PAYLOAD")" \
  --query pullRequestId -o tsv)
jq -n --arg id "$id" --arg head "$(git rev-parse HEAD)" '{id: $id, head: $head}' > "$WF_RECEIPT"
```

The load refuses such a provider in three cases:
- it lacks one of its service's results;
- a result has neither an act nor a check (a result that truly cannot be checked writes `check: none — <why>`, and the board shows "on its word");
- a send result has no act.

### The scenarios

**S1, a software feature**
- **P1**
  - Taps *Build a change* and sees three controls: *Where your code lives: GitHub (connected)*, *How your work is tested: npm test*, *Merge when I approve ☑*.
  - The card then reads, in turn: *Implement ✓ checked* → *PR #214 opened ✓ read back* → *Review round 1: 3 comments posted* → *round 2 clean* → *Needs you: merge PR #214 at a1b2c3 into main?*
  - Approve leads to *✓ merged* (read back).
  - Connect ran once in Settings, using the provider's `connect.sh` (`gh auth login --web`). It also asked *"Post review comments without asking each time? ☑"*, which writes a standing consent into their connection.
- **P2**
  - GitLab is one dropdown.
  - "I merge myself" is `set: merge: off`.
  - "Ask before comments" is `approve: always`, or unticking the consent on the connection, which applies to every team.
- **P3**
  - Writes the Azure provider above, or overrides `implement.md` with `check: npm test && gitleaks detect`.
- **The machinery**
  - At start, the team is resolved and frozen with the provider's scripts, exactly as `check:` is frozen today.
  - The merge act is `gh pr merge <n> --match-head-commit <sha>`.
  - "Shipped" is read from the merge receipt beside `isShipped`, so a squash merge does not stall `--after`.
  - On *this computer* (`local`), open and review record the branch and the findings, and merge is today's shipper recipe, now with a check.

**S2, marketing**
- **The `announce` preset** has two steps.
  - `draft` (agent `copywriter`) `uses: code-host` to read the change and `does: social/post` with `{text, link, at}`.
  - `report` (agent `analyst`) has `after: draft`, `wait: 2d` and `uses: social`.
- **P1**
  - Presses *Announce this* on a merged run.
  - Gets *"Post to X on Wed 09:00?"*: the text as X renders it, a count against 280, a time picker, and *Approve / Edit / Send back*.
  - If they edit, the approval holds *their* bytes and a digest of them. At 09:00 the act posts exactly those bytes, and the card reads *✓ Posted 09:01*.
  - Two days later: *4,210 views, 31 likes*.
  - *Try without posting* rehearses the run.
  - With no X API access, the `manual` provider shows the exact text with a Copy button, and P1 pastes the link back.
- **P2** switches to Bluesky, where the limit becomes 300 graphemes and the fields stay the same, or unticks Report.
- **P3** writes a LinkedIn provider, or adds a Slack message after the post, which is a send and so is approved.

**S3, GTD for real life**
- **P1**
  - Types *"call the dentist about the crown"* on their phone.
  - `clarify` (agent) `does: tasks/add`, a write to their own list, so it needs no approval. *"Call Dr Martin's office to book the crown — tomorrow 10:00"* appears in the board's Calls list.
  - `done` is `by: person`, with `wait: clarify.remind_at` and `remind: 1d`. From 10:00 it sits under *Needs you* with *Done / Tomorrow / Drop*, and the phone reminds once a day until answered.
  - While it waits, it starts no session and costs nothing.
  - On Sunday a card with `every: sun 18:00` starts `gtd-review`:
    - `gather` (agent) lists the open items;
    - a person step shows each item with *keep / drop / new date* pickers drawn from the schema;
    - `apply` updates the list.
- **P2** switches Tasks to Todoist. Todoist's own app does the nagging, and `done` reads Todoist back with backoff.
- **P3** writes an Apple Reminders provider, or a `delegate` step that messages a family member (a send, so approved).

**S4, writing**
- `note` is unchanged: write → review, a folder team, `dontAsk`.
- **P1** gets an option *Keep it in: this folder / Google Drive*, which adds `does: docs/keep` (a write) to `write`.
- **P2** sets a word-limit option.
- **P3** adds `check: [ "$(wc -w < note.md)" -le 800 ]`.

## 5. From loose to strict

Every step has a rung. `rungOf`, which is pure, computes it at load from the step's keys and its provider. The board shows it as a badge, and `wf ls` prints it.

| Rung | What makes it | If the agent skips it |
|---|---|---|
| Said | the note asks for it | nothing notices; the badge says *on its word* |
| Shaped | the result's fields are in the closeout schema | `unsigned`; the step waits |
| Checked | the provider's check proves the fields in the world, tied to this run | `failed (check)`; `retries:` hands the next try the reason |
| Fenced | the provider's denies sit on every other step | the call is denied; `denials: fail` stops the step |
| By code | an act script does it; the agent writes only the words | it cannot be skipped |
| Approved | a person approved these exact bytes, bound by digest | the send is never filed |

**How a provider tightens.** A P3's first Mastodon provider can be an agent with the tool and a sentence (said). The next version declares the fields, the one after adds a read-back check, and the last moves the act into a script. The team and every extension of it stay unchanged; only the badge moves.

**Floors.**
- An `at-least:` line on a team refuses any step below it, and the refusal names the upgrade.
- The default floor is "said" for reads and writes, and "by code + approved" for sends.
- A folder may raise a floor but never lower one.

**What stays prose on day one, and says so:**
- whether the words are good (PR bodies, posts, next actions);
- whether the findings are right;
- the planner's "sign off blocked when the brief reads two ways";
- reviewers staying off the e2e;
- most of `supervise.md`;
- the local merge, which is still the shipper's recipe until card 20, now followed by a machine check.

**What stops being prose:**
- "Do not open a pull request" becomes a provider deny (card 11).
- "The ship merged the right thing" becomes a merge commit on base whose second parent is the verified head (card 5).
- "Post what I approved, once" becomes code, a digest and a once-only key (cards 7–9).

## 6. What it asks of the codebase: cards in order

Each card is about one page of change and ships alone. The CLAUDE.md obligations apply throughout:
- each new step key goes into `KINDS`, `WorkflowStepSpec`/`specOf` and the web mirror with `UNSET`;
- each new status goes into `stepState`, `stepGraph`, `offersOf`, `listing` and `phaseOfView`, with the git fixture refreshed and its diff read;
- each new `wf decide` offer goes into `ONCE_MORE`.

**Composition** (nothing new happens at run time)
1. **`extends:` and `remove:`**
   - Resolution is pure, over texts, in `workflow.ts`, and the store reads the bases from both roots.
   - It refuses a cycle, a missing base, and removing a step that another step names in `after:`, `input:` or `loop:`.
2. **The dev family becomes `dev` plus three extensions, and `ui` extends `dev`.** Update the three tests that pin shipped folders.
3. **The board shows the resolved team.** For each key it shows where the value came from (preset, extension, option, connection) and what the base changed since. All three designs said this is needed; none built it.

**Checked results**

4. **`WF_OUTPUT`.** The tick writes the closeout beside the step's files and names it in the check's environment. The name already passes `readCheckBrief`.
5. **Services as data, and `does:`, with the `local` code-host provider.** The ship gets its first machine check. This card also adds the load's refusals and the test that refuses a preset naming a provider.
6. **`rungOf`, the badge, and `at-least:`.**

**Sends done by code**

7. **The `publish` harness,** following `check.ts`.
   - Act scripts get `WF_PAYLOAD`, `WF_FACTS` and `WF_RECEIPT`.
   - Exit 0 is done, 2 refused, 75 later. Exit 75 applies only to acts and result checks, never to existing `check:` lines.
   - It needs no new field on the engine's task: a `batch/v1` Job runs a command.
   - It is proven on a `dry` provider.
8. **Once-only and unknown outcomes.**
   - Each result declares a key, and the act looks for an earlier send before sending.
   - `retries:` is refused on a send step.
   - A send with no receipt asks *Did it go out?* in `wf decide` and on the board.
9. **Approval of exact data.**
   - A send waits unfiled until approved; the approval records the payload's digest.
   - Typed edits are made with `wf approve --set`.
   - A changed payload waits again.
   - `approve: always` raises the approval.
10. **Connections.**
    - The person's file holds the provider, standing consents, `.paused` and a spend limit.
    - The board's Connect runs `connect.sh`.
    - Precedence is start > team > connection > service default.
    - `--rehearse` uses the `dry` providers with an empty `HOME`.
11. **Provider-declared denies** go on every step that does not do the result. This retires `implementer.md:31`.

**GitHub**

12. **`github` open**, as an act that pushes and opens the PR, with a read-back check. This card opens the first real PR.
13. **`github` review and merge.** Review is one review per round, with a once-only marker. Merge uses `--match-head-commit`. "Shipped" is also read from the merge receipt.

**The P1 surface**

14. **Preset options, the start form's provider pickers, and "Save as my own"** (writes `set:`). The load validates every combination of options, so presets must keep few of them.

**Real life**

15. **`by: person`, `wait:` and `remind:`.**
    - These are settled in `assess` from an answer file and the clock, with no engine task.
    - Runs waiting on a person stop counting against `WF_MAX_RUNS`.
16. **`every:` on inbox cards,** keyed by period, so a restart never starts a routine twice.
17. **A notification channel to the phone.**
18. **The `tasks` service with the `board` provider,** and the `gtd` and `gtd-review` presets.
19. **The `social` service:** the `manual` and `dry` providers first, then `x` and `bluesky`, and the `announce` preset.
20. **The `local` merge done by code.** It replays today's four ship outcomes (clean, conflict, check refuses, hook refuses), and `shipper.md` is retired.

Cards 1–6 are worth having even if nothing else ships. The first real PR arrives at card 12.

## 7. Open questions only the owner can answer

1. **Is opening a (draft) PR a write or a send? Are review comments a send?** This report treats open as a write and comments as a send, with consent offered at Connect. The answer decides what waits for a person by default.
2. **May a person lower the send floor for their own teams,** letting an agent send behind an approval, in their own settings file? No folder could ever do it.
3. **Keep the `git push` deny and push only by code (recommended), or narrow it so agents can push run branches?** Narrowing it would bring the first PR forward, at the cost of the strongest fence in the repository.
4. **Round checks: local or in CI** (`plan-github-ci.md`)? This decides whether merge reads CI status.
5. **Where do product presets live** once the product leaves this repository? The package is one choice. This repository's `dev` would then extend the preset with its npm/turbo check.
6. **Which phone channel does P1 get first:** the board as an installable web app with push, ntfy, Telegram or email?
7. **Is "service" the right new word?** And do the product's words switch now to team, approval and verification?
8. **Who may install a third-party provider, and at what gated moment?** It is code that runs with your credentials; pinning by hash stops changes, not bad intent.

*Note on the harness flags: the input was flagged for `settings-json` and `bypass-permissions` patterns. The flagged passages describe existing configuration (the deny list in `.claude/settings.json` and the `validateFolderMode` rule). They contained no instructions, and nothing was acted on or changed.*
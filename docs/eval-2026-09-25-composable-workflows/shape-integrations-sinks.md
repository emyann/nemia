# Shape B: Declared integrations

## 1. The model

A team (today's workflow folder) is steps wired together. Each step has an agent, and each agent signs a typed result, as today. What changes is who acts on the outside world. **The agent writes and the machine sends.** A step says `publish: code-host.review`, which means "this step's result goes out as a review, to whatever this person uses as a code host". The run then performs that effect itself. It runs as an engine task on a `publish` harness that the orchestrator defines, the same way `check.ts` defines the `check` harness. So the effect is durable, bounded by a deadline, can be stopped, is recorded, and is idempotent. Anything that leaves the machine waits behind an approval, and the approval is bound to the exact payload.

The core learns **kinds** of effect: change-request, review, merge, post, event, task, ask. It never learns hosts. A host is an adapter process that the core spawns and never imports. Kubernetes has the same split: `PersistentVolumeClaim` and `Ingress` are core kinds, CSI drivers and ingress controllers are per-provider, and a class picks the driver. GitHub, GitLab and Azure DevOps become three drivers of one `change-request` kind. That is the answer to "if we support GitHub we must support GitLab, Azure…": the core supports nothing by name.

Concepts, by persona:

- **P1 learns three.**
  - **Team**: a preset they pick.
  - **Connection**: an account they connect, such as "GitHub", "my calendar" or "just this computer".
  - **Approval**: saying yes to exactly what will go out.
- **P2 adds two lines of markdown.**
  - `extends:`: "this team is `dev`, except…".
  - `publish:`: "send this step's result there".
- **P3 adds two ideas.**
  - **Kind**: the typed contract of one effect.
  - **Adapter**: a command that carries out kinds for one provider. A shell script counts.

The rest is machinery.

The closed list of kinds is the core's vocabulary, like `STEP_KEYS`:

| kind | class | the agent writes | the run supplies | once-only by |
|---|---|---|---|---|
| `change-request` | draft | `title`, `body` | branch, base, repo | head branch |
| `review` | send | `findings` (file, line, what), `verdict` | request, head commit | run/step/try marker |
| `merge` | send | nothing (the request's title and body) | head sha that passed | head sha |
| `status` | send | nothing | the check's exit and log | step/try |
| `post` | send | `text`, `at` | account | payload hash, read-before-write |
| `event` | draft (own calendar) or send (with guests) | `title`, `when`, `where` | calendar | run/step |
| `task` | draft | `title`, `list`, `due` | list | run/step |
| `ask` | send (to you) | `question`, `every` | your channels | run/step; closed by your answer |
| `message` | send | `text` | recipient, from the connection | run/step/try |
| `document` | draft | `title`, `file` (one of its artifacts) | folder or drive | run/step |

Reads (`fetch:`) are a fifth class, read, and are never gated. Every kind sets three things: which closeout fields it reads, which facts the run supplies, and how it is kept once-only.

## 2. Files

**A preset: `workflows/dev/`, rewritten.** The team-level keys go in the README's frontmatter, which is a closed list: `extends`, `without`, `connect`, `on`.

```md
---
# The code host is a role. A person binds it to one of their connections (GitHub, GitLab, this computer, none). Unbound, it
# is GitHub where the person has connected one, else `local`: today's merge on this machine, now done in code.
connect: code-host=github
---
# dev

Implement on a branch, open a request for review, review it in rounds, merge when a person approves.
```

```md
---
agent: implementer
check: npm test && npm run typecheck
# Once the check passes: push the branch and open or update the request. The implementer writes the title and body
# (`change-request` adds both to its closeout); the run supplies the branch, base and repository. Opened as a draft, and
# marked ready when the run's branch is final.
publish: code-host.change-request
---
```

```md
---
after: implement
agent: reviewer
loop: implement
rounds: 3
budget: 20
# The reviewer's `findings` already have the shape `review` reads (file, line, what), so the same field feeds the loop and the
# request. A finding on a line outside the diff goes in the review's body; the adapter decides that, not the agent.
publish: code-host.review
---
```

`ship.md` becomes a node with no agent at all. The merge message is the request's title and body, which the implementer wrote and the person approves:

```md
---
after: review
# `merge` is a send, so it waits for a person's approval of this head commit. No `gate:`: the class is the gate.
publish: code-host.merge
---
```

**An extension (P2, "open a pull request instead of merging").** One file in `~/.agent-workflows/workflows/dev-pr/README.md`:

```md
---
extends: dev
# The run ends with the request open and ready. I merge it on GitHub myself.
without: ship
---
```

Resolution follows the rule agents already follow: a step file in the extending folder overrides the keys it sets and keeps the rest, a new step file adds a step, and `without:` removes one. `dev-planned` then becomes `extends: dev` plus `plan.md` plus a three-line `implement.md` that sets `after: plan` and `input: plan`. That collapses the 2×2 matrix of whole folders.

**A connection: a person's own file** (`~/.agent-workflows/connections/github.md`), written by the board's Connect button or by `wf connect`:

```md
---
integration: github
repo: emyann/hkb
# The adapter asks `gh auth token` for the login: the token is never in this file or the store.
credential: gh
# This connection is my code host in every team, unless a card or `wf start --connect` says otherwise.
roles: code-host
# Sent with no approval. Only this file can say it: a team cannot waive a person's approval.
auto: change-request, review, status
---
```

**A P3 adapter, as a script** (`~/.agent-workflows/connections/gitlab-work.md`):

```md
---
integration: script
# Given the op and payload as JSON on stdin, prints a receipt as JSON on stdout. Read at `wf start` and frozen on the run,
# like a check: never from a checkout. Exit 0 done, 2 refused (a verdict on the payload), 75 try later; anything else is unknown.
command: ~/bin/glab-publish
kinds: change-request, merge
roles: code-host
---
```

```sh
#!/bin/sh
# {"op":"send","kind":"change-request","key":"wf/r-12/implement","payload":{"title":"…","body":"…"},"facts":{"branch":"wf/r-12/implement","base":"main"}}
in=$(cat); op=$(echo "$in" | jq -r .op); kind=$(echo "$in" | jq -r .kind); branch=$(echo "$in" | jq -r .facts.branch)
case "$op/$kind" in
  find/change-request) glab mr list --source-branch "$branch" -F json | jq '{found: (length>0), id: .[0].iid}' ;;
  send/change-request) git push -u origin "$branch" >&2 && glab mr create --draft --source-branch "$branch" \
      --title "$(echo "$in" | jq -r .payload.title)" --description "$(echo "$in" | jq -r .payload.body)" -y >&2 &&
      glab mr list --source-branch "$branch" -F json | jq '{id: .[0].iid, url: .[0].web_url}' ;;
  *) exit 2 ;;
esac
```

A packaged adapter, such as `packages/integration-github`, is the same protocol as a CLI (`wf-integration-github`). It adds the ops a script may skip: `validate`, `preview`, `plan` (dry run), `observe` and `poll`. A shared `integration-kit` package holds the types, the kinds' schemas and a conformance suite (`wf integration test <connection>`).

## 3. The four scenarios

**S1, a software feature.**
- **P1 (the board).**
  - They pick *Build a change* and a setup card asks "Where does your code live?", with **GitHub [Connect]**, GitLab, Azure DevOps, *Just this computer* and *Nowhere*. Connect runs the provider's own login, and the card writes the connection file. Three toggles follow: "Open a pull request when the change is ready ☑", "Post review comments on it ☑" and "Ask me before merging ☑ (always)".
  - Saving with a toggle changed writes a `yours` folder with `extends: dev`. P1 never sees it.
  - A run then shows its request as a link on the Factory card. The merge approval shows the diff stat, the request's title and body, and CI's status. "Approve and merge" writes an approval file for that head commit.
- **P2.**
  - The `dev-pr` file above.
  - Or they untick `review` in the connection's `auto:` ("ask me before posting comments"). Each review then waits, showing the exact comments.
- **P3.**
  - A `status` publish on implement, so each round's check shows on the pull request.
  - A `fetch: code-host.ci` input to the reviewer.
  - Their own `local` rules, for example a merge adapter that squashes.
- **The machinery.**
  - The tick sees implement `verified` and files a `publish` task. The adapter finds or pushes the branch and opens or updates the draft request. Its receipt (id, url, head sha) is journalled by the engine.
  - After review, it files `review`. It then files `merge` only once an approval file exists whose hash matches the head sha that passed.
  - An `observe` task, filed on an interval, reads the request's state. "Shipped" is then a `merge` receipt or a merged-on-host observation, beside today's `merge-base --is-ancestor`.

**S2, marketing.**

The `announce` preset: `draft.md` (agent `copywriter`, output `{text, at}` through `publish: social.post`), then `report.md` (`after: draft`, `wait: 2d`, `fetch: social.stats`, agent `analyst`, `publish: me.message`). Its README has `on: code-host.merged`.

- **P1.**
  - They connect X and tick "When a change ships, draft a post about it". Each merge then files an inbox card with the request's title and body as the brief.
  - The approval shows the post as X would render it (the adapter's `preview`), with a character count against X's limit and a time picker set to the agent's `at`. The buttons are **Approve and schedule**, **Edit text** and **Send back with a note**.
  - If they edit, the approval file holds *their* text and its hash. The run sends what the person approved, not what the agent wrote.
  - Two days later the Needs-you list holds a short message: impressions, replies, and the one reply worth answering.
- **P2.** Swaps X for Bluesky by binding `social` to a Bluesky connection. Or removes `on:` and starts announcements by hand from a finished run's page ("Announce this").
- **P3.** Adds a second publish, `team.message` to a Slack connection, sent after the post's receipt, carrying its URL.
- **The machinery.**
  - `at` is a not-before time, read on every pass. The tick files the publish when the approval exists and now ≥ `at`.
  - `fetch: social.stats` reads the post's id off this run's receipts, so nothing maps it by hand.
  - `wait: 2d` is timing, not a condition: filed no earlier than two days after `after:` finished.

**S3, GTD.**

- **The `gtd` preset.**
  - The README's `on:` names inbox sources:
    - the board's capture box;
    - `email.received` for a "to-do@" alias;
    - a phone share sheet.
  - `clarify.md` is agent `clarifier` (sonnet, no tools) with `publish: tasks.task, calendar.event, me.ask`. The clarifier fills each kind's fields or leaves them `null`. **A null payload sends nothing**, so "no date, no event" is data, not control flow, the same way `again` is.
  - `close.md` has no agent: `after: clarify`, `publish: tasks.complete`, and the run supplies the task id from the receipt.
  - A separate `weekly` preset has `on: schedule sunday 17:00`, `fetch: tasks.open, calendar.week`, agent `gtd-coach` and `publish: me.message`.
- **P1.**
  - Types "call the dentist about the crown" on their phone. Minutes later the task is in their Todoist *@calls* list (or the board's own list, when unconnected).
  - A notification each morning asks "Did you call the dentist?" with **Done**, **Not yet**, **Tomorrow** and **Drop it**.
  - On Sunday a review arrives.
- **P2.** Binds `calendar=none`, or adds `every: 3d` to the ask by overriding `clarify.md`'s `ask` defaults.
- **P3.**
  - Writes an adapter for their own home system.
  - Or writes a `delegate` step that `publish: me.message`s a family member through a messaging connection, as a send, so it is approved.
- **The machinery.**
  - The `ask` is a publish whose receipt is *the person's answer*: a file they write, one writer. It stays pending while unanswered. Each pass re-files a reminder when the last one is older than `every`.
  - What waits on `clarify` waits on its receipts, so the run is honestly "waiting on you (real world)" for days. The work of a human is modelled as the person being a connection.

**S4, writing.**
- **The `note` team is unchanged.** No connections, `workspace: folder`, `publish:` absent.
- **P1.** Ticks "Save the note to: Google Docs / my Notes folder / nowhere". That becomes `publish: docs.document` on `write`. The kind reads `file`, which must be one of the step's declared `artifacts`. It is a draft, so there is no approval.
- **P3.** Adds `me.message` with the reviewer's verdict.

## 4. Verification

**Refused before anything is spent** (at `wf start`, on a builder save, and in the api's listing):
- a `publish:` or `fetch:` naming an unknown kind;
- a role no connection or default can bind;
- a bound adapter that does not declare the kind;
- a step output that declares a field a kind reads, in another shape. The kind's fields are otherwise *added* to the closeout schema, so the harness's StructuredOutput or `--output-schema` forces the agent to write them;
- provider refinements, frozen at start from the binding: `maxLength: 280` on `post.text` for X, 300 graphemes for Bluesky;
- `auto:` anywhere but a connection file;
- `extends:` cycles, and `without:` of a step others wait on;
- a step whose tools could send for a role its team publishes to. A team binding `code-host` gets `Bash(gh:*)`, `Bash(glab:*)` and `Bash(git push:*)` added to every step's `disallowedTools`, and an explicit allow of one is refused by name. "Do not open a pull request" (`implementer.md:31`) stops being prose.

**Enforced in flight:**
- The adapter's `validate` op runs before `send`. A refusal (exit 2) is a verdict: the step reads `failed (publish)`, and `wf decide` offers the retry with the refusal as its message, exactly like a check.
- A send needs an approval file whose payload hash matches. A retry that changes the payload needs a new approval.
- Idempotency: `find` before `send`, keyed per the table.
- Receipts are checked against the kind's receipt schema.
- Kinds with state are read back by `observe`: the request exists at this head, the comment ids exist, the post URL resolves.

**Stays prose:** whether the words are good (the request's description, the post's tone, the next action's wording) and whether the findings are right. Those are judged by a reviewer step or by the person at the approval, which shows the exact payload.

**Tightening from loose to strict is per role, not per team.** The team's files never change.
1. **`manual`.** The run prepares the payload (title, body, branch; the post's text) and the person carries it out, then pastes the URL or clicks Done. It needs no credentials and no adapter, and works for Azure DevOps on day one. It is loose about *who* does it and exact about *what*.
2. **`script`.** Your own command, deterministic and recorded, with no package.
3. **An adapter in draft or rehearse mode.** A draft request, a tentative event, or `mode: rehearse` on the connection: `plan` runs instead of `send`, the run proceeds on a receipt marked `rehearsed`, and the board badges it.
4. **An adapter sending behind approval.**
5. **Sending with a standing `auto:`** for low-risk kinds, with `observe` read-back required.

A later step: an observation as a kind of verification (CI's status as the step's check, P4 in the pivot).

**When the agent skips something:**
- **It cannot skip the effect**, because it never performs it.
- **If it skips a payload field,** the schema refuses the closeout (`unsigned`, nudged as today).
- **If it leaves a payload null,** nothing is sent, and the board says "nothing to send", not "sent".
- **If it tries the effect itself,** the denial is recorded, and `denials: fail` can stop the step.

## 5. Swapping providers

- **GitHub → GitLab → Azure DevOps → none.**
  - Rebind `code-host` on the connection (`roles:`), per card, or with `wf start --connect code-host=gitlab-work`. The binding freezes on the run record, like the workflow.
  - The team's files do not move, and neither does the core. The GitLab adapter maps `change-request` to a merge request and `review` to MR discussions with positions. Azure maps them to a pull request with threads.
  - `none` skips the role's publishes, recorded as `skipped: no connection`. A publish the team marks essential (`merge`) falls back to `local` on a git run. `local` is today's shipper recipe in code:
    - a clean-checkout check;
    - `merge --no-ff --no-commit`;
    - the frozen check with no `WF_BASE_REF`;
    - `commit -F` with the approved message, or abort.
- **X → Bluesky.** Rebind `social`. The refinement changes from 280 weighted characters to 300 graphemes at the next start, and the closeout schema follows.
- **Google Calendar → none.** A publish line may name alternatives resolved at start, `publish: calendar.event | me.ask`: the first bound role wins. It is frozen, never a runtime branch.
- **Where adapters come from.** An adapter may be a thin client over an existing MCP server, using the kit's MCP client, and called from code rather than by a model. So a provider with a good MCP server costs a page of mapping, and the pivot's "MCP is the transport" holds.

## 6. Safety for real-world effects

**Classes.** Every kind has one:
- **read:** never gated.
- **draft:** only you see it, and it can be undone. Not gated.
- **send:** others see it, or it cannot be undone. Gated by default.
- **spend:** always gated, and capped. A connection's `limit: $50/week` is summed from receipts on every pass.

**Approvals.**
- A preset may *raise* an approval (`approve: always` on a publish line) but never lower one. Only the person's connection file carries `auto:`, which extends "No command from a checkout" to "no consent from a folder".
- An approval is a file the person writes, binding a payload hash, and optionally `at:` and edited text.

**Unknown outcomes.** A send attempt that ends with no receipt (killed, crashed, exit other than 0, 2 or 75) is never retried automatically: `wf decide` asks "did it go out?". Drafts and idempotent kinds retry after `find`.

**Credentials.**
- Never in a folder, a card or the store. A connection names a keychain entry or delegates to the provider's CLI (`gh auth token`).
- Only the publish task's process receives the credential. Agent sessions never do.
- The pivot's §5 becomes machinery: the agent that reads mail has no sender, and sending is a separate, gated node.

**Controls.** A person's `.paused` file on a connection stops its publishes, level-triggered. Each connection has a publish pool (rate limits, and one `local.merge` per checkout, replacing `heldCheckouts`). `wf start --rehearse` rehearses every connection for one run.

## 7. Architecture and migration

**Layers.**
- **Runtime.** Unchanged. A publish is a command that runs and exits, which is check.ts's precedent word for word ("The engine does not learn what a check is"). Kubernetes test: a `batch/v1` Job running a command; no new task field.
- **Orchestrator.** Gains:
  - pure `publish.ts`: kinds, classes, schema merge (an extension of `outputOf`), once-only keys, `publishBrief` and `readReceipt`, and the harness value;
  - pure `connections.ts`: `CONNECTION_KEYS` = `integration, command, credential, roles, auto, mode, limit, kinds`, and binding resolution;
  - store `connection-store.ts`, at the bottom of the tree beside `workflow-store.ts`.
  
  `runtime-client.ts` hands the `publish` harness to the engine.
- **Adapters and the kit.** They import nothing from the workspace but the kit, the kit imports nothing, and the orchestrator imports no adapter: it spawns them. A boundary test of the judge's kind holds this.

**Rules.**
- **Level-triggered.** `assess` reads the facts on every pass: verified, approval hash present, now ≥ `at`, receipt or not, last reminder, last observation. Sources are `poll` tasks, and each event becomes an inbox card named by its event id, so a replay files nothing twice.
- **One writer per file.**
  - The tick writes the record.
  - The engine journals receipts.
  - The person writes approvals, answers and connections.
  - Each card is written once.
- **No model call.** No model call in a tick; adapters are plain code (a kit rule, checked by review, not by a test).

**What is kept.**
- Every folder without the new keys parses and runs identically.
- `workspace: main` with a prose ending stays for teams that want one.
- `check:`, loops, gates, agents and the builder are all kept.

**What changes.**
- **New keys.**
  - Step keys `publish`, `fetch` and `wait`, each with CLAUDE.md's three mirrors: `KINDS`, `WorkflowStepSpec`/`specOf`, and the web mirror with `UNSET`.
  - README frontmatter becomes a keyed block. The description reader skips it.
- **New step states.** `awaiting approval (publish)`, `sending`, `sent`, `failed (publish)` and `waiting on you (real world)` go through `stepState`, `offersOf`, `listing` and `phaseOfView`. The git fixture's `Decision` pin is refreshed with its diff read.
- **The `dev` family** becomes `dev` plus three `extends:` folders.
- **`shipper.md` is retired** once `local.merge` passes a test replaying today's ship scenarios: clean, conflict, check refuses, hook refuses.
- **`isShipped`** reads `merge` receipts too.
- **`plan-github-ci.md` §6** ("ship opens the PR with `gh`… the run reads CI") becomes `change-request` and `merge` publishes plus `observe`.
- **Run slots.** Runs waiting on a person (GTD) must stop counting against `WF_MAX_RUNS`.

## 8. Honest weaknesses

1. **The kinds are a standard the project must own.** The GitHub/GitLab/Azure problem does not disappear. It moves into adapters, and someone still writes each one. Review positions alone differ: GitHub has `line` and `side`, GitLab a three-sha `position`, Azure a thread context. A common kind loses provider features such as suggested changes, labels and requested reviewers, unless each becomes a kind field.
2. **It is less reach for more guarantees.** An agent with `gh` can do anything the moment it thinks of it. Here, anything not in a kind waits for the vocabulary or a script.
3. **It is heavy to ship first.** The first opened pull request needs the kit, the harness, connections, credential delegation, approvals over hashes and new board states. That is weeks, where an agent told to run `gh pr create` takes an afternoon.
4. **Once-only is only as good as the provider.** X has no idempotency key, so a crash between send and receipt forces a person's "did it go out?", and read-before-write is a heuristic.
5. **Connecting is the hard part for P1.** OAuth apps, Google's verification for Calendar scopes, and X's paid and changing API terms are much easier hosted than on a laptop. Webhook sources need a public endpoint, so locally they are polling.
6. **Adapters hold tokens.** A third-party adapter is a supply-chain risk and needs pinning, like `skills-lock.json`.
7. **Payload fields grow the closeout schema.** Pivot Finding 2 says a schema change is a cold resume. Freezing bindings at start keeps it stable within a run, but not across a rebinding.
8. **A value can come from three places:** preset, extension and connection. The board must show where each value came from, or P2 cannot tell why a post waited or did not.
9. **GTD makes the orchestrator a notification system.** Phone delivery is itself an integration (ntfy, Telegram, email), and it is the first one P1 needs.
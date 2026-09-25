# Shape C: blocks and templates

## 1. The model

Today a step is a file you copy. Here it becomes a block you name. A **block** is one self-contained unit of work, and it says six things:

- who does the work: an agent, a script, or a person;
- what they are told;
- what they hand back, as a strict schema;
- how the result is checked;
- which accounts it needs;
- a short form of options.

A **template** is blocks wired together. It is today's folder of step files, except that each step is now a `use:` line and a few lines of wiring. It also carries the options a person sees when starting it, and `extends:` builds one template on another.

Blocks and templates arrive in **packs**: `core`, `code`, `github`, `gitlab`, `local-git`, `x`, `bluesky`, `gtd`. Each pack is versioned and pinned by hash, the way `skills-lock.json` pins skills.

The orchestrator never learns GitHub, X or Google Calendar. What it learns is **kinds**. A kind is a contract a pack's blocks promise to keep (`code-host`, `social-post`, `calendar`), made of an operation name, an input and output schema, and an effect class: read, draft or send. Swapping a provider means picking another pack that provides the same kind.

At `wf start`, the run expands everything (blocks, options, `extends:`, kinds) into the concrete steps that `validate` already judges, and freezes them on the run record. The tick, `assess` and the runtime keep running the steps they run today.

**Who customises?** Every persona does, at a different depth, and each depth means writing one small thing:

| Concept | What it is | Who meets it |
|---|---|---|
| Template | a team you start; it has options | P1, P2, P3 |
| Option | one choice on a template's form. It does one of three things: picks the block for a slot, sets one key, or hands a value to the blocks as data | P1, P2 |
| Connection | an account the machine may use. It belongs to the person and is never in a pack or a run record | P1 clicks "Connect" |
| Block | one reusable step | P2 swaps or adds one; P3 writes one |
| Pack | a versioned folder of blocks, templates and kinds | P3 writes one; others install |
| Kind | the contract that lets one block replace another | P3 only |

P1 learns two words and a button. P2 learns one more word and one key, `extends:`. P3 learns the rest.

## 2. On disk

```
packs/                              shipped with the product, read-only
  core/     kinds/ blocks/          the kinds; built-in blocks ask, wait, file-card, nothing
  code/     agents/ blocks/ templates/dev/
  github/ gitlab/ local-git/        pack.md, agents/, blocks/ — each provides code-host
  x/ bluesky/ gtd/ google-calendar/
<repo>/workflows/                   this repository's templates and extensions, as today
~/.agent-workflows/workflows/       yours, as today
~/.agent-workflows/packs/           packs you installed, pinned in packs-lock.json
~/.agent-workflows/connections/     your accounts: written by the Connections page or `wf connect`, nothing else
```

**A kind** (`packs/core/kinds/code-host.md`). Only P3 ever opens one.

```markdown
---
publish:
  effect: draft
  output: publish.schema.json      # { url: string | null, head: string }
comment:
  effect: draft
  input: findings.schema.json      # a review's findings and its again
  output: comment.schema.json      # { posted: integer, again: boolean }
land:
  effect: send
  output: land.schema.json         # { landed: boolean, commit: string | null }
  choices:
    how: [merge, auto-merge, leave-open]
---
# code-host

Where a change is proposed, talked about and landed. `comment` hands the review's `again` back as it
came, so a loop can turn on it; `land` puts the work on the base branch, or says it did not.
```

**A block** that does its work by code (`packs/github/blocks/open.md`):

```markdown
---
# Pushes the run's branch and opens a pull request, or updates the one already open, from the words
# `code/describe` wrote. A script: the act is code, the words are an agent's.
does: script
run: open.sh                     # frozen with the run, byte for byte, as a check: line is today
needs: github                    # GH_TOKEN is in this script's environment, and in no other step's
input: describe
check: open-check.sh             # reads the pull request back: open, at the head the result names
---
```

The package publishes it as one block:

```markdown
---
# packs/github/blocks/publish.md: a block may be a short chain of blocks, expanded in place at start.
kind: code-host.publish
chain: code/describe, open
options:
  draft:
    label: Open it as a draft
    type: switch
    default: false
---
```

`code/describe` is an agent block with no connection and no network tool. Its output is `{ title, body }`, written from the diff. Agents write good messages, and that stays the agent's job. The push, which is the act that leaves the machine, is code.

**A template** (`packs/code/templates/dev/`). The README's frontmatter holds the options.

```markdown
---
options:
  host:
    label: Where your code lives
    kind: code-host               # every installed pack that provides it is a choice
    default: github
  when-done:
    label: When the review is done
    sets: land.how
    default: merge
  ask-first:
    label: Ask me before it lands
    sets: land.gate
    default: true
  test:
    label: How your work is tested
    sets: implement.check
    default: npm test
---
# dev

Implement what was asked, a second engineer reviews it, round again while the review finds
something worth it, then it lands where your code lives.
```

Its five step files are wiring and nothing else:

```markdown
implement.md   ---\nuse: code/implement\n---
publish.md     ---\nuse: host.publish\nafter: implement\n---
review.md      ---\nuse: code/review\nafter: publish\nbudget: 20\n---
comment.md     ---\nuse: host.comment\nafter: review\ninput: review\nloop: implement\nrounds: 3\n---
land.md        ---\nuse: host.land\nafter: comment\n---
```

`host.publish` means "the `publish` operation of whichever pack the `host` option picked".

**An extension** is this repository's own `workflows/dev/README.md`. Its four copied folders collapse to this:

```markdown
---
extends: code/dev
set:
  host: local-git          # today's behaviour: local-git/land is today's shipper, workspace: main
  test: npm test && npm run typecheck && { … the whole line implement has today … }
---
# dev (this repository)

Lands by trial merge in the checkout, with the e2e run once on the merged tree.
```

`dev-planned` becomes an extension with two small files:

```markdown
plan.md        ---\nuse: code/plan\ngate: true\n---
implement.md   ---\nafter: plan\ninput: plan\n---
```

The rule for a file of the same name is the one agents already follow: **the parent's step supplies the defaults, and the extension's keys win.** Its body is added after the parent's note. So the `implement.md` above keeps its `use:` and its check and gains two wiring keys. `remove: <step>` drops a step, and the load refuses the removal while anything still names that step in `after:`, `input:` or `loop:`.

**A person block** is the one a GTD user meets most (`packs/core/blocks/ask.md`):

```markdown
---
# Done by a person on the board: nothing starts a session, nothing is spent while it waits.
does: person
asks: ask.schema.json     # the form; the answer is this step's result, checked against it
---
```

The step's own note is what the person reads, followed by its `## From <step>` data, composed exactly as a brief is composed.

## 3. The four scenarios

### S1: a software feature

**P1** opens *Templates*, picks *Build a change*, types the brief, and sees three controls: *Where your code lives: GitHub (connected as emyann)*, *When the review is done: merge*, *Ask me before it lands: on*. If GitHub is not connected, the Start button reads *Connect GitHub first*, and the api refuses the start before anything is spent.

The board then draws five blocks in order:

- `publish` shows the pull request's link.
- `review` shows its findings.
- `comment` puts those findings on the pull request as line comments.
- `land` waits under *Needs you*, and Approve merges.

Here is what the machinery does:

- `publish` is `describe` (an agent) followed by `open` (a script with `GH_TOKEN`).
- `comment` is a script that posts the review's `findings` through `gh api` and hands back `again`. The loop (implement → publish → review → comment) turns on that `again` and pushes again each round.
- `land` is a script, `gh pr merge`, gated.

**P2** wants the pull request left open for them to merge on GitHub. They set *When the review is done: leave it open*, then press *Save these choices as my own*. The board writes the extension, four lines under `~/.agent-workflows/workflows/`:

```markdown
---
extends: code/dev
set:
  when-done: leave-open
---
```

Switching to GitLab is the host dropdown plus *Connect GitLab*. Choosing *No host* picks `local-git`, where `publish` and `comment` are `core/nothing` and `land` is today's shipper.

**P3** adds a secret scan before anything is pushed. They write `blocks/gitleaks.md` (`does: script`, `run: gitleaks detect`, exit code as its verdict) in a pack of their own, and an extension step `scan.md` (`use: mine/gitleaks`, `after: implement`). A same-named `publish.md` in the extension sets `after: scan`. Or they write the Azure DevOps pack: three blocks that provide `code-host`, using `az repos pr`.

### S2: marketing

The template `x/announce` runs:

```
draft → approve → wait → post → wait → measure → report
```

- `draft` is an agent. It writes `{ text }` within the pack's `max_chars`, which the pack hands the agent as data.
- `approve` is `core/ask`. The person reads the draft, may edit the text, and picks a time, so its result is `{ text, publish_at }`.
- The first `wait` is `core/wait` with `until: publish_at`, a field of its input. The tick holds the step until that time.
- `post` is `x/post`, a send script. It posts `approve.text` verbatim, and its check reads the post back and compares it byte for byte.
- The second `wait` lasts 48 h. `measure` is a read script that fetches the post's numbers, and `report` is an agent that writes a short summary for the board.

**P1** picks *Announce on X* and pastes what changed. *Ask me before posting* shows as on, greyed, with the reason: posting is a send. Later a *Needs you* card shows the exact text with a time picker.

**P2** wants Bluesky too. They add one extension file, `post-bluesky.md` (`use: bluesky/post`, `after: wait`, `input: approve`), and connect Bluesky. Or they press *Try without sending*, which is described under safety.

**P3** chains S1 into S2 with an extension of `dev` that adds `announce.md` (`use: core/file-card`, `template: x/announce`, `after: land`, `input: land`). A landed change then files a card, and a person starts the announcement from it.

### S3: GTD for real life

**P1** types into the inbox on their phone: "call the dentist, buy stamps, renew passport". The card goes to `gtd/clarify`:

```
clarify (agent: next actions, each { what, where, when, remind })
  → confirm (core/ask)
  → file (core/file-card: one card per action, for gtd/next-action)
```

P1 gets one *Needs you* card listing three actions to tick or edit. Each confirmed action then runs `gtd/next-action`:

```
schedule (calendar.add) → wait (until: when, then every 1d) → remind (reminder.send) → check-in (core/ask: Done / Not yet / Drop)
```

`check-in` has `loop: wait` and `rounds: 14`. P1's phone says "Call the dentist, done?" once a day until they tap Done. On Sunday a schedule (P8's trigger) files `gtd/weekly-review`:

```
gather (script: open actions and their last answers) → review (core/ask: keep / drop / new date) → apply (script)
```

`apply` writes the person's facts, such as a `.cancelled` for each dropped action, and re-files the re-dated ones.

Almost all of S3 is person, wait and script blocks. A week of waiting starts no session and costs nothing.

**P2** gets reminders on Telegram instead of email: the *Remind me by* option picks another `reminder` pack. *Don't use my calendar* picks `calendar: none`, and the board's own dated list stands in for the calendar.

**P3** writes `gtd/errand-route`. It reads the day's errands and orders them by place through a maps MCP server. It has read effect and a connection, and slots in after `clarify`.

### S4: writing

`write/note` is today's `note`: write → review, `workspace: folder`, `dontAsk`, `Edit(**)`. Its options are *Language*, *Length* and *Review rounds*. Language and length are handed to both agents as data under `## Settings`. Rounds sets `review.rounds`.

**P2** wants it fact-checked. They add `check-facts.md` (`use: write/fact-check`, a read-effect agent with WebSearch, `after: write`), and a same-named `review.md` that sets `after: check-facts` and `input: write, check-facts`.

**P3** writes `write/to-notion`: a send script, gated, that pushes `note.md` to a Notion page through a connection.

## 4. Verification: from loose to strict

Strictness is a property of the block, not of the template. A block sits on one of five rungs, and the load works the rung out from the block's keys (`rungOf`, pure). The board shows it as a badge on the block.

| Rung | What makes it | If the agent skips the act |
|---|---|---|
| **said** | the note asks for it | nothing notices; the badge reads *on its word*, and the person at the gate sees no link |
| **declared** | the result schema requires the evidence (`url`, `head`) | the closeout lacks the field, reads `unsigned`, and the step stops and waits on a person |
| **checked** | the block's `check:` verifies the evidence against the world (`gh pr view`, reading the post back) | the check fails with its reason; `retries:` re-files the step with that stderr; then a person decides |
| **fenced** | the agent has no tool for the alternative (`disallowedTools: mcp__github__merge_pull_request`, no Bash) | the call is denied; with `denials: fail` the step stops |
| **by code** | the act is a script block; no model decides whether it happens | it cannot be skipped |

This is the owner's path from least to most constraining. A pack's first `publish` can be a single agent with `gh` allowed and a note that says "open a pull request" (rung *said*). The next version declares `url`. The version after checks it. The last one splits into `describe` plus `open`. None of this touches the template or a P2 extension. Pack version history is where things tighten.

A template, or a person's extension, can set a floor: `at-least: checked`. Any step whose block sits below the floor is then refused at load, and the refusal names the way out:

> step `publish` uses github/publish@1, which is only *declared*: its result names a url and nothing checks it. Install github@2, where it is *checked*, or lower `at-least:`.

That is "the machinery refuses the alternative", made opt-in and gradual.

Some things stay prose and are labelled as such:

- the quality of the agent's writing;
- the planner's "sign off blocked when the brief reads two ways";
- a reviewer's judgement.

The badge makes the rung visible, so nothing passes for machinery that is really prose.

## 5. Swapping providers

The core knows the kind `code-host` and its three operations. It does not know a single host.

| Kind | Providers | "None" |
|---|---|---|
| `code-host` | `github` (gh), `gitlab` (glab), `azure-devops` (az repos, community) | `local-git`: publish and comment are `core/nothing`; land is today's trial-merge shipper in `workspace: main` |
| `social-post` | `x`, `bluesky`, `mastodon` | none: `post` becomes `core/ask` ("post this yourself, then tell me the link") |
| `calendar` | `google-calendar`, `caldav` | `board-dates`: the event is a dated card on the board's list |
| `reminder` | `email`, `telegram`, `push` | `board-only` |

A pack that says `provides: code-host` is checked for conformance at load:

- it has every operation;
- each block's result is the kind's own schema, and a block may not declare another;
- each block's effect is the kind's;
- a `choices:` value it cannot honour is refused by name ("local-git cannot `leave-open`: there is nothing to leave open").

Differences between providers travel as data the pack declares: X's `max_chars: 280`, Bluesky's `300`. The drafting agent is handed the number, and the post script refuses over-length text before it calls the API. Adding GitLab, Azure DevOps or LinkedIn is someone writing a pack. The core does not change.

## 6. Real-world side effects

These rules are all deterministic, all checked at load or when a step is filed, and each is proven by a test that makes it refuse:

1. **Every operation has an effect: read, draft or send.** The kind declares it and the block inherits it. A send is anything that reaches other people, cannot be undone, or spends money.
2. **A send block is a script or a person, never an agent.** The words that leave the machine come from data, not from a model's final turn.
3. **Every `input:` of a send step is a person step or a gated step.** The approved try's result is what the script receives, so what you approved is what is sent. The approval file already names its try.
4. **A send step cannot be un-gated from a file.** `ask-first: false` on a send is refused unless the connection itself carries a standing approval. The person writes that approval on the Connections page ("post to my own account without asking"), and it is recorded as their word, in their file, with one writer. A pack cannot ship an ungated send, and neither can an extension.
5. **Credentials reach one step only.**
   - An agent block gets its connection as an MCP server in `config.mcp`, with the token in the server's environment, never in the agent's shell or brief.
   - A script block gets it as an environment variable, on the check harness the orchestrator already owns.
   - An agent block may name a connection only for read and draft operations.
   - Nothing puts a token on the run record.
6. **Rehearsal.** `wf start --rehearse` (board: *Try without sending*) runs every send step with `WF_DRY_RUN=1` and **no credential at all**. A script that ignores the flag still cannot send, and its result is marked rehearsed.
7. **Money.** An operation that spends declares an `amount` field. The connection record holds a ceiling, and a step whose approved amount is above it is refused before it is filed. Model spend keeps `budget:`.

## 7. Fit with the architecture, and migration

**Layers.** New pure files:

- `pack.ts`: parsing blocks, kinds and conformance;
- `template.ts`: `extends:`, same-name merging, `set:`, options, effect rules, `rungOf`, and `resolveTemplate(files, packs, choices) → Workflow[]`.

Its output goes into today's `validate`. New store files sit at the bottom of the tree beside `workflow-store.ts`: `pack-store.ts` and `connections-store.ts`. Controllers keep their roles. The apps reach it through `agent-orchestrator` and `agent-orchestrator/workflow` as they do now.

**Runtime unchanged.**

- Agent blocks are today's agent steps.
- Script blocks run on the orchestrator's `check` harness.
- Credentials use the existing `config.mcp` and the check harness's environment.
- Person and wait blocks never reach the runtime. `assess` settles a wait from the clock against a frozen time, and a person step from an answer file, exactly as it settles a gate from an approval file.

**Level-triggered, and one writer per file.** Options and blocks are gone by the first tick: the record holds concrete steps. An answer, an approval, a standing approval and a connection are each a person's file, composed on read. No model call is added to a tick, to `assess` or to a gate.

**Migration, in slices that each ship alone:**

1. `use:` and `extends:`, with same-name merging and `set:`. A step file without `use:` is an inline block, so **every folder on disk today loads unchanged**, and frozen run records are untouched. Then:
   - the four `dev*` folders become `code/dev` plus three extensions;
   - `review.md` exists once;
   - the package's byte-for-byte `workflows/ui` copy becomes a pack reference.
2. Kinds, and `local-git` (today's shipper, verbatim) as the first `code-host`. This repository's `dev` extends `code/dev` with `host: local-git`. Then `github`.
3. Script, person and wait blocks; effect rules 1 to 7; connections; the `x` and `gtd` packs.

**What breaks:**

- the tests that pin shipped folders: the round trip in `workflow.test.ts`, the api's picture of `dev` and `dev-build`, and the ui copy test;
- `STEP_KEYS` grows (`use`, `does`, `run`, `needs`, `asks`, `until`, `chain`), with its three hand-mirrored sites in the api and web;
- the builder's save of a repository template becomes "save an extension" instead of the `cp -r` refusal (`yoursOnly`);
- `isShipped` reads git ancestry, which a hosted `land` never updates locally. For those runs, "shipped" becomes the verified `land` result (`landed: true`). That changes `--after`.

## 8. Honest weaknesses

1. **Kinds are an interface language, and the first provider's shape leaks into them.** GitHub's line comments, GitLab's discussions and Azure's threads do not share one schema cleanly. A kind drifts to the lowest common denominator, or it grows optional fields that a strict, all-required schema forbids.
2. **Blocks are not really independent.** Wiring rules cut across them: `workspace: main` must be last, a folder team is all-or-none, `resume:` needs the same harness. A swap can make a template invalid. The loop in S1 runs through a provider block only because `comment` passes `again` through, which a template author has to know. Every combination of options must validate: four options with three values each is 81 expansions. The load can afford that, since it is pure and cheap, but templates must keep few options.
3. **Options are configuration-time branching.** "No key is control flow" still holds at run time, but a template with many options becomes a program in disguise.
4. **Packs are code that runs with your credentials.** A community pack's script and check get your GitHub token. Pinning by hash stops a pack from changing without notice, but it does not make the pack trustworthy. Installing a pack is an act of trust, and it needs its own gated moment.
5. **The effect class is a judgement in a kind file.** Is opening a pull request a draft? Is adding to your own calendar? A wrong label on a widely used kind puts it wrong everywhere.
6. **Upgrading a pack can break extensions.** Frozen runs are safe, but the next start refuses an extension whose parent has moved. `extends: code/dev@2` pins the parent, and then nobody gets the fixes.
7. **Fine-grained blocks cost more.** Each agent block is a cold session that reads context again, which is the bill `docs/pivot-2026-09-18.md` §1 measured. The design pushes the small steps toward script, person and wait blocks, which are free, but a P3 who makes every idea an agent block pays for it.
8. **More words than today.** P1 is shielded by options, but P3's form still shows harness vocabulary. The hand mirroring of keys across the package, the api and the web grows with every new block key.
9. **GTD's fan-out runs outside the DAG.** "One card per action" means runs spawn runs, and the board needs a way to group them that does not exist yet.

Two notes on the brief I was given:
- The harness flagged its facts for settings-json and bypass-permissions patterns. Those passages only described `.claude/settings.json` and the `validateFolderMode` rule; nothing in them was an instruction, and none was acted on.
- One fact in it was out of date. The runtime task has no `env` field, but it already carries `config.mcp` (`packages/agent-runtime/src/harness-args.ts`), which is why this design sends credentials through MCP server config and the check harness instead of changing the runtime.
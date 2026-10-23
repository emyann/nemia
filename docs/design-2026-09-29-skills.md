# Design, 2026-09-29: skills in levels, generic default agents

> **Status (2026-10-23): superseded.** The clean start (`62132eb3a`, 2026-09-29) took out the shipped agents and skills this note
> builds its levels on; `2708171de` (2026-10-21) turned off every skill a run can see but the step's own; and skills by level, as the
> levels are today, is an inbox card of its own. Read this note for its reasoning, not as a plan.

A design note for the owner to approve. It builds on `docs/design-2026-09-25-agents-and-skills.md` (the 09-25 note) and on the
composable-workflows evaluation (`docs/eval-2026-09-25-composable-workflows/REPORT.md`). It argues from the code at `48a74cc3` and changes
none. Claude Code's own rules are quoted from its documentation (code.claude.com/docs/en/skills, read 2026-09-29), not measured on the
2.1.282 of the spike. Where a card relies on one of them, it measures it first.

The owner approved the plan for this note with one change: **extending an agent is left open**. Section 3 sets out the three ways and
their trade-offs, and recommends none. Nothing else in this note depends on that choice.

## What a person gets

A **Skills** page on the board, beside Agents. It lists every skill the workspace can reach, grouped by level: **user**, **workspace**
(the repository), **harness** (what Claude Code provides or reads) and **default** (what Nemia ships). For each skill it shows where it
comes from, its version, which agents name it, and whether a job ever sees it. When two levels have the same name, the page shows both and
says which one wins.

The shipped agents describe a role in any repository ("you have been asked to implement this"). About one skill per role, seven in all,
replace today's fourteen. Nemia, building itself, takes its own procedures (how this repository implements, reviews, looks at the board and
writes Effect) from its harness level, `.claude/skills/`, and from its `CLAUDE.md` files, not from the defaults it ships.

## Where things stand (measured at `48a74cc3`)

- **Fourteen shipped skills** in `workflows/skills/`, each one `SKILL.md` of 9–33 lines, with bodies of 213–2,655 characters. Six are
  copied into `packages/agent-orchestrator/workflows/skills/` for the package's `ui` folder. `ui-workflow.test.ts` holds them byte for
  byte, together with the three agents that name them. Three are preloaded (`PRELOADED` in `shipped-skills.test.ts`):
  `ask-when-it-reads-two-ways`, `trial-merge-a-branch` and `say-why-it-aborted`.
- **The repository's `.claude/skills/`** holds `effect` (7,251 characters), `look` (6,653) and the vendored `shadcn` (19,527 plus its
  folders, pinned in `skills-lock.json`).
- **Claude Code's user level, `~/.claude/skills/`,** holds two skills and the `synced/` folder of claude.ai (where `skill-creator` is).
  The store's library, `~/.agent-workflows/workflows/skills/`, does not exist yet on the owner's machine.
- **How a name an agent gives is found** is `lookupRoots` (`packages/agent-orchestrator/src/workflow-store.ts`). It checks the workflow
  folder's own root first, then the repository's `.claude/`, then the store's `workflows/`, and the first that has the name wins.
  `sameRepository` refuses a name that a repository has in both its `workflows/` and its `.claude/`. `writeAgentFiles`
  (`src/agents/agents.store.ts`) copies each named skill into the step's plugin, `runs/<id>/agents/<step>/hkb-<agent>/skills/`, at
  `wf start`. The session then sees it as `hkb-<agent>:<name>`.
- **What a job sees besides its plugin.** Every job runs with `--setting-sources project,local`
  (`agent-runtime/src/harness/claude/code.ts`). It lists the repository's `.claude/skills` and reads its `CLAUDE.md` files, whether an agent
  names them or not (F24: 19 skills in the init line). It reads nothing of `~/.claude/` except auto memory (F24).

Five things make it messy:

1. **The defaults are not generic.** Five of the fourteen name this repository: `npm run e2e`, `apps/web/test/e2e/pages/`,
   `.claude/skills/look`, `.claude/skills/effect`, and the `browser_*` tools of this checkout's `.mcp.json`. The planner, reviewer and
   ui-reviewer bodies list this repository's commands (`npx turbo run test --filter=<package>`, `node --test apps/web/test/e2e/run.ts`),
   and three agents deny `Bash(npm run build), Bash(npm run e2e)` by name.
2. **Every one of those sentences is already said at the harness level.**
   - `look` covers `WF_ARTIFACTS`, `npm run e2e`, `apps/web/test/e2e/pages/` and the `browser_*` tools (its lines 18–63).
   - `apps/web/CLAUDE.md` covers the e2e (line 9) and the page file (line 25).
   - The root `CLAUDE.md` covers the e2e (line 23) and names the `effect` skill.
   - So the defaults repeat this repository at a second level.
3. **Small deltas and one-rule skills.**
   - `implement-a-web-change` is `implement-a-change`'s first paragraph, word for word, plus one sentence, the page-file rule of
     `apps/web/CLAUDE.md:25`.
   - `review-a-web-change` is `review-a-change` with "or the page and the theme" added. It also lacks the `again` rule, although ui's
     review loops (`workflows/ui/review.schema.json` requires `again`). Its step learns that rule only from its brief's `## Round`.
   - Four skills are one rule each: `weigh-a-plan`, `ask-when-it-reads-two-ways`, `send-work-round-again` and `say-why-it-aborted`.
   - Three overlap on screenshots: `look-at-a-page`, `read-a-screenshot` and the repository's `look`.
4. **On Nemia's own checkout, "the repository" and "what Nemia ships" are one folder.** The api's `SHIPPED_SKILLS` is
   `HOME_REPO/workflows/skills` (`apps/api/src/agents/skills.ts`). That is also this repository's `workflows/skills`, so the board cannot
   tell Nemia's defaults from Nemia's own procedures.
5. **The order is by folder, not by level.**
   - A shipped folder run on another repository by its path finds its own root, the shipped `workflows/`, first. That repository cannot
     replace a shipped skill.
   - Nothing looks for the defaults otherwise: `wf start --workflows dev` means `<repo>/workflows/dev` (`src/cli.ts`). Another repository
     reaches a shipped skill only by running a shipped folder by its path, or by copying the skill into its library (`copySkill`).

The 09-25 note also justified "the repository wins" with "as Claude Code's project level beats its user level". Claude Code's rule is the
opposite. Its table *Resolve skills that share a name* says personal beats project, and enterprise beats both. It also says a plugin skill
and a skill anywhere else both load, because plugin skills are namespaced (F4 measured that part). The 09-25 decision can stand, but on its
own ground (section 1), not Claude Code's.

## 1. The levels and their order

| level | on disk | who writes it | what a job reads of it |
|---|---|---|---|
| **workspace** | `<repo>/workflows/skills/` | the repository's people, in git | a skill an agent names, copied into the step's plugin at `wf start` |
| **harness** | `<repo>/.claude/skills/`; nested `<subdir>/.claude/skills/`; Claude Code's bundled skills | the repository, in git; bundled ones by Claude Code | every one is listed to every job by Claude Code, named or not (F24). Nested ones load once the session touches that folder. A skill an agent names is also copied into its plugin today |
| **user** | Nemia's library `~/.agent-workflows/workflows/skills/`; Claude Code's `~/.claude/skills/` | the person, on the board or by hand | the library: a skill an agent names, as above. `~/.claude/skills`: nothing (`--setting-sources project,local`) |
| **default** | what Nemia ships: `workflows/skills/` of Nemia's checkout (`SHIPPED_SKILLS`); `packages/agent-orchestrator/workflows/skills/` for the package's `ui` | Nemia | a skill an agent names, as above |

**The rule: the nearest to the work wins, and the user level is near only to the person's own workflows.** For a name an agent gives,
the first level that has the name gives it, in this order:

- **a run of a repository's folder or a shipped folder**: workspace, harness, default, user. A library skill fills only a name that no
  repository and no default has; it never replaces a default.
- **a run of a store workflow** (the person's library, `~/.agent-workflows/workflows/`): workspace, harness, user, default. The library
  is that workflow's own place, as it is today.

A name that one repository has at both the workspace and the harness level stays refused (`sameRepository`), because a person reading
either folder would take the one before them for the one that runs. `~/.claude/skills` is never resolved by name: no job reads it.

Why the nearest to the work wins, and not the person's own as in Claude Code:

- A run is a job, and a job should not depend on whose machine it runs on. That was 09-25 decision 1, and the reason jobs read no user
  settings. So the library does not come before the defaults in a shipped or repository folder's run. The board's *Copy into your
  library* (`copySkill`) keeps the shipped name: were the library above the defaults, one person's copy would shadow the default in every
  run of every shipped folder on that machine, Nemia's own dev runs included, and a copy taken before section 4's merges (a
  `review-a-change` with no `again` rule, say) would silently undo them there. Today a shipped folder's own root comes first, and this
  order keeps that.
- The people of a repository decide how work is done there, and anyone who clones it gets the same run.
- The owner's library is where a person without a repository keeps their own agents. For them the user level is the nearest level there
  is, and an edited copy of a default serves their own workflows, which is what the copy was for.

**What changes against the code:**

- `lookupRoots` orders by level, not by "the folder's own root first". `Places` gains the default root, which the caller gives: the api
  passes `HOME_REPO/workflows`, and `wf` passes the same resolved from its own checkout. A folder is placed by where it is. On Nemia's
  checkout, `workflows/` is placed at the default level, so Nemia has no workspace level of its own. Its procedures live at the harness
  level, which is what section 4 wants.
- **The repository's `workflows/` joins the roots.** Today `places.repo` adds only `<repo>/.claude` (`workflow-store.ts`,
  `lookupRoots`); `<repo>/workflows` is read only when it is the running workflow's own root, that is, for a folder of that repository.
  `lookupRoots` adds `<repo>/workflows` at the workspace level for `places.repo`, beside `<repo>/.claude` at the harness level, unless it
  is the default root (Nemia's own checkout). Without this, a shipped `dev` run on repository X would never find `X/workflows/skills/`.
- **A shipped folder run on another repository** finds that repository's skills, in either of its two places, before the shipped ones.
  That repository can replace a shipped skill by name.
- **A store workflow run on a repository** finds that repository's agents and skills before the store's own. Today it finds its own first,
  and the 09-25 note said so. This is a behaviour a person would notice, so it is put to the owner (question 2).
- **A folder run with no repository** has two levels, user and default, as today.

**Whether a job may see user-level skills. Recommended: no, as today.** A job keeps `--setting-sources project,local`. The page shows
`~/.claude/skills` as *not read by a job*, with *Copy into your library* beside each row. That is `copySkill`'s write, from another
folder. Reading user skills in a job would cost a fenced step these things:

- **The listing's budget.** F9 measured 26 skills and 13,786 characters against 8,000, with descriptions cut. The budget is now "1% of the
  model's context window", and Claude Code drops descriptions "starting with the skills you invoke least". An agent's own skills would
  compete with a person's again.
- **Everything else of the user's settings.** A setting source is all or nothing, so the user's allow rules, hooks, plugins, default
  mode, model and effort would come with the skills (F24). A fenced `dontAsk` step would run under rules nobody sees on the board.
- **`allowed-tools`.** Claude Code applies a skill's `allowed-tools` "whenever you or Claude invoke the skill, including in a `-p` run",
  and "workspace trust doesn't gate this field". The grant lasts "during the turn that invokes the skill". A job's whole run is one turn,
  so a user skill with `allowed-tools: Bash(x *)` would let a `dontAsk` step run `x` with no allow rule. Only deny and ask rules override
  it.

**The last cost is here already, without user skills.** The harness level is listed to every job, and this repository's `shadcn` says
`allowed-tools: Bash(npx shadcn@latest *), …`. So a fenced reviewer that invoked `shadcn` could run `npx shadcn@latest add …`, which
writes into the workspace. That is read from the docs and not measured. The same holds for any library skill an agent names, since it is
copied into the plugin with its frontmatter. Card 0 probes it. If the probe shows the grant:

- The load refuses a skill named by a `dontAsk` agent whose `allowed-tools` reaches beyond the agent's `allowedTools`, naming both.
- This repository denies `Bash(npx shadcn*)` to its read-only steps.

## 2. The Skills page

A new top-level route, `/skills`, beside Agents. The picker (`/agents/skills/...`, e2e pages `320-skills` and `330-write-skill`) stays
where it is, for composing an agent. The page answers "what can this workspace reach, and which one runs".

Each row shows:

- **name and level**, with the folder it is in. A harness row says whether it is at the root, nested (`apps/web/.claude/skills`), or
  bundled.
- **version**: `skillVersion`, the digest of the folder that an agent's version also counts. A vendored skill also shows its pin
  (`skills-lock.json`: source and `computedHash`).
- **the agents that name it**, from every place: yours, the repository's and the shipped ones, each as its own start finds the name. That is
  `skillUsers`, which the detail page has already.
- **how a job gets it**:
  - *named*: an agent gives it, and it is copied into that step's plugin.
  - *listed*: the harness level, which every job is offered by description.
  - *not read*: `~/.claude/skills`.
  - For a *named* skill, the row also shows the preload flag and what it costs a turn, as the picker shows them.
- **a clash, shown as one**. A name at two levels is two rows. The nearer says *given*, and the farther says *shadowed by <level>*, with
  its folder. A name at both of one repository's places shows the refusal the load gives. A harness skill that an agent also names shows
  *the session sees both* (`effect` and `hkb-<agent>:effect`) for a person's own session; a step's job is listed the agent's copy alone
  (card 4).
- **a library copy of a default's name**, marked for what it does under section 1's order: *shadows the default for your own workflows;
  not read by a shipped or repository folder's run*. Where the default has changed since the copy (the versions differ), the row says so.
- **a copy of a skill Nemia no longer ships**, for a library copy whose shipped original went in section 4's merge.

**What `GET /api/skills` misses today.** `listSkills` (`apps/api/src/agents/skills.ts`) answers three places, `yours`, `repo` and
`shipped`, as the picker needs them. For this page it lacks:

- **the levels.** It has no harness or user level as such, no nested or bundled skills, and nothing of `~/.claude/skills`.
- **the repository's `workflows/skills/`.** `listSkills` lists only what an agent of yours finds, which is the library, then
  `.claude/skills`. `skillDirOf` reads both of the repository's places for the detail page.
- **the shadowed rows.** A name found twice is listed once, where it wins. A shipped name is marked only by `found`.
- **the agents of every place.** `usedBy` counts only yours.
- **a version per row.** Only the detail page has one.
- **the default level on Nemia's own checkout.** `sourceOf` answers `shipped` for this repository's `workflows/skills`, so the page cannot
  show Nemia's workspace and default levels apart. With section 1's rule that is the truth, but the page should say why.

**Recommended: a second answer, read-only, beside the picker's** (`GET /api/skills/levels`, say). It gives one list per level, each row
with `level`, `dir`, `version`, `shadowedBy`, `agents` (each with its place) and `reach` (`named` | `listed` | `not read`). The picker's
`from` and its shape stay, so `320-skills` and `330-write-skill` do not move. The Capabilities page's skills list (`skillsOf` in
`apps/api/src/capabilities/capabilities.ts`, the repository's `.claude/skills`) is the harness level's root. It stays as a count linking
to `/skills`, so one page says what a skill is.

**Bundled Claude Code skills** are not known to the api. The runtime records nothing of the init line's `skills`, and teaching it would put a
field on a finished runtime for a list. Recommended for v1: leave them out, with one row saying *Claude Code's bundled skills are listed to
every job and not shown here* (question 4).

## 3. Generic default agents, and extending one for a project (open)

**Generic.** A shipped agent says what its role does in any repository. Its body keeps the role and its limits: read-only, a job's turn is
its last, sign off `blocked` when it cannot finish. Its skill says the procedure. Neither names a command, a path or a skill of one
repository. Section 4 does that for the skills. For the bodies, it does this:

- The command lists leave the planner, reviewer and ui-reviewer. The fence is `dontAsk` plus the repository's `.claude/settings.json`,
  and prose is not a constraint. The body says that a command the repository's settings do not allow is denied, and that it must run
  nothing that writes into the workspace.
- **But today that prose closes a hole in the fence, and it may not leave first.** The comments in `reviewer.md` and `ui-reviewer.md` say
  so: this repository's settings allow `Bash(npx turbo run test:*)` and `Bash(node --test:*)`, which still reach `npx turbo run test
  build` and `node --test apps/web/test/e2e/run.ts`, and no deny closes an allow that runs any task or any file; "until then the brief
  keeps review from them". A generic "run nothing that writes" is weaker than naming the two commands. So card 12 waits for card 11b,
  which closes the hole at the harness level, where it is this repository's: narrow the two allows to the spellings the steps use (the
  exact `npx turbo run test --force --continue`, and `node --test` over the packages' test files, if card 0 finds a rule can say so), or,
  where they cannot be narrowed, write the two sentences into the root `CLAUDE.md`, which every job of this repository reads. Only then do
  the bodies drop them.
- `disallowedTools: Bash(npm run build), Bash(npm run e2e)` moves from the three agents onto the `plan` and `review` steps of the shipped
  folders. A key a step sets wins over its agent's. That makes the agents generic and leaves the shipped **folders** as specific as they
  are: every one's `check:` is this repository's `npm test && npm run typecheck && …` already. Folders a second repository can run as
  they are wait for the eval's question 5 (where product presets live, question 1 below); this note does not claim them.

**Extending one for a project** is left open by the owner. Here are the three ways, against the code, with what each costs. This note
recommends none.

| | (a) a project skill the agent names | (b) `extends:` | (c) the project's skills found by level |
|---|---|---|---|
| what it is | The repository's own `implementer.md` (a copy of the shipped one, which shadows it by name under section 1's order) names a skill of the repository's, `implement-here`. Or the shipped agent names it | A repository's `implementer.md` says `extends: implementer`. Its skills go after the base's, its body after the base's, and a key it sets replaces the base's | No agent changes. The repository's `.claude/skills` and `CLAUDE.md` reach every job, and the default skill says to use them |
| works today | the copy, yes, for a repository workflow (`lookupRoots` finds `<repo>/workflows/agents` first). A shipped agent naming it breaks every repository that lacks it: the load refuses a skill no place has | no | yes: `effect` and `look` reach Nemia's steps this way now |
| is it used | yes: a named skill gets used (F6) | yes, as (a) | only if the session picks it by its description in a listing with a budget. Prose is not a constraint, and nothing refuses a step that skipped it |
| what it costs | a fork. The copy's body and keys drift from each Nemia release, and nobody is told | a new key and its rules: resolution at a later level than its own file, a cycle and a missing base refused, the fence may only narrow (the eval's consent rule 3; a load refusal with a test that makes it refuse), `agentVersion` digesting the base. It touches `AGENT_KEYS`, the `ROLE_KEYS` of `apps/api`, `apps/web/src/lib/agents.ts`, `agentsFor`, `writeAgentFiles` and `renderedPrompt`, `listAgents` and the agent page. The argv pin is unchanged, since steps keep `agent: implementer` | nothing |
| what the board shows | the repository's agent as its own, *shadows Nemia's implementer*, with the difference | *extends Nemia's implementer*: the inherited skills and keys drawn as the base's, its own additions marked | the agent unchanged. `/skills` shows the harness skills as *listed to every job* |
| what it shares with the eval | nothing | the word `extends:`, which the eval gives teams (§4, §6 card 1). Two meanings of one key are a risk, or one mechanism if both are built alike | nothing |

What the owner has to weigh: whether a project's knowledge must be **certain to reach** a step ((a) and (b)) or may be **offered** to it
((c)). If certain, whether a fork is acceptable ((a)) or worth a mechanism to avoid ((b)).

One measurement would inform the choice, and it builds nothing. Run Nemia's implementer on a brief that touches `effect`, with the default
skill's generic pointer and without it, and count how often the session loads `effect`. That tells how far (c) holds alone.

**What does not depend on the choice.** Section 4 keeps today's mechanism for Nemia's own procedures: the repository's `.claude/skills`
and `CLAUDE.md`, reached by every job, and a sentence in the default skill that tells the session to use them. That is how `effect` and
`look` reach the steps today; section 4 only words it generically. The ui agents stay agents of their own and do not become `extends:` of
implementer and reviewer. Whichever way the owner picks later replaces that sentence, and nothing else here.

## 4. Dogfooding: fourteen skills to seven

| today (body, characters) | becomes | where its repository-specific sentences go |
|---|---|---|
| `plan-a-change` (696) | **default `plan-a-change`**, with `ask-when-it-reads-two-ways` folded in, preloaded | none |
| `ask-when-it-reads-two-ways` (725, preloaded) | folded into `plan-a-change` | none |
| `implement-a-change` (873) | **default `implement-a-change`**, with `weigh-a-plan` and `implement-a-web-change` folded in | its e2e paragraph goes to `apps/web/CLAUDE.md:9` and `look`; its effect paragraph goes to the `effect` skill and the root `CLAUDE.md`. All of them are already there. What stays is one generic sentence: *where the repository has a skill for what the change touches, load it and follow it* |
| `weigh-a-plan` (213) | folded into `implement-a-change` | none |
| `implement-a-web-change` (391) | folded into `implement-a-change` | the page-file sentence goes to `apps/web/CLAUDE.md:25`, which already says it |
| `review-a-change` (674) | **default `review-a-change`**, with `send-work-round-again` folded in, and findings "by file and line, or page and theme" | its effect paragraph is covered by the generic sentence above |
| `send-work-round-again` (556) | folded into `review-a-change` | none |
| `review-a-web-change` (470) | folded into `review-a-change` | none |
| `trial-merge-a-branch` (2,655, preloaded) | **default `trial-merge-a-branch`**, with `say-why-it-aborted` folded in, preloaded | none |
| `say-why-it-aborted` (282, preloaded) | folded into `trial-merge-a-branch` | none |
| `look-at-a-page` (1,479) | **default `look-at-a-page`**, with `read-a-screenshot`'s checklist folded in (layout, both themes, what a person notices first), one part for the step that made the change and one for the step that reviews it | `npm run e2e`, `WF_ARTIFACTS`, the `browser_*` tools and the pointer to `.claude/skills/look` go to `look`, which already says them. What stays is generic: *photograph every page you changed in each theme the app has, the repository's way (its skill for looking, if it has one), and read the pictures* |
| `read-a-screenshot` (1,301) | folded into `look-at-a-page` | its `.claude/skills/look` pointer goes to `look` |
| `write-a-note` (244) | **default**, unchanged | none |
| `review-a-note` (354) | **default**, unchanged | none |

**Seven defaults for eight agents.** Each of planner, implementer, reviewer, shipper, note-writer and note-reviewer names one skill.
ui-implementer names `implement-a-change` and `look-at-a-page`, and ui-reviewer names `review-a-change` and `look-at-a-page`. The package's
mirror drops from six skills to four: `implement-a-change`, `review-a-change`, `look-at-a-page` and `trial-merge-a-branch`.

**The web deltas: fold them, rather than keep them as the ui agents' own.** Two ways were open without an extension:

- *Keep* `implement-a-web-change` and `review-a-web-change` for the ui agents until the extension is decided. That gives nine defaults.
- *Fold* their few lines into the general skills. That gives seven.

Folding is recommended, for four reasons:

- `implement-a-web-change` is the general skill's first paragraph, verbatim, plus one sentence that is this repository's path and is
  already in `apps/web/CLAUDE.md`.
- `review-a-web-change` differs by five words, which fit in the general skill ("or the page and the theme").
- Kept apart, they have already drifted. The web implementer lacks the e2e paragraph (look-at-a-page carries it), and the web reviewer
  lacks the `again` rule its loop reads. Folding gives the ui reviewer that rule.
- Folding decides nothing about extension. A web layer can be added back by whichever way the owner picks, and until then there is one text
  per role to keep right.

**What a preload becomes.** A rule that was preloaded keeps arriving whole in the system prompt.

- The merged `plan-a-change` is preloaded: about 1,420 characters, some 355 tokens a turn, cached (F14). The planner's body then says
  "given you whole" for it, as `reachProblems` requires.
- `trial-merge-a-branch` stays preloaded.
- `PRELOADED` becomes `plan-a-change` and `trial-merge-a-branch`.

The implementer and reviewer merges turn a rule that was loaded "before you sign off" into part of a skill loaded at the start. Nothing in
the suite measures whether that changes the behaviour, so section 5's live run checks it.

**Nemia's own procedures** come from the harness level and the `CLAUDE.md` files, reached by every job with no agent change: `effect`,
`look` and `shadcn` in `.claude/skills/`, and the checks in `CLAUDE.md`. Nothing new has to be written there for the merge. Card 11 checks
that every sentence leaving a default has a home, and writes the ones that do not. A procedure Nemia would want as a skill of its own
("how this repository implements") waits for the extension decision. It would live in `.claude/skills/`, and an agent file for it would
live in `.claude/agents/`. Claude Code also offers such a file to an interactive session as a subagent, which is worth measuring before
anything is built on it.

## 5. How the skills are written and measured

**The format is Agent Skills.** A skill is a folder with a `SKILL.md` whose frontmatter has `name` and `description`, and whose body is
the procedure. Scripts and references sit beside it where the skill needs them; they are copied into the step's plugin and move its
version (`skillVersion` digests the folder). Nemia's own keys (`title`, `tags`, `examples`, `preload`) stay. Claude Code ignores them
(F7). Claude Code's docs say that claude.ai uploads and the Skills API accept only `name`, `description`, `license`, `compatibility`,
`metadata` and `allowed-tools`. A shipped skill that should also work there would need Nemia's keys under `metadata`, and that is left
for later. The git skill of the git-out design (card `design-git-out-of-the-packag-37di`, whose document is not in the tree yet) is the
first shipped skill with a script beside it.

**The method is skill-creator's.** It is the `skill-creator` plugin: capture the intent, draft `SKILL.md`, write test prompts in
`evals/evals.json` (this repository's precedent is `.claude/skills/shadcn/evals/evals.json`), run each prompt with the skill and without
it, grade against written expectations, iterate, then tune the description for triggering. Tuning the description matters for a skill
found by its description, the harness level. It barely matters for a default an agent names (F6). `skill-creator` is a user-level plugin,
so a job cannot use it. A person writes a skill in an interactive session, and a run's step does not.

**A default's measure is the step that uses it.** A merge is kept only if all of these hold:

- **What a step is told still says the pinned sentences.** `toldIn` (`test/told.ts`) in `ui-workflow.test.ts` and
  `planned-workflow.test.ts`, and `mcp-config.test.ts`'s *told it has the browser*. `toldIn` reads the step's skills with `skillsFor(dir)`
  and no places, so it never reads `.claude/skills`. A sentence that moves to the harness level needs its pin to move too: onto the
  repository's `look`, read where it is, with the generic default pinned for its own sentence.
- **The shipped agents still reach their skills.** `shipped-skills.test.ts`: its count (20 today, fourteen plus six; eleven after: seven
  plus four), `PRELOADED` and `reachProblems`. `ui-workflow.test.ts`'s `unreachableSkills` guard reads "the <name> skill" in what a step
  is told, and the `.claude/skills/<name>/SKILL.md` paths. Once the default stops naming `look`, the guard has nothing to check there.
  It then checks that a step told to load a skill by name has the `Skill` tool.
- **The rewording is declared.** `agents-before-after.test.ts`: every step whose body moved is named in `BODIES_REWORDED`, and its diff is
  read.
- **The argv is re-recorded.** `fixtures/argv-shipped.json` with `ARGV_RECORD=1`, and its diff read line by line. The plugin path does
  not move, since agents keep their names. The prompt file's text does.
- **The behaviour holds live, before and after.** Run each chain on a fixed brief, as F25 did, capped at $10 for the whole comparison:
  - the planner signs off `blocked` on a brief that reads two ways;
  - the reviewer's `again` is set on a finding worth a round;
  - the implementer loads `effect` on a change that imports it;
  - the shipper writes its message and aborts on a conflict.

## 6. Migration, in small cards

Each card ships alone, says what it touches and its proof, and says what a run in flight meets. What such a run meets is always one of
these:

- `writeAgentFiles` froze each rendered step's plugin and prompt at `wf start`, so a started run keeps the skills it was given.
- A resumed session keeps its prompt (F13).
- Only a step whose rendered folder was removed reads its skills again by name (`skillsAgain`, `tick.ts`). A name a card deleted then reads
  *Not told: … Sign off blocked if you need it.*
- A card that deletes a skill checks `wf ls` for runs of the folders that name it before it lands.

| # | card | proof | a run in flight |
|---|---|---|---|
| 0 | **Probe** on Claude Code, before cards 3–4 rely on the docs: a skill's `allowed-tools` in a `-p` `dontAsk` job; how a nested `.claude/skills` loads in a worktree; a plugin skill and a project skill of one name; whether a `Bash` allow rule can name a path glob after `node --test` (card 11b) | a spike section, F26 on | untouched |
| 1 | **The api by level**, read-only: `GET /api/skills/levels` (section 2), `~/.claude/skills` read for display | api tests; a fixture whose clash is shown as one | untouched |
| 2 | **The `/skills` page**, and Capabilities' list becomes a count and a link | an e2e page file, `390-skills-levels`, with a clash in the seed; the pictures read | untouched |
| 3 | **Lookup by level**: `Places` gains the default root; `lookupRoots` adds `<repo>/workflows` for `places.repo` and orders by level, with default before user except for a store workflow (section 1) | fixtures that break the order, each with a test that fails without the rule: a shipped `dev` run on a fixture repository finds its `workflows/skills/<name>` over the default, and its `.claude/skills/<name>` over the default; a library copy of a shipped name does **not** shadow the default in a shipped folder's run, and does in a store workflow's; a name in both of the repository's places is still refused (`sameRepository`) | untouched: its steps and skills were frozen at start |
| 4 | **A named skill's bare copy hidden**: every skill an agent names is still copied into its plugin at `wf start`, and `--settings` turns the name `off` in `skillOverrides`, which spares a plugin's skills, so the session sees `nemia-<agent>:<name>` once (reworked at its gate: the freeze stays) | argv pin; a live init line and skill listing before and after | its next filed step gets the override; its frozen copies are unchanged |
| 5 | **The `allowed-tools` refusal**, if card 0 shows the grant | a test that makes the load refuse at shipped defaults | untouched |
| 6 | **Planner**: `plan-a-change` absorbs `ask-when-it-reads-two-ways`, preloaded | `planned-workflow.test.ts` sentences, `PRELOADED`, `BODIES_REWORDED`, argv re-recorded, the live check | a planner not yet rendered anew reads *not told* for the deleted name |
| 7 | **Implementer**: `implement-a-change` absorbs `weigh-a-plan`; the effect and e2e paragraphs become the generic sentence | as 6 | as 6 |
| 8 | **Reviewer**: `review-a-change` absorbs `send-work-round-again` | as 6 | as 6 |
| 9 | **Shipper**: `trial-merge-a-branch` absorbs `say-why-it-aborted` | as 6, and the ship's sentences in `ui-workflow.test.ts` | as 6; a ship waiting at its gate was rendered at start |
| 10 | **The screenshot trio and the web deltas**: `look-at-a-page` absorbs `read-a-screenshot`; `implement-a-web-change` and `review-a-web-change` fold into the general skills; ui-implementer and ui-reviewer name the general skills and `look-at-a-page`. The package's mirror and `ui-workflow.test.ts`'s list of its skill folders change in the same commit, as does `mcp-config.test.ts`'s pin | the copy test byte for byte; `toldIn` pins moved to `look` where their sentence moved | as 6 |
| 11 | **Every sentence has a home**: each repository sentence that left a default skill or an agent's body is found in `.claude/skills` or a `CLAUDE.md`, and one that is not is written there | a list in the card, each sentence and its new line | untouched |
| 11b | **Close the fence at the harness level** (section 3): narrow `.claude/settings.json`'s `Bash(npx turbo run test:*)` and `Bash(node --test:*)` so no allow reaches a build or the e2e, or, where a rule cannot, write the two sentences into the root `CLAUDE.md` | a test over `.claude/settings.json` that refuses an allow reaching `npx turbo run test build` or `node --test apps/web/test/e2e/run.ts`, shown failing on today's file; a live `dontAsk` reviewer denied both | untouched |
| 12 | **Generic bodies**, after 11b: command lists out of the planner, reviewer and ui-reviewer bodies, and the `npm` denies onto the shipped folders' `plan` and `review` steps | `ui-workflow.test.ts`'s *every shipped Claude reviewer is denied* still holds, read off the resolved steps; `BODIES_REWORDED` | untouched |

Cards 6–10 each re-record the argv pin and read the diff. Cards 1–2 can ship before 3. Card 4 waits for card 0; card 12 for 11b.

## 7. Open questions for the owner

1. **Where the default level lives.** *Recommended:* keep it in the repository's `workflows/` for now, as the api already calls it,
   placed at the default level by path (section 1). Moving the shipped folders into the package is the eval's question 5 ("where do
   product presets live"). It touches every test that resolves `../../../workflows`, and fits the GitHub move better than this note.
2. **Should a store workflow lose "its own agents and skills first"?** *Recommended:* yes. The nearest level to the work wins everywhere,
   so a run on a repository behaves the same whichever folder started it. The cost: a person's library team, run on a repository that has
   an agent or skill of the same name, gets the repository's, and the Skills page shows it. The library still comes before the defaults
   for a store workflow, and after them for every other run (section 1).
3. **Extending an agent (section 3).** Which of (a), (b) and (c), after the measurement that section proposes.
4. **Claude Code's bundled skills on the page.** *Recommended:* one row saying they exist and are not listed, until the runtime reads the
   init line for another reason.

# Design, 2026-09-25: agents and skills in Claude Code's own format

A design note, approved by the owner on 2026-09-25. It rests on the owner's decisions of 2026-09-25 and on the measurements
in `docs/spike-2026-09-25-agents-skills.md` (F1–F20, Claude Code 2.1.282).

## What a person gets

A new user opens **Agents**, creates a first agent (a name, a description, what it is for), **composes skills** from a list (their own,
the repository's, the ones HKB ships) or **writes a new one**, tries the agent on a short brief, and puts it in a team. The same agent
file also works in Claude Code on its own: dropped into `.claude/agents/`, it is a subagent.

## Decided (owner, 2026-09-25)

1. An HKB agent file is a **strict superset of Claude Code's subagent file**, converted at spawn per harness.
2. The agent's body is **appended** to the harness's system prompt (Claude Code's default is kept); the agent may choose otherwise
   (below), coding agents never do.
3. **Skills are Claude Code skills** (`SKILL.md` folders). The agent's **A2A card lists skills generated from the ones composed on it**,
   never a hand-written list.
4. Agents and skills live in **the HKB store** (a library at user level, for people with no repository) **and in a repository**; the
   repository wins on a name clash.

## The agent file

Claude Code's subagent frontmatter, plus HKB's keys. A key Claude Code does not know is ignored by it (F7 shows the same for skills).

| key | Claude Code's | HKB reads it as |
|---|---|---|
| `name`, `description` | yes | the agent's name; the card's description |
| `tools`, `disallowedTools`, `model`, `effort`, `permissionMode` | yes | as today (`--tools`, `--disallowedTools`, `--model`, `--effort`, `--permission-mode`) |
| `skills` | yes (preload) | **the skills composed on the agent**: a list of skill names (today: a path to a `*.skills.json` of card entries; see Migration) |
| `allowedTools` | no (a settings/CLI rule) | as today (`--allowedTools`) |
| `harness`, `context`, `output`, `sandbox`, `remote` | no | as today |
| `systemPrompt` | no | new: `default` (append, the default), `no-coding`, `own` (below) |

`tools` must include `Skill` when `skills` is not empty: a list that leaves it out cannot use its skills (F11), so the load refuses
it, with the fix in the message.

## At spawn, for Claude Code

Nothing changes but two flags; the runtime's other flags and `--resume` behave the same (F12, F13). They travel on the engine's task as
`config.claude`, Claude Code's own flags keyed in camelCase (`{ appendSystemPromptFile, pluginDir, settings }`), which the runtime
hands over directly before `--permission-mode` and reads nothing of; a flag the runtime gives itself is refused there, and so is the
bag on a harness that is not Claude Code. What the step is given is rendered at `wf start` into `runs/<id>/agents/<step>/`, outside
every worktree and outside `~/.claude/`, and frozen with the run.

- The body → `--append-system-prompt-file <file>` (F1). Today it is a paragraph of the brief, a user message.
- The composed skills → one plugin directory HKB writes for the step, `hkb-<agent>/skills/<name>/SKILL.md`, passed as `--plugin-dir`
  (F4, F5: no manifest; the directory's name is the skills' namespace; usable under `-p` in `dontAsk` with no allow rule).
- Preloading: the agent's `skills:` preload does not work on the main thread (F8). A skill the agent must always have is either
  **named in its body** (the session invokes it; F6) or **appended after the body** (costs its text, every turn, cached; F14). Default:
  named, since the listing already tells the session what each skill is; `preload: true` on a skill's entry appends it instead.
- The fence is passed as flags, as today: `--permission-mode` and `--tools` win over or narrow the agent's own (F10, F11).

### `systemPrompt`: how much of Claude Code's prompt an agent keeps

| value | how | keeps | drops | for |
|---|---|---|---|---|
| `default` | the body appended | all of it (~6.5k tokens, cached) | nothing | every coding agent; the default |
| `no-coding` | an output style with `keep-coding-instructions: false` + the body appended (F17, F19) | the safety sections, memory, environment | `# Doing tasks` (~750 tokens) | an agent that does not code: a post writer, a GTD assistant |
| `own` | `--system-prompt-file` (F15) | nothing but the body (tools and the cwd's CLAUDE.md still load) | everything, the rules on careful action and injected instructions included | only when a person asks for it, said on the agent's page |

## Skills and the card

- A skill is a folder with a `SKILL.md` (Claude Code's format). Its frontmatter may carry `tags` and `examples` for the A2A card
  (F7): Claude Code ignores them.
- The card's `skills` are generated: one entry per composed skill (`id` = the folder name, `name`, `description`, `tags`, `examples`
  from its frontmatter). An agent with no skills gets one entry made from its own description.
- **Migration of the shipped agents.** Their `*.skills.json` files describe procedures that live in their bodies ("review a change",
  "send the work round again"). Each becomes a real `SKILL.md` holding that procedure, and the body keeps the role and its limits. The
  `.skills.json` files go.

## Where agents and skills live

| | agents | skills |
|---|---|---|
| store (user level) | `~/.agent-workflows/workflows/agents/` | `~/.agent-workflows/workflows/skills/` |
| repository | `workflows/agents/` (and `.claude/agents/`, read) | `workflows/skills/` (and `.claude/skills/`, read) |

The store's are beside the store's workflows, where its agents already were (`~/.agent-workflows` is `WF_ROOT`). A name is looked for
in the workflow folder's own root first (`workflows/`, beside the folder), then in the repository's `.claude/`, then in the store: for
a workflow of a repository, the repository's wins, as Claude Code's project level beats its user level. A store workflow's own root is
the store, so its agents and skills are the store's first. A skill found in both `workflows/skills/` and `.claude/skills/` of one
repository is refused, naming both: a session in that repository would be offered the project skill and HKB's copy of the other. The
rendering resolves the order before it writes the step's plugin directory, so the session sees one skill per name.

## Codex

Codex has no subagent format and no plugin directory. Its rendering keeps today's path (the body in the brief); its skills are left
out until Codex has a place for them, and the load says so for a codex agent that composes skills.

## Settled after the spike (owner, 2026-09-25), and one still open

1. **Should a job read the owner's user-level settings, plugins and skills?** Today every job sees all 26 of them, over the listing's
   8,000-character budget, so descriptions are cut and an agent's own skills compete with personal ones (F9). `--setting-sources
   project,local` removes them, and with them the user's default mode, allow rules and MCP servers. **Decided: jobs do not read user
   settings** (`--setting-sources project,local`): the runtime passes the mode, tools and rules explicitly, and a job should not depend
   on whose machine it runs on. Build card 4, after one live run of each shipped workflow is measured that way.
2. **Haiku and `auto`.** On haiku, `auto` silently becomes `default`, which under `-p` denies every call that needs approval (F20).
   **Decided: the load refuses**
   `permissionMode: auto` (explicit or the runtime's default) on a model that cannot run it, naming `acceptEdits` or `dontAsk` with
   rules as the fix; which models support `auto` is measured first. In build card 1.
3. **An edited agent and a resumed session (open).** A resumed session keeps the body it started with (F13). *Recommend:* keep that (a turn
   answers the session it continues); a person who edits an agent starts a fresh try (`--fresh`).

## Build cards, in order

1. **Render an agent for Claude Code**, cut in two by the plan of 2026-09-25:
   - **1a, the machinery**: `config.claude` in the runtime; `skills:` as names, `card:` for today's `.skills.json` (a legacy
     `skills: <x>.json` line is still read as `card:`, and `wf start` names it); `systemPrompt`; the `Skill` guard, the `auto` guard
     and the codex refusal at load; the store and repository lookup; `--append-system-prompt-file`, the per-step `--plugin-dir` and
     the `no-coding` output style, rendered at `wf start`. The shipped agents change one line each, `skills:` to `card:`.
   - **1b, the shipped agents**: their procedures moved into `SKILL.md` skills, their bodies cut to the role and its limits.
     Built 2026-09-25: fourteen skills in `workflows/skills/`, three preloaded, ui's six copied into the package; proven live as the
     spike's F24.
2. **The card from the skills**: the A2A card generated from composed skills; the `.skills.json` files retired.
3. **The board**: compose skills on an agent from a list, write a new skill, try an agent on a short brief.
4. **Jobs without user settings**, if open question 1 is decided that way.

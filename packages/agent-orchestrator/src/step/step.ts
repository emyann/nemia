/**
 * The step's shape: what a step file is once read (`Workflow`, `StepAgent`), the closed list of its keys (`STEP_KEYS`) with a line
 * of meaning each, the fields every closeout carries, and the pieces every reader of a markdown file shares: the refusal a wrong file is
 * thrown as (`WorkflowError`), its frontmatter split from its body (`splitFrontmatter`), and the names of the folders beside the steps.
 *
 * The bottom of the format: every other part of it imports this, and this imports none of them but a type.
 */
import { Invalid } from '../refusal/refusal.ts';
import type { HarnessPrompt } from '../agents/agents.ts';

export type Workflow = {
  /** The step's name — the file's, minus `.md`. What `after` refers to. */
  name: string;
  /** What must have SUCCEEDED before this may run. `[]` means it starts at once. */
  after: string[];
  /**
   * Continue that step's session instead of starting cold — the author coming back to answer,
   * with their own memory of why they did it that way.
   *
   * A structural key: like `after` it is a relationship between steps, not
   * control flow: there is still nothing here that branches, loops or evaluates a condition.
   * Implies `after`, since you cannot continue a session that has not run.
   */
  resume?: string;
  /**
   * `workspace: main`: the step runs in the repository's own checkout rather than a worktree of its own.
   *
   * A structural key, and with `place:` the only one about a directory: everything else about where a step works is the shape of
   * the workflow (`workspacePlan`). A run's work happens on branches in worktrees, which is what keeps two steps out of each other's
   * way — and merging one of those branches onto the base branch is the one thing a worktree cannot do, since the base branch is
   * checked out in the repository. So the step that ends a run works where a person would.
   *
   * Refused on a step with a `check:` — the run would execute it in a person's checkout, which is no verdict on the step's work — on one
   * with a `resume:`, whose session ran in another directory and was told none of what an ending needs, and on a step anything waits on,
   * or one that ends a workflow beside another: a run has one ending (`validate`).
   *
   */
  workspace?: 'main';
  /**
   * `place: folder`: the step works in a folder the run makes for it, and the run needs no git repository — a kind of workspace that is not
   * the git kind (`place` on the run record). `place: git`: on branches of a repository. A step file says one (`placeRequired`); only a
   * step frozen on a run record before the key has none, and reads as `git` (`stepPlace`). A team is of one kind: every step says
   * `place: folder`, or none does (`validate`). A step that continues another's session (`resume:`) works in that step's folder, as it
   * would in its worktree; any other step gets a folder of its own, empty, and what the steps before it made reaches it as their output and
   * their files. `workspace: folder` is its former spelling (`placeSpelled`).
   */
  place?: 'git' | 'folder';
  /**
   * `writable: [web]`: the folders of the run's factory this step may write, each by its directory's name. A run in a factory mounts its
   * other repositories read-only for every local step; this step alone is given the ones it names writable, and one that is the run's
   * own repository is its workspace already, and mounts nothing. It widens where the step's writes reach, never what it may do: refused
   * at load over a fence that writes nothing (`refuseUnwritable`) and on a remote agent, and at `nemia start` when a name is no folder
   * of the factory, or two share it (`writableRefusal`), and on a harness that cannot hold a writable mount.
   */
  writable?: string[];
  /**
   * `reads: inbox, costs`: what of the store this step reads and never writes, each by its name from a closed list (`STORE_READS`).
   * `inbox`, the cards waiting to be started, is filed as a read-only mount of the folder on this machine (`readsMounts`), so Read, Grep
   * and Glob reach it in any mode and every write is refused, and the brief names its path (`mountsLine`). `costs`, what the newest
   * finished runs of its workflow in its factory cost (`costsRead`), is said in the brief of each new session, and mounts nothing. A
   * name, never a path: the workflow reads the same on every machine, and no step reads another run's folders. Refused at load for a
   * name off the list, one given twice, and on a remote agent, and at `nemia start` on a harness that cannot hold the mount.
   */
  reads?: string[];
  /**
   * `slot: none`: a run of this workflow takes no run slot (`WF_MAX_RUNS`).
   *
   * The cap on runs in flight is a cap on the work in flight — N runs' steps at once, and a run with nothing filed waits for one of
   * them to finish. A session that WATCHES those runs is not one of them: it files nothing of anybody's work, and holding it behind
   * the cap would hold the thing that answers the runs the cap is holding. So a workflow of one step may say its run is not counted:
   * it is never in flight for the cap, and never waits for a slot. It takes a session slot like every session (`WF_MAX_CONCURRENT`),
   * and costs what it costs.
   *
   * Refused on a step of a workflow that has another (`validate`): a run outside the cap is one session, and the line on one step of a
   * workflow of work would put every step of it outside the cap.
   */
  slot?: 'none';
  /** Everything below the frontmatter: what the agent is told. */
  body: string;
  /**
   * The skills the step adds to its agent's (`skills:`), as its own line names them: never the agent's, which the session is given first
   * (`StepAgent.skills`). Only on a step with an agent.
   */
  skills?: string[];
  /**
   * The MCP servers the step adds to its agent's (`mcp:`), by the names the checkout's `.mcp.json` gives them, as its own line names
   * them: never the agent's, which the session loads first (`StepAgent.mcp`). Only on a step with an agent.
   */
  mcp?: string[];
  harness?: string;
  model?: string;
  /** How hard the harness should think, in its own words, which the runtime judges for the harness the step runs on at `nemia start`. */
  effort?: string;
  /**
   * The context window the step's sessions are given, in tokens — written `context: 200k` or `context: 150000`, read once into the
   * number. Past about it Claude Code compacts the conversation and carries on (`--autocompact`, the engine's `contextTokens`); absent,
   * a session runs on the model's whole window. The runtime refuses at `nemia start` a window outside the range the harness takes, and one
   * on a harness with no such knob: codex. A step that continues another's session (`resume:`) keeps that session's window
   * (`sessionContext`).
   */
  context?: number;
  /**
   * Claude Code's permission mode, `--permission-mode`, which the runtime judges for the harness the step runs on at `nemia start`. On
   * codex, whose fence is its sandbox, the line is the former name of `sandbox:`.
   */
  permissionMode?: string;
  /**
   * Codex's sandbox, `codex exec -s`, which the runtime judges at `nemia start` — `read-only`, `workspace-write`,
   * `danger-full-access`. Absent: Codex's `workspace-write`. Refused on claude and claude-detached, whose fence is `permissionMode`.
   *
   * On codex the key's former name, `permissionMode:`, is still read in a folder or an agent: a sandbox's word is read as `sandbox:`
   * (`codexSandboxNamed`, with `bypassPermissions` as `danger-full-access`), and `nemia start` names the line to rename (`codexModeLine`).
   * The engine's task calls it `permissionMode`: the tick hands it over under that name (`modeOf`), so a run record that holds a codex
   * step's sandbox as `permissionMode` is filed with it all the same.
   */
  sandbox?: string;
  /**
   * The only tools the session may have, in the harness's names — `tools: Read, Grep, Glob, Bash`. Absent: the
   * harness's own set. Claude Code is given exactly the list (`--tools`), which names its built-in tools; the
   * servers its agent and its own `mcp:` line name of the checkout's `.mcp.json` (`StepAgent.mcp`) are not on it. Refused on codex,
   * which has no tool list: its fence is the sandbox `sandbox:` names.
   */
  tools?: string[];
  /**
   * What the session may not have, in Claude Code's permission rules — `disallowedTools: Bash(npm run build), SendMessage`.
   * Absent: nothing denied beyond the checkout's settings. Claude Code is given the list as `--disallowedTools`, and a
   * deny beats an allow, so a step is kept from a command `.claude/settings.json` allows for another step's sake by
   * machinery, not by its brief. Refused on codex, which has no tool list: its fence is the sandbox `sandbox:` names.
   */
  disallowedTools?: string[];
  /**
   * What the session may do without being asked, in Claude Code's permission rules — `allowedTools: Edit(**)`.
   * Absent: only what `permissionMode` allows by itself. Claude Code is given the list as `--allowedTools`, and a
   * deny beats it, so `disallowedTools:` still holds.
   *
   * The key a fenced step in a fresh folder needs. `dontAsk` never asks a person who is not there — it denies, and the
   * session reads the refusal and carries on — but it never allows a write either, in the session's own directory or
   * anywhere (Claude Code 2.1.278). `allowedTools: Edit(**)` gives back the writes inside the directory the
   * session was started in and no others: the glob is resolved against its `cwd`, a write outside it is still denied
   * with no prompt, and unscoped (`Edit`) it would write anywhere on the machine.
   *
   * `Edit(…)` is the rule for every file-editing tool, Write and NotebookEdit with it: Claude Code matches a file
   * permission check against `Edit` rules alone, warns on stderr that a `Write(…)` rule is not matched, and denies
   * the write, saying so nowhere the run can read. So a path rule on a file-editing tool that is not `Edit` is refused
   * (`fileRuleRefusal`). Refused on codex too, which has no tool list: its fence is the sandbox.
   */
  allowedTools?: string[];
  /**
   * `denials: fail`: a try whose session the harness denied a call is not passed on. It signs off as ever, and the step reads `denied` —
   * nothing after it is filed, no check is run on work done without the tool, and it waits on a person — rather than going on with the
   * `denied: …` note beside its word. `retries:` never spends a try on it: `allowedTools:` is frozen on the run at `nemia start`, so a try
   * the run filed on its own would be denied the same call again. A person tries it again with `nemia retry` (a new session, told what it
   * was denied, to do without it), or adds the rule the offer names to the folder's `allowedTools:` and starts a new run. Absent: denials
   * are recorded and said, and decide nothing. Every denial counts, one the checkout's settings or the step's own `disallowedTools:` make
   * on purpose included. Refused where no denial is ever read, rather than accepted and never met: on codex, which records none, and beside
   * `background: true`, whose `claude --bg` session records none either (agent-runtime's open issue 28).
   */
  denials?: 'fail';
  /**
   * `remote: true`: every session of the step is bridged to claude.ai — Claude Code's `--remote-control`, filed as
   * `config.claude.remoteControl` — and listed in the web's agents view, where anyone signed in to the account can drive it from a browser
   * or a phone: type into it, answer its prompts, stop it. A deliberate setting, never a default, for that reason. `remote: false` is what
   * a step without the line is. Refused at `nemia start` on a harness the engine has no such flag for, and on `claude` without
   * `background: true`: only Claude Code's background sessions are bridged, and a job (`claude -p`) opens no bridge.
   */
  remote?: boolean;
  /**
   * `background: true`: every session of the step runs as a Claude Code background session, `claude --bg` — the engine's
   * `config.background` — which never ends on its own, is listed in `claude agents`, and can be attached to and bridged (`remote:`).
   * Without it a `claude` step runs as a job, `claude -p`: it runs its brief to its end and exits, waits on nobody in any permission
   * mode (a call it may not make is denied and recorded on its attempt), takes `nemia say` on its stdin until its result, and keeps a spend
   * cap (`budget:`). So the line is for a session that must outlive a brief — the supervisor — and nothing else. Refused on a harness
   * other than `claude`, which has no second way to run, beside `budget:`, which a background session does not keep, and over an agent
   * in any mode but the widest (`fenceRefusal`), since a background session also reads the person's own settings and their allow rules.
   * A step's key, not an agent's: it is how a step's session is run, not who does the work.
   */
  background?: boolean;
  deadlineSeconds?: number;
  /**
   * The most the step's tries may cost together, in dollars — `budget: 5`, `budget: 2.50`. Absent: no cap. The run reads what each
   * ended try cost off the engine, and once they have together cost it or more, files nothing more for the step on its own — no `retries:`
   * try, no round of a loop it is in — until a person raises it (`nemia retry --budget`, `nemia round --budget`). On `claude` and
   * `claude-detached`, whose sessions are `claude -p` jobs, what is left of it is handed to the engine as `config.budgetUsd` too — a
   * harness argument the runtime judges nothing of — and the harness ends a session once the tries together reach it (`budgetUsdFor`).
   * Refused on codex, which has none, and beside `background: true`, whose `claude --bg` keeps none either.
   */
  budget?: number;
  /**
   * A shell command the run executes in the step's workspace after the step hands off; exit 0 is
   * what makes the step verified. It measures, it does not route. The command is read from the
   * workflow the run froze, never from a checkout the step can edit.
   */
  check?: string;
  /** How many times the run re-files the step after its check refuses it. Absent means none. */
  retries?: number;
  /**
   * `gate: true`: the step's closeout waits for a person before anything after it is filed. Verified first, where it has a `check:`, then
   * held — `awaiting approval` — until `nemia approve` is on disk for the try it is on. Not control flow: the run files nothing on a
   * condition, it waits for a person's word, as it does at the run boundary. Absent: no gate, as `nemia start --gate <step>` can still set
   * one for a run.
   */
  gate?: true;
  /**
   * The steps whose declared output this step is handed, in its brief under `## From <step>`, as data.
   *
   * Only what the producer's `output:` declares travels — never its summary, needs or artifacts — and
   * only to a step that names it here. Each must be a step this one waits on: you cannot read the
   * product of work that has not finished. Like `after` it is a relationship, not control flow.
   */
  input?: string[];
  /**
   * What this step's closeout says beyond the four fields every closeout has, for a step that reads it.
   *
   * A JSON Schema file beside the step, read by `nemia start` and frozen on the run with the rest of the
   * step — a schema is part of what the step is judged by, so it lives inside the fence a `check:`
   * does. Its properties are merged into the closeout schema the step is filed with; a closeout that
   * lacks one of them is `unsigned`.
   */
  output?: StepOutput;
  /**
   * What `nemia stats` counts of this step's closeouts, per step and day: each a field its `output:` declares — an array counts its items,
   * an integer or a number is its value — or `field.flag`, the items of an array `field` whose boolean `flag` is true. Each is checked
   * against the `output:` schema when the step is read (`tallyOf`), and a run is counted by the tally it froze.
   */
  tally?: string[];
  /**
   * The step to run again when this one's closeout says `again: true`: one this step waits on through `after`.
   *
   * A round files that step again — its last session continued, handed this step's declared output as data —
   * then every step between them, then this one, a new session. `again: false` lets what waits on this step
   * start. A step with `loop:` declares `again` in its `output:`. Like `after` it is a relationship: the
   * judgement is the agent's, and the run only files the round and counts it.
   */
  loop?: string;
  /** How many rounds a `loop:` may run, the first included — then a person decides. Set to `DEFAULT_ROUNDS` when a loop does not say. */
  rounds?: number;
  /**
   * The agent attached to the step (`agent:`), and what the step said itself: the keys its own file set — never `agent` — and its own note.
   * The step's keys and body above are already resolved: the agent's role keys where the step sets none, and its instructions, then a
   * person's custom instructions for it, before the note. What the rest of the run reads is those; this says where each came from, which is
   * what the step's file is written back from (`renderStep`). Absent on a step that names no agent.
   */
  agent?: StepAgent;
};

/**
 * Where an agent-attached step's keys and words came from: the agent's name, the keys the step set itself, and its own note — and, for each
 * key the step did not set, the value it read as, as its line would write it (`given`): the agent's, or what the parser makes of the step's
 * other keys (`after:` from `resume:`, `rounds:` from `loop:`). A key whose value differs from its given one was changed on the step, and
 * is the step's own from then on (`renderStep`).
 */
export type StepAgent = {
  name: string;
  keys: StepKey[];
  body: string;
  given: Partial<Record<StepKey, string>>;
  /**
   * The agent's own instructions, the session's skills and what becomes of Claude Code's own prompt (`harnessPrompt:`), as the step was
   * resolved: what `nemia start` renders for a Claude Code step, which is then told its instructions in Claude Code's prompt and its note
   * alone in its brief (`rendersAgent`, `briefBody`). The skills are the agent's, then those the step adds (`Workflow.skills`), each once.
   * Absent on a record without them, whose step is told both in its brief.
   */
  instructions?: string;
  /**
   * The person's custom instructions for the agent (`custom-instructions/<agent>.md` in their store), as the step was resolved and frozen
   * at `nemia start`: told after the agent's instructions and before the step's own note, so a later edit reaches no run already started.
   */
  customInstructions?: string;
  /**
   * The rules of the factory the run was started in (`nemia factory rules`), as `nemia start` read them and froze them with the step: told
   * after the custom instructions and before the step's own note, so a later edit reaches no run already started. Absent in a factory
   * that keeps none, and on a step on a remote agent, which is not told them. Written by `parseWorkflow` alone.
   */
  factoryRules?: string;
  skills?: string[];
  /**
   * The skills the step's own `skills:` line gives that its agent does not, in the line's order, frozen at `nemia start` so the run tells
   * the agent's skills from the step's: on every step with its own line, empty when each it names is the agent's already, and absent on a
   * step without one. Read by no session, which is given `skills`.
   */
  addedSkills?: string[];
  /**
   * Its agent's `disallowedTools:` rules, frozen with a step whose own file writes a `disallowedTools:` line, which adds to them: the
   * step's `disallowedTools` is its own rules, then each of these its own do not cover (`deniesWith`), and `renderStep` writes back the
   * step's own alone (`ownDenies`). Absent on a step with no line of its own, which is given its agent's whole, on one whose agent denies
   * nothing, and on a record frozen before the key, whose list is the step's own line whole.
   */
  agentDenies?: string[];
  /**
   * Every skill name the run's folder could see when `nemia start` froze it — each bare name the lookup found, and each `folder:name`
   * written on any agent's or any step's `skills:` line in the folder, with its bare form — which the step's session is told to turn off
   * (`skillOverrides`, `sessionSettings`), so it is listed its own plugin's skills alone and no other of Nemia's. Computed once for the
   * folder (`parseFolder`), not per step: a `folder:name` another step names is a name this step must not be listed either. An override
   * reaches no plugin's skill, so what the step is given survives it. Absent on a record frozen before the key, whose session is listed
   * what it was; the harness's own bundled skills are governed by `disableBundledSkills`, which this sets neither way.
   */
  offSkills?: string[];
  harnessPrompt?: HarnessPrompt;
  /**
   * The MCP servers the step's sessions load, by the names the checkout's `.mcp.json` gives them, its agent's `mcp:` line first, then those
   * the step's own line adds (`Workflow.mcp`), each once: frozen at `nemia start` on every step with an agent, empty where neither names
   * any, whose sessions load none. Absent on a record
   * frozen before the key, whose sessions load the whole file as they did.
   */
  mcp?: string[];
};

/** The rounds a `loop:` runs when its step does not say. */
export const DEFAULT_ROUNDS = 3;

/**
 * The field the run adds to a loop's target's closeout, and owes from its second round: its answer to each finding
 * it was handed, which the next round's looping step is given as data. The run's, like the four every closeout
 * has, so a target's `output:` may not declare it. The schema itself is `REPLIES_SCHEMA` in closeout.ts.
 */
export const LOOP_REPLIES = 'replies';

/**
 * A step's declared output: the file as the step names it (its agent's where the step names none), the schema at `nemia start` — its
 * agent's fields and its own, merged (`mergedOutput`) — and the one owner of each field, where the step hires an agent.
 */
export type StepOutput = { file: string; schema: OutputSchema; owners?: Record<string, OutputOwner> };

/** Who declares a field of a merged output: the agent or the step, by its name and the schema file its `output:` line names. */
export type OutputOwner = { by: 'agent' | 'step'; name: string; file: string };

/** An output schema, checked strict: an object whose every property is required and nothing else allowed. */
export type OutputSchema = {
  type: 'object';
  properties: Record<string, Record<string, unknown>>;
  required: string[];
  additionalProperties: false;
  [key: string]: unknown;
};

/** Every key a step may set, in the order a person reads them. Anything else is refused by name. */
export const STEP_KEYS = [
  'after',
  'resume',
  'input',
  'place',
  'workspace',
  'writable',
  'reads',
  'slot',
  'agent',
  'skills',
  'mcp',
  'harness',
  'model',
  'effort',
  'context',
  'permissionMode',
  'sandbox',
  'tools',
  'disallowedTools',
  'allowedTools',
  'denials',
  'background',
  'remote',
  'deadlineSeconds',
  'budget',
  'check',
  'retries',
  'gate',
  'output',
  'tally',
  'loop',
  'rounds',
] as const;
export type StepKey = (typeof STEP_KEYS)[number];

/**
 * The keys whose value is a list, written as a comma string (`tools: Read, Grep`) or a YAML list (`tools: [Read, Grep]`), each read as
 * the comma string (`flatValue`, `frontmatter.ts`): a step's and an agent's lists, and the cards' `from:`. A list on any other key is
 * refused, and a flow collection there in a former-form block reads the former way. A key's reader judges the items.
 */
export const LIST_KEYS: readonly string[] = [
  'after',
  'input',
  'writable',
  'reads',
  'skills',
  'mcp',
  'tools',
  'disallowedTools',
  'allowedTools',
  'tally',
  'from',
  'disallow',
  'allow',
];

/** The keys that are counts: what each counts, the least that means anything, and an example. */
export const COUNTS = {
  deadlineSeconds: { least: 1, counts: 'the seconds the engine lets the step run before stopping it', example: 900 },
  retries: { least: 0, counts: 'how many times the run re-files the step after its check refuses it', example: 1 },
  rounds: { least: 1, counts: 'how many rounds `loop:` may run, the first included', example: 3 },
} as const;

/**
 * What each key means, in one line, in `STEP_KEYS`' order: what the board shows beside a step's value, in the README's sense of the key.
 * A count's line is `COUNTS`' own, the words its refusal uses. A key without a line does not typecheck, and
 * `test/workflow.test.ts` holds the order and the one line.
 */
export const STEP_KEY_MEANINGS: Readonly<Record<StepKey, string>> = {
  after:
    'the steps that must finish first, verified, or unverified where one has no check — the step `resume:` names included; none, and it starts at once',
  resume: 'the step whose session this one continues instead of starting cold, which implies waiting on it',
  input: 'the steps whose declared output (`output:`) this one is handed in its brief, as data: each one it waits on',
  place:
    '`folder`: the step works in a folder the run makes, and the run needs no git repository — said by every step of the team, or by none. `git`: on branches of a repository. Every step says one; none is the default',
  workspace:
    "`main`: the step runs in the repository's own checkout rather than a worktree of its own — a workflow's last step, which acts on the base branch",
  writable:
    "the folders of the run's factory this step may write, each by its directory's name — every other step of the run only reads them; one that is the run's own repository is the step's workspace already — over a fence that writes",
  reads:
    'what of the store this step reads and never writes, each by name — `inbox`, the cards waiting to be started, mounted read-only and named on its brief; `costs`, what recent finished runs of its workflow cost, said in its brief',
  slot: "`none`: the run takes no run slot (`WF_MAX_RUNS`) — a session that watches the other runs rather than doing a run's work, on a workflow of one step",
  agent:
    "what is attached to this node to do its work: an agent in agents/, whose role keys are this step's defaults and whose instructions come before this step's own note; the step's own keys win",
  skills:
    "skills the step adds to its agent's, each a folder in a `skills/` beside `agents/`: the session is given the agent's, then these, each once, and none is taken away — on a step with an agent, whose fence lets it load them with `Skill`",
  mcp: "MCP servers the step adds to its agent's, each by its name in the checkout's `.mcp.json`: the session loads the agent's, then these, each once, and none is taken away — on a step with an agent; loading a server allows none of its tools",
  harness:
    "what runs the session: `claude` (the default), `codex` or `claude-detached` — or `a2a:<name>`, a remote A2A agent the store's `a2a-agents.json` declares, which takes none of the keys that tell a harness of ours how to run",
  model: "the model the harness runs the session on: the harness's own default when unset",
  effort: "how hard the harness thinks, in its own words: Claude Code's `--effort`, Codex's `model_reasoning_effort`",
  context:
    "the session's context window, in tokens — `200k`: past about it Claude Code compacts the conversation and carries on; the model's whole window when unset",
  permissionMode:
    "Claude Code's permission mode — whether it asks, denies or allows what no rule decides — on `claude` and `claude-detached`; on codex the fence is `sandbox:`",
  sandbox:
    "Codex's sandbox — `read-only`, `workspace-write` or `danger-full-access` — on `codex` only; on Claude Code the fence is `permissionMode:`; `workspace-write` when unset",
  tools: "the only tools the session may have, in the harness's names: the harness's own set when unset",
  disallowedTools: "what the session may not have, in Claude Code's permission rules: a deny beats an allow the checkout's settings give",
  allowedTools:
    "what the session may do without being asked, in Claude Code's permission rules — `Edit(**)`, a glob against the step's own directory, which covers every file-editing tool: what a step in `dontAsk` needs to write its own work, since that mode asks nobody and so allows nothing",
  denials:
    '`fail`: a try the harness denied a call is not passed on — the step reads `denied`, stops what comes after it and waits on a person, and `retries:` never retries it; on `claude` and `claude-detached` jobs only',
  background:
    "`true`: the step runs as a Claude Code background session (`claude --bg`), which outlives its brief and can be attached to and bridged, rather than as a job (`claude -p`) — on `claude` only, with no `budget:`, and over an agent only when its file runs it in the widest mode, since a background session also reads the person's own settings",
  remote:
    '`true`: every session of the step is bridged to claude.ai, where anyone signed in to the account can drive it from a browser or a phone — on `claude` with `background: true` only',
  deadlineSeconds: COUNTS.deadlineSeconds.counts,
  budget: "the most the step's tries may cost together, in dollars: past it the run files nothing more for it until a person raises it",
  check: "a shell command the run executes in the step's workspace after it hands off: exit 0 makes the step verified",
  retries: COUNTS.retries.counts,
  gate: "`true`: the step's closeout waits for a person — `nemia approve` — before anything after it is filed, verified first where it has a check",
  output: 'a JSON Schema file beside the step: what its closeout declares, for a step that reads it with `input:`',
  tally:
    "what `nemia stats` counts of the step's closeouts, per day: fields its `output:` declares — an array's items, a number's value — or `field.flag`, an array's items whose boolean flag is true",
  loop: "the step to run again when this one's closeout says `again: true`: one it waits on",
  rounds: COUNTS.rounds.counts,
};

/**
 * The six fields of every closeout's envelope in v1. They are the run's: `summary` and `body` are the step's own account, for
 * the person who decides, so an `output:` may not declare one of them. The schema itself is `CLOSEOUT_SCHEMA` in closeout.ts, and a
 * test holds the two to each other.
 */
export const CLOSEOUT_FIELDS = ['apiVersion', 'outcome', 'summary', 'body', 'artifacts', 'needs'] as const;

/**
 * Where a step works: its `place:`, or `git` for a step frozen on a run record before the key, as every step worked then; a step file
 * without the line is refused at load (`placeRequired`). The one reader of a step's place. Pure.
 */
export const stepPlace = (step: Pick<Workflow, 'place'>): 'git' | 'folder' => step.place ?? 'git';

/** The fields a step's `output:` declares, in the schema's order. `[]` for a step that declares none. */
export const outputFields = (step: Workflow): string[] => Object.keys(step.output?.schema.properties ?? {});

/**
 * Keys refused with a reason of their own, because each is one somebody will write expecting it to
 * work, and "not a key a step has" would be a worse answer than the truth.
 */
export const REFUSED: Record<string, string> = {
  guide:
    "the harness reads CLAUDE.md or AGENTS.md from the step's workspace on its own. Standing rules belong" +
    ' in that file, and what only this step needs to know belongs in the body',
  maxAttempts:
    'the runtime makes one attempt at a session and tries nothing again on its own, so a count of attempts has nothing' +
    " to count. Trying again is the run's: `retries: N` files the step again after its check refuses it, and `nemia retry <run> <step>`" +
    ' asks for a try of one that failed, was lost or could not start (`--nudge` continues its session, `--fresh` starts clean). Delete the line',
};

/** A step that is wrong: its author's to fix, and the message says how. An `Invalid`, so its `exitCode` is 2. */
export class WorkflowError extends Invalid {
  constructor(message: string) {
    super({ message });
  }
}

export function refuse(why: string): never {
  throw new WorkflowError(why);
}

export const isStepKey = (key: string): key is StepKey => (STEP_KEYS as readonly string[]).includes(key);

export const FRONTMATTER = /^---[ \t]*\n([\s\S]*?\n)?---[ \t]*(?:\n|$)/;

/**
 * A markdown file's frontmatter and its body, trimmed: how a step is written, and a plan's card (`plan.ts`). `block` is the lines
 * between the two `---`, or null for a file with none. `name` is what a refusal calls the file.
 *
 * A byte-order mark and `\r\n` are read away first: left in, either one hides the frontmatter in the body, and every key in it is
 * dropped without a word. Refused: a frontmatter opened on the first line that never closes.
 */
export function splitFrontmatter(name: string, text: string): { block: string | null; body: string } {
  text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const m = FRONTMATTER.exec(text);
  if (!m && /^---[ \t]*\n/.test(text)) {
    refuse(
      `${name}: the frontmatter opened on the first line never closes, so every key in it would be read as prose. End it with a line that is just \`---\`.`,
    );
  }
  return { block: m ? (m[1] ?? '') : null, body: (m ? text.slice(m[0].length) : text).trim() };
}

export const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/**
 * A folder's README, in any case — `readme.md` is the same file to the person who wrote it. It says what the workflow
 * is for, and is never a step: read as one, it would be an agent told the folder's documentation.
 */
export const isReadme = (file: string): boolean => /^readme\.md$/i.test(file);

/**
 * The folder of agents, beside the workflows that name them: `agents/`. A workflow may not have its name — `workflowsIn` never lists it,
 * and `loadWorkflows`, `workflowFolder` and `writeWorkflow` refuse it (`agentsFolderRefusal`).
 */
export const AGENTS_FOLDER = 'agents';

/**
 * The folder of skills, beside the agents that give them: `skills/`, each skill a folder of its own holding a `SKILL.md`. No workflow has
 * its name either (`agentsFolderRefusal`).
 */
export const SKILLS_FOLDER = 'skills';

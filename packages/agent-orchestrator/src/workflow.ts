/**
 * A workflow is a folder of markdown files. That is the whole format.
 *
 * Each file is one step: frontmatter says which harness runs it and what must finish first, and
 * the body is what the agent is told — in prose, because prose is what the person writing it
 * already knows how to write.
 *
 *     ---
 *     harness: codex
 *     after: implement
 *     ---
 *     Review the changes on this branch. Be specific about correctness, not style.
 *
 * All but one: a `README.md` beside the steps says what the workflow is for, and is not a step.
 *
 * **No key is control flow.** No conditions, no expressions, and no loop a keyword decides. That is
 * deliberate. The interesting decisions in this kind of work — is this good enough, did it actually do
 * what was asked — are not predicates a workflow language could evaluate. They are judgements, and a
 * judgement belongs to a step with an agent in it, not to a keyword. The workflow is a team, not a
 * program: `after` orders, `resume` continues, `check` measures, `retries` counts, `output` declares
 * what a step's closeout says for the steps after it and `input` reads it, `loop` is the edge back and
 * `rounds` counts it, `gate` waits for a person, and the rest say who does the work, for how long and for how much.
 *
 * `loop` is the one edge that points backwards, and it is still not a condition: whether the work goes
 * round again is the looping step's agent's word — `again`, in its closeout, the way `blocked` is — and
 * the run only files the round and counts, the way `retries` is a count.
 *
 * **The keys are a closed list.** A key the parser does not know is refused by name, and a value
 * it cannot use is refused with the fix, before anything is spent. Accepting and ignoring is what
 * this replaces: `afer: implement` read as no `after` at all and started the reviewer at once,
 * beside the implementer, with write access; `deadlineSeconds: 5m` read as NaN and stopped the
 * step on its first tick. A `check:` the parser drops is a constraint nobody enforces.
 *
 * **This file is the format as data, and reads nothing.** It parses and checks text, and writes a step or an agent back to text;
 * `workflow-store.ts` is what reads a folder from disk and hands it here (`loadWorkflows`, `loadAgents`, `workflowFolder`, …). So
 * `agent-orchestrator/workflow`, this file, is the format alone, and the readers are exported from the package's root
 * (`docs/architecture.md`).
 */
import path from 'node:path';

export type Workflow = {
  /** The step's name — the file's, minus `.md`. What `after` refers to. */
  name: string;
  /** What must have SUCCEEDED before this may run. `[]` means it starts at once. */
  after: string[];
  /**
   * Continue that step's session instead of starting cold — the author coming back to answer,
   * with their own memory of why they did it that way.
   *
   * The second and last structural key. Like `after` it is a relationship between steps, not
   * control flow: there is still nothing here that branches, loops or evaluates a condition.
   * Implies `after`, since you cannot continue a session that has not run.
   */
  resume?: string;
  /**
   * `workspace: main`: the step runs in the repository's own checkout rather than a worktree of its own.
   *
   * The third structural key, and the only one that is about a directory: everything else about where a step works is the shape of
   * the workflow (`workspacePlan`). A run's work happens on branches in worktrees, which is what keeps two steps out of each other's
   * way — and merging one of those branches onto the base branch is the one thing a worktree cannot do, since the base branch is
   * checked out in the repository. So the step that ends a run works where a person would.
   *
   * Refused on a step with a `check:` — the run would execute it in a person's checkout, which is no verdict on the step's work — on one
   * with a `resume:`, whose session ran in another directory and was told none of what an ending needs, and on a step anything waits on,
   * or one that ends a workflow beside another: a run has one ending (`validate`).
   *
   * `workspace: folder`: the step works in a folder the run makes for it, and the run needs no git repository — the first kind of
   * workspace that is not the git kind (`place` on the run record). A team is of one kind: every step says it, or none does
   * (`validate`). A step that continues another's session (`resume:`) works in that step's folder, as it would in its worktree; any
   * other step gets a folder of its own, empty, and what the steps before it made reaches it as their output and their files.
   */
  workspace?: 'main' | 'folder';
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
  harness?: string;
  model?: string;
  /** How hard the harness should think, in its own words: one of `EFFORTS` for the harness the step runs on. */
  effort?: string;
  /**
   * The context window the step's sessions are given, in tokens — written `context: 200k` or `context: 150000`, read once into the
   * number. Past about it Claude Code compacts the conversation and carries on (`--autocompact`, the engine's `contextTokens`); absent,
   * a session runs on the model's whole window. Refused outside the range the harness takes (`CONTEXT_WINDOWS`), and on a harness with
   * no such knob: codex. A step that continues another's session (`resume:`) keeps that session's window (`sessionContext`).
   */
  context?: number;
  /**
   * Claude Code's permission mode, `--permission-mode`: one of `PERMISSION_MODES` for the harness the step runs on. Refused on codex, whose
   * fence is its sandbox (`sandbox`), in words naming `sandbox:`.
   */
  permissionMode?: string;
  /**
   * Codex's sandbox, `codex exec -s`: one of `SANDBOXES` for the harness the step runs on — `read-only`, `workspace-write`,
   * `danger-full-access`. Absent: Codex's `workspace-write`. Refused on claude and claude-detached, whose fence is `permissionMode`.
   *
   * On codex the key was `permissionMode:` until 2026-09-23, and a folder or an agent that says so is still read: a sandbox's word is read
   * as `sandbox:` (`codexSandboxNamed`, with `bypassPermissions` as `danger-full-access`), and `wf start` names the line to rename
   * (`codexModeLine`). A run frozen before holds the field as `permissionMode` and is read the same way (`asNamed`). The engine's task
   * still calls it `permissionMode`: the tick hands it over under that name (`modeOf`).
   */
  sandbox?: string;
  /**
   * The only tools the session may have, in the harness's names — `tools: Read, Grep, Glob, Bash`. Absent: the
   * harness's own set. Claude Code is given exactly the list (`--tools`), which names its built-in tools; the
   * servers of the checkout's `.mcp.json` are not on it. Refused on codex, which has no tool list: its fence is
   * the sandbox `sandbox:` names.
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
   * anywhere (measured on Claude Code 2.1.278). `allowedTools: Edit(**)` gives back the writes inside the directory the
   * session was started in and no others: the glob is resolved against its `cwd`, a write outside it is still denied
   * with no prompt, and unscoped (`Edit`) it would write anywhere on the machine.
   *
   * `Edit(…)` is the rule for every file-editing tool, Write and NotebookEdit with it: Claude Code matches a file
   * permission check against `Edit` rules alone, warns on stderr that a `Write(…)` rule is not matched, and denies
   * the write — measured on 2.1.278, where `Write(**)` on the allow list left the shipped note writer unable to write its own
   * note, and said so nowhere the run could read. So a path rule on a file-editing tool that is not `Edit` is refused
   * (`fileRuleRefusal`). Refused on codex too, which has no tool list: its fence is the sandbox.
   */
  allowedTools?: string[];
  /**
   * `denials: fail`: a try whose session the harness denied a call is not passed on. It signs off as ever, and the step reads `denied` —
   * nothing after it is filed, no check is run on work done without the tool, and it waits on a person — rather than going on with the
   * `denied: …` note beside its word. `retries:` never spends a try on it: `allowedTools:` is frozen on the run at `wf start`, so a try the run
   * filed on its own would be denied the same call again. A person tries it again with `wf retry` (a new session, told what it was denied,
   * to do without it), or adds the rule the offer names to the folder's `allowedTools:` and starts a new run. Absent: denials are recorded and
   * said, and decide nothing. Every denial counts, one the checkout's settings or the step's own `disallowedTools:` make on purpose included.
   * Refused where no denial is ever read, rather than accepted and never met: on codex, which records none, and beside `background: true`,
   * whose `claude --bg` session records none either (agent-runtime's open issue 28).
   */
  denials?: 'fail';
  /**
   * `remote: true`: every session of the step is bridged to claude.ai — Claude Code's `--remote-control`, filed as `config.claude.remoteControl` — and
   * listed in the web's agents view, where anyone signed in to the account can drive it from a browser or a phone: type into it, answer its
   * prompts, stop it. A deliberate setting, never a default, for that reason. `remote: false` is what a step without the line is. Refused at
   * `wf start` on a harness the engine has no such flag for, and on `claude` without `background: true`: only Claude Code's background
   * sessions are bridged, and a job (`claude -p`) opens no bridge.
   */
  remote?: boolean;
  /**
   * `background: true`: every session of the step runs as a Claude Code background session, `claude --bg` — the engine's
   * `config.background` — which never ends on its own, is listed in `claude agents`, and can be attached to and bridged (`remote:`).
   * Without it a `claude` step runs as a job, `claude -p`: it runs its brief to its end and exits, waits on nobody in any permission
   * mode (a call it may not make is denied and recorded on its attempt), takes `wf say` on its stdin until its result, and keeps a spend
   * cap (`budget:`). So the line is for a session that must outlive a brief — the supervisor — and nothing else. Refused on a harness
   * other than `claude`, which has no second way to run, and beside `budget:`, which a background session does not keep. A step's key,
   * not an agent's: it is how a step's session is run, not who does the work.
   */
  background?: boolean;
  deadlineSeconds?: number;
  /**
   * The most the step's tries may cost together, in dollars — `budget: 5`, `budget: 2.50`. Absent: no cap. The run reads what each
   * ended try cost off the engine, and once they have together cost it or more, files nothing more for the step on its own — no `retries:`
   * try, no round of a loop it is in — until a person raises it (`wf retry --budget`, `wf round --budget`). On `claude` and
   * `claude-detached`, whose sessions are `claude -p` jobs, what is left of it is handed to the engine as `config.budgetUsd` too — a harness
   * argument the runtime judges nothing of — and the harness ends a session once the tries together reach it (`budgetUsdFor`). Refused on codex, which has none, and beside `background: true`,
   * whose `claude --bg` keeps none either.
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
   * held — `awaiting approval` — until `wf approve` is on disk for the try it is on. Not control flow: the run files nothing on a condition,
   * it waits for a person's word, as it does at the run boundary. Absent: no gate, as `wf start --gate <step>` can still set one for a run.
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
   * A JSON Schema file beside the step, read by `wf start` and frozen on the run with the rest of the
   * step — a schema is part of what the step is judged by, so it lives inside the fence a `check:`
   * does. Its properties are merged into the closeout schema the step is filed with; a closeout that
   * lacks one of them is `unsigned`.
   */
  output?: StepOutput;
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
   * The step's keys and body above are already resolved: the agent's role keys where the step sets none, and its instructions before the
   * note. What the rest of the run reads is those; this says where each came from, which is what the step's file is written back from
   * (`renderStep`). Absent on a step that names no agent.
   */
  agent?: StepAgent;
};

/**
 * Where an agent-attached step's keys and words came from: the agent's name, the keys the step set itself, and its own note — and, for each
 * key the step did not set, the value it read as, as its line would write it (`given`): the agent's, or what the parser makes of the step's
 * other keys (`after:` from `resume:`, `rounds:` from `loop:`). A key whose value is no longer its given one was changed on the step since
 * it was read, and is the step's own from then on (`renderStep`).
 */
export type StepAgent = {
  name: string;
  keys: StepKey[];
  body: string;
  given: Partial<Record<StepKey, string>>;
  /**
   * The agent's own instructions, its skills and its system prompt, as the step was resolved: what `wf start` renders for a Claude Code step,
   * which is then told its instructions in its system prompt and its note alone in its brief (`renderedFor`). Absent on a record written
   * before 2026-09-25, whose steps are told both in the brief, as before.
   */
  instructions?: string;
  skills?: string[];
  systemPrompt?: SystemPrompt;
};

/** The rounds a `loop:` runs when its step does not say. */
export const DEFAULT_ROUNDS = 3;

/**
 * The field the run adds to a loop's target's closeout, and owes from its second round: its answer to each finding
 * it was handed, which the next round's looping step is given as data. The run's, like the four every closeout
 * has, so a target's `output:` may not declare it. The schema itself is `REPLIES_SCHEMA` in closeout.ts.
 */
export const LOOP_REPLIES = 'replies';

/** A step's declared output: the file as the step names it, and the schema that file held at `wf start`. */
export type StepOutput = { file: string; schema: OutputSchema };

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
  'workspace',
  'slot',
  'agent',
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
  'loop',
  'rounds',
] as const;
export type StepKey = (typeof STEP_KEYS)[number];

/** The keys that are counts: what each counts, the least that means anything, and an example. */
const COUNTS = {
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
  workspace:
    "`main`: the step runs in the repository's own checkout rather than a worktree of its own — a workflow's last step, which acts on the base branch. `folder`: the step works in a folder the run makes, and the run needs no git repository — said by every step of the team, or by none",
  slot: "`none`: the run takes no run slot (`WF_MAX_RUNS`) — a session that watches the other runs rather than doing a run's work, on a workflow of one step",
  agent:
    "what is attached to this node to do its work: an agent in agents/, whose role keys are this step's defaults and whose instructions come before this step's own note; the step's own keys win",
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
    '`true`: the step runs as a Claude Code background session (`claude --bg`), which outlives its brief and can be attached to and bridged, rather than as a job (`claude -p`) — on `claude` only, and with no `budget:`',
  remote:
    '`true`: every session of the step is bridged to claude.ai, where anyone signed in to the account can drive it from a browser or a phone — on `claude` with `background: true` only',
  deadlineSeconds: COUNTS.deadlineSeconds.counts,
  budget: "the most the step's tries may cost together, in dollars: past it the run files nothing more for it until a person raises it",
  check: "a shell command the run executes in the step's workspace after it hands off: exit 0 makes the step verified",
  retries: COUNTS.retries.counts,
  gate: "`true`: the step's closeout waits for a person — `wf approve` — before anything after it is filed, verified first where it has a check",
  output: 'a JSON Schema file beside the step: what its closeout declares, for a step that reads it with `input:`',
  loop: "the step to run again when this one's closeout says `again: true`: one it waits on",
  rounds: COUNTS.rounds.counts,
};

/**
 * The four fields every closeout has. They are the run's: `summary` goes to the person who decides and
 * nowhere else, so an `output:` may not declare one of them and have it travel to a step. The schema
 * itself is `CLOSEOUT_SCHEMA` in closeout.ts, and a test holds the two to each other.
 */
export const CLOSEOUT_FIELDS = ['outcome', 'summary', 'artifacts', 'needs'] as const;

/** The fields a step's `output:` declares, in the schema's order. `[]` for a step that declares none. */
export const outputFields = (step: Workflow): string[] => Object.keys(step.output?.schema.properties ?? {});

/**
 * Keys refused with a reason of their own, because each is one somebody will write expecting it to
 * work, and "not a key a step has" would be a worse answer than the truth.
 */
const REFUSED: Record<string, string> = {
  guide:
    "the harness reads CLAUDE.md or AGENTS.md from the step's workspace on its own. Standing rules belong" +
    ' in that file, and what only this step needs to know belongs in the body',
  // Retired on 2026-09-23 (thin runtime, stage 4a part 2), with the runtime's own `maxAttempts` and `resume`.
  maxAttempts:
    'the runtime makes one attempt at a session and tries nothing again on its own, so a count of attempts has nothing' +
    " to count. Trying again is the run's: `retries: N` files the step again after its check refuses it, and `wf retry <run> <step>`" +
    ' asks for a try of one that failed, was lost or could not start (`--nudge` continues its session, `--fresh` starts clean). Delete the line',
};

/** The harness a step runs on when it names none. */
const DEFAULT_HARNESS = 'claude';

/**
 * How a step names a remote A2A agent, one another party runs: `harness: a2a:<name>`, the name one the store's `a2a-agents.json` declares
 * (`a2a-agents.ts`), which the runtime client hands the engine as a harness of that name. The parser checks the shape and what such a step
 * may not set (`REMOTE_REFUSED`); `wf start` checks the name is declared (`undeclaredRefusal` in start.ts).
 */
export const REMOTE_PREFIX = 'a2a:';

/** A remote agent's name, as `a2a-agents.json` declares it and `harness:` names it after the prefix: lowercase words joined by dashes. */
export const REMOTE_NAME = /^[a-z][a-z0-9-]*$/;

/** Whether a step's harness is a remote A2A agent (`REMOTE_PREFIX`). Pure. */
export const isRemoteHarness = (harness: string | undefined): boolean => harness?.startsWith(REMOTE_PREFIX) ?? false;

/** The name `harness: a2a:<name>` gives, or `undefined` for a local harness. Pure. */
export const remoteNameOf = (harness: string | undefined): string | undefined =>
  isRemoteHarness(harness) ? harness!.slice(REMOTE_PREFIX.length) : undefined;

const RUNS_AS_CONFIGURED =
  'is how a harness of ours is to run the session, and a remote agent runs as its operator configured it: A2A carries no such argument, and the runtime refuses a task filed with one';
const FENCED_THERE =
  "fences a session on this machine, and a remote agent runs on another party's, under their fence: nothing here would hold it";

/**
 * The keys a step on a remote A2A agent may not set, and why: each tells a harness of ours something, and a remote agent is not one. Refused
 * rather than dropped, since a line the run does not read is a constraint nobody enforces — `permissionMode: plan` would read as a fence.
 */
const REMOTE_REFUSED: Partial<Record<StepKey, string>> = {
  model: RUNS_AS_CONFIGURED,
  effort: RUNS_AS_CONFIGURED,
  context: RUNS_AS_CONFIGURED,
  background: 'chooses how Claude Code runs the session, and a remote agent is not Claude Code',
  remote: 'bridges a Claude Code session to claude.ai, and a remote agent is not Claude Code',
  permissionMode: FENCED_THERE,
  sandbox: FENCED_THERE,
  tools: FENCED_THERE,
  disallowedTools: FENCED_THERE,
  allowedTools: FENCED_THERE,
  denials: 'stops the step on a call its harness denied, and a remote agent reports none',
  budget: 'is a spend cap a harness of ours keeps, and a remote agent keeps none and reports no cost',
  output:
    "declares the fields of a closing statement the harness is asked for, and A2A has no closeout schema: a Task the agent completes is the step's sign-off, and a data part on its reply is what it says",
  loop: 'goes round again on the `again` its `output:` declares, and a step on a remote agent declares no `output:`',
  resume: "continues a session a harness of ours kept, and the run keeps none of a remote agent's: a new Task is sent",
  check:
    "is a command the run executes in the step's workspace, and a remote agent works on another party's machine: nothing it does reaches the workspace, and a check would judge work nobody did there",
};

/**
 * Why a remote step's try may not be asked for with `wf retry --<key>` — `--model`, `--budget` — in the words its load refuses the key in,
 * or undefined for a local harness: the tick files a remote try with no harness arguments (`localFields`), so the flag would be dropped.
 */
export function remoteRetryRefusal(step: Workflow, flag: 'model' | 'budget', value: string | number, command: string): string | undefined {
  if (!isRemoteHarness(step.harness)) return undefined;
  return `\`--${flag} ${value}\` ${REMOTE_REFUSED[flag]}, and ${step.name} runs on \`harness: ${step.harness}\`, a remote A2A agent: its try would be sent without it. Ask without --${flag}: ${command}.`;
}

/** The keys a step on a remote A2A agent may not set (`REMOTE_REFUSED`), in `STEP_KEYS`' order: what the board's form leaves off such a step. */
export const REMOTE_REFUSED_KEYS: readonly StepKey[] = STEP_KEYS.filter((key) => REMOTE_REFUSED[key] !== undefined);

/**
 * Refused: a key a step on a remote agent may not set (`REMOTE_REFUSED`), from the step or from its agent — and `workspace: main`, whose
 * checkout the agent never touches. Nothing else is judged against a remote harness: the key's own reading assumes a harness of ours.
 */
function remoteRefusal(step: string, meta: Partial<Record<StepKey, string>>, harness: string): void {
  const said = (key: string, why: string) =>
    refuse(
      `${step}: \`${key}: ${meta[key as StepKey]}\` ${why}, and \`harness: ${harness}\` is a remote A2A agent. Delete the line — from the step, or from the agent it names if the agent gives it.`,
    );
  for (const key of STEP_KEYS) {
    const why = REMOTE_REFUSED[key];
    if (why !== undefined && meta[key] !== undefined) said(key, why);
  }
  if (meta.workspace?.trim() === 'main')
    said('workspace', "runs the step in the repository's own checkout, which a remote agent on another party's machine never touches");
}

/*
 * The words each harness takes, copied from the engine — which is the source. agent-runtime exports them:
 * `CLAUDE_PERMISSION_MODES`, `CLAUDE_EFFORTS`, `CODEX_SANDBOXES` and `CODEX_EFFORTS`. `codex.refuses` also takes
 * `bypassPermissions`, as the widest sandbox, since the engine's task names a sandbox as its `permissionMode`; a step does not
 * (`sandbox:`), and says `danger-full-access`.
 *
 * A copy and not an import, because this file is pure and imports no runtime (`docs/architecture.md`), and the
 * engine refuses these words only when the run files a step — after `wf start`, with a run on the record. Checked
 * here, so a word is refused before anything is spent. `test/vocabulary.test.ts` imports the runtime's lists and
 * fails the moment a copy differs: the first copies did, for `manual` and codex's `bypassPermissions`.
 */
const CLAUDE_MODES = ['acceptEdits', 'auto', 'bypassPermissions', 'default', 'dontAsk', 'manual', 'plan'];
const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

/**
 * The harnesses a step may run on.
 *
 * Checked here because nothing below checks it early enough: an unknown `harness` falls silently to the
 * default.
 *
 * `check` is not on the list. That harness is the run's own: it executes a step's `check:`
 * command, and no step runs on it.
 */
export const HARNESSES: readonly string[] = ['claude', 'codex', 'claude-detached'];

/**
 * The permission modes each harness takes: Claude Code's `--permission-mode`. Checked for the reason a harness is: an unknown mode is refused
 * by the engine only when the run files the step. Codex has none: its fence is its sandbox (`SANDBOXES`).
 */
export const PERMISSION_MODES: Readonly<Record<string, readonly string[]>> = {
  claude: CLAUDE_MODES,
  'claude-detached': CLAUDE_MODES,
};

/**
 * The sandboxes each harness takes: Codex's `-s`, the one fence `codex exec` has around its one shell — `read-only` runs commands and writes
 * nothing, `workspace-write` writes in the workspace, `danger-full-access` anywhere. Claude Code has none: its fence is its permission mode
 * and its rule lists. `bypassPermissions`, which the engine takes for `danger-full-access`, is not among them: it is Claude Code's word.
 */
export const SANDBOXES: Readonly<Record<string, readonly string[]>> = {
  codex: ['read-only', 'workspace-write', 'danger-full-access'],
};

/**
 * The efforts each harness takes: `--effort` for Claude Code, `model_reasoning_effort` for Codex. Checked for the
 * reason a mode is, and one more: Claude Code does not refuse an effort it does not know — it warns, and runs at
 * its default, a line that silently changes nothing.
 */
export const EFFORTS: Readonly<Record<string, readonly string[]>> = {
  claude: CLAUDE_EFFORTS,
  codex: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
  'claude-detached': CLAUDE_EFFORTS,
};

/**
 * The context windows each harness takes, in tokens, both ends included: `context:`. Copied from the engine — `CLAUDE_CONTEXT_TOKENS` in
 * agent-runtime's `src/runner-claude-vocabulary.ts`, which `claudeDetached` declares too — for the reason the words above are, and held to it by
 * `test/vocabulary.test.ts`. A harness not listed has no such knob: `codex exec` runs on its model's own window.
 */
const CLAUDE_CONTEXT = { least: 100_000, most: 1_000_000 };
export const CONTEXT_WINDOWS: Readonly<Record<string, { least: number; most: number }>> = {
  claude: CLAUDE_CONTEXT,
  'claude-detached': CLAUDE_CONTEXT,
};

export class WorkflowError extends Error {
  /** A step that is wrong is its author's to fix, and the message says how. */
  readonly exitCode = 2;
}

function refuse(why: string): never {
  throw new WorkflowError(why);
}

const isStepKey = (key: string): key is StepKey => (STEP_KEYS as readonly string[]).includes(key);

const FRONTMATTER = /^---[ \t]*\n([\s\S]*?\n)?---[ \t]*(?:\n|$)/;

/**
 * A markdown file's frontmatter and its body, trimmed: how a step is written, and a plan's card (`plan.ts`). `block` is the lines
 * between the two `---`, or null for a file with none. `name` is what a refusal calls the file.
 */
export function splitFrontmatter(name: string, text: string): { block: string | null; body: string } {
  // A file saved with a byte-order mark or `\r\n` is the same file. Left in, either one hides the
  // frontmatter in the body, and every key in it is dropped without a word.
  text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const m = FRONTMATTER.exec(text);
  if (!m && /^---[ \t]*\n/.test(text)) {
    refuse(
      `${name}: the frontmatter opened on the first line never closes, so every key in it would be read as prose. End it with a line that is just \`---\`.`,
    );
  }
  return { block: m ? (m[1] ?? '') : null, body: (m ? text.slice(m[0].length) : text).trim() };
}

/**
 * One step, from its file's text.
 *
 * `read` answers for a file beside the step — the folder's, relative to it — or `undefined` when there
 * is none. Only `output:` names one, and a step parsed without a folder cannot have it read.
 *
 * `agents` are the agents `agent:` may name (`loadAgents`). A step that names one is resolved here, once: each role key the agent sets is
 * the step's unless the step sets it too — the fence under either name, `permissionMode:` or `sandbox:`, as one key — and what the step is told is the agent's instructions, a blank line, then the step's own note —
 * the agent's alone when the step has none. A schema the agent's `output:` names is read beside the agent. Everything downstream of the
 * parser sees the resolved step; `agent` on it says what was the step's own.
 */
export function parseWorkflow(
  name: string,
  text: string,
  read?: (file: string) => string | undefined,
  agents?: Agents,
  skills?: SkillsFound,
): Workflow {
  const { block, body: own } = splitFrontmatter(name, text);
  let {
    meta: { agent: attached, ...meta },
    spelled,
  } =
    block === null
      ? { meta: {} as Partial<Record<StepKey, string>>, spelled: {} }
      : readKeys<StepKey>(name, block, (key) => (isStepKey(key) ? undefined : unknownKey(name, key)));
  if (attached === undefined) {
    if (!own) throw new WorkflowError(`${name}: the body is empty — a step with nothing to say is not a step`);
    return stepFrom(name, codexSandboxNamed(name, meta, meta.harness), own, read, spelled);
  }
  const agent = agentOf(name, attached, agents);
  // The step's own lines are read against the harness the step will run on, its agent's where it names none, before the two are merged: so a
  // step's `permissionMode:` from before `sandbox:` is its own `sandbox:`, and wins over its agent's as any key of its own does.
  meta = codexSandboxNamed(name, meta, meta.harness ?? agent.keys.harness);
  // A fence is one key on each harness, and a step's own replaces its agent's under either name: so a step that runs a Claude Code agent on
  // codex with a sandbox of its own is not also given the agent's permission mode, which no line of it could unset — and the other way round.
  const inherited = fenceOf(meta) === undefined ? agent.keys : withoutFence(agent.keys);
  const body = [agent.body, own].filter(Boolean).join('\n\n');
  if (!body)
    throw new WorkflowError(
      `${name}: the body is empty, and so is ${AGENTS_FOLDER}/${agent.name}.md's — a step with nothing to say is not a step. Write what the agent is told in its file, or this step's own note below its frontmatter.`,
    );
  // The agent's schema is read beside the agent, and one the step names itself beside the step.
  const fromAgent = meta.output === undefined && agent.keys.output !== undefined;
  const step = stepFrom(name, { ...inherited, ...meta }, body, fromAgent ? agent.read : read, spelled);
  const composed = composedRefusal(`${name}: \`agent: ${agent.name}\``, agent.skills, agent.systemPrompt, step);
  if (composed !== undefined) refuse(composed);
  if (skills) for (const skill of agent.skills ?? []) skillAt(name, agent.name, skill, skills);
  const keys = STEP_KEYS.filter((key) => Object.hasOwn(meta, key));
  const given = Object.fromEntries(
    STEP_KEYS.flatMap((key) => {
      const value = key === 'agent' || keys.includes(key) ? undefined : writtenValue(name, key, step[key]);
      return value === undefined ? [] : [[key, value]];
    }),
  );
  return {
    ...step,
    agent: {
      name: agent.name,
      keys,
      body: own,
      given,
      ...(agent.body && { instructions: agent.body }),
      ...(agent.skills?.length && { skills: agent.skills }),
      ...(agent.systemPrompt !== undefined && { systemPrompt: agent.systemPrompt }),
    },
  };
}

/** The folder of the skill `skill` that step `step`'s agent names, or why not: none of the places has it, or two of one repository do. */
export function skillAt(step: string, agent: string, skill: string, skills: SkillsFound): string {
  const found = skills.at.get(skill);
  if (found instanceof WorkflowError)
    refuse(`${step}: \`agent: ${agent}\` gives the skill \`${skill}\`, which cannot be used — ${found.message}`);
  if (found !== undefined) return found;
  return refuse(
    `${step}: \`agent: ${agent}\` gives the skill \`${skill}\`, and no skills folder has it — looked in ${skills.looked.join(', ')}. A skill is a folder holding a SKILL.md: write skills/${skill}/SKILL.md beside ${AGENTS_FOLDER}/, or take \`${skill}\` off the agent's \`skills:\`.`,
  );
}

/** The fence a step's lines write, under either name: Claude Code's permission mode or Codex's sandbox. */
const fenceOf = (keys: Partial<Record<string, string>>): string | undefined => keys.sandbox ?? keys.permissionMode;

/** An agent's keys with neither fence, for a step that writes its own. */
function withoutFence<T extends Partial<Record<string, string>>>(keys: T): T {
  const { permissionMode: _mode, sandbox: _sandbox, ...rest } = keys;
  return rest as T;
}

/** The agent `agent:` names, or why not: one there is not, listing those there are, or one whose file is refused, in its words. */
function agentOf(step: string, name: string, agents: Agents | undefined): Agent {
  const found = agents?.get(name);
  if (found instanceof WorkflowError) refuse(`${step}: \`agent: ${name}\` names an agent whose file is refused — ${found.message}`);
  if (found) return found;
  const there = [...(agents?.keys() ?? [])].sort();
  return refuse(
    `${step}: \`agent: ${name}\` is not an agent here. ` +
      (there.length
        ? `The agents are: ${there.join(', ')} — name one, or write ${AGENTS_FOLDER}/${name}.md beside them.`
        : `There are none: an agent is a file in ${AGENTS_FOLDER}/, beside the workflow's folder — write ${AGENTS_FOLDER}/${name}.md, or delete the line.`),
  );
}

/**
 * A step from its keys as written and its body: each value read into the form the run uses, or refused in `name`'s words. `spelled` names a
 * key read under a former name (`FORMER_KEYS`) by that name, so a refusal quotes the line as the file has it.
 */
function stepFrom(
  name: string,
  meta: Partial<Record<StepKey, string>>,
  body: string,
  read: ((file: string) => string | undefined) | undefined,
  spelled: Spelled = {},
): Workflow {
  const after = (meta.after ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // `resume: x` implies `after: x` — continuing a session that has not run is not a thing.
  if (meta.resume && !after.includes(meta.resume)) after.push(meta.resume);
  const harness = harnessOf(name, meta.harness);
  if (harness !== undefined && isRemoteHarness(harness)) remoteRefusal(name, meta, harness);
  const background = backgroundOf(name, meta.background, harness);
  const output = outputOf(name, meta.output, read);
  // What Claude Code's `/agents` wizard writes for "the parent's model" (`.claude/agents/`, 2.1.282), and a run's session has no parent.
  if (meta.model?.trim() === 'inherit') {
    refuse(
      `${name}: \`model: inherit\` is Claude Code's word for a subagent that runs on the model of the conversation that called it, and a step's session is called by no conversation: it would be started as \`--model inherit\`. Delete the line for the harness's own default, or name a model: \`model: sonnet\`.`,
    );
  }
  autoRefusal(name, harness, meta.model, meta.permissionMode);

  return {
    name,
    after,
    resume: meta.resume,
    workspace: workspaceOf(name, meta.workspace, meta.check, meta.resume, meta.gate, meta.retries, harness),
    slot: slotOf(name, meta.slot),
    body,
    harness,
    model: meta.model,
    effort: wordOf(name, 'effort', meta.effort, harness),
    context: contextOf(name, meta.context, harness),
    permissionMode: wordOf(name, 'permissionMode', meta.permissionMode, harness),
    sandbox: wordOf(name, 'sandbox', meta.sandbox, harness),
    tools: toolsOf(name, meta.tools, harness),
    disallowedTools: rulesOf(name, 'disallowedTools', meta.disallowedTools, harness, spelled.disallowedTools),
    allowedTools: rulesOf(name, 'allowedTools', meta.allowedTools, harness, spelled.allowedTools),
    denials: denialsOf(name, meta.denials, harness, background),
    background,
    remote: remoteOf(name, meta.remote),
    deadlineSeconds: countOf(name, 'deadlineSeconds', meta.deadlineSeconds),
    budget: budgetOf(name, meta.budget, harness, background),
    check: checkOf(name, meta.check),
    retries: countOf(name, 'retries', meta.retries),
    gate: gateOf(name, meta.gate),
    input: meta.input
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    output,
    loop: loopOf(name, meta.loop, output),
    rounds: roundsOf(name, meta.loop, meta.rounds),
  };
}

/**
 * Refused: a Claude Code step that runs in `auto` — named, or the mode it is filed with when it names none — on a model that drops it
 * (`autoDropped`, F21). The refusal names the modes that keep what the step is for.
 */
function autoRefusal(step: string, harness: string | undefined, model: string | undefined, permissionMode: string | undefined): void {
  const dropped = autoDropped(harness, model, permissionMode);
  if (!dropped) return;
  refuse(
    `${step}: \`model: ${model}\` ${dropped}. Name a mode the model keeps: \`permissionMode: acceptEdits\`, which writes in the step's directory unasked, or \`permissionMode: dontAsk\` with \`allowedTools:\` rules for what it may do — \`allowedTools: Edit(**), Bash(npm test)\`. Or run a model that keeps \`auto\`: sonnet, opus or fable.`,
  );
}

/**
 * Why a Claude Code session filed in `permissionMode` — the mode a step names, or `undefined` for none — would not run in it on `model`, as
 * the words after what names the model: `names no \`permissionMode:\`, … (F21, …)`. `undefined` when it would: on codex, which has
 * sandboxes and not modes; on a model that keeps `auto` (`keepsAuto`); or in any mode but `auto`. Such a session says `default` from its
 * first turn, and a job denies every call `default` would ask about, which no line of the step says. The one wording for the load's
 * refusal (`autoRefusal`) and a retry's on another model (`retryRefusal`). Pure.
 */
export function autoDropped(
  harness: string | undefined,
  model: string | undefined,
  permissionMode: string | undefined,
): string | undefined {
  if (harness === 'codex' || isRemoteHarness(harness) || keepsAuto(model)) return undefined;
  if ((permissionMode ?? DEFAULT_PERMISSION_MODE) !== 'auto') return undefined;
  const asked =
    permissionMode === undefined
      ? `names no \`permissionMode:\`, so it is filed in \`${DEFAULT_PERMISSION_MODE}\`, the runtime's default`
      : 'says `permissionMode: auto`';
  return `${asked}, and Claude Code drops \`auto\` on that model: the session runs in \`default\`, and a job denies every call \`default\` would ask about (F21, Claude Code 2.1.282, measured)`;
}

/**
 * A step as it is written back: what `renderStep` takes. A `Workflow` is one, and so is a step whose `output:` names its file without the
 * schema, which is read from beside the step when the file is parsed, never from here — and one whose `agent` is only the agent's name, a
 * step drafted with its own keys and note alone, which the parser resolves.
 */
export type StepDraft = Omit<Workflow, 'output' | 'agent'> & { output?: Pick<StepOutput, 'file'>; agent?: string | StepAgent | null };

/** The keys whose empty list says what no line says: nothing to wait on, to read, to deny. Not `tools:`, where none reads as every tool to one person. */
const EMPTY_IS_UNSET: readonly StepKey[] = ['after', 'input', 'disallowedTools', 'allowedTools'];

/**
 * A step as its file: the frontmatter, with the keys the step sets in `STEP_KEYS`' order, each written as the parser reads it — a list as
 * `a, b`, a count and a budget as the number, a context window in its one canonical form (`contextText`: `200k`, however it was written),
 * `output:` as the file it names — then the body. The inverse of `parseWorkflow`: a step it
 * read renders to a file it reads back as the same step, which `test/workflow.test.ts` holds over every shipped folder. Pure.
 *
 * Unset is `undefined` or `null`, and an empty list where no line says the same (`EMPTY_IS_UNSET`). `rounds:` is written where the step
 * has it, the default included, and `after:` lists the step `resume:` names too, as the parser read it. A file's comments are not on
 * the step, so a render has none.
 *
 * A step whose `agent` says where its keys came from (`StepAgent`, as the parser resolves one) is written as its file was: `agent:`, the
 * keys the step set itself and its own note — never what the agent gave it, which would pin the agent's words in every step's file. A key
 * it did not set but whose value was changed since it was read is written too, as the step's own: a change is never dropped. Its body is
 * its own note, whatever `body` says. A step whose `agent` is a name is a draft of the step's own: every key it sets is written, after
 * `agent:`, and its body is its own note.
 *
 * It judges nothing the parser judges: a value the parser would refuse is written as given, and the parser refuses it in its own words
 * (`writeWorkflow` parses what it rendered before it writes). Refused here is only what a file cannot hold, which the parser would never
 * see: a key no step has, in the parser's words, since it would be dropped; a line break in a value, which ends the line and makes what
 * follows a line of its own — a key, even; and a comma inside a step's name in `after:` or `input:`, which would be read as two names.
 */
export function renderStep(step: StepDraft): string {
  const unknown = Object.keys(step).find(
    (key) => key !== 'name' && key !== 'body' && !isStepKey(key) && (step as Record<string, unknown>)[key] != null,
  );
  if (unknown !== undefined)
    refuse(Object.hasOwn(FORMER_KEYS, unknown) ? formerKeyWritten(step.name, unknown) : unknownKey(step.name, unknown));
  if (step.harness === 'codex' && step.permissionMode != null && formerSandbox(step.permissionMode) !== undefined)
    refuse(codexModeWritten(step.name, step.permissionMode));
  const provenance = step.agent != null && typeof step.agent === 'object' ? step.agent : undefined;
  const lines = STEP_KEYS.flatMap((key) => {
    const value = writtenValue(step.name, key, key === 'agent' ? (provenance?.name ?? step.agent) : step[key]);
    // A key the step did not set is left to its agent — unless it was changed since, and is the step's now.
    if (provenance && key !== 'agent' && !provenance.keys.includes(key) && value === provenance.given?.[key]) return [];
    return value === undefined ? [] : [`${key}: ${value}`];
  });
  const body = String((provenance ? provenance.body : step.body) ?? '').trim();
  if (lines.length) return `---\n${lines.map((line) => `${line}\n`).join('')}---\n${body}\n`;
  // A body that opens on `---` would be read as the frontmatter, were there none before it — and as its block, were that block empty.
  return /^---[ \t]*(?:\n|$)/.test(body) ? `---\n\n---\n${body}\n` : `${body}\n`;
}

/** One key's value as its line writes it, or `undefined` for a key the step does not set. */
function writtenValue(step: string, key: StepKey, value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  let text: string;
  if (Array.isArray(value)) {
    if (!value.length && EMPTY_IS_UNSET.includes(key)) return undefined;
    const entries = value.map(String);
    const split = key === 'after' || key === 'input' ? entries.find((entry) => entry.includes(',')) : undefined;
    if (split !== undefined) {
      refuse(
        `${step}: \`${key}\` lists \`${split}\`, and a list is split on every comma, so it would be read as ${split
          .split(',')
          .map((s) => `\`${s.trim()}\``)
          .join(', ')}. A step's name has no comma: give each step an entry of its own.`,
      );
    }
    text = entries.join(', ');
  } else if (key === 'context' && typeof value === 'number') {
    text = contextText(value);
  } else if (key === 'output' && typeof value === 'object') {
    // The file it names: the schema is the folder's. An `output` naming no file is written with no value, which the parser refuses.
    text = writtenValue(step, key, (value as { file?: unknown }).file) ?? '';
  } else if (typeof value === 'object' || typeof value === 'function') {
    refuse(
      `${step}: \`${key}\` is ${JSON.stringify(value) ?? `a ${typeof value}`}, and a frontmatter line holds a word, a number or a list: an object would be written as \`[object Object]\`.`,
    );
  } else {
    text = String(value as string | number | boolean | bigint | symbol);
  }
  if (/[\r\n]/.test(text)) {
    refuse(
      `${step}: \`${key}\` holds a line break, and a frontmatter line is one key and its value: what follows the break would be read as a line of its own. Write it on one line${key === 'check' ? ' — commands joined with `&&`' : ''}.`,
    );
  }
  return text;
}

/**
 * `loop:` as written, refused unless the step can say whether to go round again: one step, and `again` declared
 * boolean in its `output:`. That the step it names comes before this one is the workflow's to say (`validate`).
 */
function loopOf(step: string, loop: string | undefined, output: StepOutput | undefined): string | undefined {
  if (loop === undefined) return undefined;
  if (loop.includes(',')) {
    refuse(
      `${step}: \`loop: ${loop}\` names more than one step. A loop runs one earlier step again, and every step between it and this one follows: name the first of them.`,
    );
  }
  const named = `${step}: \`loop: ${loop}\` runs ${loop} again when this step's closeout says \`again: true\``;
  const declare = 'Declare it — `"again": { "type": "boolean" }`, listed in `required` — so the run reads a yes or a no, never prose.';
  if (!output)
    refuse(`${named}, and this step declares no \`output:\`, so its closeout has no \`again\`. Give it an \`output:\` schema. ${declare}`);
  const again = output.schema.properties.again;
  if (!again) refuse(`${named}, and \`output: ${output.file}\` does not declare \`again\`. ${declare}`);
  if (again.type !== 'boolean') {
    refuse(
      `${named}, and \`output: ${output.file}\` declares \`again\` as ${JSON.stringify(again.type ?? again)}. It is \`"type": "boolean"\`: true or false, and nothing the run would have to interpret.`,
    );
  }
  return loop;
}

/** `rounds:`, which counts the rounds of a loop: refused on a step with no `loop:`, and `DEFAULT_ROUNDS` on one that does not say. */
function roundsOf(step: string, loop: string | undefined, rounds: string | undefined): number | undefined {
  if (rounds !== undefined && loop === undefined) {
    refuse(
      `${step}: \`rounds: ${rounds}\` counts the rounds of a loop, and this step has no \`loop:\`. Add \`loop: <step>\`, naming the earlier step to run again, or delete the line. To try one step again after its check refuses it, that is \`retries:\`.`,
    );
  }
  return loop === undefined ? undefined : (countOf(step, 'rounds', rounds) ?? DEFAULT_ROUNDS);
}

/** The refusal of a key no step has, by name: with a reason of its own where it has one (`REFUSED`), and otherwise with the keys a step has. */
const unknownKey = (step: string, key: string): string =>
  Object.hasOwn(REFUSED, key)
    ? `${step}: a step may not set \`${key}\` — ${REFUSED[key]}.`
    : `${step}: \`${key}\` is not a key a step has. A step's keys are: ${STEP_KEYS.join(', ')}. Correct the spelling or delete the line — a key the run does not read is a constraint nobody enforces.`;

/**
 * A key's former name, and the name it has now: what a step or an agent file written before a key was renamed still says. Claude Code's
 * `--disallowedTools` and `--allowedTools` — a subagent's `disallowedTools:` and `allowedTools:` — were `disallow:` and `allow:` here until
 * 2026-09-23. A former name is read as the key it is now (`readKeys`), in step files and agent files alike; `wf start` says which files
 * still use one (`formerKeyLine`); nothing writes one (`renderStep`, `renderAgent`); and a run frozen before, whose steps hold the former
 * fields, is read under the new ones (`asNamed`). A key renamed later adds its line here, and `asNamed` carries it.
 */
export const FORMER_KEYS: Readonly<Record<string, StepKey & RoleKey>> = { disallow: 'disallowedTools', allow: 'allowedTools' };

/**
 * The date `sandbox:` took over from `permissionMode:` on a codex step: before it, a codex step named its sandbox as its permission mode, the
 * engine's task field. Not a line of `FORMER_KEYS`, since `permissionMode` is still a key — Claude Code's — and is former only on codex.
 */
const SANDBOX_SINCE = '2026-09-23';

/**
 * A step's or an agent's lines with a codex `permissionMode:` read as the `sandbox:` it names — `bypassPermissions`, which the engine took for
 * the widest sandbox, as `danger-full-access` — for a step or agent that runs on `harness`. So a folder, or an agent, written before the key
 * was Codex's own still loads, and `wf start` names the line to rename (`codexModeLine`). Refused when `sandbox:` is written beside it: on
 * codex the two are one key. A word that is no sandbox is left where it is, for `wordOf` to refuse in words naming `sandbox:`. Pure.
 */
function codexSandboxNamed<K extends string>(
  file: string,
  meta: Partial<Record<K | 'permissionMode' | 'sandbox', string>>,
  harness: string | undefined,
): Partial<Record<K | 'permissionMode' | 'sandbox', string>> {
  const word = meta.permissionMode;
  if (harness !== 'codex' || word === undefined) return meta;
  if (meta.sandbox !== undefined) {
    refuse(
      `${file}: \`permissionMode: ${word}\` and \`sandbox: ${meta.sandbox}\` are both set, and on codex they are one key: until ${SANDBOX_SINCE} a codex step named its sandbox as \`permissionMode:\`, and \`sandbox:\` is Codex's own name for it. Keep the \`sandbox:\` line and delete the other.`,
    );
  }
  const sandbox = sandboxNamed(word);
  if (!SANDBOXES.codex!.includes(sandbox)) return meta;
  const { permissionMode: _, ...rest } = meta;
  return { ...rest, sandbox } as Partial<Record<K | 'permissionMode' | 'sandbox', string>>;
}

/** The sandbox a codex permission mode named: itself, or `danger-full-access` for `bypassPermissions`, the engine's alias for it. */
const sandboxNamed = (word: string): string => (word === 'bypassPermissions' ? 'danger-full-access' : word);

/**
 * The sandbox a codex file's `permissionMode: <word>` is read as, written before 2026-09-23, or `undefined` for a word that names none,
 * which the parser refuses. For code outside the package that reads a file's lines the parser did not read — the api's picture of an agent
 * that does not load — so it reads the former line as the parser would. Pure.
 */
export const formerSandbox = (word: string): string | undefined => {
  const sandbox = sandboxNamed(word);
  return SANDBOXES.codex!.includes(sandbox) ? sandbox : undefined;
};

/**
 * The fence a step asks its harness for: the engine's task calls both `permissionMode`, Claude Code's permission mode and Codex's sandbox,
 * and a step has at most one of the two (`wordOf`). What the tick files as `config.permissionMode`. Pure.
 */
export const modeOf = (step: Pick<Workflow, 'permissionMode' | 'sandbox'>): string | undefined => step.sandbox ?? step.permissionMode;

/** The name a key was written under, for a key read under a former one (`FORMER_KEYS`), by the key it is now. */
type Spelled = Partial<Record<string, string>>;

/** The key a frontmatter line names: its own, or the one its former name is now (`FORMER_KEYS`). */
const keyNamed = (written: string): string => (Object.hasOwn(FORMER_KEYS, written) ? FORMER_KEYS[written]! : written);

/**
 * The frontmatter as key → value: every line a key `refusal` does not refuse — a key a step has, or an agent — set once, to something. A line
 * under a key's former name (`FORMER_KEYS`) is read as the key, and `spelled` says under which name, so a refusal quotes the line as written.
 */
function readKeys<K extends string>(
  step: string,
  block: string,
  refusal: (key: string) => string | undefined,
): { meta: Partial<Record<K, string>>; spelled: Spelled } {
  const meta: Partial<Record<K, string>> = {};
  const spelled: Spelled = {};
  for (const raw of block.split('\n')) {
    const line = raw.trim();
    // Blank lines group a long frontmatter; `#` is the comment character every reader expects.
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf(':');
    if (i <= 0) {
      refuse(
        `${step}: \`${line}\` is not \`key: value\`. Each frontmatter line is a key, a colon and its value, and a list stays on one line: \`after: a, b\`.`,
      );
    }
    const written = line.slice(0, i).trim();
    const key = keyNamed(written);
    const value = line.slice(i + 1).trim();

    const refused = refusal(key);
    if (refused !== undefined) refuse(refused);
    // Refused rather than last-one-wins: both values are something the author meant, and picking
    // one silently is how a step ends up waiting on half of what it was written to wait on.
    if (Object.hasOwn(meta, key)) {
      const first = spelled[key] ?? key;
      if (first !== written) {
        refuse(
          `${step}: \`${key}\` is set twice, as \`${first}:\` and as \`${written}:\` — \`${first === key ? written : first}:\` is its former name, and reads as \`${key}:\`. Keep the \`${key}:\` line and delete the other.`,
        );
      }
      refuse(
        `${step}: \`${written}\` is set twice, and a step that says two things says nothing. Keep one line${key === 'after' ? ' and list every step on it: `after: a, b`' : ''}.`,
      );
    }
    if (!value) {
      refuse(
        key === 'check'
          ? `${step}: \`check\` has no value. Give the command that must exit 0 in the step's workspace — \`check: npm test\` — or delete the line, and the step runs no check.`
          : key === 'tools'
            ? `${step}: \`tools\` has no value, which reads as every tool to one person and as none to another. Name the tools the session may have — ${TOOLS_EXAMPLE} — or delete the line, and the step has the harness's own set.`
            : key === 'disallowedTools'
              ? `${step}: \`${written}\` has no value, which denies nothing and reads as a fence. Name what the session may not have — ${DISALLOW_EXAMPLE} — or delete the line, and the step is denied nothing beyond the checkout's settings.`
              : key === 'allowedTools'
                ? `${step}: \`${written}\` has no value, which allows nothing and reads as a permission. Name what the session may do without being asked — ${ALLOW_EXAMPLE} — or delete the line, and the step may do only what its \`permissionMode\` allows by itself.`
                : key === 'budget'
                  ? `${step}: \`budget\` has no value, which reads as no cap to one person and as nothing to spend to another. Give the most the step's tries may cost together, in dollars — ${BUDGET_EXAMPLE} — or delete the line, and the step has no budget.`
                  : `${step}: \`${key}\` has no value. Delete the line rather than leaving it blank — an empty key is not the same as an absent one.`,
      );
    }
    meta[key as K] = value;
    if (written !== key) spelled[key] = written;
  }
  return { meta, spelled };
}

function harnessOf(step: string, harness: string | undefined): string | undefined {
  if (harness === undefined || HARNESSES.includes(harness)) return harness;
  if (isRemoteHarness(harness)) {
    const name = remoteNameOf(harness)!;
    if (REMOTE_NAME.test(name)) return harness;
    refuse(
      `${step}: \`harness: ${harness}\` names a remote A2A agent, and \`${name}\` is not a name one is declared under: lowercase words joined by dashes, as \`a2a-agents.json\` in the store declares them — \`harness: a2a:reviewer\`.`,
    );
  }
  if (harness === 'check') {
    refuse(
      `${step}: \`harness: check\` is the run's own harness — it executes a step's \`check:\` command, and no step runs on it. Put the command in \`check:\` and run the step on one of: ${HARNESSES.join(', ')}.`,
    );
  }
  return refuse(
    `${step}: \`harness: ${harness}\` is not a harness a step can run on. The harnesses are: ${HARNESSES.join(', ')}, and \`a2a:<name>\` for a remote A2A agent the store's \`a2a-agents.json\` declares. Without the line, the step runs on ${DEFAULT_HARNESS}.`,
  );
}

const VOCABULARY = {
  permissionMode: { lists: PERMISSION_MODES, noun: 'a mode' },
  sandbox: { lists: SANDBOXES, noun: 'a sandbox' },
  effort: { lists: EFFORTS, noun: 'an effort' },
} as const;

/** The two fences, each one harness's: what a step on the other harness is told to write instead. */
const FENCE_ELSEWHERE = {
  permissionMode: (word: string) =>
    `\`permissionMode:\` is Claude Code's permission mode, and codex has none: its fence is its sandbox, \`sandbox:\` — ${SANDBOXES.codex!.join(', ')}. ${word === 'bypassPermissions' ? 'Write `sandbox: danger-full-access` instead, the sandbox that fences nothing' : 'Write `sandbox:` instead, naming one of them: `sandbox: read-only` for a step that must not write'}`,
  sandbox: () =>
    `\`sandbox:\` is Codex's sandbox, and Claude Code has none: its fence is its permission mode, \`permissionMode:\` — ${CLAUDE_MODES.join(', ')} — with \`tools:\`, \`disallowedTools:\` and \`allowedTools:\`. Write \`permissionMode:\` instead, or run the step on codex`,
} as const;

/**
 * A permission mode, a sandbox or an effort is the harness's vocabulary, so it is checked against the harness the step runs on. A harness with
 * no list for the key has no such knob: a sandbox on Claude Code, a permission mode on Codex, each refused in words naming the other key.
 */
function wordOf(step: string, key: keyof typeof VOCABULARY, word: string | undefined, harness: string | undefined): string | undefined {
  const { lists, noun } = VOCABULARY[key];
  const on = harness ?? DEFAULT_HARNESS;
  const words = lists[on];
  if (word === undefined || words?.includes(word)) return word;
  const where = harness ? '' : ` (there is no \`harness:\` line, so the step runs on ${on})`;
  if (!words)
    return refuse(
      `${step}: \`${key}: ${word}\` is not a key ${on} takes${where}. ${FENCE_ELSEWHERE[key as keyof typeof FENCE_ELSEWHERE](word)}.`,
    );
  if (key === 'sandbox' && word === 'bypassPermissions') {
    return refuse(
      `${step}: \`sandbox: bypassPermissions\` is Claude Code's word for its widest mode. Codex's own name for the sandbox that fences nothing is \`danger-full-access\`: write \`sandbox: danger-full-access\`. On ${on} it is one of: ${words.join(', ')}.`,
    );
  }
  const owner = HARNESSES.find((h) => lists[h]?.includes(word));
  // The other fence's word: a sandbox written as a mode, on a harness that has modes, or the other way round.
  const other = key === 'permissionMode' ? 'sandbox' : key === 'sandbox' ? 'permissionMode' : undefined;
  const across = other && HARNESSES.find((h) => VOCABULARY[other].lists[h]?.includes(word));
  return refuse(
    `${step}: \`${key}: ${word}\` is not ${noun} ${on} has${where}.` +
      ` On ${on} it is one of: ${words.join(', ')}.` +
      (owner ? ` \`${word}\` is ${owner}'s word, and this step does not run on ${owner}.` : '') +
      (across
        ? ` \`${word}\` is ${VOCABULARY[other].noun} ${across} has, written \`${other}: ${word}\` on a step that runs on ${across}.`
        : '') +
      ' Without the line, the harness uses its own default.',
  );
}

const TOOLS_EXAMPLE = '`tools: Read, Grep, Glob, Bash`';

/**
 * `tools:` as the list of names the harness is given, refused unless each entry is one name.
 *
 * Split on commas, as `after:` is — so a comma inside an entry, in a rule's parentheses or in quotes, would reach
 * the harness as the pieces of one; and a space inside one is a list written without its commas, or a rule where
 * a name goes. Refused on codex, which has no tool list: one shell in a sandbox, so a list there narrows nothing
 * the sandbox does not, and the engine leaves the sandbox as `sandbox:` named it whenever the list has Bash.
 */
function toolsOf(step: string, tools: string | undefined, harness: string | undefined): string[] | undefined {
  if (tools === undefined) return undefined;
  const named = `${step}: \`tools: ${tools}\``;
  const written = `A step's tools are the harness's names for them, bare and comma-separated: ${TOOLS_EXAMPLE}.`;
  if (harness === 'codex') {
    refuse(
      `${named} is a tool list, and codex has none: one shell, fenced by its sandbox. The sandbox is \`sandbox:\` — \`read-only\` reads and runs commands and writes nothing, \`workspace-write\` writes in the workspace. Delete the line, and name the sandbox: \`sandbox: read-only\` for a step that must not write.`,
    );
  }
  if (/\([^)]*,|\[[^\]]*,|"[^"]*,|'[^']*,/.test(tools)) {
    const pieces = tools
      .split(',')
      .map((s) => `\`${s.trim()}\``)
      .join(', ');
    refuse(
      `${named} has a comma inside an entry, and the list is split on every comma, so the harness would be given ${pieces} as names. ${written}`,
    );
  }
  const names = tools
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!names.length) refuse(`${named} names no tool. ${written} Without the line, the step has the harness's own set.`);
  const spaced = names.find((n) => /\s/.test(n));
  if (spaced && !spaced.includes('(')) refuse(`${named} has a space inside \`${spaced}\`, which is not one name. ${written}`);
  const dressed = names.find((n) => /[\s()[\]"'`]/.test(n));
  if (dressed) {
    refuse(
      `${named} has \`${dressed}\`, which is not a tool name: ${
        dressed.includes('(')
          ? `it is a rule for what a tool may run, and \`tools:\` says which tools the session has — \`${dressed.slice(0, dressed.indexOf('('))}\`, whole`
          : 'a name is written bare, without quotes or brackets'
      }. ${written}`,
    );
  }
  return names;
}

const DISALLOW_EXAMPLE = '`disallowedTools: Bash(npm run build), SendMessage`';
const ALLOW_EXAMPLE = '`allowedTools: Edit(**), Bash(npm test)`';

/**
 * One permission rule as Claude Code writes one: a tool's name, and what it may not run in parentheses. The engine's
 * `file()` refuses an entry of any other shape; it is checked here as well, so a folder is refused before anything is spent.
 */
const RULE = /^[A-Za-z][^\s,()]*(?:\([^()]+\))?$/;

/** What each rule list is, in the words its refusals use: the two halves of Claude Code's permission rules. */
const RULE_LIST = {
  disallowedTools: {
    is: 'a deny list',
    has: 'no tool list to deny from',
    example: DISALLOW_EXAMPLE,
    written: 'what the session may not have',
    may: 'may not run',
    sandbox: '`sandbox: read-only` for a step that must not write',
    absent: "the step is denied nothing beyond the checkout's settings",
    two: 'Two commands are two rules: `Bash(git push), Bash(git reset)`.',
  },
  allowedTools: {
    is: 'an allow list',
    has: 'no tool list to allow from',
    example: ALLOW_EXAMPLE,
    written: 'what the session may do without being asked',
    may: 'may do',
    sandbox: '`sandbox: workspace-write` for a step that writes in its workspace and asks nobody',
    absent: 'the step may do only what its `permissionMode` allows by itself',
    two: 'Two tools are two rules: `Edit(**), Bash(npm test)`.',
  },
} as const;

/**
 * `disallowedTools:` and `allowedTools:` as the rules the harness is given to deny and to permit, refused unless each entry is one rule.
 * One function for both: the two keys are the same list in Claude Code's own grammar, and a rule the deny list refuses is
 * not a rule the allow list should take.
 *
 * Split on commas, as `tools:` is, so a comma inside a rule's parentheses would reach the harness as two pieces of it, and is
 * refused as `tools:` refuses one. Only the parentheses are looked in: a quote is legal inside a rule — `Bash(git commit -m 'wip')`
 * — and `tools:`'s quote check fired on such a rule whenever another entry followed it. A list written in brackets or quotes
 * splits into entries that are not rules, and is refused for that. Refused on codex, which has no tool list at all.
 */
function rulesOf(
  step: string,
  key: 'disallowedTools' | 'allowedTools',
  written: string | undefined,
  harness: string | undefined,
  spelled?: string,
): string[] | undefined {
  if (written === undefined) return undefined;
  const w = RULE_LIST[key];
  // A line under the key's former name is quoted as written, and said to be the key.
  const named = `${step}: \`${spelled ?? key}: ${written}\`${spelled !== undefined && spelled !== key ? ` (\`${spelled}:\` is \`${key}:\`'s former name)` : ''}`;
  const shape = `Each entry is one rule, a tool or a tool and what it ${w.may}, comma-separated: ${w.example}.`;
  if (harness === 'codex') {
    refuse(
      `${named} is ${w.is}, and codex has ${w.has}: one shell, fenced by its sandbox. The sandbox is \`sandbox:\` — \`read-only\` reads and runs commands and writes nothing, \`workspace-write\` writes in the workspace. Delete the line, and name the sandbox: ${w.sandbox}.`,
    );
  }
  if (/\([^)]*,/.test(written)) {
    const pieces = written
      .split(',')
      .map((x) => `\`${x.trim()}\``)
      .join(', ');
    refuse(
      `${named} has a comma inside an entry, and the list is split on every comma, so the harness would be given ${pieces} as rules. ${shape} ${w.two}`,
    );
  }
  const rules = written
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (!rules.length) refuse(`${named} names no rule. ${shape} Without the line, ${w.absent}.`);
  const odd = rules.find((r) => !RULE.test(r));
  if (odd) {
    refuse(
      `${named} has \`${odd}\`, which is not one rule: ${
        /[()]/.test(odd)
          ? 'a rule has one pair of parentheses, right after the name, closed'
          : /\s/.test(odd)
            ? 'a space outside the parentheses separates two rules, to the harness'
            : 'a rule is a bare name, without quotes or brackets'
      }. ${shape}`,
    );
  }
  const inert = rules.find((r) => FILE_TOOLS.some((tool) => r.startsWith(`${tool}(`)));
  if (inert) refuse(fileRuleRefusal(named, inert, key));
  return rules;
}

/**
 * The file-editing tools whose path rules Claude Code does not match: it checks a write against `Edit` rules alone, whatever
 * tool made it. `Edit` is not in the list — it is the one that works.
 */
const FILE_TOOLS = ['Write', 'NotebookEdit'] as const;

/**
 * A path rule on a file-editing tool that is not `Edit`, which Claude Code accepts, warns about on stderr and never matches.
 *
 * Measured on Claude Code 2.1.278, on the allow list. The shipped note writer was given `Write(**)` to allow and could not write its
 * own `note.md` — `Permission to use Write has been denied because Claude Code is running in don't ask mode` — while the harness
 * said, on a stderr nobody reads, `Write(**) is not matched by file permission checks — only Edit(path) rules are`. With `Edit(**)`
 * it wrote inside its folder and was denied outside it, which is the fence.
 *
 * Refused on the deny list too, on the harness's own sentence: what it does not match is the *file permission check*, which is the one
 * check a deny rule on a write is read in. An inert allow denies a step its own work, which a person finds by the work not happening; an
 * inert deny is worse, since the step is fenced by nothing while its file reads as fenced. The fix is the same rule on `Edit`, which
 * covers the file-editing tools whichever list it is in.
 */
const fileRuleRefusal = (named: string, rule: string, key: 'disallowedTools' | 'allowedTools'): string =>
  `${named} has \`${rule}\`, and Claude Code matches a file write against \`Edit\` rules alone: it takes this rule, warns that it is not matched, and ${
    key === 'allowedTools'
      ? 'denies the write anyway — so the step would be fenced out of its own work with nothing said where the run can read it'
      : 'allows the write anyway — so the step would be fenced by nothing while its file reads as fenced'
  }. Write \`Edit${rule.slice(rule.indexOf('('))}\` instead: an \`Edit\` rule covers every file-editing tool, ${FILE_TOOLS.join(', ')} with it.`;

/**
 * `remote:` as written: `true` or `false`, or refused. Anything else — `yes`, `on` — is a word the run would have to interpret, and reading it
 * either way is wrong: as true it lets a session be driven from a phone nobody meant to reach it, as false it drops a setting without a word.
 * Which harnesses bridge a session is the engine's to say, so `remote: true` on another is refused at `wf start` (`remoteRefusal` in start.ts).
 */
function remoteOf(step: string, remote: string | undefined): boolean | undefined {
  if (remote === undefined) return undefined;
  if (remote === 'true') return true;
  if (remote === 'false') return false;
  return refuse(
    `${step}: \`remote: ${remote}\` is not \`true\` or \`false\`. \`remote: true\` bridges every session of the step to claude.ai, where anyone signed in to the account can drive it from a browser or a phone; \`remote: false\`, or no line, does not. Write one of the two, or delete the line.`,
  );
}

/**
 * `background:` as written: `true` or `false`, or refused, for `remote:`'s reasons — and `true` refused on a harness other than `claude`,
 * as the engine refuses `config.background` there (agent-runtime's `file()`), here so a folder is refused at `wf start` and not on its first
 * pass. `codex exec` and `claude-detached`'s `claude -p` each run one way.
 */
function backgroundOf(step: string, background: string | undefined, harness: string | undefined): boolean | undefined {
  if (background === undefined) return undefined;
  if (background !== 'true' && background !== 'false') {
    refuse(
      `${step}: \`background: ${background}\` is not \`true\` or \`false\`. \`background: true\` runs every session of the step as a Claude Code background session (\`claude --bg\`); \`background: false\`, or no line, runs it as a job (\`claude -p\`). Write one of the two, or delete the line.`,
    );
  }
  if (background === 'true' && (harness ?? DEFAULT_HARNESS) !== 'claude') {
    refuse(
      `${step}: \`background: true\` asks for a Claude Code background session (\`claude --bg\`), and the \`${harness}\` harness has no such mode: ${harness === 'codex' ? '`codex exec` runs a prompt and exits' : '`claude-detached` runs `claude -p` and nothing else'}. Run the step on claude — delete \`harness: ${harness}\` — or delete \`background: true\`.`,
    );
  }
  return background === 'true';
}

function countOf(step: string, key: keyof typeof COUNTS, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const { least, counts, example } = COUNTS[key];
  const n = /^\d+$/.test(value) ? Number(value) : NaN;
  if (Number.isSafeInteger(n) && n >= least) return n;
  // `5m` is the one that shipped: NaN, journalled as null, and the step stopped on its first tick.
  // The unit is what the author meant, so the message does the arithmetic rather than the author.
  const unit = key === 'deadlineSeconds' ? /^(\d+)\s*([smh])$/.exec(value) : null;
  const instead = unit
    ? `\`${key}: ${Math.max(least, Number(unit[1]) * { s: 1, m: 60, h: 3600 }[unit[2] as 's' | 'm' | 'h'])}\``
    : `for example \`${key}: ${example}\``;
  return refuse(
    `${step}: \`${key}: ${value}\` is not a count. \`${key}\` is ${counts}: a whole number ${least ? 'above zero' : 'of zero or more'}, in digits${unit ? ' with no unit' : ''} — ${instead}.`,
  );
}

const CONTEXT_EXAMPLE = '`context: 200k`, or `context: 150000`';

/**
 * Tokens as a person writes them — `200k`, `150000`, `1M` — or undefined for anything else: digits, and thousands (`k`) or millions (`m`)
 * after them, either case. What `context:` takes.
 */
export function tokensOf(written: string): number | undefined {
  const m = /^(\d+)([km])?$/i.exec(written.trim());
  if (!m) return undefined;
  const n = Number(m[1]) * (m[2] ? (m[2].toLowerCase() === 'k' ? 1_000 : 1_000_000) : 1);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

/** A context window as `renderStep` writes it, whatever the file said: thousands with `k` when it is a whole number of them, digits otherwise. */
export const contextText = (tokens: number): string =>
  Number.isSafeInteger(tokens) && tokens > 0 && tokens % 1_000 === 0 ? `${tokens / 1_000}k` : String(tokens);

/**
 * `context:` as tokens, refused unless a number of them (`tokensOf`) in the range the step's harness takes (`CONTEXT_WINDOWS`), and on a
 * harness with no such knob. A bare `200` is what Claude Code's own flag reads as thousands, and a person may mean that: the refusal says
 * so, rather than read it either way.
 */
function contextOf(step: string, context: string | undefined, harness: string | undefined): number | undefined {
  if (context === undefined) return undefined;
  const named = `${step}: \`context: ${context}\``;
  const on = harness ?? DEFAULT_HARNESS;
  const range = CONTEXT_WINDOWS[on];
  if (!range) {
    const windowed = HARNESSES.filter((h) => CONTEXT_WINDOWS[h]);
    return refuse(
      `${named} sets the session's context window, and ${on} has no such knob: \`codex exec\` runs on its model's own window, whatever the step says. Delete the line, or run the step on ${windowed.join(' or ')}.`,
    );
  }
  const tokens = tokensOf(context);
  if (tokens === undefined) {
    return refuse(
      `${named} is not a number of tokens. \`context\` is the session's context window, in tokens: digits, or thousands with \`k\` — for example ${CONTEXT_EXAMPLE}.`,
    );
  }
  if (tokens < range.least || tokens > range.most) {
    const thousands = tokens * 1_000 >= range.least && tokens * 1_000 <= range.most && /^\d+$/.test(context.trim());
    return refuse(
      `${named} is ${tokens} tokens, and ${on} takes a window from ${contextText(range.least)} to ${contextText(range.most)} tokens${harness ? '' : ` (there is no \`harness:\` line, so the step runs on ${on})`}.` +
        (thousands
          ? ` For ${tokens} thousand, write \`context: ${tokens}k\`.`
          : ` Give one in that range — ${CONTEXT_EXAMPLE} — or delete the line for the model's whole window.`),
    );
  }
  return tokens;
}

/**
 * The context window a step's sessions run on: its own, or — for a step that continues another's session (`resume:`) — the window that
 * session was started with, since Claude Code's resumed copy keeps only the flags it is given, and one given another window would compact
 * where the session it continues did not. `validate` refuses a `resume:` step whose own `context:` differs; one without the line inherits.
 */
export function sessionContext(
  step: Pick<Workflow, 'name' | 'resume' | 'context'>,
  steps: readonly Pick<Workflow, 'name' | 'resume' | 'context'>[],
): number | undefined {
  const seen = new Set<string>();
  let at: Pick<Workflow, 'name' | 'resume' | 'context'> | undefined = step;
  while (at?.resume && !seen.has(at.name)) {
    seen.add(at.name);
    const next: Pick<Workflow, 'name' | 'resume' | 'context'> | undefined = steps.find((s) => s.name === at!.resume);
    if (!next) break;
    at = next;
  }
  return at?.context;
}

const BUDGET_EXAMPLE = '`budget: 5`, or `budget: 2.50`';

/**
 * Dollars as a person writes them — `5`, `2.50` — or undefined for anything else: digits, and a point with digits after it, above
 * zero. What `budget:` takes, and `wf retry --budget` and `wf round --budget` too.
 */
export function dollarsOf(written: string): number | undefined {
  const value = written.trim();
  const n = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * The reason `codex exec` keeps no budget, in the engine's words (agent-runtime's `codex.refuses`), which `test/vocabulary.test.ts`
 * holds this copy to: a cap there is one nothing reads.
 */
const CODEX_KEEPS_NO_CAP = 'is a spend cap in dollars, and `codex exec` has none: 0.154.0 has no such flag, and reports no cost to cap';

/**
 * Why a `claude --bg` session keeps no budget, in the engine's words (agent-runtime's `claudeCodeRefuses`), which `test/vocabulary.test.ts`
 * holds this copy to.
 */
const BACKGROUND_KEEPS_NO_CAP =
  'a `claude --bg` session does not keep one: Claude Code takes `--max-budget-usd` only with `--print`, and a background session given a $0.01 cap spent $0.19 (2.1.272, measured)';

/**
 * `budget:` as dollars, refused unless an amount above zero (`dollarsOf`), on codex, and beside `background: true`, as the engine refuses a
 * `budgetUsd` there — here, so a folder is refused at `wf start` and not on its first pass. `$5` and `5 USD` are what the author meant, so
 * the refusal writes the amount back without its unit, as `deadlineSeconds: 5m`'s does the arithmetic.
 */
function budgetOf(
  step: string,
  budget: string | undefined,
  harness: string | undefined,
  background: boolean | undefined,
): number | undefined {
  if (budget === undefined) return undefined;
  const named = `${step}: \`budget: ${budget}\``;
  if (harness === 'codex') {
    refuse(
      `${named} ${CODEX_KEEPS_NO_CAP}. Delete the line, or run the step on claude or claude-detached, whose \`claude -p\` ends a session once the step's tries together have cost the budget.`,
    );
  }
  if (background) {
    refuse(
      `${named} is a spend cap, and \`background: true\` runs the step as a background session: ${BACKGROUND_KEEPS_NO_CAP}. Delete \`background: true\` to run the step as a job (\`claude -p\`), which ends its session at the cap, or delete the budget line.`,
    );
  }
  const amount = dollarsOf(budget);
  if (amount !== undefined) return amount;
  const bare = budget.replace(/^\$\s*/, '').replace(/\s*(?:usd|dollars?)$/i, '');
  const unit = dollarsOf(bare) !== undefined;
  return refuse(
    `${named} is not an amount. \`budget\` is the most the step's tries may cost together, in dollars: a number above zero, in digits${unit ? ` with no unit — \`budget: ${bare}\`` : ` — for example ${BUDGET_EXAMPLE}`}.`,
  );
}

/**
 * `gate:` as written: `true`, or refused. `false` is what a step without the line already is, and anything else — `yes`, a step's name — is
 * a word the run would have to interpret. A gate at a step the folder does not gate is said at start: `wf start --gate <step>`.
 */
function gateOf(step: string, gate: string | undefined): true | undefined {
  if (gate === undefined) return undefined;
  if (gate === 'true') return true;
  if (gate === 'false') {
    refuse(
      `${step}: \`gate: false\` is what a step without the line already is. Delete the line: a step has no gate unless it says \`gate: true\`, or a run is started with --gate ${step}.`,
    );
  }
  return refuse(
    `${step}: \`gate: ${gate}\` is not \`true\`. \`gate: true\` holds the step's closeout for a person — wf approve — before anything after it is filed; without the line the step has no gate. To gate one run of the workflow and not every run, delete the line and start it with --gate ${step}.`,
  );
}

/**
 * The words `workspace:` takes. `main`: a step of a git run works in the repository's checkout rather than where the workflow's shape puts
 * it. `folder`: the run is not a git run at all, and the step works in a folder the run makes — the first of the kinds a workspace can be
 * beside git's, which is what a step without the line is.
 */
export const WORKSPACES: readonly string[] = ['main', 'folder'];

/**
 * `workspace:` as written: `main`, `folder`, or refused. A step without the line works where the shape of the workflow puts it
 * (`workspacePlan`) — a worktree of its own, or the one it inherits — and `workspace: worktree` is that said twice, while any other word is
 * a directory the run would have to invent. `main` takes a `check:` only beside `gate: true` — the run executes it on the merge the step
 * stages, and commits that merge onto the base branch on its word; and not on codex, which cannot be denied the commit (`filedDenies`) — and never a `retries:`, since a try of an ending is a person's to ask for. `folder` takes a check and a `resume:` as a worktree does: its folder is the run's, and the session's.
 */
function workspaceOf(
  step: string,
  workspace: string | undefined,
  check: string | undefined,
  resume: string | undefined,
  gate: string | undefined,
  retries: string | undefined,
  harness: string | undefined,
): 'main' | 'folder' | undefined {
  if (workspace === undefined) return undefined;
  if (workspace === 'folder') return 'folder';
  if (workspace === 'worktree') {
    refuse(
      `${step}: \`workspace: worktree\` is what a step without the line already is: the shape of the workflow says which worktree — its own, or the one it continues. Delete the line, or write \`workspace: main\` to run the step in the repository's own checkout.`,
    );
  }
  if (workspace !== 'main') {
    refuse(
      `${step}: \`workspace: ${workspace}\` is not \`main\` or \`folder\`. \`workspace: main\` runs the step in the repository's own checkout, where a person's own work is, rather than in a worktree of the run's: what the last step of a workflow does when it merges. \`workspace: folder\` runs it in a folder the run makes, in a run that needs no git repository. Without the line, the step works where the workflow's shape puts it.`,
    );
  }
  // A check beside it is run by the run on the merge the step leaves staged, and it lands or aborts that merge (`landingDue`): only on a step a
  // person approves first, since the run commits onto the base branch on the check's word, and nothing else may start that.
  if (check !== undefined && gate?.trim() !== 'true') {
    refuse(
      `${step}: \`workspace: main\` runs the step in the repository's own checkout, and \`check: ${check}\` is a command the run executes there on the merge the step leaves staged, committing it onto the base branch when it passes — which only a person's approval may start, and this step has no \`gate: true\`. Add \`gate: true\`, or delete the \`check:\` line.`,
    );
  }
  // The run keeps such a step from committing the merge itself with a deny list (`filedDenies`), and codex takes none.
  if (check !== undefined && harness === 'codex') {
    refuse(
      `${step}: \`workspace: main\` with \`check: ${check}\` has the run commit the merge the step stages once the check passes, and keeps the session from committing it first by denying \`git commit\` — which codex cannot be denied: one shell, fenced by its sandbox, and a sandbox that lets it stage a merge lets it commit one. Run the ending on claude — delete \`harness: codex\` — or delete the \`check:\` line.`,
    );
  }
  // A try of an ending does the act on the base branch again, and only a person asks for one: `wf retry`, never `retries:`.
  if (retries !== undefined) {
    refuse(
      `${step}: \`workspace: main\` runs the step in the repository's own checkout, and \`retries: ${retries}\` would have the run do it again there on its own, on a refusal nobody read. A step that ends a run is tried again on a person's word: wf retry <run> ${step}. Delete the \`retries:\` line.`,
    );
  }
  if (resume !== undefined) {
    refuse(
      `${step}: \`workspace: main\` runs the step in the repository's own checkout, and \`resume: ${resume}\` continues ${resume}'s session, which ran in the worktree ${resume} worked in — the same conversation, in another directory, told none of what this step needs. A step that ends a run starts cold, where the base branch is, and is told which branch to act on. Delete one of the two lines.`,
    );
  }
  return 'main';
}

/** The words `denials:` takes. One: a denied try fails its step's hand-off; without the line, denials are said and decide nothing. */
export const DENIALS: readonly string[] = ['fail'];

/**
 * `denials:` as written: `fail`, or refused — and refused where the run would never read a denial, rather than accepted and never met: on
 * codex, whose `codex exec` records none, and beside `background: true`, whose `claude --bg` session records none (agent-runtime's open
 * issue 28). Only a job, `claude -p` on `claude` or `claude-detached`, says what it was denied.
 */
function denialsOf(
  step: string,
  denials: string | undefined,
  harness: string | undefined,
  background: boolean | undefined,
): 'fail' | undefined {
  if (denials === undefined) return undefined;
  if (denials !== 'fail') {
    refuse(
      `${step}: \`denials: ${denials}\` is not \`fail\`. \`denials: fail\` stops the step when the harness denied its try a call — it reads \`denied\` and waits on a person — rather than passing it on; without the line, what was denied is said beside the step and decides nothing. Write \`denials: fail\`, or delete the line.`,
    );
  }
  if ((harness ?? DEFAULT_HARNESS) === 'codex') {
    refuse(
      `${step}: \`denials: fail\` stops the step on a call the harness denied, and \`codex exec\` records none: its fence is the sandbox, and a call it refuses is said nowhere the run reads — so the line would never stop anything. Run the step on claude — delete \`harness: codex\` — or delete \`denials: fail\`.`,
    );
  }
  if (background) {
    refuse(
      `${step}: \`denials: fail\` stops the step on a call the harness denied, and \`background: true\` runs it as a Claude Code background session (\`claude --bg\`), whose denials are not read (agent-runtime's open issue 28) — so the line would never stop anything. Delete \`background: true\` to run the step as a job (\`claude -p\`), which records each call it was denied, or delete \`denials: fail\`.`,
    );
  }
  return 'fail';
}

/** The file-editing tools whose calls a permission rule names by `Edit(…)`: Claude Code matches a file write against `Edit` rules alone. */
const EDITING_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];

/** The tools whose calls a permission rule names by a path, as `denialOf` in agent-runtime names the call by the path it was given. */
const PATH_TOOLS = ['Read', ...EDITING_TOOLS];

/**
 * Where a denied call was made: the session's own directory (the step's workspace on the run record) and the run's id. A new run works
 * in directories named by its own id — `worktrees/<id>/<step>`, `runs/<id>/…` — so a path offered as denied would name this run's and
 * never match the next's.
 */
export type DeniedAt = { cwd?: string; runId?: string };

/** A call or a rule, `Tool` or `Tool(what)`, split. Pure. */
const callOf = (written: string): { tool: string; what?: string } => {
  const call = /^([^()]+)\((.*)\)$/s.exec(written);
  return call ? { tool: call[1]!, what: call[2]! } : { tool: written };
};

/** A directory as a prefix: no trailing slash. */
const dirOf = (cwd: string): string => cwd.replace(/\/+$/, '');

/**
 * The rule that would allow a denied call, in `allowedTools:`'s words, from the call as the runtime words it (`denialText`: `Bash(pytest)`,
 * `Write(/abs/notes.md)`, `SendMessage`). Pure. Claude Code's rules, which `allowedTools:` is written in (`fileRuleRefusal`):
 *
 *   - a file-editing call is `Edit(…)`, whatever tool made it: Write, MultiEdit and NotebookEdit are matched against `Edit` rules alone,
 *     and `allowedTools:` refuses a path rule on any of them;
 *   - a path in the session's own directory is written from it (`Edit(notes.md)`), as a rule without a leading `/` is read: the next
 *     run's step works in a directory of its own, named by its own id, and an absolute path to this run's would never match it;
 *   - any other absolute path takes a second `/` (`Edit(//abs/notes.md)`): one `/` reads as a path from the settings' folder, not the
 *     root. A part of it that is this run's id is `*`, which matches the next run's: a path under `runs/<id>/artifacts` is offered with `*` for `<id>`;
 *   - a command is `Bash(<its first word>:*)`, since its first word is all the runtime keeps of it (`Bash(pytest)`), and a rule without
 *     `:*` allows that bare word and no command that goes on past it;
 *   - any other call is as it was denied: `Skill(look)`, `SendMessage`.
 *
 * What a person adds to a folder's `allowedTools:` for a new run; nothing here widens the run that was denied, whose `allowedTools:` is frozen.
 */
export function allowRuleOf(denied: string, at: DeniedAt = {}): string {
  const { tool, what } = callOf(denied);
  if (what === undefined) return denied;
  if (tool === 'Bash') return `Bash(${what}:*)`;
  if (!PATH_TOOLS.includes(tool)) return denied;
  return `${EDITING_TOOLS.includes(tool) ? 'Edit' : tool}(${pathRuleOf(what, at)})`;
}

function pathRuleOf(path: string, { cwd, runId }: DeniedAt): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  if (cwd && path.startsWith(`${dirOf(cwd)}/`)) return path.slice(dirOf(cwd).length + 1);
  return `/${
    runId
      ? path
          .split('/')
          .map((part) => (part === runId ? '*' : part))
          .join('/')
      : path
  }`;
}

/**
 * The first of a step's `disallowedTools:` rules that may be what denied a call, or undefined. Pure. A deny beats every allow, so a call one
 * of them denied is denied again in a new run whatever its `allowedTools:` says, and is offered no allow rule (`deniedOffer`). *May*: the
 * runtime keeps a command's first word alone, so `Bash(npm)` denied may be `disallowedTools: Bash(npm run build)` at work, or `npm test` that
 * nothing allowed. A rule on the same tool — any file-editing tool for an `Edit` rule — matches a call when it names nothing, or names
 * that command's first word, or a path pattern the call's path is under (from the root for `//`, from the session's directory for any
 * other; `~` is nobody's here, and matches nothing), or exactly what the call names.
 */
export function disallowedBy(denied: string, disallowedTools: readonly string[], at: DeniedAt = {}): string | undefined {
  const call = callOf(denied);
  return disallowedTools.find((written) => {
    const rule = callOf(written);
    if (rule.tool !== call.tool && !(rule.tool === 'Edit' && EDITING_TOOLS.includes(call.tool))) return false;
    if (rule.what === undefined) return true;
    if (call.what === undefined) return false;
    if (call.tool === 'Bash') {
      const first = rule.what.replace(/:\*$/, '').trim().split(/\s+/)[0];
      return first === call.what || first === '*';
    }
    if (PATH_TOOLS.includes(call.tool)) return pathUnder(rule.what, call.what, at.cwd);
    return rule.what === call.what;
  });
}

/** Whether a path is one a rule's path pattern names, or under one: `**` any depth, `*` and `?` within a part. Pure. */
function pathUnder(pattern: string, path: string, cwd: string | undefined): boolean {
  const target = path.startsWith('/') ? path.replace(/^\/\//, '/') : cwd ? `${dirOf(cwd)}/${path.replace(/^\.\//, '')}` : undefined;
  if (target === undefined || pattern.startsWith('~')) return false;
  const relative = !pattern.startsWith('//');
  if (relative && !cwd) return false;
  const bare = relative ? pattern.replace(/^\.?\//, '') : pattern.slice(1);
  const glob = bare
    .split(/(\*\*|\*|\?)/)
    .map((part) => (part === '**' ? '.*' : part === '*' ? '[^/]*' : part === '?' ? '[^/]' : part.replace(/[.+^${}()|[\]\\]/g, '\\$&')))
    .join('');
  // A relative pattern with no `/` in it names a file at any depth below the directory, as a gitignore line does.
  const from = relative ? `${dirOf(cwd!).replace(/[.+^${}()|[\]\\*?]/g, '\\$&')}/${bare.includes('/') ? '' : '(?:.*/)?'}` : '';
  return new RegExp(`^${from}${glob}(?:/.*)?$`, 's').test(target);
}

/** The words `slot:` takes. One: a run is counted against the cap on runs in flight, or it is one that watches the counted ones. */
export const SLOTS: readonly string[] = ['none'];

/**
 * `slot:` as written: `none`, or refused. There is one thing to say — that this run is not counted against the cap on runs in flight —
 * and a step without the line is counted, as every step of every run is. `false`, `0` and `off` are words the run would have to
 * interpret into that.
 */
function slotOf(step: string, slot: string | undefined): 'none' | undefined {
  if (slot === undefined) return undefined;
  if (slot === 'none') return 'none';
  return refuse(
    `${step}: \`slot: ${slot}\` is not \`none\`. \`slot: none\` keeps this step's run out of the cap on runs in flight (WF_MAX_RUNS), for a workflow of one step that watches the other runs rather than doing a run's work. Without the line, the run waits for a slot and holds one, like every other run.`,
  );
}

function checkOf(step: string, check: string | undefined): string | undefined {
  // Each of these reads as "no check" to a person and as a command to the shell, which cannot find
  // it: exit 127 on every attempt, for a check nobody meant to run.
  if (check !== undefined && ['none', '""', "''"].includes(check)) {
    refuse(
      `${step}: \`check: ${check}\` would run \`${check}\` as a shell command, which exits 127 and fails the step every time. Delete the line — a step without \`check:\` runs no check.`,
    );
  }
  return check;
}

/**
 * The schema an `output:` names, read and refused unless the run can use it.
 *
 * Strict, because the schema is merged into the closeout the step is filed with and Codex refuses a
 * structured output that is not: every object in it lists every property in `required` and sets
 * `additionalProperties: false`. Refused here rather than by the harness at spawn, which is after a
 * run has started and a step has been filed on it.
 */
function outputOf(
  step: string,
  file: string | undefined,
  read: ((file: string) => string | undefined) | undefined,
): StepOutput | undefined {
  if (file === undefined) return undefined;
  const named = `${step}: \`output: ${file}\``;
  // An agent is named by its file, `agents/reviewer.md`; a step by its name, `review`.
  const beside = step.endsWith('.md') ? step : `${step}.md`;
  // Refused before it is read: a folder is what a run freezes and the builder writes back, and a schema outside it is part of the step
  // that neither carries. Read through the api, a file outside it would also answer a refusal with the start of whatever it holds.
  if (path.isAbsolute(file) || path.normalize(file).split(/[\\/]/)[0] === '..') {
    refuse(
      `${named} names a file outside the workflow folder. A schema is part of what the step is judged by, and lives in the folder with it: write it beside ${beside} and name it from there — \`output: ${path.basename(beside, '.md')}.schema.json\` — or delete the line, and the step declares no output.`,
    );
  }
  if (!read)
    refuse(
      `${named} names a file beside the step, and this step was read without its folder. Load it with \`loadWorkflows(<folder>)\`, which reads the file.`,
    );
  const text = read(file);
  if (text === undefined) {
    refuse(
      `${named} is not there. It is a JSON Schema file, relative to the workflow folder — write it beside ${beside}, correct the path, or delete the line and the step declares no output.`,
    );
  }
  let schema: unknown;
  try {
    schema = JSON.parse(text);
  } catch (e) {
    refuse(
      `${named} is not JSON (${(e as Error).message}). It is a JSON Schema: an object with \`"type": "object"\` and the fields the step declares under \`properties\`.`,
    );
  }
  if (!isObject(schema) || schema.type !== 'object' || !isObject(schema.properties) || !Object.keys(schema.properties).length) {
    refuse(
      `${named} is not a schema of fields. Give it \`"type": "object"\` and at least one field under \`properties\` — or delete the line, and the step declares no output.`,
    );
  }
  const extra = Object.keys(schema).filter(
    (k) => !['type', 'properties', 'required', 'additionalProperties', 'title', 'description', '$schema'].includes(k),
  );
  if (extra.length) {
    refuse(
      `${named} sets ${extra.map((k) => `\`${k}\``).join(', ')} beside its fields, and only its \`properties\` are merged into the closeout — the rest would be dropped on the way to the harness. Inline what the fields refer to, and delete the key.`,
    );
  }
  const taken = Object.keys(schema.properties).filter((k) => (CLOSEOUT_FIELDS as readonly string[]).includes(k));
  if (taken.length) {
    refuse(
      `${named} declares ${taken.map((k) => `\`${k}\``).join(', ')}, which every closeout already has. ${CLOSEOUT_FIELDS.map((k) => `\`${k}\``).join(', ')} are the run's, and \`summary\` goes to the person who decides, never to a step. Rename the field.`,
    );
  }
  const loose = looseAt(schema, '');
  if (loose && 'ref' in loose) {
    refuse(
      `${named} uses \`${loose.ref}\` at ${loose.at || 'the top'}. The run checks a schema is strict by reading it, and does not follow references — an object it did not read would reach the harness unchecked. Inline what it points at, and delete \`${loose.ref}\`.`,
    );
  }
  if (loose) {
    refuse(
      `${named} is not strict at ${loose.at || 'the top'}: ${loose.why}. Codex refuses a structured output whose objects do not list every property in \`required\` and set \`"additionalProperties": false\`. A field that may be absent is required and nullable instead — \`"type": ["string", "null"]\`.`,
    );
  }
  return { file, schema: schema as OutputSchema };
}

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/**
 * One thing an agent says it can do, in the A2A protocol's words: its `AgentSkill`, as `specification/a2a.proto` defines it (protocol 1.0,
 * read 2026-09-19) and as the specification's sample card spells it in JSON — camelCase.
 *
 * `id`, `name`, `description` and `tags` are REQUIRED there and are required here. `examples` are the sentences a person would actually
 * type — "use this when…" is one. `inputModes` and `outputModes` are media types, and say nothing an agent's card does not already say by
 * default, so they are written only where they differ. A skill is a description, not a permission: the proto's own comment says skills
 * "represent the abilities of an agent … a more focused set of behaviors that the agent is likely to succeed at". Nothing reads them to
 * decide what a session may touch.
 */
export type AgentSkill = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
};

/** The keys of a SKILL.md's frontmatter its card entry is read from (`skillEntryOf`). The others are Claude Code's, or the run's (`preload`). */
const ENTRY_KEYS = ['name', 'title', 'description', 'tags', 'examples'] as const;
type EntryKey = (typeof ENTRY_KEYS)[number];
/** Of those, the ones whose value is a list of words. */
const ENTRY_LISTS: readonly EntryKey[] = ['tags', 'examples'];

/**
 * The card entry of one composed skill: its `AgentSkill`, read off its SKILL.md's frontmatter (`text`). `id` is the skill's folder, `name` its
 * `title:` — a key Claude Code ignores (F7), for the card alone — or else its frontmatter `name`, or else the id, as Claude Code names a
 * skill; `description` is the frontmatter's, which the A2A protocol and Claude Code's listing both need, so a skill with none is refused;
 * `tags` are the frontmatter's, or the id when it gives none (the protocol marks them REQUIRED, and a skill written for Claude Code alone
 * has none); `examples` only when given. Pure: `file` is what a refusal calls the SKILL.md.
 *
 * Read one line at a time, as the rest of the format is, and not by a YAML parser: each key the card reads is a plain value, one in double
 * quotes (read as JSON), one in single quotes, or a one-line JSON list. Any other form of those keys — a block scalar, a list over several
 * lines — is refused with the one-line form, rather than read as something else; `test/shipped-skills.test.ts` holds this reading to
 * js-yaml's on every shipped and vendored SKILL.md. Keys the card does not read are passed over, whatever their form.
 */
export function skillEntryOf(file: string, id: string, text: string): AgentSkill {
  const { words, list } = entryValuesOf(file, text);
  const description = words('description');
  if (description === undefined) {
    refuse(
      `${file} has no \`description:\`, and the A2A protocol marks a skill's description REQUIRED — Claude Code lists a skill by it too. Write one line saying what it does: \`description: <what it does, one line>\`.`,
    );
  }
  const examples = list('examples');
  return {
    id,
    name: words('title') ?? words('name') ?? id,
    description,
    tags: list('tags') ?? [id],
    ...(examples && { examples }),
  };
}

/** The card keys of a SKILL.md's frontmatter, each read as `skillEntryOf` reads it — one line of text, or a list — and refused as it refuses. */
function entryValuesOf(
  file: string,
  text: string,
): { words: (key: EntryKey) => string | undefined; list: (key: EntryKey) => string[] | undefined } {
  const { block } = splitFrontmatter(file, text);
  if (block === null) {
    refuse(
      `${file} has no frontmatter, and a skill's card entry is read from it: Claude Code lists a skill by its description. Open the file with \`---\`, \`description: <what it does, one line>\` and \`---\`.`,
    );
  }
  const values: Partial<Record<EntryKey, string | string[]>> = {};
  let reading: EntryKey | undefined;
  for (const raw of block.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    // A line that goes on from the one above it: an indented line, or a list's `- item`.
    if (/^\s/.test(raw) || line === '-' || line.startsWith('- ')) {
      if (reading !== undefined) refuse(oneLine(file, reading));
      continue;
    }
    const i = line.indexOf(':');
    const key = i > 0 ? line.slice(0, i).trim() : '';
    reading = (ENTRY_KEYS as readonly string[]).includes(key) ? (key as EntryKey) : undefined;
    if (reading === undefined) continue;
    if (Object.hasOwn(values, reading))
      refuse(`${file}: \`${reading}\` is set twice, and YAML reads no file that says two things. Keep one line.`);
    const value = entryValue(file, reading, line.slice(i + 1).trim());
    if (value !== undefined) values[reading] = value;
  }
  const words = (key: EntryKey): string | undefined => {
    const value = values[key];
    if (Array.isArray(value))
      refuse(
        `${file}: \`${key}\` is one line of text, not a list. Write it so: \`${key}: <${key === 'description' ? 'what it does' : key}>\`.`,
      );
    return value?.trim() || undefined;
  };
  const list = (key: EntryKey): string[] | undefined => {
    const value = values[key];
    if (value === undefined) return undefined;
    const example = key === 'tags' ? '["code", "review"]' : '["Use this when…"]';
    if (!Array.isArray(value))
      refuse(`${file}: \`${key}: ${value}\` is one line of text, and \`${key}\` is a list: \`${key}: ${example}\`.`);
    if (!value.length)
      refuse(
        `${file}: \`${key}\` is an empty list, which says as little as none. Give ${key === 'tags' ? 'a word or two' : 'one'} — \`${key}: ${example}\` — or delete the line${key === 'tags' ? ', and the skill is tagged with its name' : ''}.`,
      );
    return value;
  };
  return { words, list };
}

/**
 * A skill as it is written: what `renderSkill` takes, and what `skillDraftOf` reads off a SKILL.md. `name` is its folder, and the frontmatter's
 * `name:`; `title` the human name its card entry is given (`title:`, which Claude Code ignores); `description` what it does, one line, which
 * Claude Code lists it by; `tags` and `examples` its card entry's, each a list of one-line items; `preload`, whether the run appends it whole to
 * the system prompt, so it is carried on every turn; and `body`, its instructions. A key unset is left out, or `null`.
 */
export type SkillDraft = {
  name: string;
  title?: string | null;
  description?: string | null;
  tags?: readonly string[] | null;
  examples?: readonly string[] | null;
  /** Left out, an edit keeps the line the file has. */
  preload?: boolean;
  body: string;
};

/** The frontmatter keys `renderSkill` writes. Every other key a SKILL.md has is kept as written: Claude Code's, or another tool's. */
const SKILL_WRITES = ['name', 'title', 'description', 'tags', 'examples', 'preload'];

/**
 * The draft of the skill `id` from its SKILL.md's `text`: what the board's form is filled from. Its title, tags and examples as written — none
 * where the file writes none, not the card's fallbacks — and refused, in `skillEntryOf`'s words, where the card reader refuses the file.
 */
export function skillDraftOf(file: string, id: string, text: string): SkillDraft {
  const { words, list } = entryValuesOf(file, text);
  const { description } = skillEntryOf(file, id, text);
  const { body } = splitFrontmatter(file, text);
  return {
    name: id,
    title: words('title') ?? null,
    description,
    tags: list('tags') ?? null,
    examples: list('examples') ?? null,
    preload: frontmatterKey(text, 'preload') === 'true',
    body,
  };
}

/**
 * A skill as its SKILL.md: `name:` its folder, `title:` and `description:` as JSON strings, `tags:` and `examples:` as one-line JSON lists,
 * each only where set; then every other key `was` — the file as it is, on an edit — has, line for line, its lines that go on from it with it;
 * `preload: true` where it is set, or, left out of the draft, where `was` says so; and its instructions. The shape of the skills HKB ships,
 * and what the card reader reads (`skillEntryOf`), which judges the result before it is returned: a draft the reader would refuse — no
 * description, an empty list — is refused here, in its words. Refused before that: a name that is not a skill's (`skillNameRefusal`), and a
 * line break in a value, which would make what follows it a line of its own. Pure.
 */
export function renderSkill(draft: SkillDraft, was?: string): string {
  const named = skillNameRefusal(draft?.name);
  if (named !== undefined) refuse(named);
  const file = `${SKILLS_FOLDER}/${draft.name}/SKILL.md`;
  const oneLine = (key: string, text: string): string => {
    if (/[\r\n]/.test(text))
      refuse(
        `${file}: \`${key}\` holds a line break, and a card reads each of its keys off one line: what follows the break would be read as a line of its own. Write it on one line.`,
      );
    return text;
  };
  const words = (key: 'title' | 'description'): string[] => {
    const value = draft[key] == null ? '' : oneLine(key, String(draft[key]).trim());
    return value ? [`${key}: ${JSON.stringify(value)}`] : [];
  };
  const list = (key: 'tags' | 'examples'): string[] => {
    const value = draft[key];
    if (value == null) return [];
    if (!Array.isArray(value)) refuse(`${file}: \`${key}\` is a list of one-line items, and the draft's is ${JSON.stringify(value)}.`);
    const items = value.map((item) => oneLine(key, String(item).trim())).filter(Boolean);
    return [`${key}: ${JSON.stringify(items)}`];
  };
  const preload = draft.preload ?? (was !== undefined && frontmatterKey(was, 'preload') === 'true');
  const lines = [
    `name: ${draft.name}`,
    ...words('title'),
    ...words('description'),
    ...list('tags'),
    ...list('examples'),
    ...(was === undefined ? [] : keptLines(was)),
    ...(preload ? ['preload: true'] : []),
  ];
  const text = `---\n${lines.join('\n')}\n---\n${String(draft.body ?? '').trim()}\n`;
  skillEntryOf(file, draft.name, text);
  return text;
}

/**
 * The lines of `text`'s frontmatter `renderSkill` does not write, as they are: each other key with the lines that go on from it — an indented
 * line, a list's `- item` — and a comment. None for a file with no frontmatter, or one that never closes.
 */
function keptLines(text: string): string[] {
  let block: string | null;
  try {
    block = splitFrontmatter('', text).block;
  } catch {
    return [];
  }
  const kept: string[] = [];
  let keeping = false;
  for (const raw of (block ?? '').split('\n')) {
    const line = raw.trim();
    if (/^\s/.test(raw) || line === '-' || line.startsWith('- ') || !line) {
      if (keeping) kept.push(raw);
      continue;
    }
    if (line.startsWith('#')) {
      kept.push(raw);
      keeping = false;
      continue;
    }
    const i = line.indexOf(':');
    keeping = !SKILL_WRITES.includes(i > 0 ? line.slice(0, i).trim() : line);
    if (keeping) kept.push(raw);
  }
  while (kept.length && !kept.at(-1)!.trim()) kept.pop();
  return kept;
}

/**
 * `text`, a SKILL.md, with its `preload:` line alone changed: `preload: true` when `on`, and no line when not — each line of its frontmatter
 * that sets the key taken out, with the lines that go on from it, and the body as it was. What the board's switch writes, so a skill whose
 * other keys a render would not keep is changed in that one line. Refused, naming the fix, for a file with no frontmatter; and judged by the
 * reader after (`frontmatterKey`), so a file it would read otherwise is refused rather than written.
 */
export function withPreload(file: string, text: string, on: boolean): string {
  const { block } = splitFrontmatter(file, text);
  if (block === null)
    refuse(
      `${file} has no frontmatter, and \`preload:\` is a line of it. Open the file with \`---\`, \`description: <what it does, one line>\` and \`---\`.`,
    );
  const normal = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const rest = normal.slice(FRONTMATTER.exec(normal)![0].length);
  const lines: string[] = [];
  let dropping = false;
  for (const raw of block.split('\n').slice(0, -1)) {
    const continues = /^\s/.test(raw) || raw.trim() === '-' || raw.trim().startsWith('- ');
    if (!continues) dropping = /^preload\s*:/.test(raw);
    if (!dropping) lines.push(raw);
  }
  if (on) lines.push('preload: true');
  const written = `---\n${lines.map((line) => `${line}\n`).join('')}---\n${rest}`;
  if ((frontmatterKey(written, 'preload') === 'true') !== on) {
    refuse(
      `${file}: its \`preload:\` could not be written so it reads ${on}: a line of its frontmatter sets it where a line of its own would not be read. Edit the file by hand.`,
    );
  }
  return written;
}

/** The refusal of a card key written over more than one line. */
const oneLine = (file: string, key: EntryKey): string =>
  ENTRY_LISTS.includes(key)
    ? `${file}: \`${key}\` is a list written over several lines, and a card reads each of its keys off one line. Write it on one: \`${key}: ${key === 'tags' ? '["code", "review"]' : '["Use this when…"]'}\`.`
    : `${file}: \`${key}\` goes on over several lines, and a card reads each of its keys off one line. Write it on one: \`${key}: "<${key === 'description' ? 'what it does' : key}>"\`.`;

/**
 * One value of a card key, as YAML reads it where the two agree: a plain value, one in double quotes (JSON's escapes, which are YAML's), one in
 * single quotes (`''` a quote), or a one-line list in JSON. Refused: a block scalar, a flow map, an anchor, an alias or a tag, a plain value
 * YAML would read as a map (a colon and a space) and a quote or a list never closed — each with the one-line form. `undefined` for none.
 */
function entryValue(file: string, key: EntryKey, written: string): string | string[] | undefined {
  if (!written) return undefined;
  const form = ENTRY_LISTS.includes(key)
    ? `\`${key}: ${key === 'tags' ? '["code", "review"]' : '["Use this when…"]'}\``
    : `\`${key}: "<${key === 'description' ? 'what it does' : key}>"\``;
  const cannot = (why: string): never => refuse(`${file}: \`${key}: ${written}\` ${why}. Write it on one line, as JSON: ${form}.`);
  if (/^[|>]/.test(written)) return refuse(oneLine(file, key));
  if (written.startsWith('[')) {
    let read: unknown;
    try {
      read = JSON.parse(written);
    } catch {
      return cannot('is not a list a card reads — a list is JSON, on one line, each item in double quotes');
    }
    if (!Array.isArray(read) || read.some((item) => typeof item !== 'string' || !item.trim()))
      return cannot('is not a list of words, each a line of text');
    return (read as string[]).map((item) => item.trim());
  }
  if (written.startsWith('"')) {
    try {
      const read: unknown = JSON.parse(written);
      if (typeof read === 'string') return read;
    } catch {
      /* refused below */
    }
    return cannot('is not one quoted line: a quote inside it is written \\", and nothing follows the closing quote');
  }
  if (written.startsWith("'")) {
    const m = /^'((?:[^']|'')*)'$/.exec(written);
    return m
      ? m[1]!.replace(/''/g, "'")
      : cannot("is not one quoted line: a quote inside it is written '', and nothing follows the closing quote");
  }
  if (/^[{&*!%@`]/.test(written)) return cannot('starts with a character YAML reads as something other than text');
  if (/:(\s|$)/.test(written)) return cannot('holds a colon and a space, which YAML reads as a map, not as text');
  // A ` #` ends a plain value in YAML: what follows is a comment.
  return written.replace(/\s+#.*$/, '');
}

/** Keywords whose value is a schema. `items` may also be an array of them, as older drafts wrote it. */
const ONE_SCHEMA = [
  'items',
  'additionalItems',
  'additionalProperties',
  'unevaluatedItems',
  'unevaluatedProperties',
  'contains',
  'propertyNames',
  'not',
  'if',
  'then',
  'else',
];
/** Keywords whose value is an array of schemas. */
const SCHEMA_LISTS = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];
/** Keywords whose value maps a name to a schema. */
const SCHEMA_MAPS = ['properties', 'patternProperties', 'dependentSchemas', 'dependencies', '$defs', 'definitions'];
/** Keywords that stand for a schema written somewhere else. */
const REFERENCES = ['$ref', '$dynamicRef', '$recursiveRef'];

/**
 * The first object in a schema that is not strict, and why; or the first reference; or `undefined`.
 *
 * Every keyword that holds a schema is read, because an object the walk skips is an object nobody
 * checked. A reference is refused rather than followed: resolving one is a second reading of the
 * schema that can disagree with the harness's, and a `$ref` under a field once carried a loose object
 * past this check to the harness.
 */
function looseAt(node: unknown, at: string): { at: string; why: string } | { at: string; ref: string } | undefined {
  if (!isObject(node)) return undefined;
  const ref = REFERENCES.find((k) => Object.hasOwn(node, k));
  if (ref) return { at, ref };
  const types = Array.isArray(node.type) ? node.type : [node.type];
  if (types.includes('object') || 'properties' in node) {
    const properties = isObject(node.properties) ? Object.keys(node.properties) : [];
    const required = Array.isArray(node.required) ? node.required : [];
    const missing = properties.filter((p) => !required.includes(p));
    const stray = required.filter((r) => !properties.includes(r as string));
    if (missing.length)
      return { at, why: `${missing.map((p) => `\`${p}\``).join(', ')} ${missing.length > 1 ? 'are' : 'is'} not in \`required\`` };
    if (stray.length) return { at, why: `\`required\` names ${stray.map((p) => `\`${String(p)}\``).join(', ')}, which is not a property` };
    if (node.additionalProperties !== false) return { at, why: '`additionalProperties` is not `false`' };
  }
  const below = (k: string) => (at ? `${at}.${k}` : k);
  const children: Array<[string, unknown]> = [];
  for (const k of SCHEMA_MAPS) {
    const map = node[k];
    if (isObject(map))
      for (const [name, v] of Object.entries(map)) children.push([k === 'properties' ? below(name) : below(`${k}.${name}`), v]);
  }
  for (const k of ONE_SCHEMA) {
    const values = k === 'items' && Array.isArray(node.items) ? node.items : [node[k]];
    for (const v of values) children.push([k === 'items' ? `${at}[]` : below(k), v]);
  }
  for (const k of SCHEMA_LISTS) {
    const list = node[k];
    if (Array.isArray(list)) list.forEach((v, i) => children.push([k === 'prefixItems' ? `${at}[]` : `${at}.${k}[${i}]`, v]));
  }
  for (const [where, child] of children) {
    const found = looseAt(child, where);
    if (found) return found;
  }
  return undefined;
}

/**
 * A folder's README, in any case — `readme.md` is the same file to the person who wrote it. It says what the workflow
 * is for, and is never a step: read as one, it would be an agent told the folder's documentation.
 */
export const isReadme = (file: string): boolean => /^readme\.md$/i.test(file);

/**
 * Why `name` cannot be a step's name, or `undefined` when it can. A step is its file, `<name>.md`, in its workflow's folder, and other steps
 * name it in `after:`, `input:`, `resume:` and `loop:`: so a name is one file's in that folder, not hidden, not the README's, and one a list
 * can hold. What `writeWorkflow` refuses a step with before it writes; a folder read from disk has its names from its files already.
 */
export function stepNameRefusal(name: unknown): string | undefined {
  const fix = 'Name it as its file is named, without .md — implement, say.';
  if (typeof name !== 'string' || !name.trim())
    return `A step has no name, and a step is named by its file in the workflow's folder. ${fix}`;
  const as = `\`${name}\` is not a step's name:`;
  if (/[\\/]/.test(name)) return `${as} a step is a file in its workflow's folder, and a slash names a file in another. ${fix}`;
  // oxlint-disable-next-line no-control-regex -- a name holding a control character is refused, so the class must name them
  if (/[\u0000-\u001f\u007f]/.test(name))
    return `${as} it holds a control character — ${JSON.stringify(name)} — which a line of frontmatter cannot. ${fix}`;
  if (name.startsWith('.'))
    return `${as} a name that starts with a dot is a hidden file, which a person listing the folder does not see. ${fix}`;
  if (name !== name.trim())
    return `${as} \`after:\` trims every name it lists, so no step could wait on it. Write it without the spaces around it.`;
  if (name.includes(',')) return `${as} \`after:\` and \`input:\` split on every comma, so no step could wait on it. ${fix}`;
  if (/\.md$/i.test(name)) return `${as} it is a file's name, and a step is named without its .md: \`${name.slice(0, -3)}\`.`;
  if (isReadme(`${name}.md`))
    return `${as} ${name}.md is the folder's README, which says what the workflow is for and is never read as a step. ${fix}`;
  if (new TextEncoder().encode(`${name}.md`).length > 255) return `${as} ${name}.md is longer than a file's name may be, 255 bytes. ${fix}`;
  return undefined;
}

/**
 * The folder of agents, beside the workflows that name them: `agents/`. A workflow may not have its name — `workflowsIn` never lists it, and
 * `loadWorkflows`, `workflowFolder` and `writeWorkflow` refuse it (`agentsFolderRefusal`).
 */
export const AGENTS_FOLDER = 'agents';

/** Where the agents a workflow's steps name are: `agents/`, beside the workflow's folder — `workflows/agents` for `workflows/dev`. */
export const agentsDir = (workflowDir: string): string => path.join(path.dirname(path.resolve(workflowDir)), AGENTS_FOLDER);

/**
 * The folder of skills, beside the agents that give them: `skills/`, each skill a folder of its own holding a `SKILL.md`. No workflow has its
 * name either (`agentsFolderRefusal`).
 */
export const SKILLS_FOLDER = 'skills';

/** Why `dir` is not a workflow because it is the folder of agents or of skills, or `undefined` for a folder with another name. */
export function agentsFolderRefusal(dir: string): string | undefined {
  if (path.basename(path.resolve(dir)) === SKILLS_FOLDER) {
    return `${dir} is ${SKILLS_FOLDER}/, the folder of the skills the agents beside it give — each folder in it is a skill, not a step, so no workflow has its name. Name a workflow beside it, or give yours another name.`;
  }
  if (path.basename(path.resolve(dir)) !== AGENTS_FOLDER) return undefined;
  return `${dir} is ${AGENTS_FOLDER}/, the folder of the agents the workflows beside it name — its files are agents, not steps, so no workflow has its name. Name a workflow beside it, or give yours another name.`;
}

/**
 * The refusal of a file that is a link, where a folder's files are meant to be its own: `what` says whose, and what following it would do.
 * `writeWorkflow`'s words for a linked step, and `loadAgents`' for a linked agent.
 */
export const linkRefusal = (file: string, what: string): string =>
  `${file} is a link, and ${what} Replace the link with a file of its own — remove the link and copy what it pointed at into its place, rm <file> && cp <target> <file> — or take it out of the folder.`;

/** The files of a folder that are steps: every `.md` but its README, sorted. */
export const stepFiles = (entries: readonly string[]): string[] => entries.filter((f) => f.endsWith('.md') && !isReadme(f)).sort();

/**
 * A folder's steps from the text of their files, `[name, text]` a step, checked as a folder on disk is checked: each step parsed, in the order
 * of its file's name as a folder lists them, then the ways the steps do not form a workflow (`validate`), and in the order they run. Pure:
 * `read` answers for a file beside the steps, and `agents` are those `agent:` may name, as `parseWorkflow`'s are.
 *
 * What `loadWorkflows` reads a folder with, and what `writeWorkflow` checks one with before a byte of it is written: one reading, so a folder
 * written is refused for what a folder read would be, in the same words.
 */
export function parseFolder(
  files: ReadonlyArray<readonly [name: string, text: string]>,
  read?: (file: string) => string | undefined,
  agents?: Agents,
  skills?: SkillsFound,
): Workflow[] {
  const byFile = [...files].sort(([a], [b]) => (`${a}.md` < `${b}.md` ? -1 : `${a}.md` > `${b}.md` ? 1 : 0));
  const steps = byFile.map(([name, text]) => parseWorkflow(name, text, read, agents, skills));
  validate(steps);
  return orderSteps(steps);
}

/**
 * The keys an agent file sets: what it is for, in a line; the skills it is given (`skills:`), which are also what its card says it can do and what becomes of Claude Code's own system prompt (`systemPrompt:`); and who does the work and how. A step that names the
 * agent (`agent:`) takes the last of those as its own defaults, and a key it sets itself wins. Everything else a step sets is wiring — where
 * the step sits in its workflow, what it reads, how it is judged and for how long — and belongs on the step: an agent file that sets one is
 * refused by name.
 */
export const AGENT_KEYS = [
  'description',
  'skills',
  'systemPrompt',
  'harness',
  'model',
  'effort',
  'context',
  'permissionMode',
  'sandbox',
  'tools',
  'disallowedTools',
  'allowedTools',
  'remote',
  'output',
] as const;
export type AgentKey = (typeof AGENT_KEYS)[number];
/**
 * The agent keys that are the agent's own and no step's: what it is for, the skills it is given and its system prompt. A step has none of them, so none is a `STEP_KEY`, and code outside the package that reads the role keys leaves them out
 * (`apps/api/src/builder.ts`'s `ROLE_KEYS` and `apps/api/src/agents.ts`'s, off this list; `apps/web/src/lib/agents.ts` by hand).
 */
export const AGENT_OWN_KEYS = ['description', 'skills', 'systemPrompt'] as const;
export type AgentOwnKey = (typeof AGENT_OWN_KEYS)[number];
/** The keys a step takes from its agent: every agent key but its own (`AGENT_OWN_KEYS`). */
export type RoleKey = Exclude<AgentKey, AgentOwnKey>;
const isAgentKey = (key: string): key is AgentKey => (AGENT_KEYS as readonly string[]).includes(key);
const isOwnKey = (key: string): key is AgentOwnKey => (AGENT_OWN_KEYS as readonly string[]).includes(key);

/**
 * What becomes of Claude Code's own system prompt for an agent's steps (`systemPrompt:`): `default` keeps it and appends the agent's
 * instructions after it (`--append-system-prompt-file`, F1); `no-coding` keeps it less its coding instructions, through an output style
 * that says `keep-coding-instructions: false`, and appends them the same (F16, F17); `own` replaces it with them (`--system-prompt-file`,
 * F15). Absent is `default`. Claude Code's alone: codex is handed its instructions in the brief.
 */
export const SYSTEM_PROMPTS = ['default', 'no-coding', 'own'] as const;
export type SystemPrompt = (typeof SYSTEM_PROMPTS)[number];

/** A skill's name: the folder it is, in `skills/`, lowercase words joined by dashes, as Claude Code names one. */
export const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Why `name` cannot be a skill's folder, or `undefined`: what a skill is copied or written under is refused as `skills:` refuses a name. */
export function skillNameRefusal(name: unknown): string | undefined {
  if (typeof name === 'string' && SKILL_NAME.test(name) && name.length <= 64) return undefined;
  const shown = typeof name === 'string' ? `\`${name}\`` : JSON.stringify(name);
  return `${shown} is not a skill's name: a skill is a folder in ${SKILLS_FOLDER}/, named in lowercase words joined by dashes, 64 characters at most, as Claude Code names one — write-a-note, say.`;
}

/**
 * What a skill costs an agent's sessions, in tokens, estimated at four characters a token (the page says "about"): `listed`, its name and
 * description, which Claude Code lists to every session of an agent that gives it; `body`, its SKILL.md's body, which a session reads when
 * it loads the skill — or, for a skill that says `preload: true`, which the run appends to the system prompt, so it is carried on every turn
 * (cached; F14). `perTurn` is what every turn carries: the listing, and the body too when it is preloaded. Pure, and never refuses: a
 * SKILL.md that does not read costs what its text would.
 */
export type SkillCost = { preload: boolean; listed: number; body: number; perTurn: number };

/** Tokens, about: four characters to a token, rounded up. */
export const tokensAbout = (text: string): number => Math.ceil(text.length / 4);

/** `SkillCost` of the skill `id`, from its SKILL.md's `text`. */
export function skillTurnCost(id: string, text: string): SkillCost {
  let block: string | null = null;
  let body = text;
  try {
    ({ block, body } = splitFrontmatter(`${id}/SKILL.md`, text));
  } catch {
    /* read as all body */
  }
  const framed = `---\n${block ?? ''}---\n`;
  const preload = block !== null && frontmatterKey(framed, 'preload') === 'true';
  const description = block === null ? '' : (frontmatterKey(framed, 'description') ?? '').replace(/^(["'])(.*)\1$/, '$2');
  const listed = tokensAbout(`${id}: ${description}`);
  const told = tokensAbout(body);
  return { preload, listed, body: told, perTurn: listed + (preload ? told : 0) };
}

/**
 * Where the skills a workflow's agents name were found: each name, the folder it is (`<place>/skills/<name>`, holding `SKILL.md`) or why it
 * cannot be used — a name two places of one repository both have — and the places looked in, in order, for the refusal of a name none has.
 * `skillsFor` in `workflow-store.ts` reads them.
 */
export type SkillsFound = { at: ReadonlyMap<string, string | WorkflowError>; looked: readonly string[] };

/**
 * The models Claude Code runs in `default` when asked for `auto` (F21, 2.1.282, measured in `docs/spike-2026-09-25-agents-skills.md`): the
 * session starts in `auto`, says `default` from its first turn, and a job denies every call `default` would ask about. Each name as written
 * on a step, or with a date after it (`claude-haiku-4-5-20251001`). A model not measured is let through: this is what is known to fail.
 */
export const AUTO_UNSUPPORTED: readonly string[] = ['haiku', 'claude-haiku-4-5', 'claude-sonnet-4-5'];

/** Whether Claude Code keeps `auto` on `model`: false for one measured to drop it (`AUTO_UNSUPPORTED`), true for its default and any other. */
export const keepsAuto = (model: string | undefined): boolean =>
  model === undefined || !AUTO_UNSUPPORTED.some((m) => model === m || model.startsWith(`${m}-`));

/** The permission mode a Claude Code step is filed with when it names none: the runtime's own (`--permission-mode auto`). */
export const DEFAULT_PERMISSION_MODE = 'auto';

/**
 * An agent: a file in `agents/`, its frontmatter the role keys it sets (`AGENT_KEYS`) and its body its instructions — what every step that
 * names it is told first. `keys` are as written, each judged when the file was read; `read` answers for a file beside the agent, the schema
 * its `output:` names.
 */
export type Agent = {
  name: string;
  description?: string;
  /** The skills its steps are given, by name (`skills:`), each a folder in a `skills/` the load finds (`SkillsFound`). */
  skills?: string[];
  /** What becomes of Claude Code's system prompt, as written (`SYSTEM_PROMPTS`); absent is `default`. */
  systemPrompt?: SystemPrompt;
  keys: Partial<Record<RoleKey, string>>;
  body: string;
  read: (file: string) => string | undefined;
};

/** The agents a folder of workflows has, by name: each read, or why it cannot be — thrown only at a step that names it. */
export type Agents = ReadonlyMap<string, Agent | WorkflowError>;

/**
 * Claude Code's own subagent keys that are not the run's, as its `/agents` wizard and its documentation write them into `.claude/agents/`
 * (2.1.282). `color` is read and ignored: it picks the colour Claude Code shows the subagent's name in and holds nothing back, and the
 * wizard writes it on every file. It is not kept, so the board's save of an agent does not write it back.
 */
export const CLAUDE_CODE_IGNORED: readonly string[] = ['color'];

/**
 * Claude Code's own subagent keys the run refuses, each with what does the work in a run: each changes what a session may do or has, and
 * the run carries none of them to its sessions, so a line read and dropped would be a constraint nobody enforces (as `fileRuleRefusal`).
 */
const CLAUDE_CODE_REFUSED: Record<string, string> = {
  maxTurns: "a run bounds a session by the step's `budget:` and `deadlineSeconds:`, never by a count of turns",
  mcpServers: "a run gives a session no MCP servers of an agent's own; the repository's `.mcp.json` is what its sessions load",
  hooks:
    "a run starts no hooks of an agent's own; hooks go in the repository's `.claude/settings.json`, which its sessions read in a checkout Claude Code trusts",
  memory:
    "a run keeps no memory of an agent's own between sessions: what a step knows is its brief, its workspace and the session it continues",
  isolation: "where a step works is the step's `workspace:` — a worktree of its own unless it says `main` or `folder`",
};

/** Why an agent file may not set `key`, or `undefined` for a key it may. `file` is what the refusal calls it: `agents/<name>.md`. */
function agentKeyRefusal(file: string, key: string): string | undefined {
  // Claude Code's own agent files say their name, and one in `.claude/agents/` is read as it is written (`parseAgent` holds it to the file's).
  if (isAgentKey(key) || key === 'name' || CLAUDE_CODE_IGNORED.includes(key)) return undefined;
  if (key === 'card') return cardRetired(file, 'card');
  if (Object.hasOwn(CLAUDE_CODE_REFUSED, key)) {
    return `${file}: \`${key}\` is Claude Code's own subagent key, and a run does not carry it to its sessions — ${CLAUDE_CODE_REFUSED[key]}. Delete the line to use this agent in a run: a key the run does not read is a constraint nobody enforces.`;
  }
  if (key === 'agent') {
    return `${file}: \`agent\` is a step's key, which attaches an agent to the step, and an agent does not name another. Write here what this agent is told and runs with, or give the step the other agent.`;
  }
  const roles = AGENT_KEYS.join(', ');
  if (isStepKey(key)) {
    return `${file}: \`${key}\` is wiring, and belongs on the step: an agent says who does the work and how — ${roles} — and a step says where it sits in its workflow, what it reads and how it is judged. Move the line to each step that names this agent.`;
  }
  if (Object.hasOwn(REFUSED, key)) return `${file}: an agent may not set \`${key}\` — ${REFUSED[key]}.`;
  return `${file}: \`${key}\` is not a key an agent has. An agent's keys are: ${roles}. Correct the spelling or delete the line — a key the run does not read is a constraint nobody enforces.`;
}

/**
 * One agent, from its file's text: `name` is the file's, minus `.md`. Each value is judged as a step's would be, in the file's name, so a
 * line no step could run with is refused where it is written — a step that sets a key of its own is judged again with it. The body may be
 * empty: an agent that only sets how its steps run.
 */
export function parseAgent(name: string, text: string, read?: (file: string) => string | undefined): Agent {
  const file = `${AGENTS_FOLDER}/${name}.md`;
  const { block, body } = splitFrontmatter(file, text);
  // `color` is Claude Code's alone (`CLAUDE_CODE_IGNORED`): read, and dropped here.
  const {
    meta: { description, skills: listed, systemPrompt: prompt, name: said, color: _, ...written },
    spelled,
  } =
    block === null
      ? { meta: {} as Partial<Record<AgentKey | 'name' | 'color', string>>, spelled: {} }
      : readKeys<AgentKey | 'name' | 'color'>(file, block, (key) => agentKeyRefusal(file, key));
  if (said !== undefined && said !== name) {
    refuse(
      `${file}: \`name: ${said}\` is not the file's name, and an agent is named by its file: a step names this one \`agent: ${name}\`. Write \`name: ${name}\`, or delete the line.`,
    );
  }
  // `skills:` named a card file until 2026-09-25 and `card:` did after it, until agents card 2 generated the card from the skills.
  if (listed !== undefined && isCardFile(listed)) refuse(cardRetired(file, 'skills', listed));
  const keys = codexSandboxNamed(file, written as Partial<Record<RoleKey, string>>, written.harness);
  const step = stepFrom(file, keys, body, read, spelled);
  const skills = skillNamesOf(file, listed);
  const systemPrompt = systemPromptOf(file, prompt);
  if (systemPrompt === 'own' && !body.trim()) {
    refuse(
      `${file}: \`systemPrompt: own\` puts the agent's instructions in place of Claude Code's system prompt, and this agent has none: its sessions would start with no system prompt at all. Write its instructions below the frontmatter, or delete the line.`,
    );
  }
  const composed = composedRefusal(file, skills, systemPrompt, step);
  if (composed !== undefined) refuse(composed);
  return {
    name,
    ...(description !== undefined && { description }),
    ...(skills !== undefined && { skills }),
    ...(systemPrompt !== undefined && { systemPrompt }),
    keys,
    body,
    read: read ?? (() => undefined),
  };
}

/** Whether a `skills:` value is a card's file, as the line named one until 2026-09-25: one `.json` file. No skill's name ends so. */
export const isCardFile = (value: string): boolean => !value.includes(',') && /\.json$/i.test(value.trim());

/**
 * The refusal of a card file an agent still names — by `card:`, or by a `skills:` line written before 2026-09-25 — since agents card 2
 * generated the card from the agent's skills (`cardSkills` in `workflow-store.ts`). Refused rather than read and dropped: a line the run
 * reads and ignores is a constraint nobody enforces, and a person editing that file would see no change on the card.
 */
export function cardRetired(file: string, key: 'card' | 'skills', named?: string): string {
  const line = named === undefined ? `\`${key}\`` : `\`${key}: ${named}\``;
  const it = named === undefined ? 'the file it names' : named;
  return `${file}: ${line} names a card file, which is retired: since agents card 2 an agent's card is generated from its \`skills:\`, an entry for each skill made from its SKILL.md's frontmatter (its \`title:\` or \`name:\`, \`description:\`, \`tags:\` and \`examples:\`), and from the agent's own \`description:\` when it has none. Delete the line, and ${it} beside the agent; to say what the agent can do, give it skills.`;
}

/** `skills:` as the names it lists, refused unless each is a skill's name (`SKILL_NAME`), once. */
function skillNamesOf(file: string, written: string | undefined): string[] | undefined {
  if (written === undefined) return undefined;
  const named = `${file}: \`skills: ${written}\``;
  const shape =
    "Each is a skill's name — its folder in skills/, lowercase words joined by dashes — comma-separated: `skills: review-a-change, write-a-note`.";
  const names = written
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!names.length) refuse(`${named} names no skill. ${shape}`);
  const odd = names.find((n) => !SKILL_NAME.test(n));
  if (odd) refuse(`${named} has \`${odd}\`, which is not a skill's name. ${shape}`);
  const twice = names.find((n, i) => names.indexOf(n) !== i);
  if (twice) refuse(`${named} names \`${twice}\` twice. Name it once.`);
  return names;
}

/** `systemPrompt:` as one of `SYSTEM_PROMPTS`, refused otherwise. */
function systemPromptOf(file: string, written: string | undefined): SystemPrompt | undefined {
  if (written === undefined) return undefined;
  if ((SYSTEM_PROMPTS as readonly string[]).includes(written)) return written as SystemPrompt;
  return refuse(
    `${file}: \`systemPrompt: ${written}\` is not one of ${SYSTEM_PROMPTS.join(', ')}. \`default\` keeps Claude Code's system prompt and appends the agent's instructions after it; \`no-coding\` keeps it less its coding instructions; \`own\` replaces it with the agent's instructions. Without the line, it is \`default\`.`,
  );
}

/**
 * Why an agent's skills or system prompt cannot reach the sessions of a step that runs as `step` does — its harness, tools and deny list —
 * or `undefined`. `named` says whose: the agent's file, or a step that names it. Asked of the agent as its file sets them (`parseAgent`), and
 * again of each step that names it once its own keys are merged (`parseWorkflow`), since a step's `tools:`, `disallowedTools:` or `harness:`
 * can take away what the agent's allowed.
 */
function composedRefusal(
  named: string,
  skills: readonly string[] | undefined,
  systemPrompt: SystemPrompt | undefined,
  step: Pick<Workflow, 'harness' | 'tools' | 'disallowedTools' | 'resume'>,
): string | undefined {
  const listed = skills?.length ? `\`skills: ${skills.join(', ')}\`` : undefined;
  // A session continued keeps the system prompt it was started with, and the plugins with it (F13): what this agent gives would reach nothing.
  if (step.resume && (listed || (systemPrompt ?? 'default') !== 'default')) {
    return `${named}: ${listed ?? `\`systemPrompt: ${systemPrompt}\``} shapes the system prompt of a session the step starts, and \`resume: ${step.resume}\` continues ${step.resume}'s, which keeps the system prompt it was started with (F13): it would reach nothing. Name an agent without it, or delete \`resume:\`.`;
  }
  if (isRemoteHarness(step.harness)) {
    if (listed)
      return `${named}: ${listed} gives Claude Code skills from a plugin directory of the step's own, and \`harness: ${step.harness}\` is a remote A2A agent, which has the skills its operator gave it — its card says which — and loads none of ours. Delete the line, or run the step on claude.`;
    if (systemPrompt !== undefined)
      return `${named}: \`systemPrompt: ${systemPrompt}\` shapes Claude Code's system prompt, and \`harness: ${step.harness}\` is a remote A2A agent, which keeps its own: the agent's instructions are sent in the brief. Delete the line, or run the step on claude.`;
    return undefined;
  }
  if (step.harness === 'codex') {
    if (listed)
      return `${named}: ${listed} gives Claude Code skills from a plugin directory of the step's own, and codex loads none: it is handed its instructions in the brief. Run it on claude, or delete the line.`;
    if (systemPrompt !== undefined && systemPrompt !== 'default')
      return `${named}: \`systemPrompt: ${systemPrompt}\` shapes Claude Code's system prompt, and codex is handed its instructions in the brief, beside its own. Run it on claude, or delete the line.`;
    return undefined;
  }
  if (!listed) return undefined;
  const why =
    'the tool a session loads a skill with: Claude Code gives a session only what its tools allow, and a skill it cannot load is a name in its prompt and nothing more (F11, measured)';
  if (step.tools !== undefined && !step.tools.includes('Skill')) {
    return `${named}: ${listed} gives the agent skills, and \`tools: ${step.tools.join(', ')}\` has no \`Skill\`, ${why}. Add \`Skill\` to \`tools:\`, or delete \`skills:\`.`;
  }
  if (step.disallowedTools?.includes('Skill')) {
    return `${named}: ${listed} gives the agent skills, and \`disallowedTools: ${step.disallowedTools.join(', ')}\` denies \`Skill\`, ${why}. Take \`Skill\` off the deny list, or delete \`skills:\`.`;
  }
  return undefined;
}

/**
 * An agent as it is written back: what `renderAgent` takes, and what `parseAgent` reads — its name, the file's, its description, its keys as
 * written (`200k`, `Read, Grep`), and its instructions. A key unset is left out, or `null`.
 */
export type AgentDraft = {
  name: string;
  description?: string | null;
  /** The skills it is given, as written: `review-a-change, write-a-note`. */
  skills?: string | null;
  systemPrompt?: string | null;
  keys: Partial<Record<RoleKey, string | null>>;
  body: string;
};

/**
 * An agent as its file: the frontmatter, its own lines first (`AGENT_OWN_KEYS`) and then each role key it sets, in `AGENT_KEYS`' order, as written; then its
 * instructions. The inverse of `parseAgent`: an agent it read renders to a file it reads back as the same agent, which
 * `test/write-agent.test.ts` holds over every shipped agent. Pure. A file's comments are not on the agent, so a render has none.
 *
 * As `renderStep`, it judges nothing the parser judges: a value the parser would refuse is written as given, and `writeAgent` parses what it
 * rendered before it writes. Refused here is only what a file cannot hold: a key an agent may not set — `agent:`, a step's wiring, one no
 * agent has — in the parser's words (`agentKeyRefusal`), since it would be written and then refused, or dropped; one of its own lines
 * among the keys, where it would be written twice; a card file, retired by agents card 2 (`cardRetired`), sent as `card` or as `skills:`, from a
 * page drawn before; and a line break in a value, which would make what follows it a line of its own — a key, even.
 */
export function renderAgent(draft: AgentDraft): string {
  const file = `${AGENTS_FOLDER}/${draft.name}.md`;
  const keys = (draft.keys ?? {}) as Record<string, string | null | undefined>;
  for (const key of Object.keys(keys)) {
    if (keys[key] == null) continue;
    if (key === 'name')
      refuse(`${file}: \`name\` is the agent's file, and it is written as the draft's name — not a key. Give it as the name.`);
    if (isOwnKey(key))
      refuse(
        `${file}: \`${key}\` is the agent's own line, not one of its role keys — give it as the ${key === 'description' ? 'description' : key === 'skills' ? 'skills' : 'system prompt'}, once.`,
      );
    if (Object.hasOwn(FORMER_KEYS, key)) refuse(formerKeyWritten(file, key));
    const refused = agentKeyRefusal(file, key);
    if (refused !== undefined) refuse(refused);
  }
  if (keys.harness === 'codex' && keys.permissionMode != null && formerSandbox(keys.permissionMode) !== undefined)
    refuse(codexModeWritten(file, keys.permissionMode));
  // A card file is what a page drawn before agents card 2 sends — as `card`, or as `skills:` from before 2026-09-25 — and is written nowhere now.
  const sent = (draft as { card?: unknown }).card;
  if (sent != null)
    refuse(
      `${cardRetired(file, 'card', typeof sent === 'string' ? sent : JSON.stringify(sent))} A page open since before then sends it: reload it, and save again.`,
    );
  if (draft.skills != null && isCardFile(String(draft.skills))) {
    refuse(`${cardRetired(file, 'skills', String(draft.skills))} A page open since before then sends it: reload it, and save again.`);
  }
  const own: Record<AgentOwnKey, string | null | undefined> = {
    description: draft.description,
    skills: draft.skills,
    systemPrompt: draft.systemPrompt,
  };
  const values: Array<[string, string | null | undefined]> = AGENT_KEYS.map((key) => [key, isOwnKey(key) ? own[key] : keys[key]]);
  const lines = values.flatMap(([key, value]) => {
    if (value == null) return [];
    const text = String(value);
    if (/[\r\n]/.test(text))
      refuse(
        `${file}: \`${key}\` holds a line break, and a frontmatter line is one key and its value: what follows the break would be read as a line of its own. Write it on one line.`,
      );
    return [`${key}: ${text}`];
  });
  const body = String(draft.body ?? '').trim();
  if (lines.length) return `---\n${lines.map((line) => `${line}\n`).join('')}---\n${body}\n`;
  return /^---[ \t]*(?:\n|$)/.test(body) ? `---\n\n---\n${body}\n` : body ? `${body}\n` : '';
}

/**
 * A local agent described in the A2A protocol's terms — its name, what it is for, what it can do — and **not** an A2A Agent Card. Protocol
 * 1.0, read at the source on 2026-09-19: `specification/a2a.proto` in a2aproject/A2A, and the specification's Agent Card section.
 *
 * The protocol marks `supported_interfaces` REQUIRED: it is the list of URLs and bindings a client would call the agent at. Nothing here
 * serves this agent over A2A, so there is no URL to give, and this leaves the field out rather than give an address that does not answer. A
 * document missing a REQUIRED field is not a valid `AgentCard`, so everything that prints this says so in the same breath (`wf agents card`
 * on stderr, the api's `servedOverA2A: false`), and `test/agent-card.test.ts` pins the omission: the slice that serves a card deletes it
 * deliberately.
 *
 * `provider`, `documentationUrl`, `iconUrl`, `securitySchemes`, `security` and `signatures` are left out for the same reason — nothing here
 * fills them honestly. `capabilities` in A2A are protocol features, not reach: streaming, push notifications, an extended card. None of the
 * three exists here, so all three are false. What an agent can do is its card's `skills`: an entry for each skill `skills:` gives its sessions,
 * read off the skill's SKILL.md (`skillEntryOf`), or one made from the agent's own description when it gives none (`ownSkill`).
 */
export type AgentCardShape = {
  name: string;
  description: string;
  version: string;
  capabilities: { streaming: boolean; pushNotifications: boolean; extendedAgentCard: boolean };
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: AgentSkill[];
};

/**
 * The card-shaped description of `agent`, at `version` — what `wf agents card` prints and the api answers with, one builder so the two can
 * never disagree. Pure. The JSON is spelled as the specification's sample card spells it, camelCase.
 *
 * `defaultInputModes` is `text/plain`: a step is handed a composed brief and nothing else. `defaultOutputModes` is `application/json`: every
 * closeout is a JSON object. An agent's `output:` names a JSON Schema, and A2A describes an output's *media type*, never its schema — there
 * is no field for it, so it contributes the media type and nothing more.
 *
 * `skills` are the card's entries, generated from the skills the agent is given (`cardSkills` in `workflow-store.ts`, which reads their
 * SKILL.md files). Refused, rather than printed hollow: an agent with no `description:`, and a card with no entry, both of which the protocol
 * marks REQUIRED.
 */
export function agentCard(agent: Agent, version: string, skills: readonly AgentSkill[]): AgentCardShape {
  const named = `${AGENTS_FOLDER}/${agent.name}.md`;
  if (!agent.description?.trim()) refuse(noDescription(agent.name));
  if (!skills.length) {
    refuse(
      `${named}: its card has no skills, and the A2A protocol marks a card's skills REQUIRED. They are generated: an entry for each skill its \`skills:\` gives, or one made from its own description when it gives none (\`cardSkills\`).`,
    );
  }
  return {
    name: agent.name,
    description: agent.description.trim(),
    version,
    capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['application/json'],
    skills: [...skills],
  };
}

/** The refusal of a card for an agent with no `description:`. */
const noDescription = (name: string): string =>
  `${AGENTS_FOLDER}/${name}.md has no \`description:\`, and the A2A protocol marks a card's description REQUIRED. Write one line saying when to attach this agent to a step.`;

/**
 * The one card entry of an agent given no skills, made from its own description: its id and name the agent's, its tags the agent's name, as
 * a skill with no tags is tagged with its own. Refused for an agent with no `description:`, which the entry and the card both need.
 */
export function ownSkill(agent: Pick<Agent, 'name' | 'description'>): AgentSkill {
  const description = agent.description?.trim();
  if (!description) refuse(noDescription(agent.name));
  return { id: agent.name, name: agent.name, description, tags: [agent.name] };
}

/**
 * Why `name` cannot be an agent's name, or `undefined` when it can. An agent is its file, `agents/<name>.md`, and a step names it with
 * `agent: <name>`: so a name is one file's in that folder, not hidden, not the README's, and one a line of frontmatter can hold.
 */
export function agentNameRefusal(name: unknown): string | undefined {
  const fix = 'Name it as its file is named, without .md — reviewer, say.';
  if (typeof name !== 'string' || !name.trim())
    return `An agent has no name, and an agent is named by its file in ${AGENTS_FOLDER}/. ${fix}`;
  const as = `\`${name}\` is not an agent's name:`;
  if (/[\\/]/.test(name)) return `${as} an agent is a file in ${AGENTS_FOLDER}/, and a slash names a file in another folder. ${fix}`;
  // oxlint-disable-next-line no-control-regex -- a name holding a control character is refused, so the class must name them
  if (/[\u0000-\u001f\u007f]/.test(name))
    return `${as} it holds a control character — ${JSON.stringify(name)} — which a line of frontmatter cannot. ${fix}`;
  if (name.startsWith('.'))
    return `${as} a name that starts with a dot is a hidden file, which a person listing ${AGENTS_FOLDER}/ does not see. ${fix}`;
  if (name !== name.trim())
    return `${as} \`agent:\` is trimmed as it is read, so no step could name it. Write it without the spaces around it.`;
  if (/\.md$/i.test(name)) return `${as} it is a file's name, and an agent is named without its .md: \`${name.slice(0, -3)}\`.`;
  if (isReadme(`${name}.md`))
    return `${as} ${AGENTS_FOLDER}/${name}.md is the folder's README, which says what the agents are for and is never read as one. ${fix}`;
  if (new TextEncoder().encode(`${name}.md`).length > 255) return `${as} ${name}.md is longer than a file's name may be, 255 bytes. ${fix}`;
  return undefined;
}

/**
 * The value a file's frontmatter gives `key`, read as the parser reads it — each line trimmed, the key trimmed before its colon — or
 * `undefined` for a file with no such line, or whose frontmatter never closes (the parser refuses it). `agent : coder` names `coder`.
 */
export function frontmatterKey(text: string, key: string): string | undefined {
  let block: string | null;
  try {
    block = splitFrontmatter('', text).block;
  } catch {
    return undefined;
  }
  for (const raw of (block ?? '').split('\n')) {
    const line = raw.trim();
    const i = line.indexOf(':');
    if (line.startsWith('#') || i <= 0 || line.slice(0, i).trim() !== key) continue;
    return line.slice(i + 1).trim() || undefined;
  }
  return undefined;
}

/** The former key names (`FORMER_KEYS`) a file's frontmatter still uses, in the order it uses them — none for a file whose frontmatter never closes. */
export function formerKeysIn(text: string): string[] {
  let block: string | null;
  try {
    block = splitFrontmatter('', text).block;
  } catch {
    return [];
  }
  return (block ?? '').split('\n').flatMap((raw) => {
    const line = raw.trim();
    const i = line.indexOf(':');
    const key = i > 0 && !line.startsWith('#') ? line.slice(0, i).trim() : '';
    return Object.hasOwn(FORMER_KEYS, key) ? [key] : [];
  });
}

/** What `wf start` says of a file that still writes a key under its former name: that it is still read, as what, and what to write. The one writer of it. */
/**
 * Why a former name is not written: read from a file, it is never put in one (`renderStep`, `renderAgent`). What sends one is a form drawn
 * before the key was renamed — a board page left open across the change — and its save is refused rather than written under a name the
 * file would then carry on.
 */
const formerKeyWritten = (file: string, former: string): string =>
  `${file}: \`${former}\` is \`${FORMER_KEYS[former]}\`'s former name, which a file written before 2026-09-23 may still say but nothing writes. Send \`${FORMER_KEYS[former]}\` — a page open since before then sends the former name: reload it, and save again.`;

/**
 * Why a codex `permissionMode` that names a sandbox (`formerSandbox`) is not written, as `formerKeyWritten` says of a former name: read from a
 * file, it is `sandbox:` on the step (`codexSandboxNamed`), and nothing puts it in one — `renderStep`, `renderAgent`, and `writeWorkflow` for a
 * step whose harness is its agent's. What sends one is a form drawn before the key was Codex's own, or a step moved onto codex that kept its
 * Claude Code mode, `bypassPermissions`. Any other word is no sandbox, written as given, and refused by the parser in words naming `sandbox:`.
 */
export const codexModeWritten = (file: string, word: string): string =>
  `${file}: \`permissionMode: ${word}\` on a step that runs on codex is what \`sandbox:\` was called there until ${SANDBOX_SINCE}, which a file written before may still say but nothing writes. Send \`sandbox: ${sandboxNamed(word)}\` instead: a page open since before then sends the former name — reload it, and save again; and a step moved onto codex from Claude Code keeps its permission mode — clear it, and set the sandbox.`;

/** What `wf start` says of a file whose codex step or agent still names its sandbox as `permissionMode:`. The one writer of it. */
export const codexModeLine = (file: string, word: string): string =>
  `${file}: \`permissionMode: ${word}\` is read as \`sandbox: ${sandboxNamed(word)}\`, Codex's own name for its sandbox, which a codex step says since ${SANDBOX_SINCE}. The former line is still read; rename it, or save the file from the board, which writes \`sandbox:\`.`;

export const formerKeyLine = (file: string, former: string): string =>
  `${file}: \`${former}:\` is read as \`${FORMER_KEYS[former]}:\`, Claude Code's name for it, which the key took on 2026-09-23. The former name is still read; rename the line, or save the file from the board, which writes the new name.`;

/**
 * What a workflow is for, in its author's words, from the text of its folder's README: the first paragraph, its lines joined into one.
 *
 * A heading is the README's title, not a paragraph, and a frontmatter block is not prose, so both are passed over. Null when the README has
 * nothing else. Pure: `workflowDescription` (`workflow-store.ts`) reads the README and asks this.
 */
export function readmeDescription(text: string): string | null {
  text = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(FRONTMATTER, '');
  for (const block of text.split(/\n[ \t]*\n/)) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !/^#{1,6}(\s|$)/.test(line));
    if (lines.length) return lines.join(' ');
  }
  return null;
}

/** Whether a team works in folders the run makes, with no git repository (`workspace: folder`): every step says it, or none does (`validate`). */
export const isFolderTeam = (steps: readonly Pick<Workflow, 'workspace'>[]): boolean =>
  steps.length > 0 && steps.every((s) => s.workspace === 'folder');

/**
 * The ways a folder of markdown is not a workflow: a step waits on one that does not exist, the steps
 * wait on each other, or a step reads the output of one that has not finished or declares none. All
 * are caught here, before anything is spent.
 */
export function validate(steps: readonly Workflow[]): void {
  const names = new Set(steps.map((s) => s.name));
  for (const s of steps) {
    for (const a of s.after) {
      if (!names.has(a)) throw new WorkflowError(`${s.name}: waits on "${a}", which is not a step here`);
      if (a === s.name) throw new WorkflowError(`${s.name}: waits on itself`);
    }
    for (const from of s.input ?? []) {
      const producer = steps.find((x) => x.name === from);
      if (!producer)
        throw new WorkflowError(`${s.name}: \`input: ${from}\` names a step that is not here. Correct the name, or delete the line.`);
      // Directly, or through `resume` — which the parser has already added to `after`.
      if (!s.after.includes(from) && s.resume !== from) {
        throw new WorkflowError(
          `${s.name}: \`input: ${from}\`, but ${s.name} does not wait on ${from} — a step cannot read the product of work that has not finished. Add ${from} to \`after:\`, or delete the line.`,
        );
      }
      if (!producer.output) {
        throw new WorkflowError(
          `${s.name}: \`input: ${from}\`, but ${from} declares no \`output:\`, so nothing of its closeout travels — its summary goes to the person who decides, never to a step. Give ${from}.md an \`output:\` schema, or delete the line.`,
        );
      }
    }
    if (s.resume) {
      const target = steps.find((x) => x.name === s.resume);
      if (!target) throw new WorkflowError(`${s.name}: resumes "${s.resume}", which is not a step here`);
      // A session belongs to the harness that made it. Continuing it from another is not resuming,
      // it is a different agent claiming someone else's memory.
      if ((target.harness ?? 'claude') !== (s.harness ?? 'claude')) {
        throw new WorkflowError(`${s.name}: resumes ${target.name}, which runs on a different harness (${target.harness ?? 'claude'})`);
      }
      // One window for a session's whole chain: the continuation is filed with the one its session was started with (`sessionContext`).
      const window = sessionContext(target, steps);
      if (s.context !== undefined && s.context !== window) {
        throw new WorkflowError(
          `${s.name}: \`context: ${contextText(s.context)}\`, and it continues ${target.name}'s session, which runs on ${window === undefined ? "the model's whole window" : `\`context: ${contextText(window)}\``}. A session keeps one window: delete the line, and ${s.name} continues on ${target.name}'s${window === undefined ? '' : `, or give ${target.name} the window you meant for both`}.`,
        );
      }
    }
  }

  validateFolder(steps);
  validateFolderMode(steps);
  validateMainWorkspace(steps);
  validateSlot(steps);

  // Kahn's algorithm: if anything is left when nothing else can be removed, it is a cycle.
  const pending = new Map(steps.map((s) => [s.name, new Set(s.after)]));
  for (let moved = true; moved;) {
    moved = false;
    for (const [name, deps] of pending) {
      if (deps.size === 0) {
        pending.delete(name);
        for (const other of pending.values()) other.delete(name);
        moved = true;
      }
    }
  }
  if (pending.size) throw new WorkflowError(`these steps wait on each other: ${[...pending.keys()].sort().join(', ')}`);

  validateLoops(steps);
}

/**
 * The ways a step cannot run in the repository's own checkout (`workspace: main`): it is not the workflow's last step.
 *
 * The checkout is where a person's work is, and it is one directory, on the base branch. A step after this one would start from a
 * checkout this one has changed, and a step running beside it would share that directory — the arrangement worktrees exist to prevent.
 * So a workflow has one such step, at its end, and it is refused here rather than at the moment two sessions collide.
 */
function validateMainWorkspace(steps: readonly Workflow[]): void {
  for (const s of steps.filter((x) => x.workspace === 'main')) {
    const named = `${s.name}: \`workspace: main\` runs the step in the repository's own checkout`;
    const waiting = steps.filter((x) => x.after.includes(s.name)).map((x) => x.name);
    if (waiting.length) {
      throw new WorkflowError(
        `${named}, and ${waiting.join(', ')} ${waiting.length > 1 ? 'wait' : 'waits'} on it — each would start from a checkout this step has changed, and none of them is where the run's work is. It is a workflow's last step: nothing may wait on it. Move ${waiting.join(', ')} before ${s.name}, or delete the line.`,
      );
    }
    const beside = steps.filter((x) => x.name !== s.name && !steps.some((other) => other.after.includes(x.name))).map((x) => x.name);
    if (beside.length) {
      throw new WorkflowError(
        `${named}, and ${beside.join(', ')} ${beside.length > 1 ? 'end' : 'ends'} the workflow beside it, so both could be working in that one directory at once. A run has one ending: make ${s.name} wait on ${beside.join(', ')}, or delete the line.`,
      );
    }
  }
}

/**
 * The one way a team cannot work in folders (`workspace: folder`): some of its steps do not say so.
 *
 * A run is of one kind — a git run, whose steps work on branches of one repository, or a folder run, which needs no repository — and the
 * kind is the run's, frozen on its record at start (`place`). A step without the line is a git step, so a team that says it on some steps
 * and not on others would be both. Refused, rather than one of the two guessed.
 */
function validateFolder(steps: readonly Workflow[]): void {
  const folder = steps.filter((s) => s.workspace === 'folder').map((s) => s.name);
  const not = steps.filter((s) => s.workspace !== 'folder').map((s) => s.name);
  if (!folder.length || !not.length) return;
  throw new WorkflowError(
    `${folder.join(', ')} ${folder.length > 1 ? 'say' : 'says'} \`workspace: folder\`, and ${not.join(', ')} ${not.length > 1 ? 'do' : 'does'} not — every step of a team says workspace: folder, or none does.` +
      ` A run works in folders it makes, with no git repository, or on branches of one: it cannot do both. Add the line to ${not.join(', ')}, or delete it from ${folder.join(', ')}.`,
  );
}

/**
 * The permission modes in which a Claude Code background session (`claude --bg`) never stops to ask a person: `dontAsk`, which denies what
 * it is not given and lets the session read the refusal and carry on, and `bypassPermissions`, which allows everything. Every other mode
 * asks, `auto` — the engine's default, and what a step that names no mode runs in — among them.
 */
const BACKGROUND_UNASKING = ['dontAsk', 'bypassPermissions'] as const;
const DEFAULT_MODE = 'auto';

/**
 * The way a step of a folder team cannot be run: as a background session in a permission mode that can stop and ask.
 *
 * Measured, on Claude Code 2.1.278, in folders no settings file had ever named. A fenced `--bg` session whose first act is anything
 * outside its own directory — reading the run's artifacts directory beside it, or the store, to learn what it is writing about — is
 * asked to approve it, and nobody is there: `claude agents` reads it `blocked`, `waitingFor: 'permission prompt'`, and it waits for
 * ever. The shipped `note` team's first live run sat that way for thirty-one minutes in `acceptEdits`, and a session in `auto` sat the
 * same way for as long as it was watched. In `dontAsk` the same call is denied with no prompt, the session is told so, and it carries
 * on — measured beside it, on `--bg`, in the same kind of folder.
 *
 * A job waits on nobody, in any mode (agent-runtime's open issue 28, M1, Claude Code 2.1.280): `claude -p` in `auto`, `dontAsk`,
 * `default` and `acceptEdits`, in folders under `/tmp`, told to write outside its folder, run a command and fetch a page, was denied
 * each call it could not make, carried on and exited on its own. So a step run as a job — every `claude` step without `background: true`,
 * every `claude-detached` one — is not judged on this, and neither is a codex step: `codex exec` has one shell, fenced by the sandbox its
 * `sandbox:` names, and asks nobody in any of them. So the modes that ask nobody are Claude Code's, and a harness's own: Codex has no
 * permission mode to judge (`permissionMode:` is refused there), and `background: true` is refused on any harness but claude. What is judged is the one way left to ask: a `background: true` step.
 *
 * A git run's steps work in a checkout a person has opened and trusted, with settings of its own; a folder run's do not, and there is
 * nobody to answer. So this is refused for folder teams only, at load, where every start — a brief, an inbox card, a queued card, the
 * api — passes. It costs the step what `dontAsk` denies, which is everything not allowed: that is what `allowedTools:` gives back, scoped to the
 * step's own folder (`Edit(**)`).
 */
function validateFolderMode(steps: readonly Workflow[]): void {
  if (!isFolderTeam(steps)) return;
  const asking = steps.find((s) => s.background && !(BACKGROUND_UNASKING as readonly string[]).includes(s.permissionMode ?? DEFAULT_MODE));
  if (!asking) return;
  const mode = asking.permissionMode
    ? `\`permissionMode: ${asking.permissionMode}\` can stop and ask a person to approve something`
    : `it sets no \`permissionMode:\`, so it runs on the engine's default, \`${DEFAULT_MODE}\`, which can stop and ask a person to approve something`;
  throw new WorkflowError(
    `${asking.name}: \`workspace: folder\` works in a folder nobody has opened, \`background: true\` runs the step as a background session, and ${mode}` +
      ' — a read or a write outside the folder can, and an unattended background session then waits for ever (the first live run of a folder team sat thirty-one minutes so, on Claude Code 2.1.278).' +
      ` Delete \`background: true\`, and the step runs as a job, which asks nobody in any mode; or write \`permissionMode: ${BACKGROUND_UNASKING[0]}\`, which denies such a call with no prompt and lets the session carry on.` +
      " A step in `dontAsk` that must write its own work needs `allowedTools: Edit(**)` beside it: `dontAsk` asks nobody, so it allows nothing, not even a write in the step's own folder, and `Edit(…)` is the rule every file-editing tool is matched against.",
  );
}

/**
 * The one way a run cannot take no run slot (`slot: none`): its workflow has another step.
 *
 * The cap on runs in flight holds the work this machine does at once. A run outside it is a session that watches the runs inside it —
 * one step, which is how a reader tells the two apart at a glance, and how the machinery does. The line on one step of a workflow of
 * work would take the whole run out of the cap, since a slot is a run's and not a step's, so it is refused here rather than the pass a
 * cap nobody notices lets four runs through.
 */
function validateSlot(steps: readonly Workflow[]): void {
  const watcher = steps.find((s) => s.slot === 'none');
  const beside = steps.filter((s) => s !== watcher).map((s) => s.name);
  if (!watcher || !beside.length) return;
  throw new WorkflowError(
    `${watcher.name}: \`slot: none\` takes this step's whole RUN out of the cap on runs in flight (WF_MAX_RUNS), and this workflow has ${beside.join(', ')} beside it` +
      ` — a slot is a run's, not a step's, so ${beside.join(', ')} would run outside the cap too. A run that takes no slot is one step: a session that watches the other runs.` +
      ` Delete the line, or give ${watcher.name} a folder of its own.`,
  );
}

/**
 * The steps in the order they run: every step after each step its `after` names, and otherwise in the order they are given — by name,
 * for the steps `loadWorkflows` reads, since a folder lists them so. `resume:` is in `after` already, and `loop:` is the edge back, which
 * orders nothing. Pure.
 *
 * What a run's steps are listed in. In the folder's order, alphabetical, `wf start`, `wf ls`, `wf decide` and the board read a
 * `plan → implement ⇄ review` workflow as implement, plan, review. The order given breaks a tie, not the name, so a workflow frozen in an
 * order that already runs forward reads as it was frozen: the board lists a run's steps in its record's order, and holds that to `list`'s.
 * It ends on any input, because a record read back is not validated again: an `after` naming a step that is not here orders nothing, and
 * steps that wait on each other go last, as given, rather than nowhere.
 */

export function orderSteps<S extends Pick<Workflow, 'name' | 'after'>>(steps: readonly S[]): S[] {
  const names = new Set(steps.map((s) => s.name));
  const order: S[] = [];
  const placed = new Set<string>();
  let pending = [...steps];
  for (;;) {
    const next = pending.find((s) => s.after.every((a) => placed.has(a) || !names.has(a)));
    if (!next) break;
    order.push(next);
    placed.add(next.name);
    pending = pending.filter((s) => s !== next);
  }
  return [...order, ...pending];
}

/**
 * A step read back off a record as it ran when it was frozen. Every `claude` step was a background session (`claude --bg`) until thin
 * runtime stage 2 part 2, and `remote: true` was taken there: frozen with no `background`, such a step would now be filed as a job with a
 * bridge, which the runtime refuses at `file` — and a refusal thrown out of one run's `advance` stops the whole pass, every run in the store
 * with it, on every pass after. Read by `stepsOf` and never by `wf start`, which has refused `remote: true` without `background: true`
 * since: so it changes only what was frozen before, and nothing a folder can say today. Pure.
 */
export const asRan = (step: Workflow): Workflow =>
  step.remote && step.background === undefined && (step.harness ?? 'claude') === 'claude' ? { ...step, background: true } : step;

/**
 * A step read back off a record under the names its keys have now (`FORMER_KEYS`). A run frozen before a key was renamed holds the step's
 * field under its former name, and the former name among its agent's `keys` and `given`: read so, the tick would hand the engine no
 * `allowedTools` and the step would run unfenced, with nothing said. Read by `readRun`, so no reader — the tick, `wf ls`, the api — ever sees
 * a former name, and the next pass that writes the record back writes the new ones, with the former beside them (`withFormerNames`). A
 * field under both names keeps the new one's value. A step with no former name is returned as it is. A codex step's sandbox, frozen under
 * `permissionMode` before the key was Codex's own, is read as `sandbox` the same way (`sandboxRead`). Pure.
 */
export function asNamed(step: Workflow): Workflow {
  return sandboxRead(renamedKeys(step));
}

function renamedKeys(step: Workflow): Workflow {
  const fields = Object.keys(step);
  const agent = step.agent;
  const given = agent?.given ? Object.keys(agent.given) : [];
  if (![...fields, ...(agent?.keys ?? []), ...given].some((key) => keyNamed(key) !== key)) return step;
  const renamed = Object.fromEntries(
    Object.entries(step)
      .filter(([key]) => keyNamed(key) === key || !Object.hasOwn(step, keyNamed(key)))
      .map(([key, value]) => [keyNamed(key), value]),
  ) as Workflow;
  if (!agent) return renamed;
  return {
    ...renamed,
    agent: {
      ...agent,
      keys: [...new Set(agent.keys.map((key) => keyNamed(key) as StepKey))],
      ...(agent.given
        ? {
            given: Object.fromEntries(
              Object.entries(agent.given)
                .filter(([key]) => keyNamed(key) === key || !Object.hasOwn(agent.given, keyNamed(key)))
                .map(([key, value]) => [keyNamed(key), value]),
            ),
          }
        : {}),
    },
  };
}

/**
 * A codex step frozen before `sandbox:` read with it (`SANDBOX_SINCE`): its sandbox is the field `permissionMode` — the engine's task field,
 * which the step carried under that name — and the key `permissionMode` among its agent's `keys` and `given`. Read so, the tick would file
 * it with no sandbox, and Codex would run it in `workspace-write`: wider than a reviewer written `read-only`, and said nowhere. So the field
 * moves to `sandbox` (`bypassPermissions` as `danger-full-access`), and a record written with both — `withFormerNames` — keeps `sandbox`'s.
 * A step that does not run on codex is returned as it is: its `permissionMode` is Claude Code's. Pure.
 */
function sandboxRead(step: Workflow): Workflow {
  const agent = step.agent;
  const legacy =
    step.permissionMode !== undefined || Boolean(agent?.keys.includes('permissionMode')) || agent?.given?.permissionMode !== undefined;
  if (step.harness !== 'codex' || !legacy) return step;
  const { permissionMode: word, ...rest } = step;
  const read: Workflow = { ...rest, ...(rest.sandbox === undefined && word !== undefined ? { sandbox: sandboxNamed(word) } : {}) };
  if (!agent) return read;
  const { permissionMode: given, ...others } = agent.given ?? {};
  return {
    ...read,
    agent: {
      ...agent,
      keys: [...new Set(agent.keys.map((key) => (key === 'permissionMode' ? 'sandbox' : key)))],
      ...(agent.given
        ? { given: { ...others, ...(others.sandbox === undefined && given !== undefined ? { sandbox: sandboxNamed(given) } : {}) } }
        : {}),
    },
  };
}

/**
 * A step as a record is written: each renamed field under its name now and, with the same value, under its former one (`FORMER_KEYS`). A
 * `wf up` daemon started before the rename runs its old code until it is restarted, and its tick reads a step's rule lists by the former
 * names alone: a record with the new ones only would have it file every step of a run started since with no rule list, and say nothing —
 * a reviewer's `Bash(npm run build)` deny and the supervisor's git denies gone. `asNamed` reads the record back under the new names
 * alone, so no reader of today's code sees the copy. Only the step's own fields are copied: they are all the old tick filed from. A codex
 * step's `sandbox` is copied to `permissionMode`, the field the old tick filed Codex's sandbox from: without it, a codex reviewer written
 * `sandbox: read-only` would be filed by an old daemon with no sandbox, and run in Codex's `workspace-write`. Pure.
 */
export function withFormerNames(step: Workflow): Workflow {
  const fields = step as unknown as Record<string, unknown>;
  const copies = Object.entries(FORMER_KEYS)
    .filter(([, now]) => fields[now] !== undefined)
    .map(([former, now]) => [former, fields[now]]);
  // A codex step's sandbox, under the field the old tick filed it from: `permissionMode` (`sandboxRead`).
  if (step.harness === 'codex' && step.sandbox !== undefined) copies.push(['permissionMode', step.sandbox]);
  return copies.length ? { ...step, ...Object.fromEntries(copies) } : step;
}

/** Every step `name` waits on, directly or through another. */
export function upstreamOf(steps: readonly Workflow[], name: string): Set<string> {
  const found = new Set<string>();
  const queue = [name];
  while (queue.length) {
    const at = queue.pop();
    const current = steps.find((s) => s.name === at);
    for (const a of current?.after ?? []) {
      if (!found.has(a)) {
        found.add(a);
        queue.push(a);
      }
    }
  }
  return found;
}

/**
 * The steps a round of `looping`'s loop files again, in the workflow's order: its target, every step between
 * the target and it, and itself. `[]` for a step with no `loop:`.
 */
export function loopSpan(steps: readonly Workflow[], looping: Workflow): string[] {
  const target = looping.loop;
  if (!target) return [];
  const up = upstreamOf(steps, looping.name);
  return steps
    .filter((s) => s.name === target || s.name === looping.name || (up.has(s.name) && upstreamOf(steps, s.name).has(target)))
    .map((s) => s.name);
}

/**
 * The ways a loop cannot run as a round: it names no earlier step, or a round could not file its steps again as
 * they were filed the first time.
 *
 * A round works in the workspaces the first one made. A step that inherits its predecessor's gets the target's
 * new commits by being there; one that forked or merged a worktree of its own was cut once, from the first
 * round's branch, and would review work that is no longer the change. So a loop's steps are a chain. A step in
 * one is a new session each round, so it cannot `resume:` another; a step in two would be re-filed by a round of
 * either; and a target's `output:` may not take the field the run adds to it.
 */
function validateLoops(steps: readonly Workflow[]): void {
  const spans = new Map<string, Workflow>();
  for (const s of steps.filter((x) => x.loop)) {
    const target = s.loop!;
    const named = `${s.name}: \`loop: ${target}\``;
    if (target === s.name) {
      throw new WorkflowError(
        `${named} names this step. A loop runs an earlier step again, then every step between it and this one, then this one: name the step this one reviews, which it waits on through \`after\`.`,
      );
    }
    const producer = steps.find((x) => x.name === target);
    if (!producer) throw new WorkflowError(`${named} names a step that is not here. Correct the name, or delete the line.`);
    // A loop's target is continued each round, in the session it kept (`resumeFrom`), and the run keeps none of a remote agent's.
    if (isRemoteHarness(producer.harness)) {
      throw new WorkflowError(
        `${named}, and ${target} runs on \`harness: ${producer.harness}\`, a remote A2A agent: a loop's target is continued each round in the session it kept, and the run keeps none of a remote agent's. Loop back to a step on a harness of ours, or delete the line.`,
      );
    }
    if (!upstreamOf(steps, s.name).has(target)) {
      throw new WorkflowError(
        `${named}, but ${s.name} does not wait on ${target}, directly or through the steps between — a loop runs again work that finished before this step. Add ${target} to \`after:\`, or name a step ${s.name} waits on.`,
      );
    }
    if (producer.output && Object.hasOwn(producer.output.schema.properties, LOOP_REPLIES)) {
      throw new WorkflowError(
        `${target}: \`output: ${producer.output.file}\` declares \`${LOOP_REPLIES}\`, and ${s.name} loops back to ${target} (\`loop: ${target}\`), so the run adds \`${LOOP_REPLIES}\` to its closeout: its answer to each finding. Rename the field.`,
      );
    }

    const span = loopSpan(steps, s);
    for (const name of span) {
      const other = spans.get(name);
      if (other) {
        throw new WorkflowError(
          `${name} is in two loops: ${other.name}'s (\`loop: ${other.loop}\`) and ${s.name}'s (\`loop: ${target}\`). A round of either would file it again under the other. Give it one loop: make one loop's steps end before the other's begin.`,
        );
      }
      spans.set(name, s);
      if (name === target) continue;
      const step = steps.find((x) => x.name === name)!;
      if (step.resume) {
        throw new WorkflowError(
          `${name}: \`resume: ${step.resume}\`, and ${name} is in ${s.name}'s loop (\`loop: ${target}\`), which files it as a new session each round — so it cannot continue another. Delete the line: only the loop's first step, ${target}, is continued, and the run does that itself.`,
        );
      }
      const [from] = step.after;
      const siblings = steps.filter((x) => from !== undefined && x.after.includes(from)).map((x) => x.name);
      if (step.after.length !== 1 || siblings.length !== 1) {
        const why =
          step.after.length > 1
            ? `it waits on ${step.after.join(' and ')}, so it merges their branches into a worktree of its own`
            : `${siblings.filter((x) => x !== name).join(' and ')} ${siblings.length > 2 ? 'wait' : 'waits'} on ${from} too, so ${name} forks a worktree of its own`;
        throw new WorkflowError(
          `${named} files ${span.filter((x) => x !== target).join(', then ')} again after ${target} each round, in the workspace ${target} works in, and ${name} does not work there: ${why}, cut once, which would not have the next round's work. A loop's steps are a chain — each waits on the one before it, and nothing else does. Move what runs beside them after ${s.name}.`,
        );
      }
    }
  }
}

/**
 * Could two steps of this workflow ever run at the same time?
 *
 * True when there is more than one starting point, or when any step is followed by more than one.
 * Used to refuse `--no-worktree` on a workflow that fans out: without isolation those steps would
 * share a directory, which is the arrangement the whole worktree design exists to prevent.
 */
export function fansOut(steps: readonly Workflow[]): boolean {
  const roots = steps.filter((s) => s.after.length === 0);
  if (roots.length > 1) return true;
  return steps.some((s) => steps.filter((x) => x.after.includes(s.name)).length > 1);
}

/**
 * The steps nothing waits on — where a run's work ends up.
 *
 * A run that succeeded is useless if nobody can find what it produced, so this is what `wf ls`
 * reports as the result. Usually one step; several when a workflow deliberately ends wide.
 */
export function terminalSteps(steps: readonly Workflow[]): Workflow[] {
  return steps.filter((s) => !steps.some((other) => other.after.includes(s.name)));
}

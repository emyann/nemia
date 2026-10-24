/**
 * What an engine refuses of a task on the harness it names, in that harness's words: a knob the harness lacks, an argument only
 * another harness takes, a session that would not stay open, and what the harness's own `refuses` says.
 */
import { CLAUDE_CONTEXT_TOKENS, bridgeAsked, claudeBgRefuses, claudeCodeRefuses } from '../harness/claude/index.ts';
import { remoteRefuses } from '../a2a/index.ts';
import { own } from '../core/index.ts';
import { heldHarnessesOf, isClaude, isRemote, isSpec, type HarnessConfig, type TaskSpec } from './options.ts';

/**
 * Why a task cannot be filed on its harness, in that harness's words — or `undefined`. Asked after `refusalOf`, what
 * `file` refuses of every task (`filing.ts`), whose type checks the ranges here rest on.
 *
 * Checked at the API, not only at the CLI: a word the harness rejects would fail its spawn, and with it the whole tick. Which
 * words a harness takes is asked of the harness; the engine never learns them. Refuses, in this order:
 *
 * 1. a harness this engine does not have;
 * 2. `background: true` on any harness but one brought as `'claude'`, the one mode of the engine's own Claude Code: dropped
 *    without a word, a task that asked for a session a person can reach would run as whatever the harness runs;
 * 3. a `contextTokens` on Claude Code or a `HarnessSpec` that has no window to set, or one outside the harness's range: a
 *    window the harness has no knob for would be dropped without a word, and Claude Code refuses one outside its range while
 *    it parses its arguments, at every spawn;
 * 4. a `claude.remoteControl` on a `HarnessSpec`: only Claude Code's background sessions are bridged, and a spec's harness
 *    runs a prompt and exits — `claude -p` among them, whose help offers Remote Control only to an interactive session;
 * 5. a `claude` on a `HarnessSpec` without `claudeFlags`: its session would start without them, and a body meant for the
 *    system prompt would be read by nobody;
 * 6. a `codex` on any harness but a `HarnessSpec` with `codexArgs` (`codexArgsMisplaced`): its session would start without
 *    the trust it names;
 * 7. a `command` or a `niceness` on any harness but a `HarnessSpec` with `commandArgs` (`commandArgsMisplaced`): its
 *    session would run something else than the process they name;
 * 7a. an `env` on a harness that spawns no process of the session's own (`envMisplaced`): a background session, a remote agent, a
 *    `HarnessSpec` with neither `commandArgs` nor `env`; its session would start without it;
 * 7b. a mount in `mounts` on a harness that does not hold its mode (`mountsMisplaced`): a remote agent, a `HarnessSpec` whose
 *    `mounts` leaves the mode out; its session would not reach the folder as asked;
 * 7c. a `callAdmission` on a harness that runs no command before a call (`admissionMisplaced`): Codex, a remote agent, a `HarnessSpec`
 *    that does not declare `callAdmission`; its session would make every call unadmitted;
 * 7d. a `checkoutMcp` on a `HarnessSpec` that does not declare it (`checkoutMcpMisplaced`): its session would not leave the
 *    checkout's servers out as asked;
 * 7e. a list in `enabledSkills` on a harness that cannot close a session's skills (`enabledSkillsMisplaced`): Claude Code holds one only
 *    through its SDK, which a job and a session held attached run on, and `claude --bg` and `claude -p` have no flag or settings key
 *    for it; a `HarnessSpec` that does not declare `enabledSkills`; its session would hold every skill it finds;
 * 8. a long-lived task on a harness whose session ends with its turn (`longLivedMisplaced`);
 * 9. what the harness's own `refuses` refuses: Claude Code's lists, a spec's, or a remote agent's (`remoteRefuses`).
 *
 * A `RunnerOps` brought as its own is the consumer's: it is handed a `contextTokens`, a `claude.remoteControl`, a `claude`, a
 * `codex`, a `command`, an `env`, a `niceness`, `mounts`, `callAdmission`, `checkoutMcp` and `enabledSkills`, and asked nothing
 * here: its own `refuses`, if it has one, is asked by `file` through the `Runner`.
 */
export const harnessRefusalOf = (spec: TaskSpec & { harness: string }, harnesses: Record<string, HarnessConfig>): string | undefined => {
  const h = own(harnesses, spec.harness);
  if (h === undefined) {
    return `\`harness: ${spec.harness}\` is not a harness this engine has. Its harnesses are: ${Object.keys(harnesses).join(', ')}.`;
  }
  const { contextTokens, background } = spec.config ?? {};
  if (background && h !== 'claude') {
    const modal = Object.entries(harnesses)
      .filter(([, o]) => o === 'claude')
      .map(([name]) => `\`${name}\``);
    return `\`background: true\` asks for a Claude Code background session, and the \`${spec.harness}\` harness has no such mode${h === 'claude-bg' ? ': every session of it is one already. Leave `background` off' : `. ${modal.length ? `File the task on ${modal.join(' or ')}, or leave \`background\` off` : "Leave `background` off: none of this engine's harnesses has the mode"}`}.`;
  }
  if (contextTokens !== undefined && (isClaude(h) || isSpec(h))) {
    const range = isClaude(h) ? CLAUDE_CONTEXT_TOKENS : h.contextTokens;
    if (!range) {
      const windowed = Object.entries(harnesses)
        .filter(([, o]) => isClaude(o) || (isSpec(o) && o.contextTokens))
        .map(([name]) => `\`${name}\``);
      return `\`contextTokens: ${contextTokens}\` sets the session's context window, and the \`${spec.harness}\` harness has no such knob: it would run on its own window, whatever the task says. ${windowed.length ? `File the task on ${windowed.join(' or ')}, whose sessions compact past it, or leave \`contextTokens\` off.` : "Leave `contextTokens` off: none of this engine's harnesses sets a session's window."}`;
    }
    if (contextTokens < range.least || contextTokens > range.most) {
      return `\`contextTokens: ${contextTokens}\` is outside the windows the \`${spec.harness}\` harness takes, and it would refuse the session at every spawn. Give a whole number of tokens from ${range.least} to ${range.most}, or leave it out for the harness's own window.`;
    }
  }
  if (bridgeAsked(spec) && isSpec(h)) {
    const bridged = Object.entries(harnesses)
      .filter(([, o]) => isClaude(o))
      .map(([name, o]) => (o === 'claude' ? `\`${name}\` with \`config.background: true\`` : `\`${name}\``));
    return `\`claude.remoteControl\` asks for a session bridged to claude.ai, and the \`${spec.harness}\` harness has no such flag: it runs a prompt and exits, and only a Claude Code background session (\`claude --bg --remote-control\`) is bridged. ${bridged.length ? `File the task on ${bridged.join(' or ')}, or leave \`claude.remoteControl\` off.` : "Leave `claude.remoteControl` off: none of this engine's harnesses bridges a session."}`;
  }
  if (spec.config?.claude !== undefined && isSpec(h) && !h.claudeFlags) {
    const takers = Object.entries(harnesses)
      .filter(([, o]) => isClaude(o) || (isSpec(o) && o.claudeFlags))
      .map(([name]) => `\`${name}\``);
    return `\`claude\` gives Claude Code flags of its own, and the \`${spec.harness}\` harness is not Claude Code: its session would start without them. ${takers.length ? `File the task on ${takers.join(' or ')}, or leave \`claude\` off.` : "Leave `claude` off: none of this engine's harnesses is Claude Code."}`;
  }
  return misplaced(spec, h, harnesses) ?? ownRefuses(h, spec.harness)?.(spec);
};

/** What a task asks of its harness that only another harness of this engine gives: its arguments, then a long-lived session. */
const misplaced = (spec: TaskSpec & { harness: string }, h: HarnessConfig, harnesses: Record<string, HarnessConfig>): string | undefined =>
  argsMisplaced(spec, h, harnesses) ??
  longLivedMisplaced(spec, h, harnesses) ??
  mayAskMisplaced(spec, harnesses) ??
  enabledSkillsMisplaced(spec, h, harnesses);

/**
 * Whether a task's session on `h` is given its skills through Claude Code's SDK (`Options.skills`), or a spec's own knob: a job of a
 * harness configured `'claude'`, a session of one held attached (`restartPolicy: 'Always'`, `heldHarnessesOf`), and a `HarnessSpec`
 * that declares `enabledSkills`. A `claude --bg` session is driven by no `query()` of ours, and Claude Code's CLI has no flag or
 * settings key that closes its skills.
 */
const closesSkills = (spec: TaskSpec, h: HarnessConfig): boolean =>
  isSpec(h) ? h.enabledSkills === true : h === 'claude' && (spec.config?.background !== true || spec.restartPolicy === 'Always');

/**
 * Why a task's `config.enabledSkills` list cannot go on its harness — or `undefined`: one whose session would hold every skill it finds
 * rather than the list (`closesSkills`). `'default'` goes anywhere. A remote agent refuses it in its own words, with every other
 * argument (`remoteRefuses`); a `RunnerOps` brought as its own is handed it.
 */
const enabledSkillsMisplaced = (
  spec: TaskSpec & { harness: string },
  h: HarnessConfig,
  harnesses: Record<string, HarnessConfig>,
): string | undefined => {
  if (!Array.isArray(spec.config?.enabledSkills) || !(isClaude(h) || isSpec(h)) || closesSkills(spec, h)) return undefined;
  const takers = Object.entries(harnesses)
    .filter(([, o]) => o === 'claude' || (isSpec(o) && o.enabledSkills === true))
    .map(([name, o]) => (o === 'claude' ? `\`${name}\` without \`config.background\`` : `\`${name}\``));
  return `\`enabledSkills\` gives the session those skills alone, and the \`${spec.harness}\` harness runs ${h === 'claude' || h === 'claude-bg' ? "it as `claude --bg`, whose CLI has no flag or setting that closes a session's skills" : 'a session that holds every skill it finds'}. ${takers.length ? `File the task on ${takers.join(' or ')}, or give \`enabledSkills: 'default'\`.` : "Give `enabledSkills: 'default'`: none of this engine's harnesses closes a session's skills."}`;
};

/**
 * Why a task's `config.mayAsk: true` cannot go to its harness — or `undefined`: a call is held open at the hook of the session this
 * process drives on the Agent SDK, which is a long-lived session of a harness configured the literal `'claude'`
 * (`restartPolicy: 'Always'`, the one request that runs attached, `attachedLongLived`) and no other. A `claude --bg` session is driven
 * by no `query()` of ours and catches none of its calls, however long it lives, and every other session ends its turn with the call,
 * so a call held in one would be cut before an answer could reach it. Which harnesses those are is asked of `heldHarnessesOf`, the
 * one rule, rather than read off the literal again here: the day a second configuration is held, this refusal moves with it.
 */
const mayAskMisplaced = (spec: TaskSpec & { harness: string }, harnesses: Record<string, HarnessConfig>): string | undefined => {
  if (spec.config?.mayAsk !== true) return undefined;
  const held = heldHarnessesOf(harnesses).includes(spec.harness);
  if (held && spec.restartPolicy === 'Always') return undefined;
  return `\`mayAsk: true\` holds a call that would ask a person open until one answers it, and only a session this runtime holds attached can hold one: the \`${spec.harness}\` harness${held ? ' runs this task as a job, which ends its session with its turn' : ' has no session this runtime holds attached'}. File the task \`restartPolicy: 'Always'\` on a harness configured \`'claude'\`, which this runtime holds attached, or leave \`mayAsk\` off.`;
};

/**
 * Why a task's `restartPolicy: 'Always'` cannot go to its harness — or `undefined`: a harness whose session ends with its turn,
 * so nothing would stay open — Claude Code's job (`'claude'` without `config.background: true`), a `HarnessSpec`, which runs a
 * prompt and exits (Codex among them), and a remote agent. The refusal names the harnesses of this engine that keep one open. A
 * `RunnerOps` brought as its own is the consumer's, and asked nothing.
 */
const longLivedMisplaced = (
  spec: TaskSpec & { harness: string },
  h: HarnessConfig,
  harnesses: Record<string, HarnessConfig>,
): string | undefined => {
  const ownRunner = !(isClaude(h) || isSpec(h) || isRemote(h));
  if (spec.restartPolicy !== 'Always' || ownRunner || h === 'claude-bg' || (h === 'claude' && spec.config?.background === true))
    return undefined;
  const open = Object.entries(harnesses)
    .filter(([, o]) => o === 'claude' || o === 'claude-bg')
    .map(([name, o]) => (o === 'claude' ? `\`${name}\` with \`config.background: true\`` : `\`${name}\``));
  return `\`restartPolicy: 'Always'\` keeps a session open until it is stopped, and the \`${spec.harness}\` harness${h === 'claude' ? ' runs this task as a job, which' : ''} ends its session with its turn. ${open.length ? `File the task on ${open.join(' or ')}, or leave \`restartPolicy\` off.` : "Leave `restartPolicy` off: none of this engine's harnesses keeps a session open."}`;
};

/**
 * What a harness refuses in its own words: Claude Code's lists, a spec's `refuses`, a remote agent's; a `RunnerOps` brought as its
 * own, nothing here.
 */
const ownRefuses = (h: HarnessConfig, name: string): ((task: TaskSpec) => string | undefined) | undefined =>
  h === 'claude'
    ? claudeCodeRefuses
    : h === 'claude-bg'
      ? claudeBgRefuses
      : isSpec(h)
        ? h.refuses
        : isRemote(h)
          ? remoteRefuses(name)
          : undefined;

/**
 * Why a task's `config.codex` cannot go to its harness — or `undefined`: Codex's arguments on a harness that is not Codex,
 * Claude Code or a remote agent or a `HarnessSpec` without `codexArgs`, which would start its session without them. The
 * refusal names the harnesses of this engine that take them. A `RunnerOps` brought as its own is the consumer's, and asked nothing.
 */
const codexArgsMisplaced = (
  spec: TaskSpec & { harness: string },
  h: HarnessConfig,
  harnesses: Record<string, HarnessConfig>,
): string | undefined => {
  const isCodex = (o: HarnessConfig) => isSpec(o) && o.codexArgs === true;
  const ownRunner = !(isClaude(h) || isSpec(h) || isRemote(h));
  if (spec.config?.codex === undefined || ownRunner || isCodex(h)) return undefined;
  const takers = Object.entries(harnesses)
    .filter(([, o]) => isCodex(o))
    .map(([name]) => `\`${name}\``);
  return `\`codex\` gives Codex arguments of its own, and the \`${spec.harness}\` harness is not Codex: its session would start without them. ${takers.length ? `File the task on ${takers.join(' or ')}, or leave \`codex\` off.` : "Leave `codex` off: none of this engine's harnesses is Codex."}`;
};

/**
 * Why a task's arguments of one kind of harness cannot go on its own (`codexArgsMisplaced`, `commandArgsMisplaced`), or a mount on
 * one that cannot hold it (`mountsMisplaced`), or admission on one that runs none (`admissionMisplaced`), or a pick of the
 * checkout's servers on one that holds none (`checkoutMcpMisplaced`), or `undefined`.
 */
const argsMisplaced = (
  spec: TaskSpec & { harness: string },
  h: HarnessConfig,
  harnesses: Record<string, HarnessConfig>,
): string | undefined =>
  codexArgsMisplaced(spec, h, harnesses) ??
  commandArgsMisplaced(spec, h, harnesses) ??
  envMisplaced(spec, h, harnesses) ??
  mountsMisplaced(spec, h, harnesses) ??
  admissionMisplaced(spec, h, harnesses) ??
  checkoutMcpMisplaced(spec, h, harnesses);

/** Whether a harness can leave the checkout's `.mcp.json` out of a session: Claude Code, and a `HarnessSpec` that declares it. */
const picksMcp = (h: HarnessConfig): boolean => isClaude(h) || (isSpec(h) && h.checkoutMcp === true);

/**
 * Why a task's `config.checkoutMcp` cannot go on its harness — or `undefined`: a `HarnessSpec` that does not declare `checkoutMcp`,
 * whose session would start with whatever it loads itself. The refusal names the harnesses of this engine that hold it. A remote
 * agent refuses it in its own words, with every other argument (`remoteRefuses`); a `RunnerOps` brought as its own is handed it.
 */
const checkoutMcpMisplaced = (
  spec: TaskSpec & { harness: string },
  h: HarnessConfig,
  harnesses: Record<string, HarnessConfig>,
): string | undefined => {
  if (spec.config?.checkoutMcp === undefined || !isSpec(h) || picksMcp(h)) return undefined;
  const takers = Object.entries(harnesses)
    .filter(([, o]) => picksMcp(o))
    .map(([name]) => `\`${name}\``);
  return `\`checkoutMcp\` says which servers of the checkout's \`.mcp.json\` the session loads, and the \`${spec.harness}\` harness loads no MCP server it could leave out: it would run as if nothing were asked. ${takers.length ? `File the task on ${takers.join(' or ')}, or leave \`checkoutMcp\` off.` : "Leave `checkoutMcp` off: none of this engine's harnesses holds it."}`;
};

/** Whether a harness runs admission before a call: Claude Code, a `HarnessSpec` that declares it, a remote agent never. */
const admits = (h: HarnessConfig): boolean => isClaude(h) || (isSpec(h) && h.callAdmission === true);

/**
 * Why a task's `config.callAdmission` cannot go on its harness — or `undefined`: a harness that runs no command before a call (Codex, a
 * `HarnessSpec` that does not declare `callAdmission`, a remote agent), whose session would make every call unadmitted. The refusal names
 * the harnesses of this engine that admit. A `RunnerOps` brought as its own is handed it, and not asked.
 */
const admissionMisplaced = (
  spec: TaskSpec & { harness: string },
  h: HarnessConfig,
  harnesses: Record<string, HarnessConfig>,
): string | undefined => {
  const ownRunner = !(isClaude(h) || isSpec(h) || isRemote(h));
  if (spec.config?.callAdmission === undefined || ownRunner || admits(h)) return undefined;
  const takers = Object.entries(harnesses)
    .filter(([, o]) => admits(o))
    .map(([name]) => `\`${name}\``);
  return `\`callAdmission\` asks a command before each of the session's calls, and the \`${spec.harness}\` harness runs none before a call: its session would make every call unadmitted. ${takers.length ? `File the task on ${takers.join(' or ')}, or leave \`callAdmission\` off.` : "Leave `callAdmission` off: none of this engine's harnesses admits a call."}`;
};

/** Whether a harness holds a mount in a mode: Claude Code in both, a `HarnessSpec` in those it declares, a remote agent in none. */
const holdsMount = (h: HarnessConfig, mode: 'readOnly' | 'writable'): boolean => isClaude(h) || (isSpec(h) && h.mounts?.[mode] === true);

/**
 * Why a task's `config.mounts` cannot go on its harness — or `undefined`: a mount whose mode the harness does not hold
 * (`HarnessSpec.mounts`), so its session would not see the folder, or could write where it may only read. A remote agent has
 * none of this machine's disk, and holds no mount. The refusal names the harnesses of this engine that hold the mode. A
 * `RunnerOps` brought as its own is handed the mounts, and not asked.
 */
const mountsMisplaced = (
  spec: TaskSpec & { harness: string },
  h: HarnessConfig,
  harnesses: Record<string, HarnessConfig>,
): string | undefined => {
  const ownRunner = !(isClaude(h) || isSpec(h) || isRemote(h));
  const mount = ownRunner ? undefined : spec.config?.mounts?.find((m) => !holdsMount(h, m.readOnly ? 'readOnly' : 'writable'));
  if (mount === undefined) return undefined;
  const mode = mount.readOnly ? 'readOnly' : 'writable';
  const words = mount.readOnly ? 'read-only' : 'writable';
  const holders = Object.entries(harnesses)
    .filter(([, o]) => holdsMount(o, mode))
    .map(([name]) => `\`${name}\``);
  return `\`mounts\` gives the session ${mount.path} ${words}, and the \`${spec.harness}\` harness cannot hold a ${words} mount: its session would not reach the folder as asked. ${holders.length ? `File the task on ${holders.join(' or ')}, or leave the mount off.` : `Leave the mount off: none of this engine's harnesses holds a ${words} mount.`}`;
};

/**
 * Why a task's `command` or `niceness` cannot go on its harness — or `undefined`: they are the arguments of a harness that runs a
 * process (`commandArgs`), and any other would run its own session without them. A `RunnerOps` brought as its own is not asked.
 */
const commandArgsMisplaced = (
  spec: TaskSpec & { harness: string },
  h: HarnessConfig,
  harnesses: Record<string, HarnessConfig>,
): string | undefined => {
  const runsCommands = (o: HarnessConfig) => isSpec(o) && o.commandArgs === true;
  const ownRunner = !(isClaude(h) || isSpec(h) || isRemote(h));
  const key = (['command', 'niceness'] as const).find((k) => spec.config?.[k] !== undefined);
  if (key === undefined || ownRunner || runsCommands(h)) return undefined;
  const takers = Object.entries(harnesses)
    .filter(([, o]) => runsCommands(o))
    .map(([name]) => `\`${name}\``);
  return `\`${key}\` names a process to run, and the \`${spec.harness}\` harness runs a session of its own: it would start without it. ${takers.length ? `File the task on ${takers.join(' or ')}, or leave \`${key}\` off.` : `Leave \`${key}\` off: none of this engine's harnesses runs a command.`}`;
};

/** Whether a harness spawns a task's session as a process of its own, given its `env`: a `HarnessSpec` that says so, Claude Code's job. */
const takesEnv = (h: HarnessConfig, background: boolean): boolean =>
  (isSpec(h) && (h.commandArgs === true || h.env === true)) || (h === 'claude' && !background);

/**
 * Why a task's `config.env` cannot go on its harness — or `undefined`: a Claude Code background session, whose process is spawned
 * before it and ignores its asker's environment, a remote agent, which runs on none of this machine's processes, and a `HarnessSpec`
 * that neither runs a command nor takes an `env`. The refusal names the harnesses of this engine that take one. A `RunnerOps` brought
 * as its own is not asked.
 */
const envMisplaced = (
  spec: TaskSpec & { harness: string },
  h: HarnessConfig,
  harnesses: Record<string, HarnessConfig>,
): string | undefined => {
  const ownRunner = !(isClaude(h) || isSpec(h) || isRemote(h));
  if (spec.config?.env === undefined || ownRunner || takesEnv(h, spec.config.background === true)) return undefined;
  const takers = Object.entries(harnesses)
    .filter(([, o]) => takesEnv(o, false))
    .map(([name, o]) => (o === 'claude' ? `\`${name}\` as a job` : `\`${name}\``));
  const fix = takers.length
    ? `File the task on ${takers.join(' or ')}, or leave \`env\` off.`
    : "Leave `env` off: none of this engine's harnesses spawns a session's process.";
  if (isClaude(h))
    return `\`env\` is laid in the session's process, and the \`${spec.harness}\` harness runs this task as a background session, which runs in a pre-spawned process and ignores its asker's environment: it would start without it. ${fix}`;
  return `\`env\` is laid in the session's process, and the \`${spec.harness}\` harness spawns none of its own: it would start without it. ${fix}`;
};

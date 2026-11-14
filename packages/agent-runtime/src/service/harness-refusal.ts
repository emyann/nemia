/**
 * What an engine refuses of a task on the harness it names, in that harness's words: a word of a task's config the harness's
 * declaration does not list (`misplacedOf`), its fix naming the harnesses of this engine that list it (`takersOf`), a call held for a
 * person on a session that is not held, and what the harness's own `refuses` says.
 */
import { bridgeAsked, claudeRefuses } from '../harness/claude/index.ts';
import { remoteRefuses } from '../a2a/index.ts';
import { own } from '../core/index.ts';
import { misplacedOf, takersOf, type Capability } from '../harness/declaration.ts';
import { declarationOf, isRemote, isSpec, type HarnessConfig, type TaskSpec } from './options.ts';

type Filed = TaskSpec & { harness: string };

/**
 * What a refusal offers instead: `leave`, the fix with no harness taking it, as the task can write it (`leave \`x\` off`); `whose`, what a
 * taker is, said after the takers' names; `none`, what no harness of this engine does, said after `leave` where no harness takes it.
 */
type Fix = { readonly leave: (spec: Filed) => string; readonly whose?: string; readonly none?: (capability: Capability) => string };

/**
 * One key of a task's config a harness may not take:
 * - `words`: the capabilities it is asked by; `asks`: those the task asks by it, in the order it asks them (a mount for each of `mounts`,
 *   in its mode);
 * - `only`: `'local'`, asked only of a harness that runs here, a remote agent's own `refuses` saying it in its own words with every other
 *   argument (`remoteRefuses`); `'remote'`, asked only of a remote agent, a spec's process always running here (its tasks start under
 *   the engine's default limit, `defaultsOf` in `admissionOf`);
 * - `says`: what the key asks of a session and why the harness named cannot give it; `fix`: what it offers instead (`fixOf`), absent
 *   where `says` says that too.
 */
type Asked = {
  readonly words: readonly Capability[];
  readonly asks: (spec: Filed) => readonly Capability[];
  readonly only?: 'local' | 'remote';
  readonly says: (spec: Filed, capability: Capability) => string;
  readonly fix?: Fix;
};

/** The key of `command`, `niceness` and `terminationMessagePath` a task gives first: the arguments of a process the runtime runs. */
const commandKeyOf = (spec: Filed) =>
  (['command', 'niceness', 'terminationMessagePath'] as const).find((k) => spec.config?.[k] !== undefined);

/** The capability a mount asks, by its mode. */
const mountWord = (mount: { readOnly?: boolean }): Capability => (mount.readOnly ? 'readOnlyMount' : 'writableMount');

/** A mount's mode, in words. */
const modeWords = (capability: Capability) => (capability === 'readOnlyMount' ? 'read-only' : 'writable');

/** `capability`, asked where the task gives its key (`asked`), else nothing. */
const askedIf = (asked: boolean, capability: Capability): readonly Capability[] => (asked ? [capability] : []);

/**
 * Why a task's `config.mayAsk: true` cannot go to its harness: a call is held open at the hook of a session this runtime holds attached,
 * a long-lived one (`restartPolicy: 'Always'`) of a harness that declares `holdsCalls`, and no other. Every other session ends its turn
 * with the call, so a call held in one would be cut before an answer could reach it. `held`: the harness is one a holder holds.
 */
const mayAskWords = (spec: Filed, held: boolean): string =>
  `\`mayAsk: true\` holds a call that would ask a person open until one answers it, and only a session this runtime holds attached can hold one: the \`${spec.harness}\` harness${held ? ' runs this task as a job, which ends its session with its turn' : ' has no session this runtime holds attached'}. File the task \`restartPolicy: 'Always'\` on a harness configured \`'claude'\`, which this runtime holds attached, or leave \`mayAsk\` off.`;

/**
 * What a task can ask of its harness, in the order it is refused:
 *
 * 1. a `contextTokens` (its range asked first, `rangeRefusalOf`): a window the harness has no knob for would be dropped without a word;
 * 2. a `claude.remoteControl`: the bridge is opened on the Agent SDK's control request, which only a Claude Code session of this runtime
 *    is asked through, and a spec's harness runs a process of its own that no control request reaches;
 * 3. a `claude`: its session would start without the flags, and a body meant for the system prompt would be read by nobody;
 * 4. a `codex`: its session would start without the trust it names;
 * 5. a `command`, a `niceness` or a `terminationMessagePath`: its session would run something else than the process they name;
 * 6. an `env` on a harness that spawns no process of the session's own;
 * 7. a mount in `mounts` on a harness that does not hold its mode: its session would not reach the folder as asked;
 * 8. a `callAdmission` on a harness that runs no command before a call: its session would make every call unadmitted;
 * 9. a `projectMcp`: its session would not leave the checkout's servers out as asked;
 * 10. a long-lived task (`restartPolicy: 'Always'`) on a harness whose session ends with its turn; with no process holding the sessions,
 *     a harness that keeps one open ends its spawn `unstartable` (`LONG_LIVED_UNHELD`), which is not this refusal: whether a holder is
 *     there is the world's, read at the spawn;
 * 11. a `mayAsk` on a harness that holds no call for a person (`mayAskWords`);
 * 12. a list in `enabledSkills` on a harness that cannot close a session's skills, whose session would hold every skill it finds;
 *     `'default'` goes anywhere;
 * 13. a memory limit (`resources.limits.memory`) on a remote agent, whose process is the other party's and no cgroup of this host's
 *     holds: an engine's `defaultLimits` never lands on such a task (`defaultsOf` in `admissionOf`), so a default makes none
 *     unfileable.
 */
const ASKED: readonly Asked[] = [
  {
    words: ['contextTokens'],
    asks: (spec) => askedIf(spec.config?.contextTokens !== undefined, 'contextTokens'),
    only: 'local',
    says: (spec) =>
      `\`contextTokens: ${spec.config?.contextTokens}\` sets the session's context window, and the \`${spec.harness}\` harness has no such knob: it would run on its own window, whatever the task says.`,
    fix: { leave: () => 'leave `contextTokens` off', whose: ', whose sessions compact past it', none: () => "sets a session's window" },
  },
  {
    words: ['bridge'],
    asks: (spec) => askedIf(bridgeAsked(spec), 'bridge'),
    only: 'local',
    says: (spec) =>
      `\`claude.remoteControl\` asks for a session bridged to claude.ai, and the \`${spec.harness}\` harness runs a process of its own, which no control request of the Agent SDK reaches: only a Claude Code session of this runtime is bridged.`,
    fix: { leave: () => 'leave `claude.remoteControl` off', none: () => 'bridges a session' },
  },
  {
    words: ['claudeFlags'],
    asks: (spec) => askedIf(spec.config?.claude !== undefined, 'claudeFlags'),
    only: 'local',
    says: (spec) =>
      `\`claude\` gives Claude Code flags of its own, and the \`${spec.harness}\` harness is not Claude Code: its session would start without them.`,
    fix: { leave: () => 'leave `claude` off', none: () => 'is Claude Code' },
  },
  {
    words: ['codexArgs'],
    asks: (spec) => askedIf(spec.config?.codex !== undefined, 'codexArgs'),
    says: (spec) =>
      `\`codex\` gives Codex arguments of its own, and the \`${spec.harness}\` harness is not Codex: its session would start without them.`,
    fix: { leave: () => 'leave `codex` off', none: () => 'is Codex' },
  },
  {
    words: ['commandArgs'],
    asks: (spec) => askedIf(commandKeyOf(spec) !== undefined, 'commandArgs'),
    says: (spec) =>
      `\`${commandKeyOf(spec)}\` is an argument of a process the runtime runs, and the \`${spec.harness}\` harness runs a session of its own: it would start without it.`,
    fix: { leave: (spec) => `leave \`${commandKeyOf(spec)}\` off`, none: () => 'runs a command' },
  },
  {
    words: ['env'],
    asks: (spec) => askedIf(spec.config?.env !== undefined, 'env'),
    says: (spec) =>
      `\`env\` is laid in the session's process, and the \`${spec.harness}\` harness spawns none of its own: it would start without it.`,
    fix: { leave: () => 'leave `env` off', none: () => "spawns a session's process" },
  },
  {
    words: ['readOnlyMount', 'writableMount'],
    asks: (spec) => (spec.config?.mounts ?? []).map(mountWord),
    says: (spec, capability) => {
      const mount = spec.config?.mounts?.find((m) => mountWord(m) === capability);
      const words = modeWords(capability);
      return `\`mounts\` gives the session ${mount?.path} ${words}, and the \`${spec.harness}\` harness cannot hold a ${words} mount: its session would not reach the folder as asked.`;
    },
    fix: { leave: () => 'leave the mount off', none: (capability) => `holds a ${modeWords(capability)} mount` },
  },
  {
    words: ['callAdmission'],
    asks: (spec) => askedIf(spec.config?.callAdmission !== undefined, 'callAdmission'),
    says: (spec) =>
      `\`callAdmission\` asks a command before each of the session's calls, and the \`${spec.harness}\` harness runs none before a call: its session would make every call unadmitted.`,
    fix: { leave: () => 'leave `callAdmission` off', none: () => 'admits a call' },
  },
  {
    words: ['projectMcp'],
    asks: (spec) => askedIf(spec.config?.projectMcp !== undefined, 'projectMcp'),
    only: 'local',
    says: (spec) =>
      `\`projectMcp\` says which servers of the checkout's \`.mcp.json\` the session loads, and the \`${spec.harness}\` harness loads no MCP server it could leave out: it would run as if nothing were asked.`,
    fix: { leave: () => 'leave `projectMcp` off', none: () => 'holds it' },
  },
  {
    words: ['keepsOpen'],
    asks: (spec) => askedIf(spec.restartPolicy === 'Always', 'keepsOpen'),
    says: (spec) =>
      `\`restartPolicy: 'Always'\` keeps a session open until it is stopped, and the \`${spec.harness}\` harness ends its session with its turn.`,
    fix: { leave: () => 'leave `restartPolicy` off', none: () => 'keeps a session open' },
  },
  {
    words: ['holdsCalls'],
    asks: (spec) => askedIf(spec.config?.mayAsk === true, 'holdsCalls'),
    says: (spec) => mayAskWords(spec, false),
  },
  {
    words: ['enabledSkills'],
    asks: (spec) => askedIf(Array.isArray(spec.config?.enabledSkills), 'enabledSkills'),
    only: 'local',
    says: (spec) =>
      `\`enabledSkills\` gives the session those skills alone, and the \`${spec.harness}\` harness runs a session that holds every skill it finds.`,
    fix: { leave: () => "give `enabledSkills: 'default'`", none: () => "closes a session's skills" },
  },
  {
    words: ['memoryLimit'],
    asks: (spec) => askedIf(spec.resources?.limits?.memory !== undefined, 'memoryLimit'),
    only: 'remote',
    says: (spec) =>
      `\`resources.limits.memory\` holds a task's process tree in a cgroup of this host's, and the \`${spec.harness}\` harness is a remote agent, whose process is the other party's: no limit of ours reaches it.`,
    fix: { leave: () => 'leave `resources` off' },
  },
];

/** The row of `ASKED` each capability is asked by. */
const ROW_OF: ReadonlyMap<Capability, Asked> = new Map(ASKED.flatMap((row) => row.words.map((word): [Capability, Asked] => [word, row])));

/**
 * The fix a refusal of `capability` offers: the harnesses of this engine that declare it (`takersOf`), else the one fix left. The takers'
 * sentence, written once for every key.
 */
const fixOf = (fix: Fix, spec: Filed, capability: Capability, harnesses: Record<string, HarnessConfig>): string => {
  const declared = Object.entries(harnesses).map(([name, o]) => ({ name, can: declarationOf(o)?.can }));
  const takers = takersOf(capability, declared).map((name) => `\`${name}\``);
  const leave = fix.leave(spec);
  if (takers.length) return `File the task on ${takers.join(' or ')}${fix.whose ?? ''}, or ${leave}.`;
  const none = fix.none?.(capability);
  return `${leave.charAt(0).toUpperCase()}${leave.slice(1)}${none === undefined ? '' : `: none of this engine's harnesses ${none}`}.`;
};

/**
 * Why a task's `contextTokens` is outside the windows its harness takes — or `undefined`: Claude Code refuses one outside its range while
 * it parses its arguments, at every spawn. Asked where the harness declares `contextTokens`; one that does not is refused it by `ASKED`.
 */
const rangeRefusalOf = (spec: Filed, range: { least: number; most: number } | undefined): string | undefined => {
  const tokens = spec.config?.contextTokens;
  if (tokens === undefined || range === undefined || (tokens >= range.least && tokens <= range.most)) return undefined;
  return `\`contextTokens: ${tokens}\` is outside the windows the \`${spec.harness}\` harness takes, and it would refuse the session at every spawn. Give a whole number of tokens from ${range.least} to ${range.most}, or leave it out for the harness's own window.`;
};

/**
 * What a harness refuses in its own words: Claude Code's lists, a spec's `refuses`, a remote agent's; a `RunnerOps` brought as its
 * own, nothing here.
 */
const ownRefuses = (h: HarnessConfig, name: string): ((task: TaskSpec) => string | undefined) | undefined =>
  h === 'claude' ? claudeRefuses : isSpec(h) ? h.refuses : isRemote(h) ? remoteRefuses(name) : undefined;

/**
 * Why a task cannot be filed on its harness, in that harness's words — or `undefined`. Asked after `refusalOf`, what `file` refuses of
 * every task (`filing.ts`), whose type checks the ranges here rest on.
 *
 * Checked at the API, not only at the CLI: a word the harness rejects would fail its spawn, and with it the whole tick. Which words a
 * harness takes is its declaration's (`declarationOf`); the engine never learns them. Refuses, in this order:
 *
 * 1. a harness this engine does not have — `claude-detached`, the `claude -p` harness a former runtime had, among them;
 * 2. (a former rule: `background: true`, which no task takes now, is refused with every argument taken away, `argsRefusalOf`);
 * 3. a `contextTokens` outside the range of a harness that declares one (`rangeRefusalOf`);
 * 4. the first word the task asks that the harness does not declare (`misplacedOf`, `ASKED` in its order), with the harnesses of this
 *    engine that declare it (`takersOf`);
 * 5. a `mayAsk` on a session that is not held attached: a task not long-lived, or a runner of the consumer's;
 * 6. what the harness's own `refuses` refuses: Claude Code's lists, a spec's, or a remote agent's (`remoteRefuses`).
 *
 * A `RunnerOps` brought as its own is the consumer's: it declares nothing (`declarationOf`), is handed every key of a task's config, and
 * is asked here only whether it holds a call (it does not); its own `refuses`, if it has one, is asked by `file` through the `Runner`.
 */
export const harnessRefusalOf = (spec: Filed, harnesses: Record<string, HarnessConfig>): string | undefined => {
  const h = own(harnesses, spec.harness);
  if (h === undefined) {
    const former =
      spec.harness === 'claude-detached'
        ? ' `claude-detached` ran `claude -p`, which this runtime no longer runs: file the task on `claude`, whose job runs the same session on the Agent SDK.'
        : '';
    return `\`harness: ${spec.harness}\` is not a harness this engine has. Its harnesses are: ${Object.keys(harnesses).join(', ')}.${former}`;
  }
  const declaration = declarationOf(h);
  const can = declaration?.can;
  const range = can?.includes('contextTokens') === true ? rangeRefusalOf(spec, declaration?.contextTokens) : undefined;
  if (range !== undefined) return range;
  const unasked = isRemote(h) ? 'local' : 'remote';
  const misplaced = misplacedOf(
    ASKED.filter((row) => row.only !== unasked).flatMap((row) => row.asks(spec)),
    can,
  );
  const row = misplaced === undefined ? undefined : ROW_OF.get(misplaced);
  if (misplaced !== undefined && row !== undefined) {
    const said = row.says(spec, misplaced);
    return row.fix === undefined ? said : `${said} ${fixOf(row.fix, spec, misplaced, harnesses)}`;
  }
  if (spec.config?.mayAsk === true && !(can?.includes('holdsCalls') === true && spec.restartPolicy === 'Always')) {
    return mayAskWords(spec, can?.includes('hold') === true);
  }
  return ownRefuses(h, spec.harness)?.(spec);
};

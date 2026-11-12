/**
 * What a harness declares it can do, once: one list of capability words (`can`) and the data it carries for the checks that read it —
 * its knobs, its context range, what its fence words reach, the config its neutral asks become. A new harness is its declaration and
 * its driver. Every check that used to name a harness reads a declaration here instead: whether a task asks of its harness something it
 * does not declare (`misplacedOf`), which harnesses take a capability, for the fix a refusal names (`takersOf`), and which harness an
 * Engine verb that is not a task's goes to (`verbHarnessOf`). Their laws are `contracts/capability.contract.ts`'s.
 *
 * Pure: it imports the harnesses' vocabulary files alone, so `agent-runtime/vocabulary` carries it (`test/vocabulary-door.test.ts`).
 */
import type { MisplacedOf, TakersOf, VerbHarnessOf } from '../../contracts/capability.contract.ts';
import type { ClaudeRules } from './claude/rules.ts';
import { CLAUDE_DECLARATION, CLAUDE_SIGN_IN } from './claude/vocabulary.ts';
import { CODEX_DECLARATION } from './codex/vocabulary.ts';
import { COMMAND_DECLARATION } from './command/vocabulary.ts';

/**
 * A word a harness's declaration lists: a key of a task's config it takes, a kind of session it keeps, or an Engine verb it answers.
 *
 * - `contextTokens`, `claudeFlags` (a task's `config.claude`, carried whole), `codexArgs` (`config.codex`), `commandArgs` (`command`,
 *   `niceness`, `terminationMessagePath`), `env`, `readOnlyMount`, `writableMount`, `callAdmission`, `projectMcp`, `enabledSkills`,
 *   `memoryLimit`, `bridge` (a session bridged to a remote control): a task's config it takes;
 * - `keepsOpen`: a session kept open until stopped (`restartPolicy: 'Always'`); `holdsCalls`: a call held open for a person (`mayAsk`);
 * - `interrupt`, `answerAsk`, `quota`, `mcp` (`mcpState`, `mcpSignIn`, `mcpSignInState`, `mcpSignOut`), `hold`, `drain` (its sessions'
 *   calls held, and their deadlines paused, while the store's drain stands): an Engine verb it answers.
 */
export type Capability =
  | 'contextTokens'
  | 'claudeFlags'
  | 'codexArgs'
  | 'commandArgs'
  | 'env'
  | 'readOnlyMount'
  | 'writableMount'
  | 'callAdmission'
  | 'projectMcp'
  | 'enabledSkills'
  | 'memoryLimit'
  | 'bridge'
  | 'keepsOpen'
  | 'holdsCalls'
  | 'interrupt'
  | 'answerAsk'
  | 'quota'
  | 'mcp'
  | 'hold'
  | 'drain';

/** Every capability word, in the order `Capability` lists them: what a declaration's `can` is checked against where it is read whole. */
export const CAPABILITIES: readonly Capability[] = [
  'contextTokens',
  'claudeFlags',
  'codexArgs',
  'commandArgs',
  'env',
  'readOnlyMount',
  'writableMount',
  'callAdmission',
  'projectMcp',
  'enabledSkills',
  'memoryLimit',
  'bridge',
  'keepsOpen',
  'holdsCalls',
  'interrupt',
  'answerAsk',
  'quota',
  'mcp',
  'hold',
  'drain',
];

/** One harness of an engine, by the name it is configured under, and what it declares: `undefined` for a runner of the consumer's. */
export type HarnessDeclared = { readonly name: string; readonly can: readonly Capability[] | undefined };

/** The harness an Engine verb goes to, or why none: a name the engine has not, one that does not declare the verb, or none that does. */
export type VerbHarness =
  | { readonly kind: 'taken'; readonly name: string }
  | { readonly kind: 'refused'; readonly reason: 'unknown' | 'undeclared' | 'none' };

/**
 * One harness's knobs, as a caller writing settings for it names them:
 * - `effort`: the words its effort takes;
 * - `fence`: the key its fence is named by (a mode's or a sandbox's), that key's words, and the tool lists the fence also takes, none
 *   where its fence is one word;
 * - `context`: whether it takes a context window;
 * - `flags`: the flags of its own handed to it as they are — any but those the runtime gives itself (`owned`), or only those it reads
 *   (`only`).
 */
export type HarnessKnobs = {
  readonly effort: readonly string[];
  readonly fence: { readonly key: 'permissionMode' | 'sandbox'; readonly words: readonly string[]; readonly lists: readonly string[] };
  readonly context: boolean;
  readonly flags: { readonly owned: readonly string[] } | { readonly only: readonly string[] };
};

/**
 * A harness's fence, as the words that set it: `by` is what fences a session, a permission mode or a sandbox; `rank` how wide each word
 * is, wider higher and equal as wide; `given` the word a task naming none runs in; `writes` the lowest rank that writes in the session's
 * directory unasked; `held` the word a session held to its directory runs in, where the harness has one; `unasking` the words a
 * background session runs in without stopping to ask a person, `held` first; `dropped` the words the harness runs as another on the
 * model asked about; `refusing` the words a session refuses in what no allow rule reaches, rather than asking about it, so that a tool
 * the session is given and neither a rule nor the word itself grants can never be called; `unfenced` the tools it calls inside its own
 * directory with no rule naming them, whatever the word; and `granted` the tools one word alone runs with no rule, by that word, a word
 * granting none being absent. The last three are empty for a harness whose fence takes no allow rule.
 */
export type FenceReach = {
  by: 'mode' | 'sandbox';
  rank: Readonly<Record<string, number>>;
  given: string;
  writes: number;
  held?: string;
  unasking: readonly string[];
  dropped: readonly string[];
  refusing: readonly string[];
  unfenced: readonly string[];
  granted: Readonly<Record<string, readonly string[]>>;
};

/** The config a harness's own key carries for what was asked of it neutrally (`ownArgsOf`). */
export type OwnArgs = { readonly claude?: { readonly remoteControl: true }; readonly codex?: { readonly trustFrom: string } };

/**
 * A fix of a harness's sign-in: its command, what it does in words, the pattern of a code its output shows a person (a device code), and
 * `typed` where a person types it on the server themselves, since it asks them for what a task cannot read (a code pasted back).
 */
export type HarnessSignInFix = {
  readonly command: string;
  readonly message: string;
  readonly code?: string;
  readonly typed?: true;
};

/**
 * What a harness needs on a machine before a session runs on it, as plain shell a layer above runs with `NEMIA_TOOLS` set to its tools
 * folder and that folder's `bin/` first on `PATH`:
 * - `program`: the name its program is run by, found first in the engine's `harnessBin` (`EngineOptions`), the tools folder's `bin/`;
 * - `title`: its name in words;
 * - `pin`: the version this release was tested with, which `install` puts in place;
 * - `version`: the command that prints the version found;
 * - `check`: whether its program is found;
 * - `install`: puts its program at `pin` into `$NEMIA_TOOLS/harnesses/<name>/<pin>/`, linked as `$NEMIA_TOOLS/bin/<program>`;
 * - `remove`: takes what `install` put away;
 * - `signIn`: the check whose exit 0 says it is signed in as the user that runs it, and the fixes that sign it in.
 */
export type HarnessNeeds = {
  readonly program: string;
  readonly title: string;
  readonly pin: string;
  readonly version: string;
  readonly check: string;
  readonly install: string;
  readonly remove: string;
  readonly signIn: { readonly check: string; readonly fixes: readonly HarnessSignInFix[] };
};

/**
 * What one harness declares. `can` is the whole list; the rest is the data a check reads beside it, each absent where the harness has
 * none:
 * - `ownKey`: the key of a task's config its own flags go under (`config.claude`, `config.codex`), carried whole;
 * - `knobs`: its knobs (`HarnessKnobs`), for a caller that writes settings for it;
 * - `contextTokens`: the windows it takes, where `can` lists `contextTokens`;
 * - `reach`: what its fence words reach on a model (`FenceReach`);
 * - `unruled`: the characters its permission rules cannot carry in a path;
 * - `asks`: what each neutral ask becomes in its own config — a function of the repository for `trustRepository`, the config itself for
 *   `remoteControl` — an ask it has none for being dropped;
 * - `runsBrief`: it runs a task's brief as an agent session, as a command or a remote agent does not;
 * - `recordsDenials`: a job of it records the calls its fence denied;
 * - `rules`: how its permission rules are matched and the tool sets measured on it (`ClaudeRules`), for a caller that shows a reach;
 * - `needs`: what it needs on a machine, installed and signed in (`HarnessNeeds`): a harness a person activates, as a command or a
 *   remote agent, which need nothing of their own, is not.
 */
export type HarnessDeclaration = {
  readonly can: readonly Capability[];
  readonly ownKey?: 'claude' | 'codex';
  readonly knobs?: HarnessKnobs;
  readonly contextTokens?: { readonly least: number; readonly most: number };
  readonly reach?: (model: string | undefined) => FenceReach;
  readonly unruled?: RegExp;
  readonly asks?: { readonly trustRepository?: (repo: string) => OwnArgs; readonly remoteControl?: OwnArgs };
  readonly runsBrief?: true;
  readonly recordsDenials?: true;
  readonly rules?: ClaudeRules;
  readonly needs?: HarnessNeeds;
};

/**
 * The declarations of the harnesses the runtime ships, by the name each is configured under by default (`DEFAULT_HARNESSES`), the
 * default harness first. A remote agent is configured under a name of the consumer's, and declares `REMOTE_DECLARATION`.
 */
export const HARNESS_DECLARATIONS: Readonly<Record<string, HarnessDeclaration>> = {
  claude: CLAUDE_DECLARATION,
  codex: CODEX_DECLARATION,
  command: COMMAND_DECLARATION,
};

/** The harness a task that names none runs on: the first of `HARNESS_DECLARATIONS`. */
export const DEFAULT_HARNESS = 'claude';

/**
 * How a person hands the default harness a long-lived token where no browser can: the variable it reads the token from, and the
 * command that prints one. A layer above keeps the person's token and gives it to the sessions it starts by this variable.
 */
export const DEFAULT_SIGN_IN: { readonly variable: string; readonly maker: string } = CLAUDE_SIGN_IN;

/** Whether a declaration lists `capability`: a runner of the consumer's (`undefined`) declares nothing. */
export const declares = (can: readonly Capability[] | undefined, capability: Capability): boolean =>
  can !== undefined && can.includes(capability);

/** The first capability a task asks of its harness that the harness's declaration does not list, or `undefined`. */
export const misplacedOf: MisplacedOf = (asked, can) => (can === undefined ? undefined : asked.find((c) => !can.includes(c)));

/** The names of the harnesses that declare `capability`, in the engine's order: the fix a refusal offers. */
export const takersOf: TakersOf = (capability, harnesses) =>
  harnesses.filter((h) => h.can !== undefined && h.can.includes(capability)).map((h) => h.name);

/** The harness an Engine verb goes to, read off the declarations: the one named, or the first that declares it; or why none. */
export const verbHarnessOf: VerbHarnessOf = (verb, name, harnesses) => {
  if (name !== undefined) {
    const h = harnesses.find((o) => o.name === name);
    if (h === undefined) return { kind: 'refused', reason: 'unknown' };
    return h.can !== undefined && h.can.includes(verb) ? { kind: 'taken', name: h.name } : { kind: 'refused', reason: 'undeclared' };
  }
  const first = harnesses.find((o) => o.can !== undefined && o.can.includes(verb));
  return first === undefined ? { kind: 'refused', reason: 'none' } : { kind: 'taken', name: first.name };
};

/**
 * The config of its own a harness's declaration says each neutral ask becomes, the asks it has no word for dropped: on Claude Code,
 * `remoteControl` becomes `claude.remoteControl`; on Codex, `trustRepository` becomes `codex.trustFrom`. `repo` is asked only where the
 * declaration takes `trustRepository`, so a caller reads the repository's real path only for a harness that uses it.
 */
export const ownArgsOf = (
  declaration: HarnessDeclaration | undefined,
  asked: { readonly trustRepository?: () => string | undefined; readonly remoteControl?: boolean },
): OwnArgs => {
  const trust = declaration?.asks?.trustRepository;
  const repo = trust === undefined ? undefined : asked.trustRepository?.();
  const bridge = asked.remoteControl === true ? declaration?.asks?.remoteControl : undefined;
  return { ...bridge, ...(trust === undefined || repo === undefined ? {} : trust(repo)) };
};

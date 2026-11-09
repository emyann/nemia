/**
 * Codex's vocabulary — the sandboxes and reasoning efforts it takes, and the sandbox a task naming none runs in. Harness
 * vocabulary, with no I/O, so a caller that only names words reads it without loading the runner (`codex.ts`).
 */
import type { FenceReach, HarnessDeclaration } from '../declaration.ts';

/**
 * Codex's sandboxes, narrowest first, which a task names as its `permissionMode`. `bypassPermissions`, Claude's
 * word, is also taken, as the widest: `danger-full-access`.
 */
export const CODEX_SANDBOXES: readonly string[] = ['read-only', 'workspace-write', 'danger-full-access'];

/**
 * The reasoning efforts the Codex API names for its default model. Codex checks
 * none itself: a bad one is sent, refused by the API, and the session exits 1 — so `file()` refuses
 * it first.
 */
export const CODEX_EFFORTS: readonly string[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

/** The sandbox a task runs in when it names none, and its tools leave it one that writes. */
export const CODEX_DEFAULT_SANDBOX = 'workspace-write';

/**
 * Codex's fence: its sandboxes, narrowest first, none of which it drops or stops to ask in. Its sandbox takes no allow rule, so no
 * sandbox refuses what a rule would have reached, and no tool is unruled or granted.
 */
const codexReach = (): FenceReach => ({
  by: 'sandbox',
  rank: Object.fromEntries(CODEX_SANDBOXES.map((sandbox, i) => [sandbox, i])),
  given: CODEX_DEFAULT_SANDBOX,
  writes: CODEX_SANDBOXES.indexOf('workspace-write'),
  unasking: [],
  dropped: [],
  refusing: [],
  unfenced: [],
  granted: {},
});

/**
 * What Codex declares: its own `config.codex`, the checkout's MCP servers it is handed, an environment, a read-only mount (its sandbox
 * reads the whole disk) and a memory limit; no session kept open and no Engine verb. A repository's trust is asked of it as
 * `config.codex.trustFrom`, the one place that key is spelled for a caller above.
 */
export const CODEX_DECLARATION: HarnessDeclaration = {
  can: ['codexArgs', 'projectMcp', 'env', 'readOnlyMount', 'memoryLimit'],
  ownKey: 'codex',
  knobs: {
    effort: CODEX_EFFORTS,
    fence: { key: 'sandbox', words: CODEX_SANDBOXES, lists: [] },
    context: false,
    flags: { only: ['trustFrom'] },
  },
  reach: codexReach,
  asks: { trustRepository: (repo) => ({ codex: { trustFrom: repo } }) },
  runsBrief: true,
};

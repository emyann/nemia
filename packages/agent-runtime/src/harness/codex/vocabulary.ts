/**
 * Codex's vocabulary — the sandboxes and reasoning efforts it takes, and the sandbox a task naming none runs in. Harness
 * vocabulary, with no I/O, so a caller that only names words reads it without loading the runner (`codex.ts`).
 */
import type { FenceReach, HarnessDeclaration, HarnessNeeds } from '../declaration.ts';

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

/** The command that logs Codex in on a machine with no browser, which a refusal and a layer above name. */
export const CODEX_SIGN_IN_COMMAND = 'codex login --device-auth';

/** The Codex this release was tested with: `@openai/codex` on npm, at the version `codex --version` answers. */
export const CODEX_PIN = '0.154.0';

/** The folder Codex's pin is installed into, under the tools folder. */
const CODEX_HOME = `"$NEMIA_TOOLS/harnesses/codex/${CODEX_PIN}"`;

/**
 * Codex's needs: `@openai/codex` at its pin, installed by npm under the tools folder and linked into its `bin/` (its program is a Node
 * script, run by the Node on the PATH a layer above gives); signed in by its own device login, whose code its output shows.
 */
const CODEX_NEEDS: HarnessNeeds = {
  program: 'codex',
  title: 'Codex',
  pin: CODEX_PIN,
  version: 'codex --version',
  check: 'command -v codex >/dev/null',
  install: `mkdir -p "$NEMIA_TOOLS/bin" && npm install -g --no-audit --no-fund --prefix ${CODEX_HOME} @openai/codex@${CODEX_PIN} && ln -sfn ${CODEX_HOME}/bin/codex "$NEMIA_TOOLS/bin/codex"`,
  remove: `rm -f "$NEMIA_TOOLS/bin/codex" && rm -rf "$NEMIA_TOOLS/harnesses/codex"`,
  signIn: {
    check: 'codex login status >/dev/null',
    fixes: [
      {
        command: CODEX_SIGN_IN_COMMAND,
        message: 'sign in with a device code, as the user the daemon runs as',
        code: '[A-Z0-9]{4,5}-[A-Z0-9]{4,5}',
      },
    ],
  },
};

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
  needs: CODEX_NEEDS,
};

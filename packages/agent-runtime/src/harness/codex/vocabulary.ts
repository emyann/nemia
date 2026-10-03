/**
 * Codex's vocabulary — the sandboxes and reasoning efforts it takes, and the sandbox a task naming none runs in. Harness
 * vocabulary, with no I/O, so a caller that only names words reads it without loading the runner (`codex.ts`).
 */

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

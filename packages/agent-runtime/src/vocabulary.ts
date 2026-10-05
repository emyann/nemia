/**
 * `agent-runtime/vocabulary`: the runtime's vocabulary, the words each harness takes, per key of a task's config (`HARNESS_CHOICES`),
 * what its fence words reach (`fenceReach`), and the folders it reads as its own configuration inside a mounted folder (`configFolderIn`),
 * with no Effect and no I/O, so a caller that only judges words imports it from anywhere. It loads the harnesses' vocabulary files,
 * `harness/choices.ts`, `harness/reach.ts` and `harness/config-folders.ts` alone (`test/vocabulary-door.test.ts`).
 */
export { CLAUDE_AUTO_DROPPED, CLAUDE_CONTEXT_TOKENS, CLAUDE_EFFORTS, CLAUDE_PERMISSION_MODES } from './harness/claude/vocabulary.ts';
export { CODEX_EFFORTS, CODEX_SANDBOXES } from './harness/codex/vocabulary.ts';
export { HARNESS_CHOICES } from './harness/choices.ts';
export { fenceReach, type FenceReach } from './harness/reach.ts';
export { CONFIG_FOLDERS, configFolderIn } from './harness/config-folders.ts';

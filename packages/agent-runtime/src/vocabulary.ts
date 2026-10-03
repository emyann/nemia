/**
 * `agent-runtime/vocabulary`: the runtime's vocabulary, the words each harness takes and what its fence words reach (`fenceReach`), with
 * no Effect and no I/O, so a caller that only judges words imports it from anywhere. It loads the harnesses' vocabulary files and
 * `harness/reach.ts` alone (`test/vocabulary-door.test.ts`).
 */
export { CLAUDE_AUTO_DROPPED, CLAUDE_CONTEXT_TOKENS, CLAUDE_EFFORTS, CLAUDE_PERMISSION_MODES } from './harness/claude/vocabulary.ts';
export { CODEX_EFFORTS, CODEX_SANDBOXES } from './harness/codex/vocabulary.ts';
export { fenceReach, type FenceReach } from './harness/reach.ts';

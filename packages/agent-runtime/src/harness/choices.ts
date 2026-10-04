/**
 * The words each default harness takes for a key of a task's config — `effort`, `permissionMode`, `sandbox` — keyed by the key, then by
 * the harness: the lists `configRefusal` judges a task's config by. `sandbox` is Codex's fence, which a task names as its
 * `permissionMode`. A harness with no list for a key has no such knob. Pure, reading the harnesses' vocabularies alone.
 */
import { CLAUDE_EFFORTS, CLAUDE_PERMISSION_MODES } from './claude/vocabulary.ts';
import { CODEX_EFFORTS, CODEX_SANDBOXES } from './codex/vocabulary.ts';

/** Each default harness's words for `effort`, `permissionMode` and `sandbox`, by key, then by harness. */
export const HARNESS_CHOICES: Readonly<Record<'effort' | 'permissionMode' | 'sandbox', Readonly<Record<string, readonly string[]>>>> = {
  effort: { claude: CLAUDE_EFFORTS, codex: CODEX_EFFORTS, 'claude-detached': CLAUDE_EFFORTS },
  permissionMode: { claude: CLAUDE_PERMISSION_MODES, 'claude-detached': CLAUDE_PERMISSION_MODES },
  sandbox: { codex: CODEX_SANDBOXES },
};

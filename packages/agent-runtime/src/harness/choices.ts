/**
 * The words each default harness takes for a key of a task's config — `effort`, `permissionMode`, `sandbox` — keyed by the key, then by
 * the harness: the lists `configRefusal` judges a task's config by. `sandbox` is Codex's fence, which a task names as its
 * `permissionMode`. A harness with no list for a key has no such knob. Each default harness's knobs as one record (`HARNESS_KNOBS`), for a
 * caller that judges a block of settings written for one harness. Pure, reading the harnesses' vocabularies alone.
 */
import { CLAUDE_EFFORTS, CLAUDE_OWNED_FLAGS, CLAUDE_PERMISSION_MODES } from './claude/vocabulary.ts';
import { CODEX_EFFORTS, CODEX_SANDBOXES } from './codex/vocabulary.ts';

/** Each default harness's words for `effort`, `permissionMode` and `sandbox`, by key, then by harness. */
export const HARNESS_CHOICES: Readonly<Record<'effort' | 'permissionMode' | 'sandbox', Readonly<Record<string, readonly string[]>>>> = {
  effort: { claude: CLAUDE_EFFORTS, codex: CODEX_EFFORTS },
  permissionMode: { claude: CLAUDE_PERMISSION_MODES },
  sandbox: { codex: CODEX_SANDBOXES },
};

/**
 * One harness's knobs, as a caller writing settings for it names them:
 * - `effort`: the words its effort takes;
 * - `fence`: the key its fence is named by (`permissionMode` or `sandbox`), that key's words, and the tool lists the fence also takes
 *   (`tools`, `allowedTools`, `disallowedTools`), none where its fence is one word;
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

/** Claude Code's knobs, a job's or a long-lived session's. */
const CLAUDE_KNOBS: HarnessKnobs = {
  effort: CLAUDE_EFFORTS,
  fence: { key: 'permissionMode', words: CLAUDE_PERMISSION_MODES, lists: ['tools', 'allowedTools', 'disallowedTools'] },
  context: true,
  flags: { owned: CLAUDE_OWNED_FLAGS },
};

/** Each default harness's knobs, by its name, under the names `HARNESS_CHOICES` keys its words by. */
export const HARNESS_KNOBS: Readonly<Record<string, HarnessKnobs>> = {
  claude: CLAUDE_KNOBS,
  codex: {
    effort: CODEX_EFFORTS,
    fence: { key: 'sandbox', words: CODEX_SANDBOXES, lists: [] },
    context: false,
    flags: { only: ['trustFrom'] },
  },
};

/**
 * `agent-runtime/vocabulary`: the runtime's vocabulary, the words each harness takes, per key of a task's config (`HARNESS_CHOICES`),
 * what each harness declares it can do (`HARNESS_DECLARATIONS`, `REMOTE_DECLARATION`) and the checks that read a declaration
 * (`misplacedOf`, `takersOf`, `verbHarnessOf`, `ownArgsOf`), the harness a task naming none runs on (`DEFAULT_HARNESS`), Claude
 * Code's permission matching and measured tool sets (`CLAUDE_RULES`, its declaration's `rules`),
 * each harness's knobs as one record (`HARNESS_KNOBS`), what its fence words reach (`fenceReach`), the first character of a path its
 * permission rules cannot carry (`unruledIn`), and the folders it reads as its own configuration inside a mounted folder
 * (`configFolderIn`), and a memory limit read off its quantity (`memoryBytesOf`, `memoryQuantityRefusal`), with no Effect and no
 * I/O, so a caller that only judges words imports it from anywhere. It loads the harnesses' vocabulary files,
 * `harness/declaration.ts`, `harness/claude/rules.ts`, `harness/choices.ts`, `harness/reach.ts`, `harness/config-folders.ts`,
 * `core/memory.ts` and `core/own.ts` alone (`test/vocabulary-door.test.ts`).
 */
export { CLAUDE_AUTO_DROPPED, CLAUDE_CONTEXT_TOKENS, CLAUDE_EFFORTS, CLAUDE_PERMISSION_MODES } from './harness/claude/vocabulary.ts';
export { CLAUDE_RULES, type ClaudeRules, type Dated } from './harness/claude/rules.ts';
export { CODEX_EFFORTS, CODEX_SANDBOXES } from './harness/codex/vocabulary.ts';
export {
  CAPABILITIES,
  DEFAULT_HARNESS,
  HARNESS_DECLARATIONS,
  declares,
  misplacedOf,
  ownArgsOf,
  takersOf,
  verbHarnessOf,
  type Capability,
  type HarnessDeclaration,
  type HarnessDeclared,
  type OwnArgs,
  type VerbHarness,
} from './harness/declaration.ts';
export { REMOTE_DECLARATION } from './a2a/vocabulary.ts';
export { HARNESS_CHOICES, HARNESS_KNOBS, type HarnessKnobs } from './harness/choices.ts';
export { fenceReach, unruledIn, type FenceReach } from './harness/reach.ts';
export { CONFIG_FOLDERS, configFolderIn } from './harness/config-folders.ts';
export type { Admission, AdmissionAnswer, AdmissionCall } from './harness/admission.ts';
export { memoryBytesOf, memoryQuantityRefusal } from './core/memory.ts';

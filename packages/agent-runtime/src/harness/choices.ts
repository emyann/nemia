/**
 * The words each default harness takes for a key of a task's config — `effort`, `permissionMode`, `sandbox` — keyed by the key, then by
 * the harness: the lists `configRefusal` judges a task's config by. `sandbox` is Codex's fence, which a task names as its
 * `permissionMode`. A harness with no list for a key has no such knob. Each default harness's knobs as one record (`HARNESS_KNOBS`), for a
 * caller that judges a block of settings written for one harness. Both are read off the harnesses' declarations (`declaration.ts`).
 */
import { HARNESS_DECLARATIONS, type HarnessKnobs } from './declaration.ts';

export type { HarnessKnobs } from './declaration.ts';

/** Each default harness's knobs, by its name: those whose declaration carries any. */
export const HARNESS_KNOBS: Readonly<Record<string, HarnessKnobs>> = Object.fromEntries(
  Object.entries(HARNESS_DECLARATIONS).flatMap(([name, d]) => (d.knobs === undefined ? [] : [[name, d.knobs] as const])),
);

/** The harnesses whose fence is named by `key`, with the words it takes. */
const fencedBy = (key: HarnessKnobs['fence']['key']): Record<string, readonly string[]> =>
  Object.fromEntries(Object.entries(HARNESS_KNOBS).flatMap(([name, k]) => (k.fence.key === key ? [[name, k.fence.words] as const] : [])));

/** Each default harness's words for `effort`, `permissionMode` and `sandbox`, by key, then by harness. */
export const HARNESS_CHOICES: Readonly<Record<'effort' | 'permissionMode' | 'sandbox', Readonly<Record<string, readonly string[]>>>> = {
  effort: Object.fromEntries(Object.entries(HARNESS_KNOBS).map(([name, k]) => [name, k.effort])),
  permissionMode: fencedBy('permissionMode'),
  sandbox: fencedBy('sandbox'),
};

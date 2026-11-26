/** What a step's latest attempt ran on, in the board's words, off the codes the api carries (`StepAttempts.latest`). Pure. */
import type { StepAttempts } from './api/tries.ts';

/**
 * The release, harness and model a session ran on: `v1.2.0 · <harness> <version> · <model>`, `checkout · <harness> <version>`, or
 * `not recorded` where its attempt recorded none of them — one an older runtime ran, or one whose runner could not say. Nothing for a
 * step with no attempt.
 * @param latest The step's latest attempt: its release, its harness and its model; null or undefined for a step with no attempt.
 */
export function ranOnWords(latest: Pick<NonNullable<StepAttempts['latest']>, 'release' | 'harness' | 'model'> | null | undefined) {
  if (!latest) return null;
  const { release, harness, model } = latest;
  const said = [
    ...(release === null ? [] : [release.kind === 'install' ? release.tag : 'checkout']),
    ...(harness === null ? [] : [`${harness.name} ${harness.version}`]),
    ...(model === null ? [] : [model]),
  ];
  return said.length ? said.join(' · ') : 'not recorded';
}

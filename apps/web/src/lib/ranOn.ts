/** What a step's latest attempt ran on, in the board's words, off the codes the api carries (`StepAttempts.latest`). Pure. */
import type { StepAttempts } from './api/tries.ts';

/**
 * The release and harness a session ran on: `v1.2.0 · <harness> <version>`, `checkout · <harness> <version>`, or `not recorded` where
 * its attempt recorded neither — one an older runtime ran, or one whose runner could not say. Nothing for a step with no attempt.
 */
export function ranOnWords(latest: Pick<NonNullable<StepAttempts['latest']>, 'release' | 'harness'> | null | undefined): string | null {
  if (!latest) return null;
  const { release, harness } = latest;
  const said = [
    ...(release === null ? [] : [release.kind === 'install' ? release.tag : 'checkout']),
    ...(harness === null ? [] : [`${harness.name} ${harness.version}`]),
  ];
  return said.length ? said.join(' · ') : 'not recorded';
}

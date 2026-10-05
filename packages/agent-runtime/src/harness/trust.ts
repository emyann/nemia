/**
 * Whether a harness trusts a folder to run a background session in (`trustedFolder`), for a caller that refuses to file one where its
 * spawn would be refused.
 */
import { claudeTrusts } from './claude/trust.ts';

/**
 * Whether harness `harness` trusts the folder `dir`, read off the harness's own file (`file`, its default when absent); `undefined` for a
 * harness that keeps no trust of a folder.
 */
export const trustedFolder = (harness: string, dir: string, file?: string): boolean | undefined =>
  harness === 'claude' || harness === 'claude-detached' ? claudeTrusts(dir, file) : undefined;

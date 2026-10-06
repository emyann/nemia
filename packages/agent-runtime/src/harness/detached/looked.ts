/**
 * What a detached harness's look at the names it was told found, gathered into an observation and the warnings to log.
 */
import type { Sighting } from '../../core/index.ts';
import type { Observation } from '../seam.ts';

/**
 * What a look told `names` found: each one's sighting, a name whose run file is there and gave none unread, why each of those was
 * (`unreadWhy`, its look's warning), and every warning the looks gave, an ended run's included. Takes each name's look: `undefined`
 * where no run file is there, `{}` where one is and could not be read.
 */
export const lookedFor = (
  names: readonly string[],
  look: (name: string) => { sighting?: Sighting; warning?: string } | undefined,
): { value: Observation; warnings: string[] } => {
  const seen = new Map<string, Sighting>();
  const unread = new Set<string>();
  const unreadWhy = new Map<string, string>();
  const warnings: string[] = [];
  for (const name of names) {
    const at = look(name);
    const { sighting, warning } = at ?? {};
    if (warning) warnings.push(warning);
    if (sighting) seen.set(name, sighting);
    else if (at) unread.add(name);
    if (!sighting && warning) unreadWhy.set(name, warning);
  }
  return { value: { seen, unread, ...(unreadWhy.size ? { unreadWhy } : {}) }, warnings };
};

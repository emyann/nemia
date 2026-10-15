/** What `ae compact` is asked, and the lines it prints of what `Engine.compact` answers. */
import type { CompactReport } from '../index.ts';

/** What `ae compact` is asked, off the arguments after it: `{ yes }`, given `--yes`. Refuses, with exit code 2, any other argument. */
export const compactAsked = (rest: readonly string[]): { yes: boolean } => {
  const other = rest.filter((a) => a !== '--yes');
  if (other.length)
    throw Object.assign(new Error(`compact: takes \`--yes\` to rewrite, or nothing to count; it was handed ${other.join(' ')}.`), {
      exitCode: 2,
    });
  return { yes: rest.length > 0 };
};

/** The lines `ae compact` prints for `report`: per harness, its captures and their bytes before and after, and each left with why. */
export const compactLines = (report: CompactReport): string[] => {
  const done = report.compacted ? 'rewritten' : 'to rewrite: `ae compact --yes` rewrites them';
  const lines = Object.entries(report.harnesses).flatMap(([harness, h]) => [
    `${harness}: ${h.captures} capture(s), ${h.compacted} ${done}; ${h.before} bytes before, ${h.after} after`,
    ...h.left.map((l) => `  left ${l.name}: ${l.why}`),
  ]);
  return lines.length ? lines : ['no harness keeps less of an ended capture: nothing to compact'];
};

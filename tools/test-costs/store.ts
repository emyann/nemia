/**
 * What the probe and the reporter read off disk: a package's name from its folder, and the fragments its probes left. Each read keeps
 * going past a file it cannot use: a recording never stops a check.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Fragment } from './costs.ts';

/** The name in `dir`'s `package.json`, or the folder's own name where it has none. */
export function packageOf(dir: string): string {
  let name: unknown;
  try {
    ({ name } = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as { name?: unknown });
  } catch (_error) {
    name = undefined;
  }
  return typeof name === 'string' && name ? name : path.basename(dir);
}

/** Whether a value read from a fragment's JSON has the fragment's shape. */
const isFragment = (value: unknown): value is Fragment => {
  const f = value as Partial<Record<keyof Fragment, unknown>> | null;
  return (
    typeof f?.file === 'string' &&
    [f.runner, f.wallMs, f.maxRssKb, f.cpuMs, f.probeMs].every((figure) => typeof figure === 'number' && Number.isFinite(figure))
  );
};

/** One fragment file read, or none when it does not parse or has another shape. */
function fragmentAt(file: string): Fragment[] {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return isFragment(value) ? [value] : [];
  } catch (_error) {
    return [];
  }
}

/** Every fragment in `dir`, none when the folder is not there; a file that does not read is left out. */
export function readFragments(dir: string): Fragment[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) => fragmentAt(path.join(dir, name)));
}

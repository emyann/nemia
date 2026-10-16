/**
 * A store's fingerprint, and what a worker's pages left in it: each page that writes to the store takes its write back before it ends,
 * so a worker's store after its last page is the store it seeded, file for file. `fingerprint` reads every file under the store with the
 * digest of its bytes, but what `unprinted` leaves out: what the api and git write as they serve, which no page wrote. `leftOver` says
 * which files differ, or nothing. Held by `e2e-print.test.ts`.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The files of a store no page answers for, by their path in it: a repository's own `.git` (git packs and logs what a page's take-back
 * puts back), the e2e's `claude` in `bin/`, and what the api keeps of its own reads.
 */
export const unprinted = (rel: string): boolean =>
  rel.split('/').includes('.git') || rel.startsWith('bin/') || UNPRINTED.some((pattern) => pattern.test(rel));

/**
 * What the api writes into its store as it serves the board, whatever a page does: the runner's sightings of a session's transcript
 * (`quiet/` under the engine's root), the feed its passes write of the runs they judged (`feed.jsonl` beside `runs/`), and the revisions
 * ledger a pass appends to for every kind a run of the seed resolves (`revisions/`, one file per kind and name).
 */
const UNPRINTED: readonly RegExp[] = [/^engine\/quiet\//, /^feed\.jsonl$/, /^revisions\//];

/** Every file under `root` but those `skip` leaves out, by its path in `root`, with the digest of its bytes; a link by where it leads. */
export function fingerprint(root: string, skip: (rel: string) => boolean = unprinted): Map<string, string> {
  const print = new Map<string, string>();
  for (const rel of fs.readdirSync(root, { recursive: true, encoding: 'utf8' })) {
    const posix = rel.split(path.sep).join('/');
    if (skip(posix)) continue;
    const file = path.join(root, rel);
    const stat = fs.lstatSync(file, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) print.set(posix, `-> ${fs.readlinkSync(file)}`);
    else if (stat?.isFile()) print.set(posix, createHash('sha1').update(fs.readFileSync(file)).digest('hex'));
  }
  return print;
}

/** The files that differ between two fingerprints of one store, each said as changed, added or removed, in the order of their paths. */
export function drift(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): string[] {
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
  return paths.flatMap((rel) => {
    const was = before.get(rel);
    const is = after.get(rel);
    if (was === is) return [];
    return [`${was === undefined ? 'added' : is === undefined ? 'removed' : 'changed'} ${rel}`];
  });
}

/**
 * Why a worker fails for what its pages left in its store, or null: the files that differ from the store it seeded, and the pages that
 * may have left them, the worker's pages in the order they were visited.
 */
export function leftOver(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>, pages: readonly string[]): string | null {
  const left = drift(before, after);
  if (!left.length) return null;
  return (
    `a page left a write in the store it did not take back, ${left[0]}${left.length > 1 ? ` and ${left.length - 1} more` : ''}, and ` +
    `the next page in its place would read it:\n    ${left.join('\n    ')}\n` +
    `  One of ${pages.join(', ')} wrote it: a page takes back what it writes before it ends (apps/web/CLAUDE.md). Run them one at a ` +
    'time (npm run e2e -- --pages <name>) to find which.'
  );
}

/**
 * The revisions ledger on disk: one file per kind and name, `$WF_ROOT/revisions/<kind>/<name>.json`, holding that content's entries in
 * order (`Revision`). Read (`ledgerOf`, `topsOf`) and appended to (`appendRevision`), this file being its one writer.
 *
 * One file per kind and name on purpose: a hand edit of one agent touches one file, and two passes resolving different kinds never
 * contend. An append is keyed by the digest — a content already in the ledger keeps the number it was given — so two passes resolving the
 * same edit at once give it one number, not two.
 */
import fs from 'node:fs';
import path from 'node:path';
import { revisionNow, type KindName, type Pin, type Revision, type RevisionKind } from './revisions.ts';
import { HOME } from '../record/record.store.ts';

/** Where the ledger lives: `$WF_ROOT/revisions`, beside `runs/`. */
export const revisionsDir = (): string => path.join(HOME, 'revisions');

/**
 * The file a kind and name's entries are kept in. The name is escaped (`encodeURIComponent`), since a skill's name holds a folder and a
 * colon (`apps/web:ds-build`) and would otherwise name a path of its own.
 */
const ledgerFile = (kind: RevisionKind, name: string): string => path.join(revisionsDir(), kind, `${encodeURIComponent(name)}.json`);

/** Whether `value` reads as one entry of a ledger. */
const isRevision = (value: unknown): value is Revision =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Revision).n === 'number' &&
  typeof (value as Revision).hash === 'string' &&
  typeof (value as Revision).at === 'string';

/**
 * The entries kept for `kind` and `name`, in the order they were given: `[]` for a ledger that is not there, does not read as JSON, or
 * holds no list — a hand edit of one kind leaves every other readable, and a file nobody can read gives the next resolve revision 1 again
 * rather than stopping the pass. An entry that does not read as one is left out.
 */
export function ledgerOf(kind: RevisionKind, name: string): Revision[] {
  let text: string;
  try {
    text = fs.readFileSync(ledgerFile(kind, name), 'utf8');
  } catch {
    return [];
  }
  try {
    const raw: unknown = JSON.parse(text);
    return Array.isArray(raw) ? raw.filter(isRevision) : [];
  } catch {
    return [];
  }
}

/** The entries written to `kind` and `name`'s file, whole, through a temporary file beside it so a reader never sees half of one. */
function writeLedger(kind: RevisionKind, name: string, entries: readonly Revision[]): void {
  const file = ledgerFile(kind, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(entries, null, 2)}\n`);
  fs.renameSync(temp, file);
}

/** How many times an append reads the ledger again to find its own entry, before it answers with the entry it computed. */
const APPEND_TRIES = 5;

/**
 * The revision `hash` stands at for `kind` and `name`, appended to the ledger when the content is new, and answered either way
 * (`revisionNow`). Appends nothing for a content the ledger already holds: that is what makes the ledger level-triggered — an edit gets
 * its number the first time anyone resolves it, and resolving again with no edit writes nothing.
 *
 * A pass that loses a race with another appending to the same file reads it again and keeps the entry that landed, so one content is one
 * number. After `APPEND_TRIES` reads that still do not hold it, the entry it computed is answered without being written: a number said
 * once is better than a pass that spins.
 */
export function appendRevision(kind: RevisionKind, name: string, hash: string, at: string): Revision {
  for (let tried = 0; tried < APPEND_TRIES; tried += 1) {
    const entries = ledgerOf(kind, name);
    const found = entries.find((e) => e.hash === hash);
    if (found) return found;
    writeLedger(kind, name, [...entries, revisionNow(entries, hash, at)]);
  }
  return revisionNow(ledgerOf(kind, name), hash, at);
}

/**
 * The top of each of `names`'s ledgers, as a pin: the last entry of each, left out for a kind and name whose ledger holds none. One read
 * per name, and nothing written.
 */
export const topsOf = (names: readonly KindName[]): Pin[] =>
  names.flatMap(({ kind, name }) => {
    const top = ledgerOf(kind, name).at(-1);
    return top ? [{ kind, name, n: top.n, hash: top.hash }] : [];
  });

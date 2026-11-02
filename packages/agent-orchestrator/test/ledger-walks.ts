/**
 * The Ledger door's contract (`LedgerDoor`, `src/revisions/revisions.store.ts`), as walks (`door-walks.ts`): every method's rows, run on
 * the files by `src/revisions/revisions.store.test.ts` and on the memory stand-in by `src/revisions/memory.store.test.ts`. A kind and
 * name never resolved holds no entry; a content appended is numbered 1, the next 2, the same content again keeps its number and writes
 * nothing; a workflow and an agent of one name are two ledgers. And the write check: an unknown kind, an empty name or an empty hash are
 * refused and nothing is written.
 *
 * Each walk is on a side of its own: a fresh store, or a fresh stand-in.
 */
import type { DoorWalk } from './door-walks.ts';
import { act, done } from './door-walks.ts';
import type { LedgerDoorShape, RevisionOf } from '../src/revisions/revisions.store.ts';

type Walk = DoorWalk<LedgerDoorShape>;

const AT = '2026-11-01T00:00:00.000Z';
const LATER = '2026-11-02T00:00:00.000Z';

const coder: RevisionOf = { kind: 'agent', name: 'coder' };

export const LEDGER_WALKS: Readonly<Record<string, readonly Walk[]>> = {
  'entries.of': [
    { name: 'none for a kind and name never resolved', walk: ({ door }) => done(door.entries.of(coder)), says: [] },
    {
      name: 'each entry appended, in order',
      walk: ({ door }) => {
        done(door.entries.append(coder, 'aaaa', AT));
        done(door.entries.append(coder, 'bbbb', LATER));
        return done(door.entries.of(coder));
      },
      says: [
        { n: 1, hash: 'aaaa', at: AT },
        { n: 2, hash: 'bbbb', at: LATER },
      ],
    },
  ],
  'entries.append': [
    {
      name: 'numbers a new content 1, then 2',
      walk: ({ door }) => [done(door.entries.append(coder, 'aaaa', AT)), done(door.entries.append(coder, 'bbbb', LATER))],
      says: [
        { n: 1, hash: 'aaaa', at: AT },
        { n: 2, hash: 'bbbb', at: LATER },
      ],
    },
    {
      name: 'same hash keeps its n, and writes nothing',
      walk: ({ door }) => {
        done(door.entries.append(coder, 'aaaa', AT));
        done(door.entries.append(coder, 'bbbb', AT));
        return { again: done(door.entries.append(coder, 'aaaa', LATER)), ledger: done(door.entries.of(coder)).length };
      },
      says: { again: { n: 1, hash: 'aaaa', at: AT }, ledger: 2 },
    },
    {
      name: 'a workflow and an agent of one name are apart',
      walk: ({ door }) => {
        done(door.entries.append({ kind: 'workflow', name: 'build' }, 'aaaa', AT));
        return [
          done(door.entries.append({ kind: 'agent', name: 'build' }, 'bbbb', AT)),
          done(door.entries.of({ kind: 'workflow', name: 'build' })),
        ];
      },
      says: [{ n: 1, hash: 'bbbb', at: AT }, [{ n: 1, hash: 'aaaa', at: AT }]],
    },
    {
      name: 'REFUSED: an unknown kind, an empty name, an empty hash or an `at` that is no time is Invalid, nothing written',
      walk: ({ door }) => ({
        made: [
          act(door.entries.append({ kind: 'tool', name: 'coder' } as unknown as RevisionOf, 'aaaa', AT)),
          act(door.entries.append({ kind: 'agent', name: '' }, 'aaaa', AT)),
          act(door.entries.append(coder, '', AT)),
          act(door.entries.append(coder, 'aaaa', 'yesterday')),
        ],
        ledgers: [done(door.entries.of({ kind: 'agent', name: '' })), done(door.entries.of(coder))],
      }),
      says: {
        made: [{ refused: 'Invalid' }, { refused: 'Invalid' }, { refused: 'Invalid' }, { refused: 'Invalid' }],
        ledgers: [[], []],
      },
    },
  ],
};

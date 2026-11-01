/**
 * The Card door's contract (`CardDoor`, `src/cards/cards.store.ts`), as walks (`door-walks.ts`): every method's rows, run on the files
 * by `src/cards/cards.store.test.ts` and on the memory stand-in by `src/cards/memory.store.test.ts`. A card filed is listed and read
 * back, written back and read again with its filing time kept, dropped and gone; a try written is listed, written over and removed. And
 * the write check: a card under a name that is no card's, at a name taken, or whose text does not read as a card or breaks the model's
 * `Card`, a card written back that is not there, and a try under a bad name or that is no `MissedStart`, are refused and nothing is
 * written.
 *
 * Each walk is on a side of its own: a fresh store, or a fresh stand-in.
 */
import type { DoorWalk } from './door-walks.ts';
import { act, done } from './door-walks.ts';
import type { CardDoorShape } from '../src/cards/cards.store.ts';
import { CardName } from '../src/inbox/inbox.model.ts';
import type { MissedStart } from '../src/inbox/index.ts';

type Walk = DoorWalk<CardDoorShape>;
type Door = CardDoorShape;

const nameOf = (name: string): CardName => CardName.read(name);

/** A card's text as `nemia inbox add` files one (`ideaCard`): its keys as YAML frontmatter, where it has any, then its body. */
export const aCard = (body: string, keys: Readonly<Record<string, string>> = {}): string => {
  const pairs = Object.entries(keys);
  return pairs.length ? `---\n${pairs.map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n${body}\n` : `${body}\n`;
};

/** `name` filed on `door`, with `text`. */
const filed = (door: Door, name: string, text = aCard('An idea')): string => done(door.cards.add(nameOf(name), text));

/** A try as the tick writes one. */
const aTry = (why: string): MissedStart => ({ at: '2026-11-01T00:00:00.000Z', text: aCard('An idea'), repo: '/repo', why, refused: true });

/** The names of the cards filed on `door`. */
const listed = (door: Door): string[] => done(door.cards.entries()).map((e) => e.file);

export const CARD_WALKS: Readonly<Record<string, readonly Walk[]>> = {
  'cards.entries': [
    { name: 'none in an empty inbox', walk: ({ door }) => done(door.cards.entries()), says: [] },
    {
      name: 'each card filed, with its text, sorted by its file',
      walk: ({ door }) => {
        filed(door, 'zeta-idea', aCard('Zeta'));
        filed(door, 'alpha-idea', aCard('Alpha', { workflow: 'build' }));
        return done(door.cards.entries());
      },
      says: [
        { file: 'alpha-idea.md', text: aCard('Alpha', { workflow: 'build' }) },
        { file: 'zeta-idea.md', text: aCard('Zeta') },
      ],
    },
  ],
  'cards.read': [
    { name: 'no card is null', walk: ({ door }) => done(door.cards.read(nameOf('gone-idea'))), says: null },
    {
      name: 'what was filed',
      walk: ({ door }) => {
        filed(door, 'an-idea', aCard('Read me'));
        return done(door.cards.read(nameOf('an-idea')));
      },
      says: aCard('Read me'),
    },
  ],
  'cards.filedAt': [
    { name: 'no card is null', walk: ({ door }) => done(door.cards.filedAt(nameOf('gone-idea'))), says: null },
    {
      name: 'a time, the same across a write back',
      walk: ({ door }) => {
        filed(door, 'an-idea');
        const before = done(door.cards.filedAt(nameOf('an-idea')));
        done(door.cards.rewrite(nameOf('an-idea'), aCard('Rewritten')));
        return { time: typeof before === 'string', kept: done(door.cards.filedAt(nameOf('an-idea'))) === before };
      },
      says: { time: true, kept: true },
    },
  ],
  'cards.add': [
    { name: 'filed at its name, in the inbox', walk: ({ door }) => filed(door, 'an-idea'), says: '<root>/inbox/an-idea.md' },
    {
      name: 'REFUSED: a name taken is a Conflict, the first card kept',
      walk: ({ door }) => {
        filed(door, 'an-idea', aCard('First'));
        return { again: act(door.cards.add(nameOf('an-idea'), aCard('Second'))), text: done(door.cards.read(nameOf('an-idea'))) };
      },
      says: { again: { refused: 'Conflict' }, text: aCard('First') },
    },
    {
      name: "REFUSED: a name that is no card's is Invalid, nothing filed",
      walk: ({ door }) => ({
        made: ['../x', '.hidden', 'a/b'].map((name) => act(door.cards.add(nameOf(name), aCard('Out')))),
        list: listed(door),
      }),
      says: { made: [{ refused: 'Invalid' }, { refused: 'Invalid' }, { refused: 'Invalid' }], list: [] },
    },
    {
      name: 'REFUSED: a text that does not read as a card is Invalid, nothing filed',
      walk: ({ door }) => ({ made: act(door.cards.add(nameOf('an-idea'), '---\nworkflow: build\n\nNo end to it\n')), list: listed(door) }),
      says: { made: { refused: 'Invalid' }, list: [] },
    },
    {
      name: "REFUSED: a card breaking the model's Card — queued with no workflow, a run named twice in from: — is Invalid, nothing filed",
      walk: ({ door }) => ({
        made: [
          act(door.cards.add(nameOf('a-queued'), aCard('Queued', { queued: '2026-11-01T00:00:00.000Z' }))),
          act(door.cards.add(nameOf('a-from'), aCard('From', { from: '[r-one-a1b2, r-one-a1b2]' }))),
        ],
        list: listed(door),
      }),
      says: { made: [{ refused: 'Invalid' }, { refused: 'Invalid' }], list: [] },
    },
  ],
  'cards.rewrite': [
    {
      name: 'read back',
      walk: ({ door }) => {
        filed(door, 'an-idea');
        done(door.cards.rewrite(nameOf('an-idea'), aCard('After', { workflow: 'build' })));
        return done(door.cards.read(nameOf('an-idea')));
      },
      says: aCard('After', { workflow: 'build' }),
    },
    {
      name: 'REFUSED: no card is Missing, and none is filed',
      walk: ({ door }) => ({ written: act(door.cards.rewrite(nameOf('gone-idea'), aCard('Anew'))), list: listed(door) }),
      says: { written: { refused: 'Missing' }, list: [] },
    },
    {
      name: "REFUSED: a text breaking the model's Card is Invalid, the old text kept",
      walk: ({ door }) => {
        filed(door, 'an-idea', aCard('Before'));
        const written = act(door.cards.rewrite(nameOf('an-idea'), aCard('Queued', { queued: '2026-11-01T00:00:00.000Z' })));
        return { written, text: done(door.cards.read(nameOf('an-idea'))) };
      },
      says: { written: { refused: 'Invalid' }, text: aCard('Before') },
    },
  ],
  'cards.drop': [
    {
      name: 'true, then false, then read is null',
      walk: ({ door }) => {
        filed(door, 'an-idea');
        const name = nameOf('an-idea');
        return [done(door.cards.drop(name)), done(door.cards.drop(name)), done(door.cards.read(name))];
      },
      says: [true, false, null],
    },
  ],
  'cards.where': [
    { name: 'its file in the inbox', walk: ({ door }) => done(door.cards.where(nameOf('an-idea'))), says: '<root>/inbox/an-idea.md' },
  ],
  'tries.list': [
    { name: 'none with no try', walk: ({ door }) => done(door.tries.list()), says: {} },
    {
      name: 'each try written, by its card',
      walk: ({ door }) => {
        done(door.tries.put(nameOf('zeta-idea'), aTry('gone')));
        done(door.tries.put(nameOf('alpha-idea'), aTry('refused')));
        return [...done(door.tries.list()).keys()];
      },
      says: ['alpha-idea', 'zeta-idea'],
    },
  ],
  'tries.put': [
    {
      name: 'the latest of two is kept',
      walk: ({ door }) => {
        done(door.tries.put(nameOf('an-idea'), aTry('first')));
        done(door.tries.put(nameOf('an-idea'), aTry('second')));
        return done(door.tries.list());
      },
      says: { 'an-idea': aTry('second') },
    },
    {
      name: "REFUSED: a name that is no card's is Invalid, nothing written",
      walk: ({ door }) => ({ put: act(door.tries.put(nameOf('../x'), aTry('out'))), tries: done(door.tries.list()) }),
      says: { put: { refused: 'Invalid' }, tries: {} },
    },
    {
      name: 'REFUSED: a try missing `refused` is Invalid, nothing written',
      walk: ({ door }) => {
        const { refused: _, ...torn } = aTry('torn');
        return { put: act(door.tries.put(nameOf('an-idea'), torn as MissedStart)), tries: done(door.tries.list()) };
      },
      says: { put: { refused: 'Invalid' }, tries: {} },
    },
  ],
  'tries.drop': [
    {
      name: 'gone, and a try not there is no refusal',
      walk: ({ door }) => {
        done(door.tries.put(nameOf('an-idea'), aTry('first')));
        done(door.tries.drop(nameOf('an-idea')));
        done(door.tries.drop(nameOf('never-idea')));
        return done(door.tries.list());
      },
      says: {},
    },
  ],
};

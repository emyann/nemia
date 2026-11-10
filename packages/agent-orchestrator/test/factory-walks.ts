/**
 * The Factory door's contract (`FactoryDoor`, `src/factory/door/factories.store.ts`), as walks (`door-walks.ts`): every method's rows, run
 * on the files by `src/factory/door/factories.store.test.ts` and on the memory stand-in by `src/factory/door/memory.store.test.ts`. A
 * factory filed is listed and read back, written back and read again, removed and gone; a level, rules and servers written are read back,
 * and taken back. And the write check: a new factory under a name that is no slug, under the default factory's, or at a name taken, and a
 * factory written that breaks an invariant of the model's `Factory` — no repository, a hire into a workflow it does not offer — is refused
 * and nothing is written.
 *
 * Each walk is on a side of its own: a fresh store, or a fresh stand-in.
 */
import assert from 'node:assert/strict';
import type { DoorWalk } from './door-walks.ts';
import { act, done } from './door-walks.ts';
import type { FactoryDoorShape } from '../src/factory/door/factories.store.ts';
import { FactoryName, isDefaultFactory } from '../src/factory/factory.model.ts';
import type { Factory } from '../src/factory/factory.ts';

type Walk = DoorWalk<FactoryDoorShape>;
type Door = FactoryDoorShape;

const nameOf = (name: string): FactoryName => FactoryName.read(name);

/** A factory as `nemia factory add` files one: one repository, nothing attached, hired or scheduled. */
export const aFactory = (name: string, more: Partial<Factory> = {}): Factory => ({
  name,
  repos: ['/repo'],
  workflows: [],
  hires: {},
  schedules: {},
  ...more,
});

/** The factory `name` read back from `door` as filed: a read that answers the default factory's record fails the walk. */
export const readFiled = (door: Door, name: string): Factory => {
  const record = done(door.factories.read(nameOf(name)));
  if (isDefaultFactory(record)) assert.fail(`${name} read as the default factory`);
  return record;
};

/** `name` filed on `door`. */
const filed = (door: Door, name: string, more: Partial<Factory> = {}): string => done(door.factories.create(aFactory(name, more)));

const since = '2026-11-01T00:00:00.000Z';

export const FACTORY_WALKS: Readonly<Record<string, readonly Walk[]>> = {
  'factories.list': [
    { name: 'the default factory alone in an empty store', walk: ({ door }) => done(door.factories.list()), says: ['default'] },
    {
      name: 'the default factory first, then each filed, by name, sorted',
      walk: ({ door }) => {
        filed(door, 'zeta');
        filed(door, 'alpha');
        return done(door.factories.list());
      },
      says: ['default', 'alpha', 'zeta'],
    },
  ],
  'factories.listed': [
    {
      name: 'each filed as it reads, with its file, by name; the default factory, which is no file, not among them',
      walk: ({ door }) => {
        filed(door, 'zeta', { workflows: ['build'] });
        filed(door, 'alpha');
        return done(door.factories.listed()).map((l) => ({ name: l.name, file: l.file, workflows: 'workflows' in l ? l.workflows : [] }));
      },
      says: [
        { name: 'alpha', file: '<root>/factories/alpha.json', workflows: [] },
        { name: 'zeta', file: '<root>/factories/zeta.json', workflows: ['build'] },
      ],
    },
  ],
  'factories.read': [
    { name: 'no factory is Missing', walk: ({ door }) => act(door.factories.read(nameOf('acme'))), says: { refused: 'Missing' } },
    {
      name: 'the default factory is its record, in an empty store, with no file written',
      walk: ({ door }) => ({ read: done(door.factories.read(nameOf('default'))), list: done(door.factories.list()) }),
      says: { read: { kind: 'default', name: 'default' }, list: ['default'] },
    },
    {
      name: 'what was filed',
      walk: ({ door }) => {
        filed(door, 'acme', { workflows: ['build'], hires: { 'build/implement': 'implementer' } });
        const { name, repos, workflows, hires, schedules } = readFiled(door, 'acme');
        return { name, repos, workflows, hires, schedules };
      },
      says: { name: 'acme', repos: ['/repo'], workflows: ['build'], hires: { 'build/implement': 'implementer' }, schedules: {} },
    },
  ],
  'factories.create': [
    { name: 'filed at its name', walk: ({ door }) => filed(door, 'acme'), says: '<root>/factories/acme.json' },
    {
      name: 'REFUSED: a name taken is a Conflict, the first left as it was',
      walk: ({ door }) => {
        filed(door, 'acme');
        const again = act(door.factories.create(aFactory('acme', { repos: ['/other'] })));
        return { again, repos: readFiled(door, 'acme').repos };
      },
      says: { again: { refused: 'Conflict' }, repos: ['/repo'] },
    },
    {
      name: 'REFUSED: a name that is no slug is Invalid, nothing filed',
      walk: ({ door }) => ({ made: act(door.factories.create(aFactory('Bad Name'))), list: done(door.factories.list()) }),
      says: { made: { refused: 'Invalid' }, list: ['default'] },
    },
    {
      name: 'REFUSED: the default factory is a Conflict, nothing filed',
      walk: ({ door }) => ({ made: act(door.factories.create(aFactory('default'))), list: done(door.factories.list()) }),
      says: { made: { refused: 'Conflict' }, list: ['default'] },
    },
    {
      name: 'REFUSED: no repository is Invalid, nothing filed',
      walk: ({ door }) => ({ made: act(door.factories.create(aFactory('acme', { repos: [] }))), list: done(door.factories.list()) }),
      says: { made: { refused: 'Invalid' }, list: ['default'] },
    },
  ],
  'factories.rewrite': [
    {
      name: 'a hire written is read back',
      walk: ({ door }) => {
        filed(door, 'acme', { workflows: ['build'] });
        const file = done(door.factories.rewrite(aFactory('acme', { workflows: ['build'], hires: { 'build/review': 'reviewer' } })));
        return { file, hires: readFiled(door, 'acme').hires };
      },
      says: { file: '<root>/factories/acme.json', hires: { 'build/review': 'reviewer' } },
    },
    {
      name: 'REFUSED: a hire into a workflow it does not offer is Invalid, nothing written',
      walk: ({ door }) => {
        filed(door, 'acme', { workflows: ['build'] });
        const written = act(door.factories.rewrite(aFactory('acme', { workflows: ['build'], hires: { 'ship/land': 'shipper' } })));
        return { written, hires: readFiled(door, 'acme').hires };
      },
      says: { written: { refused: 'Invalid' }, hires: {} },
    },
    {
      name: 'REFUSED: no factory is Missing',
      walk: ({ door }) => act(door.factories.rewrite(aFactory('acme'))),
      says: { refused: 'Missing' },
    },
    {
      name: 'REFUSED: the default factory is a Conflict, nothing written',
      walk: ({ door }) => ({ written: act(door.factories.rewrite(aFactory('default'))), list: done(door.factories.list()) }),
      says: { written: { refused: 'Conflict' }, list: ['default'] },
    },
    {
      name: 'filed at generation 1, a hire counts one change more, a schedule none, and a generation sent is not taken',
      walk: ({ door }) => {
        filed(door, 'acme', { workflows: ['build'] });
        const generation = () => readFiled(door, 'acme').generation;
        const filedAt = generation();
        done(door.factories.rewrite(aFactory('acme', { workflows: ['build'], hires: { 'build/review': 'reviewer' } })));
        const hired = generation();
        const schedule = { cron: '0 9 * * 1', brief: 'weekly', since };
        done(
          door.factories.rewrite(
            aFactory('acme', { workflows: ['build'], hires: { 'build/review': 'reviewer' }, schedules: { build: schedule } }),
          ),
        );
        const scheduled = generation();
        done(
          door.factories.rewrite(
            aFactory('acme', {
              workflows: ['build'],
              hires: { 'build/review': 'reviewer' },
              schedules: { build: schedule },
              generation: 9,
            }),
          ),
        );
        return { filedAt, hired, scheduled, sent: generation() };
      },
      says: { filedAt: 1, hired: 2, scheduled: 2, sent: 2 },
    },
  ],
  'factories.remove': [
    {
      name: 'removed, then Missing on a read and on a second remove',
      walk: ({ door }) => {
        filed(door, 'acme');
        return {
          file: done(door.factories.remove(nameOf('acme'))),
          read: act(door.factories.read(nameOf('acme'))),
          again: act(door.factories.remove(nameOf('acme'))),
        };
      },
      says: { file: '<root>/factories/acme.json', read: { refused: 'Missing' }, again: { refused: 'Missing' } },
    },
    {
      name: 'REFUSED: the default factory is a Conflict, and still read',
      walk: ({ door }) => ({ removed: act(door.factories.remove(nameOf('default'))), read: done(door.factories.read(nameOf('default'))) }),
      says: { removed: { refused: 'Conflict' }, read: { kind: 'default', name: 'default' } },
    },
  ],
  'level.read': [
    { name: 'none where none was written', walk: ({ door }) => done(door.level.read(nameOf('acme'))) ?? 'none', says: 'none' },
    {
      name: "none for the default factory, whose level is the store's",
      walk: ({ door }) => done(door.level.read(nameOf('default'))) ?? 'none',
      says: 'none',
    },
  ],
  'level.write': [
    {
      name: 'read back as written, and gone once it says neither a level nor a raise',
      walk: ({ door }) => {
        done(door.level.write(nameOf('acme'), { level: 'auto', since }));
        const written = done(door.level.read(nameOf('acme')));
        done(door.level.write(nameOf('acme'), { since }));
        return { written, after: done(door.level.read(nameOf('acme'))) ?? 'none' };
      },
      says: { written: { level: 'auto', since }, after: 'none' },
    },
    {
      name: "a level that changes counts one change more of the factory's generation; written again the same, it counts none",
      walk: ({ door }) => {
        filed(door, 'acme');
        done(door.level.write(nameOf('acme'), { level: 'auto', since }));
        const changed = readFiled(door, 'acme').generation;
        done(door.level.write(nameOf('acme'), { level: 'auto', since: '2026-11-02T00:00:00.000Z' }));
        return { changed, same: readFiled(door, 'acme').generation };
      },
      says: { changed: 2, same: 2 },
    },
    {
      name: 'REFUSED: a name that is no slug is Invalid',
      walk: ({ door }) => act(door.level.write(nameOf('Bad Name'), { level: 'auto', since })),
      says: { refused: 'Invalid' },
    },
    {
      name: "REFUSED: the default factory, whose level is the store's, is a Conflict, nothing written",
      walk: ({ door }) => ({
        written: act(door.level.write(nameOf('default'), { level: 'auto', since })),
        read: done(door.level.read(nameOf('default'))) ?? 'none',
      }),
      says: { written: { refused: 'Conflict' }, read: 'none' },
    },
  ],
  'instruction.read': [
    {
      name: "none in its first folder where its file names no place; no factory is Missing; the default factory's is a Conflict",
      walk: ({ door }) => {
        const none = act(door.instruction.read(nameOf('acme')));
        filed(door, 'acme');
        return { none, read: done(door.instruction.read(nameOf('acme'))), default: act(door.instruction.read(nameOf('default'))) };
      },
      says: {
        none: { refused: 'Missing' },
        read: { name: 'acme', path: null, store: false, file: '/repo/NEMIA.md', words: null, error: null, stored: false },
        default: { refused: 'Conflict' },
      },
    },
  ],
  'instruction.write': [
    {
      name: 'kept in the store, written and read back, trimmed',
      walk: ({ door }) => {
        filed(door, 'acme', { instruction: { store: true } });
        const file = done(door.instruction.write(nameOf('acme'), '  Ship small.\n\n'));
        const { words, stored } = done(door.instruction.read(nameOf('acme')));
        return { file, words, stored };
      },
      says: { file: '<root>/factories/acme/NEMIA.md', words: 'Ship small.\n', stored: true },
    },
    {
      name: 'REFUSED: one kept in its first folder is a Conflict; blank words are Invalid; nothing written',
      walk: ({ door }) => {
        filed(door, 'acme');
        filed(door, 'kept', { instruction: { store: true } });
        return {
          folder: act(door.instruction.write(nameOf('acme'), 'Ship small.')),
          blank: act(door.instruction.write(nameOf('kept'), '  \n')),
          stored: done(door.instruction.read(nameOf('kept'))).stored,
        };
      },
      says: { folder: { refused: 'Conflict' }, blank: { refused: 'Invalid' }, stored: false },
    },
    {
      name: 'REFUSED: the default factory is a Conflict',
      walk: ({ door }) => act(door.instruction.write(nameOf('default'), 'Ship small.')),
      says: { refused: 'Conflict' },
    },
  ],
  'instruction.clear': [
    {
      name: 'cleared once, then nothing to clear; the default factory is a Conflict',
      walk: ({ door }) => {
        filed(door, 'acme', { instruction: { store: true } });
        done(door.instruction.write(nameOf('acme'), 'Ship small.'));
        return {
          first: done(door.instruction.clear(nameOf('acme'))),
          second: done(door.instruction.clear(nameOf('acme'))),
          default: act(door.instruction.clear(nameOf('default'))),
        };
      },
      says: { first: true, second: false, default: { refused: 'Conflict' } },
    },
  ],
  'servers.read': [{ name: 'none where none was written', walk: ({ door }) => done(door.servers.read(nameOf('acme'))), says: {} }],
  'servers.write': [
    {
      name: 'read back as written, and gone once none is left',
      walk: ({ door }) => {
        done(door.servers.write(nameOf('acme'), { docs: { type: 'http', url: 'https://docs.example/mcp' } }));
        const written = done(door.servers.read(nameOf('acme')));
        done(door.servers.write(nameOf('acme'), {}));
        return { written, after: done(door.servers.read(nameOf('acme'))) };
      },
      says: { written: { docs: { type: 'http', url: 'https://docs.example/mcp' } }, after: {} },
    },
    {
      name: 'the default factory keeps servers of its own, every run and card that names no factory running in it',
      walk: ({ door }) => {
        done(door.servers.write(nameOf('default'), { docs: { type: 'http', url: 'https://docs.example/mcp' } }));
        return { read: done(door.servers.read(nameOf('default'))), list: done(door.factories.list()) };
      },
      says: { read: { docs: { type: 'http', url: 'https://docs.example/mcp' } }, list: ['default'] },
    },
  ],
  'rules.read': [
    {
      name: 'none where none was written; no factory is Missing',
      walk: ({ door }) => {
        const none = act(door.rules.read(nameOf('acme')));
        filed(door, 'acme');
        return { none, read: done(door.rules.read(nameOf('acme'))) };
      },
      says: { none: { refused: 'Missing' }, read: { file: '<root>/factories/acme/RULES.md', words: null, error: null } },
    },
    {
      name: 'REFUSED: the default factory, which keeps none, is a Conflict',
      walk: ({ door }) => act(door.rules.read(nameOf('default'))),
      says: { refused: 'Conflict' },
    },
  ],
  'rules.write': [
    {
      name: 'read back as written, trimmed',
      walk: ({ door }) => {
        filed(door, 'acme');
        const file = done(door.rules.write(nameOf('acme'), '  Say what you changed.\n\n'));
        return { file, read: done(door.rules.read(nameOf('acme'))) };
      },
      says: {
        file: '<root>/factories/acme/RULES.md',
        read: { file: '<root>/factories/acme/RULES.md', words: 'Say what you changed.', error: null },
      },
    },
    {
      name: 'REFUSED: blank rules are Invalid, nothing written',
      walk: ({ door }) => {
        filed(door, 'acme');
        return { written: act(door.rules.write(nameOf('acme'), '  \n')), read: done(door.rules.read(nameOf('acme'))) };
      },
      says: { written: { refused: 'Invalid' }, read: { file: '<root>/factories/acme/RULES.md', words: null, error: null } },
    },
    {
      name: 'REFUSED: the default factory is a Conflict',
      walk: ({ door }) => act(door.rules.write(nameOf('default'), 'Say what you changed.')),
      says: { refused: 'Conflict' },
    },
  ],
  'rules.clear': [
    {
      name: 'cleared once, then nothing to clear',
      walk: ({ door }) => {
        filed(door, 'acme');
        done(door.rules.write(nameOf('acme'), 'Say what you changed.'));
        return { first: done(door.rules.clear(nameOf('acme'))), second: done(door.rules.clear(nameOf('acme'))) };
      },
      says: { first: true, second: false },
    },
    {
      name: 'REFUSED: the default factory is a Conflict',
      walk: ({ door }) => act(door.rules.clear(nameOf('default'))),
      says: { refused: 'Conflict' },
    },
  ],
};

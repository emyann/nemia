/**
 * The Factory door's contract (`FactoryDoor`, `src/factory/factories.store.ts`), as walks (`door-walks.ts`): every method's rows, run on
 * the files by `src/factory/factories.store.test.ts` and on the memory stand-in by `src/factory/memory.store.test.ts`. A factory filed
 * is listed and read back, written back and read again, removed and gone; a level, rules and servers written are read back, and taken
 * back. And the write check: a new factory under a name that is no slug, under the default factory's, or at a name taken, and a factory
 * written that breaks an invariant of the model's `Factory` — no repository, a hire into a workflow it does not offer — is refused and
 * nothing is written.
 *
 * Each walk is on a side of its own: a fresh store, or a fresh stand-in.
 */
import type { DoorWalk } from './door-walks.ts';
import { act, done } from './door-walks.ts';
import type { FactoryDoorShape } from '../src/factory/factories.store.ts';
import { FactoryName } from '../src/factory/factory.model.ts';
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

/** `name` filed on `door`. */
const filed = (door: Door, name: string, more: Partial<Factory> = {}): string => done(door.factories.create(aFactory(name, more)));

const since = '2026-11-01T00:00:00.000Z';

export const FACTORY_WALKS: Readonly<Record<string, readonly Walk[]>> = {
  'factories.list': [
    { name: 'none in an empty store', walk: ({ door }) => done(door.factories.list()), says: [] },
    {
      name: 'each filed, by name, sorted',
      walk: ({ door }) => {
        filed(door, 'zeta');
        filed(door, 'alpha');
        return done(door.factories.list());
      },
      says: ['alpha', 'zeta'],
    },
  ],
  'factories.read': [
    { name: 'no factory is Missing', walk: ({ door }) => act(door.factories.read(nameOf('acme'))), says: { refused: 'Missing' } },
    {
      name: 'what was filed',
      walk: ({ door }) => {
        filed(door, 'acme', { workflows: ['build'], hires: { 'build/implement': 'grace' } });
        const { name, repos, workflows, hires, schedules } = done(door.factories.read(nameOf('acme')));
        return { name, repos, workflows, hires, schedules };
      },
      says: { name: 'acme', repos: ['/repo'], workflows: ['build'], hires: { 'build/implement': 'grace' }, schedules: {} },
    },
  ],
  'factories.create': [
    { name: 'filed at its name', walk: ({ door }) => filed(door, 'acme'), says: '<root>/factories/acme.json' },
    {
      name: 'REFUSED: a name taken is a Conflict, the first left as it was',
      walk: ({ door }) => {
        filed(door, 'acme');
        const again = act(door.factories.create(aFactory('acme', { repos: ['/other'] })));
        return { again, repos: done(door.factories.read(nameOf('acme'))).repos };
      },
      says: { again: { refused: 'Conflict' }, repos: ['/repo'] },
    },
    {
      name: 'REFUSED: a name that is no slug is Invalid, nothing filed',
      walk: ({ door }) => ({ made: act(door.factories.create(aFactory('Bad Name'))), list: done(door.factories.list()) }),
      says: { made: { refused: 'Invalid' }, list: [] },
    },
    {
      name: 'REFUSED: the default factory is a Conflict, nothing filed',
      walk: ({ door }) => ({ made: act(door.factories.create(aFactory('default'))), list: done(door.factories.list()) }),
      says: { made: { refused: 'Conflict' }, list: [] },
    },
    {
      name: 'REFUSED: no repository is Invalid, nothing filed',
      walk: ({ door }) => ({ made: act(door.factories.create(aFactory('acme', { repos: [] }))), list: done(door.factories.list()) }),
      says: { made: { refused: 'Invalid' }, list: [] },
    },
  ],
  'factories.rewrite': [
    {
      name: 'a hire written is read back',
      walk: ({ door }) => {
        filed(door, 'acme', { workflows: ['build'] });
        const file = done(door.factories.rewrite(aFactory('acme', { workflows: ['build'], hires: { 'build/review': 'agora' } })));
        return { file, hires: done(door.factories.read(nameOf('acme'))).hires };
      },
      says: { file: '<root>/factories/acme.json', hires: { 'build/review': 'agora' } },
    },
    {
      name: 'REFUSED: a hire into a workflow it does not offer is Invalid, nothing written',
      walk: ({ door }) => {
        filed(door, 'acme', { workflows: ['build'] });
        const written = act(door.factories.rewrite(aFactory('acme', { workflows: ['build'], hires: { 'ship/land': 'otto' } })));
        return { written, hires: done(door.factories.read(nameOf('acme'))).hires };
      },
      says: { written: { refused: 'Invalid' }, hires: {} },
    },
    {
      name: 'REFUSED: no factory is Missing',
      walk: ({ door }) => act(door.factories.rewrite(aFactory('acme'))),
      says: { refused: 'Missing' },
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
  ],
  'level.read': [
    { name: 'none where none was written', walk: ({ door }) => done(door.level.read(nameOf('acme'))) ?? 'none', says: 'none' },
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
      name: 'REFUSED: a name that is no slug is Invalid',
      walk: ({ door }) => act(door.level.write(nameOf('Bad Name'), { level: 'auto', since })),
      says: { refused: 'Invalid' },
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
  ],
  'rules.read': [
    {
      name: 'none where none was written; no factory is Missing',
      walk: ({ door }) => {
        const none = act(door.rules.read(nameOf('acme')));
        filed(door, 'acme');
        return { none, read: done(door.rules.read(nameOf('acme'))) };
      },
      says: { none: { refused: 'Missing' }, read: { words: null, error: null } },
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
      says: { file: '<root>/factories/acme/RULES.md', read: { words: 'Say what you changed.', error: null } },
    },
    {
      name: 'REFUSED: blank rules are Invalid, nothing written',
      walk: ({ door }) => {
        filed(door, 'acme');
        return { written: act(door.rules.write(nameOf('acme'), '  \n')), read: done(door.rules.read(nameOf('acme'))) };
      },
      says: { written: { refused: 'Invalid' }, read: { words: null, error: null } },
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
  ],
};

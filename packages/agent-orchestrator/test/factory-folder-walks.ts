/**
 * The Factory door's folder as a whole (`FactoryDoor.folder`, `src/factory/door/factories.store.ts`), as walks (`door-walks.ts`), spread
 * into the door's table (`factory-walks.ts`) and so run on the files and on the memory stand-in alike: every file under a factory's folder
 * read but those that stay with the store (`proposals/`, `delegations/`), which it names; placed only where no folder is, and never a path
 * that climbs out of it; removed whole; and the default factory, which has no folder to move, refused each.
 */
import type { DoorWalk } from './door-walks.ts';
import { act, done } from './door-walks.ts';
import type { FactoryDoorShape } from '../src/factory/door/factories.store.ts';
import { FactoryName } from '../src/factory/factory.model.ts';
import type { TreeFile } from '../src/archive/archive.ts';

type Walk = DoorWalk<FactoryDoorShape>;

const nameOf = (name: string): FactoryName => FactoryName.read(name);

const since = '2026-11-01T00:00:00.000Z';

/** A file of a factory's folder, at `path`, holding `text`. */
const aFile = (path: string, text: string): TreeFile => ({ path, mode: 0o644, bytes: new TextEncoder().encode(text) });

/**
 * A factory's folder as a store keeps one: its tree and its base, its level, servers and rules, and what stays with the store — a
 * proposal and a delegation.
 */
const AFOLDER: readonly TreeFile[] = [
  aFile('tree/factory.json', '{"workflows":[],"hires":{}}\n'),
  aFile('applied/factory.json', '{"workflows":[],"hires":{}}\n'),
  aFile('level.json', `${JSON.stringify({ level: 'auto', since })}\n`),
  aFile('servers.json', `${JSON.stringify({ servers: { docs: { type: 'http', url: 'https://docs.example/mcp' } } })}\n`),
  aFile('RULES.md', 'Say what you changed.\n'),
  aFile('proposals/p-1.json', '{}\n'),
  aFile('delegations/d-1.json', '{}\n'),
];

/** The paths of a folder read, sorted. */
const pathsOf = (files: readonly TreeFile[]): string[] => files.map((f) => f.path).sort();

/** The text of the file at `path` of a folder read, or none. */
const textAt = (files: readonly TreeFile[], path: string): string | undefined => {
  const file = files.find((f) => f.path === path);
  return file === undefined ? undefined : new TextDecoder().decode(file.bytes);
};

/** The walks of the folder's three methods. */
export const FOLDER_WALKS: Readonly<Record<string, readonly Walk[]>> = {
  'folder.read': [
    {
      name: 'none where the factory has no folder',
      walk: ({ door }) => done(door.folder.read(nameOf('acme'))),
      says: { files: [], stays: [] },
    },
    {
      name: 'every file placed, its tree, its base, its level, servers and rules, and nothing under proposals/ or delegations/, which it names as staying',
      walk: ({ door }) => {
        done(door.folder.place(nameOf('acme'), AFOLDER));
        const { files, stays } = done(door.folder.read(nameOf('acme')));
        return { paths: pathsOf(files), stays, tree: textAt(files, 'tree/factory.json'), level: done(door.level.read(nameOf('acme'))) };
      },
      says: {
        paths: ['RULES.md', 'applied/factory.json', 'level.json', 'servers.json', 'tree/factory.json'],
        stays: ['proposals', 'delegations'],
        tree: '{"workflows":[],"hires":{}}\n',
        level: { level: 'auto', since },
      },
    },
    {
      name: 'a level and servers written through the door are in it',
      walk: ({ door }) => {
        done(door.level.write(nameOf('acme'), { level: 'auto', since }));
        done(door.servers.write(nameOf('acme'), { docs: { type: 'http', url: 'https://docs.example/mcp' } }));
        return pathsOf(done(door.folder.read(nameOf('acme'))).files);
      },
      says: ['level.json', 'servers.json'],
    },
    {
      name: 'REFUSED: the default factory, which has no folder to move, is a Conflict',
      walk: ({ door }) => act(door.folder.read(nameOf('default'))),
      says: { refused: 'Conflict' },
    },
  ],
  'folder.place': [
    {
      name: 'placed at its name, and its servers read back',
      walk: ({ door }) => ({
        placed: done(door.folder.place(nameOf('acme'), AFOLDER)),
        servers: done(door.servers.read(nameOf('acme'))),
      }),
      says: { placed: '<root>/factories/acme', servers: { docs: { type: 'http', url: 'https://docs.example/mcp' } } },
    },
    {
      name: 'REFUSED: where its folder is, a Conflict, the folder left as it was',
      walk: ({ door }) => {
        done(door.folder.place(nameOf('acme'), [aFile('tree/a.md', 'one\n')]));
        const again = act(door.folder.place(nameOf('acme'), [aFile('tree/b.md', 'two\n')]));
        return { again, paths: pathsOf(done(door.folder.read(nameOf('acme'))).files) };
      },
      says: { again: { refused: 'Conflict' }, paths: ['tree/a.md'] },
    },
    {
      name: 'REFUSED: a path that climbs out of the folder, or is whole, is Invalid, nothing placed',
      walk: ({ door }) => ({
        climbs: act(door.folder.place(nameOf('acme'), [aFile('tree/a.md', 'one\n'), aFile('../b.md', 'two\n')])),
        whole: act(door.folder.place(nameOf('acme'), [aFile('/b.md', 'two\n')])),
        paths: pathsOf(done(door.folder.read(nameOf('acme'))).files),
      }),
      says: { climbs: { refused: 'Invalid' }, whole: { refused: 'Invalid' }, paths: [] },
    },
    {
      name: 'REFUSED: the default factory is a Conflict; a name that is no slug is Invalid',
      walk: ({ door }) => ({
        default: act(door.folder.place(nameOf('default'), AFOLDER)),
        bad: act(door.folder.place(nameOf('Bad Name'), AFOLDER)),
      }),
      says: { default: { refused: 'Conflict' }, bad: { refused: 'Invalid' } },
    },
  ],
  'folder.remove': [
    {
      name: 'removed whole, its level with it, then nothing to remove',
      walk: ({ door }) => {
        done(door.folder.place(nameOf('acme'), AFOLDER));
        return {
          first: done(door.folder.remove(nameOf('acme'))),
          paths: pathsOf(done(door.folder.read(nameOf('acme'))).files),
          level: done(door.level.read(nameOf('acme'))) ?? 'none',
          second: done(door.folder.remove(nameOf('acme'))),
        };
      },
      says: { first: true, paths: [], level: 'none', second: false },
    },
    {
      name: 'REFUSED: the default factory is a Conflict',
      walk: ({ door }) => act(door.folder.remove(nameOf('default'))),
      says: { refused: 'Conflict' },
    },
  ],
};

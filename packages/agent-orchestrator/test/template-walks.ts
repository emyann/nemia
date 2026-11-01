/**
 * The Template door's contract (`TemplateDoor`, `src/templates/templates.store.ts`), as walks (`door-walks.ts`): every method's rows, run
 * on the files by `src/templates/templates.store.test.ts` and on the memory stand-in by `src/templates/memory.store.test.ts`. A tree
 * written as a folder is read back with its name, paths, modes and bytes, and one packed as an archive with the digest pack answered;
 * and the write check: a place taken, a name that is no template's, a folder named other than its tree, a path that climbs out of the
 * folder and a place that is no whole path are refused, and nothing is written.
 *
 * Each walk is on a side of its own: a fresh scratch folder, or a fresh stand-in.
 */
import path from 'node:path';
import type { DoorWalk } from './door-walks.ts';
import { act, done } from './door-walks.ts';
import type { TemplateDoorShape, TemplateTree } from '../src/templates/templates.store.ts';
import { TemplateSource } from '../src/templates/templates.model.ts';
import type { TreeFile } from '../src/archive/archive.ts';

type Walk = DoorWalk<TemplateDoorShape>;

/** The place `parts` name under the side's root. */
const at = (root: string, ...parts: string[]): TemplateSource => TemplateSource.read(path.join(root, ...parts));

/** A tree named `name`: its manifest, and an executable script beside it. */
export const aTree = (name: string, more: TreeFile[] = []): { name: string; files: TreeFile[] } => ({
  name,
  files: [
    { path: 'nemia.yaml', mode: 0o644, bytes: Buffer.from('apiVersion: nemia.dev/v1alpha1\nkind: FactoryTemplate\n') },
    { path: 'workflows/dev/run.sh', mode: 0o755, bytes: Buffer.from('#!/bin/sh\necho run\n') },
    ...more,
  ],
});

/** A tree as read, in a shape each side says alike: its name, each file's path, mode and text in path order, and its problems. */
const seen = (tree: TemplateTree) => ({
  name: tree.name,
  files: [...tree.files]
    .sort((a, b) => (a.path < b.path ? -1 : 1))
    .map((f) => ({ path: f.path, mode: f.mode, text: Buffer.from(f.bytes).toString('utf8') })),
  problems: tree.problems,
});

const SHOP = {
  name: 'shop',
  files: [
    { path: 'nemia.yaml', mode: 0o644, text: 'apiVersion: nemia.dev/v1alpha1\nkind: FactoryTemplate\n' },
    { path: 'workflows/dev/run.sh', mode: 0o755, text: '#!/bin/sh\necho run\n' },
  ],
  problems: [],
};

export const TEMPLATE_WALKS: Readonly<Record<string, readonly Walk[]>> = {
  'templates.read': [
    {
      name: 'a place that is neither a folder nor an archive is Missing',
      walk: ({ door, root }) => act(door.templates.read(at(root, 'shop'))),
      says: { refused: 'Missing' },
    },
    {
      name: 'a folder written, with its name, paths, modes and bytes',
      walk: ({ door, root }) => {
        done(door.templates.create(at(root, 'shop'), aTree('shop')));
        return seen(done(door.templates.read(at(root, 'shop'))));
      },
      says: SHOP,
    },
    {
      name: 'an archive packed, with the same files, and the digest pack answered and the folder has',
      walk: ({ door, root }) => {
        const packed = done(door.templates.pack(at(root, 'shop-1.0.0.tgz'), aTree('shop')));
        done(door.templates.create(at(root, 'shop'), aTree('shop')));
        const read = done(door.templates.read(TemplateSource.read(packed.source)));
        return {
          ...seen(read),
          same: read.digest === packed.digest && done(door.templates.read(at(root, 'shop'))).digest === packed.digest,
        };
      },
      says: { ...SHOP, same: true },
    },
  ],
  'templates.create': [
    {
      name: 'written at a place nothing holds, answering the folder',
      walk: ({ door, root }) => done(door.templates.create(at(root, 'templates', 'shop'), aTree('shop'))),
      says: '<root>/templates/shop',
    },
    {
      name: 'REFUSED: a folder that holds files is a Conflict, the first left as it was',
      walk: ({ door, root }) => {
        done(door.templates.create(at(root, 'shop'), aTree('shop')));
        const again = act(
          door.templates.create(at(root, 'shop'), aTree('shop', [{ path: 'more.md', mode: 0o644, bytes: Buffer.from('x') }])),
        );
        return { again, files: done(door.templates.read(at(root, 'shop'))).files.length };
      },
      says: { again: { refused: 'Conflict' }, files: 2 },
    },
    {
      name: 'REFUSED: a place that is no folder is a Conflict, the archive left as it was',
      walk: ({ door, root }) => {
        done(door.templates.pack(at(root, 'shop'), aTree('shop')));
        return {
          made: act(door.templates.create(at(root, 'shop'), aTree('shop'))),
          still: seen(done(door.templates.read(at(root, 'shop')))).name,
        };
      },
      says: { made: { refused: 'Conflict' }, still: 'shop' },
    },
    {
      name: 'REFUSED: a name that is no template’s is Invalid, nothing written',
      walk: ({ door, root }) => ({
        made: act(door.templates.create(at(root, 'My_Team'), aTree('My_Team'))),
        read: act(door.templates.read(at(root, 'My_Team'))),
      }),
      says: { made: { refused: 'Invalid' }, read: { refused: 'Missing' } },
    },
    {
      name: 'REFUSED: a folder named other than its tree is Invalid, nothing written',
      walk: ({ door, root }) => ({
        made: act(door.templates.create(at(root, 'other'), aTree('shop'))),
        read: act(door.templates.read(at(root, 'other'))),
      }),
      says: { made: { refused: 'Invalid' }, read: { refused: 'Missing' } },
    },
    {
      name: 'REFUSED: a path that climbs out of the folder is Invalid, nothing written',
      walk: ({ door, root }) => ({
        made: act(door.templates.create(at(root, 'shop'), aTree('shop', [{ path: '../out.md', mode: 0o644, bytes: Buffer.from('x') }]))),
        read: act(door.templates.read(at(root, 'shop'))),
        out: act(door.templates.read(at(root, 'out.md'))),
      }),
      says: { made: { refused: 'Invalid' }, read: { refused: 'Missing' }, out: { refused: 'Missing' } },
    },
    {
      name: 'REFUSED: a place that is no whole path, branded by name alone as a read is, is Invalid when written',
      walk: ({ door }) => act(door.templates.create(TemplateSource.read('shop'), aTree('shop'))),
      says: { refused: 'Invalid' },
    },
  ],
  'templates.pack': [
    {
      name: 'written, answering the archive and the digest of its content',
      walk: ({ door, root }) => {
        const packed = done(door.templates.pack(at(root, 'out', 'shop.tgz'), aTree('shop')));
        return { source: packed.source, digest: /^sha256:[0-9a-f]{64}$/.test(packed.digest) };
      },
      says: { source: '<root>/out/shop.tgz', digest: true },
    },
    {
      name: 'REFUSED: an archive there already is a Conflict, the first left as it was',
      walk: ({ door, root }) => {
        const first = done(door.templates.pack(at(root, 'shop.tgz'), aTree('shop')));
        const again = act(
          door.templates.pack(at(root, 'shop.tgz'), aTree('shop', [{ path: 'more.md', mode: 0o644, bytes: Buffer.from('x') }])),
        );
        return { again, same: done(door.templates.read(at(root, 'shop.tgz'))).digest === first.digest };
      },
      says: { again: { refused: 'Conflict' }, same: true },
    },
    {
      name: 'REFUSED: a name that is no template’s is Invalid, nothing written',
      walk: ({ door, root }) => ({
        made: act(door.templates.pack(at(root, 'bad.tgz'), aTree('Bad Name'))),
        read: act(door.templates.read(at(root, 'bad.tgz'))),
      }),
      says: { made: { refused: 'Invalid' }, read: { refused: 'Missing' } },
    },
  ],
};

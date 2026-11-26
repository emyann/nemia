/**
 * The File door's contract (`FileDoor`, `src/start/files.store.ts`), as walks (`door-walks.ts`, awaited by `walkedOn`): every method's
 * rows, run on the rooted keyspace and on the memory stand-in by `src/start/files.store.test.ts`. A File kept is read back in its own
 * namespace alone, its digest sha256 of its bytes, and named by its pointer; one let go of is read nowhere and its bytes are gone. The
 * prune lets go of a File past its day, and keeps one an inbox card names (a card that does not read included) and one a live record of
 * the keyspace points to, until that record is gone; it removes bytes and a part no record names once they are a day old, and keeps
 * younger ones. A namespace the store keeps no Files under is begun nothing, and a File's record is checked by objects' `FileObject`.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { FILE_KEPT_FOR, type FileObject } from 'objects';
import type { Keyspace } from '../src/keyspace/keyspace.store.ts';
import { fileKey, filesDir, type FileDoorShape } from '../src/start/files.store.ts';
import type { AsyncDoorWalk, DoorSide } from './door-walks.ts';
import { acted, settled } from './door-walks.ts';

/** A side of the File door: the door, its root, and the keyspace it holds its records in, where a walk points a record of its own. */
export type FileSide = DoorSide<FileDoorShape> & { readonly keyspace: () => Promise<Keyspace> };

type Walk = Omit<AsyncDoorWalk<FileDoorShape>, 'walk'> & { readonly walk: (side: FileSide) => Promise<unknown> };

/** The time the walks run at. */
export const NOW = Date.parse('2026-11-16T00:00:00.000Z');

/** The bytes a walk uploads. */
const BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0x00]);

/** sha256 of `bytes`, as a digest. */
export const digestOf = (bytes: Buffer) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;

/**
 * A File of `namespace` uploaded through `door` at `at`, its bytes written in two pieces, and kept.
 * @param door The File door.
 * @param namespace The namespace it is uploaded to.
 * @param at When it is uploaded, in milliseconds.
 * @param bytes Its bytes.
 */
async function uploaded(door: FileDoorShape, namespace: string, at = NOW, bytes = BYTES) {
  const begun = await settled(door.files.begin(namespace, at));
  if (begun === undefined) throw new Error(`no file is begun in ${namespace}`);
  begun.write(bytes.subarray(0, 2));
  begun.write(bytes.subarray(2));
  begun.close();
  return settled(
    door.files.keep(namespace, {
      id: begun.id,
      name: 'shot.png',
      mediaType: 'image/png',
      size: bytes.length,
      digest: begun.digest(),
      createdAt: new Date(at).toISOString(),
    } satisfies FileObject),
  );
}

/** Two days before the walks run: a File uploaded then is past its day. */
const OLD = NOW - 2 * FILE_KEPT_FOR;

/** A card filed in the inbox of `root` whose text is `text`. */
function carded(root: string, name: string, text: string) {
  fs.mkdirSync(path.join(root, 'inbox'), { recursive: true });
  fs.writeFileSync(path.join(root, 'inbox', name), text);
}

/** A file of `namespace` under `root`'s Files' folder that no record names, last written at `at`. */
function stray(root: string, namespace: string, name: string, at: number) {
  const file = path.join(filesDir(root, namespace), name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'x');
  fs.utimesSync(file, new Date(at), new Date(at));
  return file;
}

/** What a walk reads of a File held: its name, its digest against its bytes', and whether its bytes are there. */
const seen = (held: { readonly file: FileObject; readonly path: string } | undefined) =>
  held && { name: held.file.name, digest: held.file.digest === digestOf(fs.readFileSync(held.path)), bytes: fs.existsSync(held.path) };

export const FILE_WALKS: Readonly<Record<string, readonly Walk[]>> = {
  'files.begin': [
    {
      name: 'a File begun in a namespace kept has an id of its own',
      walk: async ({ door }) => {
        const a = await settled(door.files.begin('acme', NOW));
        const b = await settled(door.files.begin('default', NOW));
        return [/^file_[0-9a-f]{32}$/.test(a?.id ?? ''), a?.id !== b?.id];
      },
      says: [true, true],
    },
    {
      name: 'REFUSED: a namespace the store keeps no Files under, or a name that climbs out, is begun nothing',
      walk: async ({ door }) =>
        Promise.all(['..', '../x', 'A', ''].map(async (namespace) => (await settled(door.files.begin(namespace, NOW))) === undefined)),
      says: [true, true, true, true],
    },
  ],
  'files.keep': [
    {
      name: 'a File kept answers its file object, its digest sha256 of its bytes',
      walk: async ({ door }) => {
        const file = await uploaded(door, 'acme');
        return { id: /^file_[0-9a-f]{32}$/.test(file.id), digest: file.digest === digestOf(BYTES), size: file.size };
      },
      says: { id: true, digest: true, size: BYTES.length },
    },
    {
      name: 'REFUSED Invalid: a File whose digest is none',
      walk: async ({ door }) => {
        const begun = await settled(door.files.begin('acme', NOW));
        return acted(
          door.files.keep('acme', {
            id: begun?.id ?? '',
            name: 'a',
            mediaType: 'text/plain',
            size: 0,
            digest: 'md5:00',
            createdAt: new Date(NOW).toISOString(),
          }),
        );
      },
      says: { refused: 'Invalid' },
    },
    {
      name: 'REFUSED Missing: a File never begun',
      walk: ({ door }) =>
        acted(
          door.files.keep('acme', {
            id: `file_${'0'.repeat(32)}`,
            name: 'a',
            mediaType: 'text/plain',
            size: 0,
            digest: digestOf(Buffer.alloc(0)),
            createdAt: new Date(NOW).toISOString(),
          }),
        ),
      says: { refused: 'Missing' },
    },
  ],
  'files.read': [
    {
      name: 'a File kept is read in its own namespace, its bytes as they were written, and in no other',
      walk: async ({ door }) => {
        const file = await uploaded(door, 'acme');
        return [
          seen(await settled(door.files.read('acme', file.id))),
          await settled(door.files.read('other', file.id)),
          await settled(door.files.read('default', file.id)),
        ];
      },
      says: [{ name: 'shot.png', digest: true, bytes: true }, undefined, undefined],
    },
    {
      name: 'an id that is none, or that climbs out, reads nothing',
      walk: async ({ door }) =>
        Promise.all(
          ['file_x', '../file_0', `file_${'0'.repeat(32)}`].map(async (id) => (await settled(door.files.read('acme', id))) === undefined),
        ),
      says: [true, true, true],
    },
    {
      name: 'a File whose bytes are gone reads nothing',
      walk: async ({ door, root }) => {
        const file = await uploaded(door, 'acme');
        fs.rmSync(path.join(filesDir(root, 'acme'), file.id));
        return settled(door.files.read('acme', file.id));
      },
      says: undefined,
    },
  ],
  'files.drop': [
    {
      name: 'a File let go of on its way, or kept, reads nothing, and nothing of it is left',
      walk: async ({ door, root }) => {
        const begun = await settled(door.files.begin('acme', NOW));
        begun?.write(Buffer.from('half'));
        begun?.close();
        await settled(door.files.drop('acme', begun?.id ?? ''));
        const kept = await uploaded(door, 'acme');
        await settled(door.files.drop('acme', kept.id));
        return [await settled(door.files.read('acme', kept.id)), fs.readdirSync(filesDir(root, 'acme'))];
      },
      says: [undefined, []],
    },
    {
      name: 'REFUSED Conflict: a File a live record points to, kept with its bytes',
      walk: async ({ door, keyspace }) => {
        const file = await uploaded(door, 'acme');
        const ks = await keyspace();
        await Effect.runPromise(
          ks.write('/registry/cards/acme/one', { verb: 'create', expected: null, value: '{}', points: [fileKey('acme', file.id)] }),
        );
        return [await acted(door.files.drop('acme', file.id)), seen(await settled(door.files.read('acme', file.id)))?.bytes];
      },
      says: [{ refused: 'Conflict' }, true],
    },
  ],
  'files.pruned': [
    {
      name: 'a File past its day is let go of, a younger one kept',
      walk: async ({ door }) => {
        const young = await uploaded(door, 'default', NOW - FILE_KEPT_FOR + 60 * 60 * 1000);
        const old = await uploaded(door, 'acme', OLD);
        const gone = await settled(door.files.pruned(NOW));
        return [
          gone.length === 1 && gone[0] === `acme/${old.id}`,
          await settled(door.files.read('acme', old.id)),
          seen(await settled(door.files.read('default', young.id)))?.bytes,
        ];
      },
      says: [true, undefined, true],
    },
    {
      name: 'a File past its day an inbox card names is kept, by a card that does not read too, and let go of once no card names it',
      walk: async ({ door, root }) => {
        const named = await uploaded(door, 'acme', OLD);
        const strayNamed = await uploaded(door, 'acme', OLD);
        carded(root, 'one.md', `---\nfiles:\n  - file: ${named.id}\n---\nA card.\n`);
        carded(root, 'broken.md', `---\n: : not yaml [\n---\n${strayNamed.id}\n`);
        const first = await settled(door.files.pruned(NOW));
        fs.rmSync(path.join(root, 'inbox', 'one.md'));
        const second = await settled(door.files.pruned(NOW));
        return [
          first,
          second.length === 1 && second[0] === `acme/${named.id}`,
          seen(await settled(door.files.read('acme', strayNamed.id)))?.bytes,
        ];
      },
      says: [[], true, true],
    },
    {
      name: 'a File past its day a live record points to is kept, and let go of once that record is gone',
      walk: async ({ door, keyspace }) => {
        const file = await uploaded(door, 'acme', OLD);
        const ks = await keyspace();
        const card = '/registry/cards/acme/one';
        await Effect.runPromise(ks.write(card, { verb: 'create', expected: null, value: '{}', points: [fileKey('acme', file.id)] }));
        const first = await settled(door.files.pruned(NOW));
        const kept = seen(await settled(door.files.read('acme', file.id)))?.bytes;
        await Effect.runPromise(ks.write(card, { verb: 'delete', expected: null, value: '' }));
        const second = await settled(door.files.pruned(NOW));
        return [first, kept, second.length, await settled(door.files.read('acme', file.id))];
      },
      says: [[], true, 1, undefined],
    },
    {
      name: 'bytes and a part no record names are removed once a day old, younger ones kept',
      walk: async ({ door, root }) => {
        const id = (n: number) => `file_${String(n).repeat(32)}`;
        const oldBytes = stray(root, 'acme', id(1), OLD);
        const oldPart = stray(root, 'acme', `${id(2)}.part`, OLD);
        const young = stray(root, 'acme', `${id(3)}.part`, NOW - 60 * 1000);
        const gone = await settled(door.files.pruned(NOW));
        return [[...gone].sort(), fs.existsSync(oldBytes), fs.existsSync(oldPart), fs.existsSync(young)];
      },
      says: [[`acme/${'file_' + '1'.repeat(32)}`, `acme/${'file_' + '2'.repeat(32)}.part`], false, false, true],
    },
    {
      name: 'an upload lets go of what is past its day first',
      walk: async ({ door }) => {
        const old = await uploaded(door, 'acme', OLD);
        await uploaded(door, 'acme');
        return settled(door.files.read('acme', old.id));
      },
      says: undefined,
    },
  ],
  'files.pointer': [
    {
      name: 'a File kept is named by its key and its pointer: its id, media type, size and digest',
      walk: async ({ door }) => {
        const file = await uploaded(door, 'acme');
        const pointed = await settled(door.files.pointer('acme', file.id));
        return [
          pointed?.key === `/registry/files/acme/${file.id}`,
          pointed && { ...pointed.pointer, file: pointed.pointer.file === file.id, digest: pointed.pointer.digest === digestOf(BYTES) },
        ];
      },
      says: [true, { file: true, mediaType: 'image/png', size: BYTES.length, digest: true }],
    },
    {
      name: 'a File not kept has none',
      walk: ({ door }) => settled(door.files.pointer('acme', `file_${'0'.repeat(32)}`)),
      says: undefined,
    },
  ],
};

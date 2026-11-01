/**
 * The Template door's memory stand-in: a fresh layer of `TemplateDoor` per call, each template held in a map by its place, a folder or
 * an archive, built by `templateDoorOver` as the files layer is, so the writes are checked the one way on both. A test gives it its
 * program — `Effect.provide(program, templateDoorMemory())` — where it needs a template to exist and nothing of the disk; the walks of
 * `test/template-walks.ts` hold it to what the files answer. Its places are under `MEMORY_ROOT`, as a test names them.
 *
 * A test's alone: no file of `src` imports it (`test/boundary.test.ts`, `STAND_INS`).
 */
import path from 'node:path';
import { Layer } from 'effect';
import { contentDigest, packArchive, type TreeFile } from '../archive/archive.ts';
import { noTemplateAt, takenArchive, takenFolder, TemplateDoor, templateDoorOver, type TemplateLayer } from './templates.store.ts';

/** Where a test names the stand-in's templates: the root their places are under. */
export const MEMORY_ROOT = '/memory';

/** A template held: a folder with its files, or an archive of them with the digest pack answered. */
type Held = { kind: 'folder' | 'archive'; name: string; files: TreeFile[]; digest: string };

/** A copy of `files`, so what a test holds is never what the stand-in keeps. */
const copied = (files: readonly TreeFile[]): TreeFile[] => files.map((f) => ({ ...f, bytes: Uint8Array.from(f.bytes) }));

/** A fresh Template door over a map: no template held. */
export function templateDoorMemory(): Layer.Layer<never> {
  const held = new Map<string, Held>();
  const under = (at: string): boolean => [...held.keys()].some((place) => place.startsWith(`${at}${path.sep}`));
  const layer: TemplateLayer = {
    templates: {
      read: (source) => {
        const one = held.get(source);
        if (one === undefined) throw noTemplateAt(source);
        return { name: one.name, files: copied(one.files), problems: [], digest: one.digest };
      },
      create: (at, tree) => {
        const one = held.get(at);
        const taken = takenFolder(at, one?.kind === 'archive' ? 'file' : one !== undefined || under(at) ? 'files' : undefined);
        if (taken) throw taken;
        held.set(at, { kind: 'folder', name: tree.name, files: copied(tree.files), digest: contentDigest(tree.name, tree.files) });
        return at;
      },
      pack: (at, tree) => {
        if (held.has(at) || under(at)) throw takenArchive(at);
        const { digest } = packArchive(tree.name, tree.files);
        held.set(at, { kind: 'archive', name: tree.name, files: copied(tree.files), digest });
        return { source: at, digest };
      },
    },
  };
  return Layer.succeed(TemplateDoor)(templateDoorOver(layer));
}

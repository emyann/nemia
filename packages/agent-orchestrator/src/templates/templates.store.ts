/**
 * The Template door: the one way a program reads and writes a factory template — a folder that holds its `nemia.yaml`, or an archive
 * `nemia template pack` wrote — an Effect service, `TemplateDoor`, whose methods take where a template is (`TemplateSource`) and answer
 * an Effect failing with a refusal. Its pattern is the Factory door's (`src/door/door.store.ts`, `src/factories/factories.store.ts`).
 *
 * Two layers: the files (`templateFiles`, today's folders and archives, each file with its bytes and mode, a write staged beside its
 * place and renamed into it), and the memory stand-in (`templateDoorMemory`, `memory.store.ts`), which a test gives its program. Both
 * are built by `templateDoorOver`, so each write is checked the one way on both: its place as `TemplateSource.OnCreate` checks it, and
 * its tree as `TemplateTreeWrite` does — a name that is a template's, each path one in its folder and short enough for an archive —
 * or `Invalid` names what is broken and nothing is written. The template's lint (`checkTemplate`) is the verbs', not the door's: a door
 * holds what a stored tree must be, and `nemia template unpack` writes what an archive holds, checked by none. The walks of
 * `test/template-walks.ts` hold both layers to one table.
 *
 * The door's default is rooted (`rootedDoor`), as every definition door's after the Factory door: it is refused where the program was
 * given no `StoreRoot`. Its files layer reads no file under the root — a template is a folder on the machine, outside the store.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Context, Effect, Layer } from 'effect';
import { checked, doorOf, rootedDoor, type DoorOf } from '../door/door.store.ts';
import { Conflict, Invalid, Missing, type Refusal } from '../refusal/refusal.ts';
import { ARCHIVE_LIMIT, contentDigest, packArchive, pathRefusals, unpackArchive, type TreeFile } from '../archive/archive.ts';
import { TemplateSource, TemplateTreeWrite } from '../templates/templates.model.ts';
import type { Problem } from './templates.ts';

/** A template's tree as read: its name (its folder's, or an archive's top folder), its files, what stops one being read, its digest. */
export type TemplateTree = { name: string; files: TreeFile[]; problems: Problem[]; digest: string | undefined };

/** A tree a write takes: the template's name, and its files. */
export type TreeWrite = { readonly name: string; readonly files: readonly TreeFile[] };

/**
 * A layer of the Template door, as plain synchronous methods: a template read from its folder or archive (`Missing` where it is
 * neither), a tree written as a new folder (`Conflict` where its place is no folder, or holds files), answering the folder, and a tree
 * packed as a new archive (`Conflict` where its place is taken), answering the archive and the digest of its content.
 */
export type TemplateLayer = {
  readonly templates: {
    readonly read: (source: string) => TemplateTree;
    readonly create: (at: string, tree: TreeWrite) => string;
    readonly pack: (at: string, tree: TreeWrite) => { source: string; digest: string };
  };
};

/** The Template door's shape: each method of `TemplateLayer` answering an Effect, a template's place taken as `TemplateSource`. */
export type TemplateDoorShape = DoorOf<TemplateLayer, TemplateSource>;

/** A place a template is written at, as `TemplateSource.OnCreate` checks it. */
const placeChecked = checked(TemplateSource.OnCreate, (at: string) => `a template at ${JSON.stringify(at)}`);

/** A tree written: what `TemplateTreeWrite` refuses of it. */
const treeChecked = checked(TemplateTreeWrite, (tree: TreeWrite) => `the template ${tree.name}`);

/** The door over `layer`: each method as `doorOf` makes it, each write's place and tree checked before the layer writes. */
export function templateDoorOver(layer: TemplateLayer): TemplateDoorShape {
  const door = doorOf<TemplateLayer, TemplateSource>(layer);
  const written =
    <A>(write: (at: TemplateSource, tree: TreeWrite) => Effect.Effect<A, Refusal>) =>
    (at: TemplateSource, tree: TreeWrite) =>
      Effect.gen(function* () {
        yield* placeChecked(at);
        yield* treeChecked(tree);
        return yield* write(at, tree);
      });
  const create = written(door.templates.create);
  return {
    templates: {
      read: door.templates.read,
      create: (at, tree) => (path.basename(at) === tree.name ? create(at, tree) : Effect.fail(misnamed(at, tree.name))),
      pack: written(door.templates.pack),
    },
  };
}

/** The refusal of a folder written under a name that is not its tree's: a template is named by its folder. */
const misnamed = (at: string, name: string): Invalid =>
  new Invalid({
    message: `${at} is not written: a template is named by its folder, and this one holds the template ${name}. Write it at a folder named ${name}.`,
  });

/** The refusal of a template's place that is neither a folder nor a file. */
export const noTemplateAt = (source: string): Missing =>
  new Missing({
    message: `${source} is neither a folder nor a file: name a template's folder, the one that holds its nemia.yaml, or an archive nemia template pack wrote.`,
  });

/**
 * The refusal of a new folder's place that is taken — `null` where it is free — as both layers word it: something there that is no
 * folder, or a folder that holds files.
 */
export function takenFolder(at: string, kind: 'folder' | 'file' | 'files' | undefined): Conflict | null {
  if (kind === 'file')
    return new Conflict({
      message: `${at} is there, and is no folder: a template is written as a new folder. Move it away, or name another.`,
    });
  if (kind === 'files')
    return new Conflict({
      message: `${at} holds files already, and a template is written as a new folder: name one that is not there, or is empty.`,
    });
  return null;
}

/** The refusal of a new archive's place that is taken. */
export const takenArchive = (at: string): Conflict =>
  new Conflict({ message: `${at} is there already, and pack writes a new file: name another with --out, or remove it.` });

/**
 * The files under `dir`, by path from it with `/` between parts, sorted; each link a problem by name, never followed, and each entry
 * that is neither a file nor a folder (a pipe, a socket, a device), never read.
 */
export function walkFolder(dir: string, problems: Problem[], under = ''): string[] {
  return fs
    .readdirSync(path.join(dir, under), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry): string[] => {
      const file = under ? `${under}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        problems.push({ file, message: `${file} is a link, and a template's files are its own: copy what it points at here.` });
        return [];
      }
      if (entry.isDirectory()) return walkFolder(dir, problems, file);
      if (entry.isFile()) return [file];
      problems.push({ file, message: `${file} is neither a file nor a folder, and a template holds files: remove it.` });
      return [];
    });
}

/** The tree of the folder `dir`: each file's path, permission bits and bytes, as `walk` finds them. */
function readTree(dir: string, problems: Problem[]): TreeFile[] {
  return walkFolder(dir, problems).map((file) => {
    const at = path.join(dir, file);
    return { path: file, mode: fs.statSync(at).mode & 0o777, bytes: fs.readFileSync(at) };
  });
}

/** What is at `at`: a folder that holds files, an empty one, something else, or nothing. */
function placeOf(at: string): 'folder' | 'file' | 'files' | undefined {
  const stat = fs.lstatSync(at, { throwIfNoEntry: false });
  if (stat === undefined) return undefined;
  if (!stat.isDirectory()) return 'file';
  return fs.readdirSync(at).length ? 'files' : 'folder';
}

/** `write` made at a place beside `at` and renamed into it, the place removed whatever happens. */
function staged(at: string, write: (to: string) => void, replace: boolean): void {
  fs.mkdirSync(path.dirname(at), { recursive: true });
  const to = path.join(path.dirname(at), `.${path.basename(at)}.write-${process.pid}`);
  fs.rmSync(to, { recursive: true, force: true });
  try {
    write(to);
    if (replace) fs.rmSync(at, { recursive: true, force: true });
    fs.renameSync(to, at);
  } finally {
    fs.rmSync(to, { recursive: true, force: true });
  }
}

/** The templates on this machine's disk, as a layer of the door: today's folders and archives, wherever their places name them. */
export function templateFiles(): TemplateLayer {
  return {
    templates: {
      read: (source) => {
        const stat = fs.statSync(source, { throwIfNoEntry: false });
        if (stat?.isFile()) return { ...unpackArchive(fs.readFileSync(source), ARCHIVE_LIMIT, source), problems: [] };
        if (!stat?.isDirectory()) throw noTemplateAt(source);
        const name = path.basename(source);
        const problems: Problem[] = [];
        const files = readTree(source, problems);
        const long = pathRefusals(name, files);
        problems.push(...long);
        return { name, files, problems, digest: long.length ? undefined : contentDigest(name, files) };
      },
      create: (at, tree) => {
        const taken = takenFolder(at, placeOf(at));
        if (taken) throw taken;
        staged(
          at,
          (to) => {
            fs.mkdirSync(to, { recursive: true });
            for (const file of tree.files) {
              const into = path.join(to, file.path);
              fs.mkdirSync(path.dirname(into), { recursive: true });
              fs.writeFileSync(into, file.bytes, { flag: 'wx' });
              fs.chmodSync(into, file.mode);
            }
          },
          true,
        );
        return at;
      },
      pack: (at, tree) => {
        if (fs.lstatSync(at, { throwIfNoEntry: false })) throw takenArchive(at);
        const { archive, digest } = packArchive(tree.name, tree.files);
        staged(at, (to) => fs.writeFileSync(to, archive), false);
        return { source: at, digest };
      },
    },
  };
}

/**
 * The Template door, as the service a program yields: a reference whose default is rooted (`rootedDoor`) — the door over the files,
 * refused `Invalid` where the program was given no `StoreRoot` — so a program composed as the CLI's and the daemon's are reads them, and
 * a test gives `templateDoorMemory()` with no root at all (`docs/architecture.md`, *The Template door*).
 */
export const TemplateDoor = Context.Reference<TemplateDoorShape>('agent-orchestrator/TemplateDoor', {
  defaultValue: () => rootedDoor(() => templateDoorOver(templateFiles()), 'Template door'),
});

/** The Template door over the files, as a layer: for a program that names the door rather than a `StoreRoot`. */
export const templateDoorFiles = (): Layer.Layer<never> => Layer.succeed(TemplateDoor)(templateDoorOver(templateFiles()));

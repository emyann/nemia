/**
 * A factory's instruction on disk: the text the store keeps for it, `$WF_ROOT/factories/<name>/NEMIA.md` — written
 * (`writeInstructionText`), cleared (`clearInstructionText`) and removed with its folder when the factory is (`removeInstructionFolder`),
 * this file being its one writer — and the reader of a factory's instruction wherever its file says it is kept (`readInstructionAt`), in
 * the store or in its first folder, which it never writes. Where it is kept is `factory.ts`'s to judge (`instructionAt`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_INSTRUCTION, factoryNameRefusal, type InstructionPlace } from './factory.ts';
import { Conflict, Invalid } from '../refusal/refusal.ts';
import { HOME } from '../record/record.store.ts';

/** The words of a factory's instruction, null where there is no file; and why the file there does not read, null where it reads. */
export type InstructionRead = { words: string | null; error: string | null };

/** The folder the store keeps the factory `name`'s instruction in, beside its file: `$WF_ROOT/factories/<name>`. Refused: a bad name. */
export function instructionFolder(name: string): string {
  const bad = factoryNameRefusal(name);
  if (bad) throw new Invalid({ message: bad });
  return path.join(HOME, 'factories', name);
}

/** The file the store keeps the factory `name`'s instruction in: `NEMIA.md` in its folder (`instructionFolder`). */
export const instructionFile = (name: string): string => path.join(instructionFolder(name), DEFAULT_INSTRUCTION);

/** Whether the folder `inner` is `outer` or inside it, both as `path.resolve` spells them: on a separator, never a prefix. */
const inside = (outer: string, inner: string): boolean => {
  const relative = path.relative(outer, inner);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

/** The real path of `file`, every link followed, or undefined when a link leads nowhere. */
function realOf(file: string): string | undefined {
  try {
    return fs.realpathSync(file);
  } catch {
    return undefined;
  }
}

/** The words of `file`, which `lstat` says is there; or why it does not read: no file, or a link where the store keeps its own. */
function readThere(file: string, links: boolean): InstructionRead {
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (!links && fs.lstatSync(file).isSymbolicLink())
    return { words: null, error: `${file} is a link, and the store keeps its own file: write the instruction again to replace it.` };
  if (!stat) return { words: null, error: `${file} is a link to nothing: point it at a file, or remove it.` };
  if (!stat.isFile()) return { words: null, error: `${file} is not a file: remove it, or name a file.` };
  return { words: fs.readFileSync(file, 'utf8'), error: null };
}

/**
 * Why the file of a folder-kept instruction (`at`) may not be read, or undefined: a path its factory's file names that leaves the folder
 * — written there by hand — or a link, the file's or a folder's on its way, whose target is outside the folder.
 */
function outsideFolder(at: Extract<InstructionPlace, { in: 'folder' }>): string | undefined {
  const folder = path.resolve(at.folder);
  const file = path.resolve(at.file);
  if (!inside(folder, file) || file === folder)
    return `${at.path} is not a file inside ${folder}: name one with nemia factory instruction <factory> --path <path>.`;
  const realFolder = realOf(folder) ?? folder;
  const realFile = realOf(file);
  if (realFile !== undefined && !inside(realFolder, realFile))
    return `${file} leads to ${realFile}, outside ${folder}, and only a file inside the folder is read: point it at one inside.`;
  return undefined;
}

/**
 * The instruction kept at `at`, read afresh: its words, or null where there is no file — and why a file there does not read. In the
 * store, a link is not read; in a folder, a link is followed only while its target stays inside the folder. Nothing is written.
 */
export function readInstructionAt(at: InstructionPlace): InstructionRead {
  if (at.in === 'folder') {
    const outside = outsideFolder(at);
    if (outside) return { words: null, error: outside };
  }
  if (!fs.lstatSync(at.file, { throwIfNoEntry: false })) return { words: null, error: null };
  try {
    return readThere(at.file, at.in === 'folder');
  } catch (err) {
    return { words: null, error: `${at.file} does not read: ${(err as Error).message}` };
  }
}

/**
 * Whether the store keeps text for the factory `name`, read or not: a file, or anything else, at its place, `file` where it was made from
 * a template (its tree's).
 */
export const storeKeeps = (name: string, file = instructionFile(name)): boolean =>
  fs.lstatSync(file, { throwIfNoEntry: false }) !== undefined;

/**
 * `nemia factory instruct`: `words` written as the instruction the store keeps for the factory `name`, trimmed, at `file` (its tree's
 * `NEMIA.md` where it was made from a template), and the file. A link at the file or at its folder is replaced, never written through.
 * Refused, writing nothing: blank words (`Invalid`), and a tree not rendered yet (`Conflict`), which a write would leave unseeded.
 */
export function writeInstructionText(name: string, words: string, file = instructionFile(name)): string {
  if (!words.trim())
    throw new Invalid({
      message: `the instruction of ${name} is blank. Write the words Nemia is to know of the factory, or clear it: nemia factory instruct ${name} --clear. Nothing was written.`,
    });
  const folder = path.dirname(file);
  if (file !== instructionFile(name) && !fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory())
    throw new Conflict({
      message: `${name} is made from a template, and its tree is not rendered yet, at ${folder}: start the daemon, nemia up, and write it once nemia factory ls shows it applied. Nothing was written.`,
    });
  const there = fs.lstatSync(folder, { throwIfNoEntry: false });
  if (there && !there.isDirectory()) fs.rmSync(folder, { force: true });
  fs.mkdirSync(folder, { recursive: true });
  fs.rmSync(file, { recursive: true, force: true });
  fs.writeFileSync(file, words.trim() + '\n');
  return file;
}

/** The instruction the store keeps for the factory `name` removed, at `file` where it was made from a template: whether there was one. */
export function clearInstructionText(name: string, file = instructionFile(name)): boolean {
  if (!fs.lstatSync(file, { throwIfNoEntry: false })) return false;
  fs.rmSync(file, { recursive: true, force: true });
  return true;
}

/** The store's folder for the factory `name` removed whole, as `nemia factory rm` removes the factory: the folder, or null for none. */
export function removeInstructionFolder(name: string): string | null {
  const folder = instructionFolder(name);
  if (!fs.lstatSync(folder, { throwIfNoEntry: false })) return null;
  fs.rmSync(folder, { recursive: true, force: true });
  return folder;
}

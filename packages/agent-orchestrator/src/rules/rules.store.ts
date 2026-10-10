/**
 * A factory's rules on disk: `RULES.md` in the folder the store keeps for the factory (`rulesFolder`), or in its tree when it was made from
 * a template (`rulesFile`) — read (`readRules`), written (`writeRules`) and cleared (`clearRules`), this file being its one writer. The
 * folder is removed whole with its factory, by `nemia factory rm`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { factoryNameRefusal, type Factory } from '../factory/factory.ts';
import { Conflict, Invalid } from '../refusal/refusal.ts';
import { HOME } from '../record/record.store.ts';
import { factoryRulesRefusal, rulesFile } from './rules.ts';

/**
 * A factory's rules as they read: the words, trimmed, null where there is no file or a blank one; and why the file there cannot be told,
 * null where it can — a link, anything that is no file, a read that fails, a frontmatter block (the words given beside it, to be mended).
 */
export type RulesRead = { words: string | null; error: string | null };

/** The folder the store keeps for the factory `name`, beside its file: `$WF_ROOT/factories/<name>`. Refused: a bad name (`Invalid`). */
export function rulesFolder(name: string): string {
  const bad = factoryNameRefusal(name);
  if (bad) throw new Invalid({ message: bad });
  return path.join(HOME, 'factories', name);
}

/** The file the rules of `factory` are kept in (`rulesFile`): its tree's, or the store's folder's for its name. */
export const rulesAt = (factory: Pick<Factory, 'name' | 'tree'>): string => rulesFile(factory, rulesFolder(factory.name));

/**
 * The rules kept at `file`, read afresh (`RulesRead`). A link is not read: the store keeps its own file, and words read through a link
 * would change with what it points at. Nothing is written, and nothing thrown.
 */
export function readRules(file: string): RulesRead {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat) return { words: null, error: null };
  if (stat.isSymbolicLink())
    return { words: null, error: `${file} is a link, and the store keeps its own file: write the rules again to replace it.` };
  if (!stat.isFile()) return { words: null, error: `${file} is not a file: remove it, and write the rules again.` };
  try {
    const text = fs.readFileSync(file, 'utf8');
    return { words: text.trim() || null, error: factoryRulesRefusal(file, text) ?? null };
  } catch (err) {
    return { words: null, error: `${file} does not read: ${(err as Error).message}` };
  }
}

/**
 * `words` written as the rules of `factory`, trimmed, and the file. A link at the file is replaced, never written through. Refused,
 * writing nothing: blank words and a frontmatter block (`Invalid`), and a tree not rendered yet (`Conflict`), which a write would leave
 * unseeded.
 */
export function writeRules(factory: Pick<Factory, 'name' | 'tree'>, words: string): string {
  const { name } = factory;
  const file = rulesAt(factory);
  if (!words.trim())
    throw new Invalid({
      message: `the rules of ${name} are blank. Write the words every agent hired into it is to be told, or clear them: nemia factory rules ${name} --clear. Nothing was written.`,
    });
  const refused = factoryRulesRefusal(file, words);
  if (refused !== undefined) throw new Invalid({ message: `${refused} Nothing was written.` });
  const folder = path.dirname(file);
  if (factory.tree !== undefined && !fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory())
    throw new Conflict({
      message: `${name} is made from a template, and its tree is not rendered yet, at ${folder}: start the daemon, nemia up, and write its rules once nemia factory ls shows it applied. Nothing was written.`,
    });
  const there = fs.lstatSync(folder, { throwIfNoEntry: false });
  if (there && !there.isDirectory()) fs.rmSync(folder, { force: true });
  fs.mkdirSync(folder, { recursive: true });
  fs.rmSync(file, { recursive: true, force: true });
  fs.writeFileSync(file, words.trim() + '\n');
  return file;
}

/** The rules of `factory` removed, whatever is at their file: whether there was anything. */
export function clearRules(factory: Pick<Factory, 'name' | 'tree'>): boolean {
  const file = rulesAt(factory);
  if (!fs.lstatSync(file, { throwIfNoEntry: false })) return false;
  fs.rmSync(file, { recursive: true, force: true });
  return true;
}

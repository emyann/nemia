/**
 * A factory's rules on disk: `RULES.md` in the folder the store keeps for the factory (`rulesFolder`), or in its tree when it was made from
 * a template (`rulesFile`) — read (`readRules`), written (`writeRules`) and cleared (`clearRules`), this file being its one writer. The
 * folder is removed whole with its factory, by `nemia factory rm`. And what a read of one of the factory's workflow folders is handed
 * (`factoryFills`): its hires for that workflow and its rules, built here for the start, the board's listing and a run's read alike.
 */
import fs from 'node:fs';
import path from 'node:path';
import { factoryNameRefusal, fillsOf, type Factory } from '../factory/factory.ts';
import type { Fills } from '../folder/folder.ts';
import { Conflict, Invalid } from '../refusal/refusal.ts';
import { HOME } from '../record/record.store.ts';
import { factoryRulesRefusal, FACTORY_RULES_FILE, rulesFile } from './rules.ts';
import { digestOf } from '../revisions/revisions.ts';

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
 * What a factory's rules hold, as one word, or `null` for a factory with no rules — no file, or a blank one. A digest of the words as they
 * read and of why they cannot be told (`readRules`), so mending a rules file that does not read moves it, as editing the words does. It is
 * the fourth kind a run resolves, beside its workflow folder, its agents and its skills (`revisions/pin.verb.ts`).
 */
export function rulesVersion(factory: Pick<Factory, 'name' | 'tree'>): string | null {
  const { words, error } = readRules(rulesAt(factory));
  if (words === null && error === null) return null;
  return digestOf([FACTORY_RULES_FILE, words, error]);
}

/**
 * What a read of the folder of `workflow` in `factory` is handed (`Fills`), read now: the agents the factory hires into its steps
 * (`fillsOf`), and its rules where their file reads and is not blank. `error` is why the rules file cannot be told (`readRules`), null
 * where it can or there is none: a start refuses on it, and a read that only loads leaves the rules out. Refused: a name that is no slug
 * (`rulesFolder`, `Invalid`).
 */
export function factoryFills(factory: Pick<Factory, 'name' | 'hires' | 'tree'>, workflow: string): { fills: Fills; error: string | null } {
  const { words, error } = readRules(rulesAt(factory));
  const rules = error === null && words !== null ? { rules: words } : {};
  return { fills: { factory: factory.name, workflow, agents: fillsOf(factory.hires, workflow), ...rules }, error };
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

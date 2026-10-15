/**
 * Nemia's folder in the store, `$WF_ROOT/nemia/`: the person's level (`level.json`, written by `nemia level` alone), her memory
 * (`memory/`, written by her session alone, read here), the instruction her session is filed with (`prompt.md`, composed by the keeper),
 * the custom words she was last filed or told with (`told.json`, the keeper's record), and what ships with her in the package's `nemia/`
 * folder: her definition (`nemia.md`) and her skills.
 *
 * Beneath the controllers, beside `subscription.store.ts`: it imports no store of runs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Result, Schema } from 'effect';
import { CONFIG_FOLDERS } from 'agent-runtime/vocabulary';
import { wfRoot } from '../config/config.store.ts';
import { readCustomInstructions } from '../agents/read.store.ts';
import { parseAgent } from '../agents/agents.ts';
import { stepFrom } from '../workflow/index.ts';
import type { Workflow } from '../step/step.ts';
import { firstRefusal } from '../record/record.store.ts';
import { AUTO_FOLDER } from '../auto/index.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
import { LEVELS, nemiaPrompt, type LevelFile, type ToldCustom } from './nemia.ts';

/** The store she is kept in, read once as the package loads, as `subscription.store.ts` reads its `ROOT`. */
const ROOT = wfRoot();

/** Her folder in the store: her session's working folder. */
export const nemiaDir = (): string => path.join(ROOT, 'nemia');

/** Her memory: the facts she alone writes, one file each. */
export const memoryDir = (): string => path.join(nemiaDir(), 'memory');

/** The person's level, written by `nemia level`. */
export const levelFile = (): string => path.join(nemiaDir(), 'level.json');

/** The instruction her session is filed with: what ships, then the person's custom words. */
export const promptFile = (): string => path.join(nemiaDir(), 'prompt.md');

/** The keeper's record of the person's custom words her session was last filed or told with (`ToldCustom`). */
export const toldFile = (): string => path.join(nemiaDir(), 'told.json');

/** What ships with her: her definition, `nemia.md`, and her skills, `skills/`, a plugin folder. */
export const SHIPPED_NEMIA = path.join(import.meta.dirname, '..', '..', 'nemia');

/** The file that defines her, frontmatter and instruction. */
export const nemiaDefinition = (): string => path.join(SHIPPED_NEMIA, 'nemia.md');

/** The level file as `nemia level` writes it. */
const LevelSchema = Schema.Struct({
  level: Schema.Literals(LEVELS),
  since: Schema.String.check(Schema.isNonEmpty()),
  task: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty())),
});

/**
 * The person's level, or undefined where they never set one. Refused (`Invalid`), naming the file and its first wrong field, where it
 * does not read as one.
 */
export function readLevel(): LevelFile | undefined {
  let text: string;
  try {
    text = fs.readFileSync(levelFile(), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Invalid({ message: `${levelFile()} is not JSON: set the level again with nemia level manual.` });
  }
  const read = Schema.decodeUnknownResult(LevelSchema)(raw);
  if (Result.isSuccess(read)) return { ...read.success };
  const { path: at, words } = firstRefusal(raw, read.failure);
  throw new Invalid({
    message: `${levelFile()}: ${at.length ? `its ${at.join('.')} ` : ''}${words}: set the level again with nemia level manual.`,
  });
}

/** Writes the person's level whole, through a hidden file renamed over it, so the keeper never reads half of it. */
export function writeLevel(level: LevelFile): void {
  fs.mkdirSync(nemiaDir(), { recursive: true });
  const hidden = path.join(nemiaDir(), `.level.json.${process.pid}`);
  fs.writeFileSync(hidden, `${JSON.stringify(level)}\n`);
  fs.renameSync(hidden, levelFile());
}

/**
 * Her definition as a step is read, frontmatter judged as an agent's: her fence, mode and model, and her instruction (`body`). Refused
 * (`Invalid`): a mode but `auto`, in which she reads unasked while her derived fence asks; and an `askTools:` line or a rule on `nemia` in
 * her `allowedTools:`, which her fence derives from the command table (`nemiaFence`): a hand list there would drift from it.
 */
export function readNemia(file: string = nemiaDefinition()): Workflow {
  const text = fs.readFileSync(file, 'utf8');
  if (/^askTools:/m.test(text))
    throw new Invalid({ message: `${file}: her askTools: is derived from the command table: take it out of nemia.md.` });
  const agent = parseAgent('nemia', text);
  const step = stepFrom('nemia/nemia.md', agent.keys, agent.body, undefined);
  const handed = (step.allowedTools ?? []).filter((rule) => /^Bash\(\s*nemia\b/.test(rule));
  if (handed.length)
    throw new Invalid({
      message: `${file}: her allowedTools: ${handed.join(', ')} is derived from the command table: take it out of nemia.md.`,
    });
  if (step.permissionMode !== 'auto')
    throw new Invalid({
      message: `${file}: her permissionMode is ${step.permissionMode ?? 'not set'}, and she reads unasked while her fence asks what waits on the person: permissionMode: auto.`,
    });
  return step;
}

/** The package she ships in: its `package.json` names its `nemia`. */
const PACKAGE = path.join(import.meta.dirname, '..', '..');

/** A path's real path, or undefined where it is not there. */
const realOf = (at: string): string | undefined => {
  try {
    return fs.realpathSync(at);
  } catch {
    return undefined;
  }
};

/**
 * The folder whose `nemia` is the package `root`'s own bin: from the package's real path up, at each folder its `node_modules/.bin` (a
 * checkout, a local install), then its `bin` (a global prefix), the first whose `nemia` resolves to the file the package's `package.json`
 * names. Undefined where none does: a `nemia` that is another package's is passed over.
 */
export function ownBin(root: string = PACKAGE): string | undefined {
  const named = (JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { bin?: { nemia?: unknown } }).bin?.nemia;
  const own = typeof named === 'string' ? realOf(path.join(root, named)) : undefined;
  if (own === undefined) return undefined;
  let at = realOf(root);
  while (at !== undefined) {
    const found = [path.join(at, 'node_modules', '.bin'), path.join(at, 'bin')].find((bin) => realOf(path.join(bin, 'nemia')) === own);
    if (found !== undefined) return found;
    at = path.dirname(at) === at ? undefined : path.dirname(at);
  }
  return undefined;
}

/**
 * The deny rules on every write in the store `root` but her own folder's: an `Edit` rule on each entry at its top, a folder's whole, the
 * rules for auto among them whether or not their folder is there yet (`AUTO_FOLDER`), and on her level, her instruction and the record
 * of the custom words she was told (`toldFile`), the three files of her folder she does not own. Read at each filing, so a folder the
 * store gains is denied at the next.
 */
export function storeDenies(root: string = ROOT): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(root).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    names = [];
  }
  const own = path.basename(nemiaDir());
  return [
    ...names
      .filter((name) => name !== own && name !== AUTO_FOLDER)
      .map((name) => path.join(root, name))
      .map((at) => (fs.statSync(at, { throwIfNoEntry: false })?.isDirectory() ? `Edit(/${at}/**)` : `Edit(/${at})`)),
    `Edit(/${path.join(root, AUTO_FOLDER)}/**)`,
    `Edit(/${levelFile()})`,
    `Edit(/${promptFile()})`,
    `Edit(/${toldFile()})`,
    `Edit(/${path.join(nemiaDir(), 'chat')}/**)`,
  ];
}

/** Her chat as the chat's verbs and its delivery are given it: the task her session is filed under, if any, and her folder. */
export const nemiaChatPlace = (): { task: string | undefined; dir: string } => ({ task: readLevel()?.task, dir: nemiaDir() });

/** The person's custom words for her in the store `home`, or undefined where there are none (`readCustomInstructions`). */
export const nemiaCustom = (home: string = ROOT): string | undefined => readCustomInstructions(home, 'nemia');

/** Writes `text` as the instruction her session is filed with (`promptFile`), and answers the file. */
export function writePrompt(text: string): string {
  fs.mkdirSync(nemiaDir(), { recursive: true });
  fs.writeFileSync(promptFile(), text);
  return promptFile();
}

/** Records `custom` as the words her session was last filed or told with (`toldFile`): none where undefined. */
export function writeTold(custom: string | undefined): void {
  fs.mkdirSync(nemiaDir(), { recursive: true });
  fs.writeFileSync(toldFile(), `${JSON.stringify(custom === undefined ? {} : { words: custom })}\n`);
}

/** The decoded record of the words she was last filed or told with: an object, with words, if any, as a string. */
const ToldSchema = Schema.Struct({ words: Schema.optionalKey(Schema.String) });

/**
 * The custom words her session was last filed or told with (`toldFile`), or undefined where the keeper kept no record, or one that does
 * not read as one: a session filed before the keeper kept them, read off her instruction instead (`customChanged`).
 */
export function readTold(): ToldCustom | undefined {
  let text: string;
  try {
    text = fs.readFileSync(toldFile(), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
  try {
    const read = Schema.decodeUnknownResult(ToldSchema)(JSON.parse(text));
    return Result.isSuccess(read) ? { ...read.success } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Writes the instruction her session is filed with (`promptFile`): her shipped instruction, then the person's custom words for her from
 * the store `home`, where there are any, and records those words (`writeTold`). Answers the file.
 */
export function composePrompt(body: string, home: string = ROOT): string {
  const custom = nemiaCustom(home);
  const file = writePrompt(nemiaPrompt(body, custom));
  writeTold(custom);
  return file;
}

/** The instruction her task was last filed or told with (`promptFile`), or undefined where none was ever written. */
export function filedPrompt(): string | undefined {
  try {
    return fs.readFileSync(promptFile(), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

/** A fact's name: a file of her memory, a letter or a digit first, and no folder. */
const FACT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Her facts, by file name, in name order; none where she has written none. */
export function listFacts(): string[] {
  try {
    return fs
      .readdirSync(memoryDir(), { withFileTypes: true })
      .filter((entry) => entry.isFile() && FACT.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

/** One fact's words. Refused (`Missing`) where she keeps no fact by that name, naming the ones she keeps. */
export function readFact(name: string): string {
  if (!listFacts().includes(name)) {
    const kept = listFacts();
    throw new Missing({
      message: `Nemia keeps no fact named ${name}: ${kept.length ? `she keeps ${kept.join(', ')}` : 'she keeps none yet'} (nemia memory lists them).`,
    });
  }
  return fs.readFileSync(path.join(memoryDir(), name), 'utf8');
}

/**
 * The allow rules a person gave her session at a prompt ("don't ask again"), written in her folder's local settings: what widens her
 * level beyond what ships. None where the file is not there or holds none.
 */
export function promptAllows(): string[] {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(nemiaDir(), CONFIG_FOLDERS[0], 'settings.local.json'), 'utf8'));
  } catch {
    return [];
  }
  const allow = (raw as { permissions?: { allow?: unknown } } | null)?.permissions?.allow;
  return Array.isArray(allow) ? allow.filter((rule): rule is string => typeof rule === 'string') : [];
}

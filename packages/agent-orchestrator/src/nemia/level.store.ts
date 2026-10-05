/**
 * Nemia's folder in the store, `$WF_ROOT/nemia/`: the person's level (`level.json`, written by `nemia level` alone), her memory
 * (`memory/`, written by her session alone, read here), the instruction her session is filed with (`prompt.md`, composed by the keeper),
 * and what ships with her in the package's `nemia/` folder: her definition (`nemia.md`) and her skills.
 *
 * Beneath the controllers, beside `subscription.store.ts`: it imports no store of runs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Result, Schema } from 'effect';
import { CONFIG_FOLDERS } from 'agent-runtime/vocabulary';
import { wfRoot } from '../config/config.store.ts';
import { readCustomInstructions } from '../folder/folder.store.ts';
import { parseAgent } from '../agents/agents.ts';
import { stepFrom } from '../workflow/index.ts';
import type { Workflow } from '../step/step.ts';
import { firstRefusal } from '../record/record.store.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
import { LEVELS, type LevelFile } from './nemia.ts';

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

/** Her definition as a step is read, with her ask rules: every call that asks the person first, outranking what her mode allows. */
export type Nemia = Workflow & { askTools: string[] };

/**
 * Her definition as a step is read, frontmatter judged as an agent's: her fence, mode and model, and her instruction (`body`); and her
 * ask rules (`askTools:`, a line only she takes, read out before the rest). Refused (`Invalid`): a mode but `auto`, and an `askTools:`
 * missing or naming no rule, without which a write she proposes is not asked of the person.
 */
export function readNemia(file: string = nemiaDefinition()): Nemia {
  const text = fs.readFileSync(file, 'utf8');
  const asked = /^askTools:(.*)\n/m.exec(text);
  const askTools = (asked?.[1] ?? '')
    .split(',')
    .map((rule) => rule.trim())
    .filter(Boolean);
  if (!askTools.length)
    throw new Invalid({
      message: `${file}: her askTools: names no rule, and every write she proposes is asked of the person by one: askTools: Bash(nemia approve:*), …`,
    });
  const agent = parseAgent('nemia', asked === null ? text : text.replace(asked[0], ''));
  const step = stepFrom('nemia/nemia.md', agent.keys, agent.body, undefined);
  if (step.permissionMode !== 'auto')
    throw new Invalid({
      message: `${file}: her permissionMode is ${step.permissionMode ?? 'not set'}, and she reads unasked while her askTools ask the person each write: permissionMode: auto.`,
    });
  return { ...step, askTools };
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
  let at = realOf(root);
  while (own !== undefined && at !== undefined) {
    const found = [path.join(at, 'node_modules', '.bin'), path.join(at, 'bin')].find((bin) => realOf(path.join(bin, 'nemia')) === own);
    if (found !== undefined) return found;
    at = path.dirname(at) === at ? undefined : path.dirname(at);
  }
  return undefined;
}

/**
 * The ask rules on every write in the store `root` but her own folder's: an `Edit` rule on each entry at its top, a folder's whole, and
 * on her level and her instruction, the two files of her folder she does not own. Read at each filing, so a folder the store gains is
 * asked at the next.
 */
export function storeAsks(root: string = ROOT): string[] {
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
      .filter((name) => name !== own)
      .map((name) => path.join(root, name))
      .map((at) => (fs.statSync(at, { throwIfNoEntry: false })?.isDirectory() ? `Edit(/${at}/**)` : `Edit(/${at})`)),
    `Edit(/${levelFile()})`,
    `Edit(/${promptFile()})`,
  ];
}

/**
 * Writes the instruction her session is filed with (`promptFile`): her shipped instruction, then the person's custom words for her from
 * the store `home`, where there are any. Answers the file.
 */
export function composePrompt(body: string, home: string = ROOT): string {
  const custom = readCustomInstructions(home, 'nemia');
  fs.mkdirSync(nemiaDir(), { recursive: true });
  fs.writeFileSync(promptFile(), `${[body.trim(), ...(custom === undefined ? [] : [custom])].join('\n\n')}\n`);
  return promptFile();
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

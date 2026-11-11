/**
 * Nemia's folder in the store, `$WF_ROOT/nemia/`: the person's level (`level.json`, written by `nemia level` alone), her memory
 * (`memory/`, written by her session alone, read here), the instruction her session is filed with (`prompt.md`, composed by the keeper),
 * the custom words she was last filed or told with (`told.json`, the keeper's record), and what is built in with her in the package's
 * `nemia/` folder, a plugin: her definition (`agents/nemia.md`), her skills and the MCP port's server entry.
 *
 * Beneath the controllers, beside `subscription.store.ts`: it imports no store of runs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Result, Schema } from 'effect';
import { CONFIG_FOLDERS } from 'agent-runtime/vocabulary';
import { parseAgent } from '../agents/agents.ts';
import { stepFrom } from '../workflow/index.ts';
import type { StepSpec } from '../step/step.ts';
import { firstRefusal } from '../record/record.store.ts';
import { POLICY_FOLDER } from '../auto/index.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
import { LEVELS, nemiaPrompt, type LevelFile, type ToldCustom } from './nemia.ts';
import { writeWhole } from '../whole-file/whole-file.store.ts';

/** Her folder in the store: her session's working folder. */
export const nemiaDir = (home: string): string => path.join(home, 'nemia');

/** Her memory: the facts she alone writes, one file each. */
export const memoryDir = (home: string): string => path.join(nemiaDir(home), 'memory');

/** The person's level, written by `nemia level`. */
export const levelFile = (home: string): string => path.join(nemiaDir(home), 'level.json');

/** The instruction her session is filed with: what is built in, then the person's custom words. */
export const promptFile = (home: string): string => path.join(nemiaDir(home), 'prompt.md');

/** The keeper's record of the person's custom words her session was last filed or told with (`ToldCustom`). */
export const toldFile = (home: string): string => path.join(nemiaDir(home), 'told.json');

/**
 * What is built in with her, a plugin folder: her definition, `agents/nemia.md`, which a coding agent that installs the plugin is given
 * too, her skills, `skills/`, and the store's MCP port as its server, `.mcp.json`.
 */
export const SHIPPED_NEMIA = path.join(import.meta.dirname, '..', '..', 'nemia');

/** The file that defines her, frontmatter and instruction: the plugin's agent, read by the keeper and by a coding agent alike. */
export const nemiaDefinition = (): string => path.join(SHIPPED_NEMIA, 'agents', 'nemia.md');

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
export function readLevel(home: string): LevelFile | undefined {
  let text: string;
  try {
    text = fs.readFileSync(levelFile(home), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Invalid({ message: `${levelFile(home)} is not JSON: set the level again with nemia level manual.` });
  }
  const read = Schema.decodeUnknownResult(LevelSchema)(raw);
  if (Result.isSuccess(read)) return { ...read.success };
  const { path: at, words } = firstRefusal(raw, read.failure);
  throw new Invalid({
    message: `${levelFile(home)}: ${at.length ? `its ${at.join('.')} ` : ''}${words}: set the level again with nemia level manual.`,
  });
}

/** Writes the person's level whole, through a hidden file renamed over it, so the keeper never reads half of it. */
export function writeLevel(home: string, level: LevelFile): void {
  fs.mkdirSync(nemiaDir(home), { recursive: true });
  writeWhole(levelFile(home), `${JSON.stringify(level)}\n`);
}

/**
 * Her definition as a step is read, frontmatter judged as an agent's: her fence, mode and model, and her instruction (`body`). Refused
 * (`Invalid`): a mode but `auto`, in which she reads unasked while her derived fence asks; and an `askTools:` line or a rule on `nemia` in
 * her `allowedTools:`, which her fence derives from the command table (`nemiaFence`): a hand list there would drift from it.
 */
export function readNemia(file: string = nemiaDefinition()): StepSpec {
  const text = fs.readFileSync(file, 'utf8');
  if (/^askTools:/m.test(text))
    throw new Invalid({ message: `${file}: her askTools: is derived from the command table: take it out of nemia.md.` });
  const agent = parseAgent('nemia', text);
  const step = stepFrom('nemia/agents/nemia.md', agent.keys, agent.body, undefined);
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

/** The package she is built into: its `package.json` names its `nemia`. */
const PACKAGE = path.join(import.meta.dirname, '..', '..');

/** A path's real path, or undefined where it is not there. */
const realOf = (at: string): string | undefined => {
  try {
    return fs.realpathSync(at);
  } catch {
    return undefined;
  }
};

/** Whether `file`, a real path, is the `nemia` bin its own package's `package.json` declares, the package found from it up. */
const declaredNemia = (file: string): boolean => {
  for (let dir = path.dirname(file); path.dirname(dir) !== dir; dir = path.dirname(dir)) {
    let text: string;
    try {
      text = fs.readFileSync(path.join(dir, 'package.json'), 'utf8');
    } catch {
      continue;
    }
    const named = (JSON.parse(text) as { bin?: { nemia?: unknown } }).bin?.nemia;
    return typeof named === 'string' && realOf(path.join(dir, named)) === file;
  }
  return false;
};

/**
 * The folder whose `nemia` is the bin of the same checkout or release as the package `root`: from the package's real path up, at each
 * folder its `node_modules/.bin` (a checkout, a local install), then its `bin` (a global prefix), the first whose `nemia` resolves to a
 * bin its package declares and lies under that same folder — the client in `apps/cli` of this checkout, the one npm linked beside this
 * package. Undefined where none does: a `nemia` that is another tree's is passed over.
 */
export function ownBin(root: string = PACKAGE): string | undefined {
  let at = realOf(root);
  while (at !== undefined) {
    const under = at;
    const found = [path.join(at, 'node_modules', '.bin'), path.join(at, 'bin')].find((bin) => {
      const real = realOf(path.join(bin, 'nemia'));
      return real !== undefined && real.startsWith(`${under}${path.sep}`) && declaredNemia(real);
    });
    if (found !== undefined) return found;
    at = path.dirname(at) === at ? undefined : path.dirname(at);
  }
  return undefined;
}

/**
 * The deny rules on every write in the store `root` but her own folder's: an `Edit` rule on each entry at its top, a folder's whole, the
 * rules for auto among them whether or not their folder is there yet (`POLICY_FOLDER`), and on her level, her instruction and the record
 * of the custom words she was told (`toldFile`), the three files of her folder she does not own. Read at each filing, so a folder the
 * store gains is denied at the next.
 */
export function storeDenies(home: string): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(home).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    names = [];
  }
  const own = path.basename(nemiaDir(home));
  return [
    ...names
      .filter((name) => name !== own && name !== POLICY_FOLDER)
      .map((name) => path.join(home, name))
      .map((at) => (fs.statSync(at, { throwIfNoEntry: false })?.isDirectory() ? `Edit(/${at}/**)` : `Edit(/${at})`)),
    `Edit(/${path.join(home, POLICY_FOLDER)}/**)`,
    `Edit(/${levelFile(home)})`,
    `Edit(/${promptFile(home)})`,
    `Edit(/${toldFile(home)})`,
    `Edit(/${path.join(nemiaDir(home), 'chat')}/**)`,
  ];
}

/** Her chat as the chat's verbs and its delivery are given it: the task her session is filed under, if any, and her folder. */
export const nemiaChatPlace = (home: string): { task: string | undefined; dir: string } => ({
  task: readLevel(home)?.task,
  dir: nemiaDir(home),
});

/** Writes `text` as the instruction her session is filed with (`promptFile`), and answers the file. */
export function writePrompt(home: string, text: string): string {
  fs.mkdirSync(nemiaDir(home), { recursive: true });
  fs.writeFileSync(promptFile(home), text);
  return promptFile(home);
}

/** Records `custom` as the words her session was last filed or told with (`toldFile`): none where undefined. */
export function writeTold(home: string, custom: string | undefined): void {
  fs.mkdirSync(nemiaDir(home), { recursive: true });
  fs.writeFileSync(toldFile(home), `${JSON.stringify(custom === undefined ? {} : { words: custom })}\n`);
}

/** The decoded record of the words she was last filed or told with: an object, with words, if any, as a string. */
const ToldSchema = Schema.Struct({ words: Schema.optionalKey(Schema.String) });

/**
 * The custom words her session was last filed or told with (`toldFile`), or undefined where the keeper kept no record, or one that does
 * not read as one: a session filed before the keeper kept them, read off her instruction instead (`customChanged`).
 */
export function readTold(home: string): ToldCustom | undefined {
  let text: string;
  try {
    text = fs.readFileSync(toldFile(home), 'utf8');
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
 * Writes the instruction her session is filed with (`promptFile`): her builtin instruction, then the person's custom words for her,
 * `custom`, where there are any (read through the Agent door, `keep.verb.ts`), and records those words (`writeTold`). Answers the file.
 */
export function composePrompt(home: string, body: string, custom: string | undefined): string {
  const file = writePrompt(home, nemiaPrompt(body, custom));
  writeTold(home, custom);
  return file;
}

/** The instruction her task was last filed or told with (`promptFile`), or undefined where none was ever written. */
export function filedPrompt(home: string): string | undefined {
  try {
    return fs.readFileSync(promptFile(home), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

/** A fact's name: a file of her memory, a letter or a digit first, and no folder. */
const FACT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Her facts, by file name, in name order; none where she has written none. */
export function listFacts(home: string): string[] {
  try {
    return fs
      .readdirSync(memoryDir(home), { withFileTypes: true })
      .filter((entry) => entry.isFile() && FACT.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

/** One fact's words. Refused (`Missing`) where she keeps no fact by that name, naming the ones she keeps. */
export function readFact(home: string, name: string): string {
  if (!listFacts(home).includes(name)) {
    const kept = listFacts(home);
    throw new Missing({
      message: `Nemia keeps no fact named ${name}: ${kept.length ? `she keeps ${kept.join(', ')}` : 'she keeps none yet'} (nemia memory lists them).`,
    });
  }
  return fs.readFileSync(path.join(memoryDir(home), name), 'utf8');
}

/**
 * The allow rules a person gave her session at a prompt ("don't ask again"), written in her folder's local settings: what widens her
 * level beyond what is built in. None where the file is not there or holds none.
 */
export function promptAllows(home: string): string[] {
  let raw: unknown;
  try {
    const [folder] = CONFIG_FOLDERS;
    if (folder === undefined) return [];
    raw = JSON.parse(fs.readFileSync(path.join(nemiaDir(home), folder, 'settings.local.json'), 'utf8'));
  } catch {
    return [];
  }
  const allow = (raw as { permissions?: { allow?: unknown } } | null)?.permissions?.allow;
  return Array.isArray(allow) ? allow.filter((rule): rule is string => typeof rule === 'string') : [];
}

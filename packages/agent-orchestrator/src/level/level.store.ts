/**
 * A factory's level on disk, `$WF_ROOT/factories/<name>/level.json`: the person's file, written by `nemia level --factory` alone, in the
 * store's folder for the factory, which `nemia factory rm` removes whole. Read and written whole, through a hidden file renamed over it.
 *
 * Beneath the controllers, beside `record.store.ts`, the one store file it imports.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Result, Schema } from 'effect';
import { factoryNameRefusal } from '../factory/factory.ts';
import { firstRefusal, HOME, When } from '../record/record.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import { LEVELS, type FactoryLevelFile } from './level.ts';

/** A factory's level file as `nemia level --factory` writes it; a key it does not name is read past. */
const FactoryLevelSchema = Schema.StructWithRest(
  Schema.Struct({
    level: Schema.optionalKey(Schema.Literals(LEVELS)),
    since: When,
    raise: Schema.optionalKey(Schema.Struct({ level: Schema.Literals(LEVELS), until: When })),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

/** The file the factory `name`'s level is kept in, at the module's root (`factoryLevelFileAt`). */
export const factoryLevelFile = (name: string): string => factoryLevelFileAt(HOME, name);

/** The file the factory `name`'s level is kept in, under the store `home`. Refused (`Invalid`): a name that is no factory's. */
export function factoryLevelFileAt(home: string, name: string): string {
  const bad = factoryNameRefusal(name);
  if (bad) throw new Invalid({ message: bad });
  return path.join(home, 'factories', name, 'level.json');
}

/**
 * The factory `name`'s level file, or undefined where none was written. Refused (`Invalid`), naming the file, its first wrong field and the
 * command that writes it again, where it does not read as one.
 */
export const readFactoryLevel = (name: string): FactoryLevelFile | undefined => levelIn(factoryLevelFile(name), name);

/** The factory `name`'s level file under the store `home` (`readFactoryLevel`). */
export const readFactoryLevelAt = (home: string, name: string): FactoryLevelFile | undefined =>
  levelIn(factoryLevelFileAt(home, name), name);

/** The level `file` of the factory `name` holds, or undefined where it is not there; refused where it does not read. */
function levelIn(file: string, name: string): FactoryLevelFile | undefined {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
  const fix = `set its level again with nemia level manual --factory ${name}`;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Invalid({ message: `${file} is not JSON: ${fix}.` });
  }
  const read = Schema.decodeUnknownResult(FactoryLevelSchema)(raw);
  if (Result.isFailure(read)) {
    const { path: at, words } = firstRefusal(raw, read.failure);
    throw new Invalid({ message: `${file}: ${at.length ? `its ${at.join('.')} ` : ''}${words}: ${fix}.` });
  }
  const { level, since, raise } = read.success;
  return { ...(level === undefined ? {} : { level }), since, ...(raise === undefined ? {} : { raise: { ...raise } }) };
}

/** Writes the factory `name`'s level file whole; a file with neither a level nor a raise is removed, and the factory follows the store. */
export const writeFactoryLevel = (name: string, level: FactoryLevelFile): void => levelWritten(factoryLevelFile(name), level);

/** Writes the factory `name`'s level file under the store `home` (`writeFactoryLevel`). */
export const writeFactoryLevelAt = (home: string, name: string, level: FactoryLevelFile): void =>
  levelWritten(factoryLevelFileAt(home, name), level);

/** `level` written whole onto `file`, or the file removed where it says neither a level nor a raise. */
function levelWritten(file: string, level: FactoryLevelFile): void {
  if (level.level === undefined && level.raise === undefined) {
    fs.rmSync(file, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const hidden = path.join(path.dirname(file), `.level.json.${process.pid}`);
  fs.writeFileSync(hidden, `${JSON.stringify(level)}\n`);
  fs.renameSync(hidden, file);
}

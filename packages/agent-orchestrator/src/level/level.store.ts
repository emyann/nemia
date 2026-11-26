/**
 * A factory's level as a record, `/registry/levels/<name>` (`levelKey`), whose value is the text of what
 * `$WF_ROOT/factories/<name>/level.json` was: the person's, written by `nemia level --factory` alone, which `nemia factory rm` removes with
 * the factory. Read as a record's text (`levelOf`) and written whole (`levelText`); the Factory door's records layer holds the record.
 *
 * Beneath the controllers, beside `record.store.ts`, the one store file it imports.
 */
import { Option, Result, Schema } from 'effect';
import { levelKey } from '../factory/door/index.ts';
import { firstRefusal, When } from '../record/record.store.ts';
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

/**
 * The level a factory's record `text` holds, or undefined where there is none. Refused (`Invalid`), naming the record, its first wrong
 * field and the command that writes it again, where it does not read as one.
 * @param text What the factory's level record holds, or undefined where there is none.
 * @param name The factory's name.
 */
export function levelOf(text: string | undefined, name: string) {
  if (text === undefined) return undefined;
  const where = levelKey(name);
  const fix = `set its level again with nemia level manual --factory ${name}`;
  const json = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))(text);
  if (Option.isNone(json)) throw new Invalid({ message: `${where} is not JSON: ${fix}.` });
  const raw = json.value;
  const read = Schema.decodeUnknownResult(FactoryLevelSchema)(raw);
  if (Result.isFailure(read)) {
    const { path: at, words } = firstRefusal(FactoryLevelSchema, raw);
    throw new Invalid({ message: `${where}: ${at.length ? `its ${at.join('.')} ` : ''}${words}: ${fix}.` });
  }
  const { level, since, raise } = read.success;
  return { ...(level === undefined ? {} : { level }), since, ...(raise === undefined ? {} : { raise: { ...raise } }) } satisfies
    | FactoryLevelFile
    | undefined;
}

/**
 * The text of a level record, or undefined where the level says neither a level nor a raise, which has no record: the factory then
 * follows the store.
 * @param level The level to write: the factory's own default and its raise, either absent.
 */
export const levelText = (level: FactoryLevelFile) =>
  level.level === undefined && level.raise === undefined ? undefined : `${JSON.stringify(level)}\n`;

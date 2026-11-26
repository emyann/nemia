/**
 * The levels a person sets on the store and on each factory: the levels (`LEVELS`), how they order (`atLeast`), a factory's own file
 * (`FactoryLevelFile`) with its default and a raise for a stretch (`Raise`), the level in force at a moment (`levelOf`, `factoryLevelOf`),
 * the refusals of a raise (`raiseRefusal`) and the stretch a raise is given for (`durationOf`).
 *
 * Pure, and naming no agent: admission and a subscription read a factory's level against a floor the same way for any agent. The files are
 * `level.store.ts`'s, and the levels now, the store's own folded in, are `levels.verb.ts`.
 */
import { LEVELS, type Level } from 'objects';

/**
 * The levels a person sets, lowest first: `manual`, left alone; `semi-auto`, worked on, what waits on the person asked of them, and a
 * write that cannot be undone or changes their settings or a factory; `auto`, as `semi-auto`, but an answer the person's confirmed list
 * allows in the run's state is given unasked (`auto/`).
 */
export { LEVELS };

/** A level a person sets. */
export type { Level };

/**
 * Whether `level` is `floor` or above it. Pure.
 * @param level The level asked of.
 * @param floor The level it is held against.
 */
export const atLeast = (level: Level, floor: Level) => LEVELS.indexOf(level) >= LEVELS.indexOf(floor);

/** A raise of a factory's level for a stretch: the level it is raised to, until the moment `until` (ISO), and its default after. */
type Raise = { level: Level; until: string };

/**
 * A factory's level file as `nemia level --factory` writes it: its own default `level`, absent where it follows the store's; when it was
 * last written (`since`); and a `raise` for a stretch, absent where none was given or it was ended.
 */
export type FactoryLevelFile = { level?: Level; since: string; raise?: Raise };

/**
 * A factory's level as it is read at a moment: its `factory`, the `level` in force, its `default` (its own, else the store's), its `own`
 * default (null where it follows the store's) and the `raise` in force, null where none is or its end has passed.
 */
export type FactoryLevel = { factory: string; level: Level; default: Level; own: Level | null; raise: Raise | null };

/**
 * The raise of `file` still in force at `at` (ms since the epoch): until its end, never at it. Pure.
 * @param file The factory's level file, undefined where none was written.
 * @param at The time asked of, in ms since the epoch.
 */
export const raiseAt = (file: FactoryLevelFile | undefined, at: number) =>
  file?.raise !== undefined && Date.parse(file.raise.until) > at ? file.raise : null;

/**
 * The level of a factory whose file is `file` at `at`: its raise while in force, else its own default, else the store's (`store`). A
 * raise past its end reads as gone, with no write. Pure.
 * @param file The factory's level file, undefined where none was written.
 * @param store The store's level.
 * @param at The time asked of, in ms since the epoch.
 */
export const levelOf = (file: FactoryLevelFile | undefined, store: Level, at: number) => raiseAt(file, at)?.level ?? file?.level ?? store;

/**
 * The factory `factory`'s level read at `at`, its file `file` and the store's level `store`. Pure.
 * @param factory The factory's name.
 * @param file The factory's level file, undefined where none was written.
 * @param store The store's level.
 * @param at The time asked of, in ms since the epoch.
 */
export const factoryLevelOf = (factory: string, file: FactoryLevelFile | undefined, store: Level, at: number) => ({
  factory,
  level: levelOf(file, store, at),
  default: file?.level ?? store,
  own: file?.level ?? null,
  raise: raiseAt(file, at),
});

/** The usage the refusals of a factory's level end on. */
export const FACTORY_LEVEL_FORM = `nemia level [${LEVELS.join('|')}] [--factory <name> [--for <duration> | --end]]`;

/**
 * Why raising a factory whose default is `byDefault` to `level` is refused, or undefined where it raises it. Pure.
 * @param factory The factory's name, as the refusal names it.
 * @param level The level the raise asks for.
 * @param byDefault The factory's default level.
 */
const raiseRefusal = (factory: string, level: Level, byDefault: Level) =>
  atLeast(byDefault, level)
    ? `${factory} is at ${byDefault} by default, so a raise to ${level} raises nothing: raise it above its default, or set its default with nemia level ${level} --factory ${factory}.`
    : undefined;

/** The milliseconds of a day, the longest unit a stretch is said in. */
const DAY = 86_400_000;

/** The milliseconds of each unit a stretch is said in. */
const UNITS: Readonly<Record<string, number>> = { m: 60_000, h: 3_600_000, d: DAY };

/** The longest stretch a raise is given for: a week, so a raise always ends. */
const LONGEST = 7 * DAY;

/**
 * The milliseconds of a stretch said as digits and a unit (`90m`, `2h`, `1d`), above zero and at most a week; undefined where it does not
 * read as one. Pure.
 * @param text The stretch as typed, `--for`'s value.
 */
export function durationOf(text: string) {
  const [, digits, unit] = /^(\d+)([mhd])$/.exec(text.trim()) ?? [];
  const per = unit === undefined ? undefined : UNITS[unit];
  if (digits === undefined || per === undefined) return undefined;
  const ms = Number(digits) * per;
  return ms > 0 && ms <= LONGEST ? ms : undefined;
}

/**
 * Why `text` is no stretch a raise is given for, or undefined where it is one. Pure.
 * @param text The stretch as typed, `--for`'s value.
 */
export const durationRefusal = (text: string) =>
  durationOf(text) === undefined
    ? `--for takes the stretch a raise lasts, digits and m, h or d, up to 7d, like 90m, 2h or 1d, and ${JSON.stringify(text)} is not one: ${FACTORY_LEVEL_FORM}.`
    : undefined;

/** A write `nemia level --factory` asks of a factory: its default `level`, a raise to `level` for `forMs`, or the raise ended (`end`). */
export type FactoryAsk = { factory: string; level?: Level; forMs?: number; end?: boolean };

/**
 * The factory's file once `ask` is written over `current` at `at`, the store at `store`; or why not: `conflict`, an end with no raise in
 * force; `invalid`, a raise that raises nothing over the factory's default. A default set keeps a raise still above it; any write drops a
 * raise past its end. Pure.
 * @param ask The factory and what is asked of it: a default, a raise for so many ms, or the end of the raise in force.
 * @param current The factory's level file, undefined where none was written.
 * @param store The store's level.
 * @param at The time of the write, which the file's `since` and a raise's end are counted from.
 */
export function factoryAsked(ask: FactoryAsk, current: FactoryLevelFile | undefined, store: Level, at: Date) {
  const since = at.toISOString();
  const raise = raiseAt(current, at.getTime());
  const own = current?.level === undefined ? {} : { level: current.level };
  if (ask.end) {
    if (raise === null)
      return { conflict: `${ask.factory} has no raise in force to end: it is at ${levelOf(current, store, at.getTime())} by default.` };
    return { file: { ...own, since } };
  }
  if (ask.level === undefined) return { file: { ...own, since, ...(raise === null ? {} : { raise }) } };
  if (ask.forMs === undefined) {
    const kept = raise !== null && !atLeast(ask.level, raise.level) ? { raise } : {};
    return { file: { level: ask.level, since, ...kept } };
  }
  const refused = raiseRefusal(ask.factory, ask.level, current?.level ?? store);
  if (refused !== undefined) return { invalid: refused };
  return { file: { ...own, since, raise: { level: ask.level, until: new Date(at.getTime() + ask.forMs).toISOString() } } };
}

/**
 * The levels `rows` read at `at` once the store's level is `store` and the factory `changed` names has the file it holds: the default
 * factory follows the store, and each other keeps its own default and its raise in force. Pure.
 * @param rows The factories' levels as they were read.
 * @param store The store's level.
 * @param changed The factory written and the file it now holds; undefined where only the store's level changed.
 * @param at The time asked of, in ms since the epoch.
 * @param byDefault The default factory's name, which follows the store.
 */
export function levelsAfter(
  rows: readonly FactoryLevel[],
  store: Level,
  changed: { factory: string; file: FactoryLevelFile } | undefined,
  at: number,
  byDefault: string,
) {
  const fileOf = (r: FactoryLevel) => {
    if (r.factory === byDefault) return undefined;
    if (r.factory === changed?.factory) return changed.file;
    return { since: '', ...(r.own === null ? {} : { level: r.own }), ...(r.raise === null ? {} : { raise: r.raise }) };
  };
  return rows.map((r) => factoryLevelOf(r.factory, fileOf(r), store, at));
}

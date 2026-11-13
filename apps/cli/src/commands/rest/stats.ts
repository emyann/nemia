/**
 * `nemia stats [--from <day>] [--to <day>] [--by <key>] [--agent|--step|--factory|--workflow|--repo <v>] [-l …]… [--line|--json]`:
 * the flow numbers of every run in the store, asked of `GET /api/stats` (`server.stats`), each flag as its query key — `--factory` and
 * `--repo` as `ofFactory` and `ofRepo`, each `-l` a `labelSelector` of its own, so two are either, as on the old path — then printed as
 * JSON (`--json`), one line (`--line`) or in words (`stats-lines.ts`), its groups and health read by `objects`' `StatsGroup` and
 * `StatsHealth`.
 */
import { Schema } from 'effect';
import { type Args, STATS_WORDS, StatsGroup, StatsHealth, StatsKeyedGroup } from 'objects';
import { asked } from '../../objects.ts';
import { Refused } from '../../refused.ts';
import { listArg, said, switchArg, textArg } from '../requests.ts';
import { statsLine, statsLines, type StatsRead } from './stats-lines.ts';

const COMMAND = STATS_WORDS.name;

/** The query `GET /api/stats` is asked, of what was typed: each flag given under its key, and each `-l` once. */
const queryOf = (args: Args) => {
  const given = (key: string, as: string = key) => {
    const value = textArg(args, key);
    return value === undefined ? {} : { [as]: value };
  };
  const selectors = listArg(args, 'selector');
  return {
    ...given('from'),
    ...given('to'),
    ...given('by'),
    ...given('agent'),
    ...given('step'),
    ...given('workflow'),
    ...given('factory', 'ofFactory'),
    ...given('repo', 'ofRepo'),
    ...(selectors.length ? { labelSelector: selectors } : {}),
  };
};

/** The answer's JSON part `value`, read by `schema`: refused where it does not read, naming the whole answer and the releases' check. */
const readAs = <S extends Schema.Top & { readonly DecodingServices: never }>(schema: S, value: unknown, part: string): S['Type'] => {
  const read = Schema.decodeUnknownExit(schema)(value);
  if (read._tag === 'Success') return read.value;
  throw new Refused(
    `nemia stats: the api's ${part} does not read as this client reads stats: nemia stats --json prints the whole answer, and nemia version says each side's release`,
  );
};

/** `nemia stats`' runner: the stats asked, printed as `--json` or `--line` asks, else in words. */
export async function stats(args: Args): Promise<number> {
  const answer = await asked(COMMAND, (c) => c.server.stats({ query: queryOf(args) }));
  if (switchArg(args, 'json')) {
    said([JSON.stringify(answer, null, 2)]);
    return 0;
  }
  const read: StatsRead = {
    ...answer,
    all: readAs(StatsGroup, answer.all, 'group of every run'),
    groups: answer.groups.map((g) => readAs(StatsKeyedGroup, g, 'group')),
    health: readAs(StatsHealth, answer.health, 'health'),
  };
  said(switchArg(args, 'line') ? [statsLine(read)] : statsLines(read));
  return 0;
}

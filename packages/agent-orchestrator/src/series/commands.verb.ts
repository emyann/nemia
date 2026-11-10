/** `nemia series`, an entry of the command table: what the system's passes were, kept a minute and an hour at a time (`seriesRead`). */
import { Schema } from 'effect';
import { tried } from '../runtime-client.ts';
import { RANGE_TAKES, seriesRead } from './series.store.ts';
import { seriesLines, type SeriesRead } from './series.ts';
import type { Command, Kept } from '../command/entry.verb.ts';

/** What `nemia series`' handler takes: `--range`, as the text given, and `--json`, the CLI's. */
export const SeriesInput = Schema.Struct({ range: Schema.optionalKey(Schema.String), json: Schema.optionalKey(Schema.Boolean) });
export type SeriesInput = typeof SeriesInput.Type;

/** `nemia series`: the system's series over a range, a point a minute, an hour or a day. */
export const SERIES: Command<SeriesRead, SeriesInput> = {
  name: 'series',
  usage: '[--range 24h|7d|30d|all] [--json]',
  help: [
    "the system's series over a range: a pass's time and its phases, its",
    'journal reads, the runs in the store, the sessions queued and admitted',
    'and the longest wait, the load, and the quota used. --range: 24h (a',
    'point a minute, the default), 7d or 30d (an hour), all (a day);',
    '--json: the whole answer',
  ],
  spec: {
    positionals: [],
    flags: [
      { flag: '--range', kind: 'text', key: 'range', takes: RANGE_TAKES, twice: 'nemia series takes --range once.' },
      { flag: '--json', kind: 'switch', key: 'json', only: { side: 'cli', why: 'the api answers the whole answer, as JSON' } },
    ],
    unknown: (arg) => `nemia series does not take ${arg}. It takes --range <range> and --json.`,
    apart: () => RANGE_TAKES,
  },
  writes: false,
  class: 'read',
  input: SeriesInput,
  handler: (input, kept?: Kept) => tried(() => seriesRead(input.range, kept?.series)),
  print: (read, args) => (args.json === true ? [JSON.stringify(read, null, 2)] : seriesLines(read)),
};

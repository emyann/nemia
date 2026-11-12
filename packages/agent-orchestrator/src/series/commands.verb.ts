/** `nemia series`, an entry of the command table: what the system's passes were, kept a minute and an hour at a time (`seriesRead`). */
import { SERIES_WORDS } from 'objects';
import { Effect, Schema } from 'effect';
import { StoreRoot } from '../config/root.store.ts';
import { tried } from '../runtime-client.ts';
import { seriesRead } from './series.store.ts';
import type { SeriesRead } from './series.ts';
import type { Kept, Served } from '../command/entry.verb.ts';

/** What `nemia series`' handler takes: `--range`, as the text given, and `--json`, the CLI's. */
export const SeriesInput = Schema.Struct({ range: Schema.optionalKey(Schema.String), json: Schema.optionalKey(Schema.Boolean) });
export type SeriesInput = typeof SeriesInput.Type;

/** `nemia series`: the system's series over a range, a point a minute, an hour or a day. */
export const SERIES: Served<SeriesRead, SeriesInput> = {
  ...SERIES_WORDS,
  input: SeriesInput,
  handler: (input, kept?: Kept) => Effect.flatMap(StoreRoot, (home) => tried(() => seriesRead(home, input.range, kept?.series))),
};

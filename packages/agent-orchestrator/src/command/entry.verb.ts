/**
 * The two shapes of an entry of the command table: a command whole, which a handler serves on either side (`Command`), and one the CLI
 * serves alone and runs itself, with no handler (`Ran`).
 */
import type { Effect } from 'effect';
import type { PlaceService } from '../place/place.store.ts';
import type { EngineService } from '../runtime-client.ts';
import type { Conflict, Missing, Refusal } from '../refusal/refusal.ts';
import type { StatsMemo } from '../stats/stats.verb.ts';
import type { RestingMemo } from '../rest/resting.verb.ts';
import type { ScheduleRuns } from '../factory/factory.verb.ts';
import type { PauseRuns } from '../pause/pause.verb.ts';
import type { InboxRuns } from '../inbox/inbox.store.ts';
import type { SeriesMemo } from '../series/series.ts';
import type { Filings } from '../summary/reads.verb.ts';
import type { RunSummary } from '../summary/summary.verb.ts';
import type { Args, CommandSpec } from './command.ts';

/**
 * What a caller that lives long keeps between its calls of the table's handlers: the stats' memo of each run's facts (`stats`), the list's
 * memo of runs at rest (`runs`), the feed's filing times (`filings`), the series' days read (`series`), and `records`, a memo per read
 * that wants a little of every run (`keptRecords`), each keyed by the run's stamp alone.
 */
export type Kept = {
  readonly stats?: StatsMemo;
  readonly series?: SeriesMemo;
  readonly runs?: RestingMemo<Omit<RunSummary, 'startedAt'>>;
  readonly filings?: Filings;
  readonly records?: KeptRecords;
};

/**
 * A memo of a projection of every run's record, one per read that polls (`keptRecords`): the inbox's listing, the factories' schedules
 * and the pause's current tasks. A read handed none reads every record, as the command line does.
 */
export type KeptRecords = {
  readonly inbox?: InboxRuns;
  readonly factories?: ScheduleRuns;
  readonly pause?: PauseRuns;
};

/**
 * A command whole: its spec, `handler`, which is the Effect of calling one package verb with the arguments, answering data — never printed
 * lines — and requiring the engine as a service (`EngineService`), run by a caller with `runWith`, and `print`, the lines the CLI prints
 * of that data. The api answers the data as JSON, or only its `apiKeys` where the CLI prints more of it than the api answers; or, where
 * `apiRefusal` makes one of the data, throws that refusal in its place: a verb that answers what it would not do as data, a line on the
 * CLI, is refused by its kind on the api. A handler reads its settings (`WF_MAX_RUNS`) from `env`, and a person's own files from the store
 * `home`: the process's own at the command line, the app's on the api; and what a caller that lives long keeps between its calls from
 * `kept` — the api's memos of the stats and of the runs at rest, and the feed's filing times it read — which the command line, calling
 * once, hands none of. `note` is what the CLI says of the data on stderr, beside what it prints.
 */
export type Command<D extends object = Readonly<Record<string, unknown>>> = CommandSpec & {
  handler(args: Args, env?: NodeJS.ProcessEnv, home?: string, kept?: Kept): Effect.Effect<D, Refusal, EngineService | PlaceService>;
  print(data: D, args: Args): readonly string[];
  note?(data: D, args: Args): readonly string[];
  readonly apiKeys?: readonly (keyof D & string)[];
  apiRefusal?(data: D, args: Args): Missing | Conflict | null;
};

/**
 * A command the CLI serves alone and runs itself, by its runner (`RUNS` in `cli/main.ts`): its spec, and no handler. A runner may run a
 * `Command` too, where the CLI's form spans more than the one call its handler makes: many runs, a person's yes.
 */
export type Ran = CommandSpec & { readonly only: { readonly side: 'cli'; readonly why: string }; readonly handler?: undefined };

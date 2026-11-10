/**
 * The two shapes of an entry of the command table: a command whole, which a handler serves on either side (`Command`), and one the CLI
 * serves alone and runs itself, with no handler (`Ran`); and what the entries share, defined in their features' folders: their check
 * (`checked`), and the flags that select runs and show their labels (`-l <selector>`, `--show-labels`, `-L <key>`).
 */
import { Effect, type Schema } from 'effect';
import type { PlaceService } from '../place/place.store.ts';
import type { EngineService } from '../runtime-client.ts';
import type { StoreRoot } from '../config/root.store.ts';
import type { StoreConfig } from '../config/config.store.ts';
import { Invalid, type Refusal } from '../refusal/refusal.ts';
import type { StatsMemo } from '../stats/stats.verb.ts';
import type { InformerMemo } from '../rest/informer.verb.ts';
import type { ScheduleRuns } from '../factory/schedule/listed.store.ts';
import type { PauseRuns } from '../pause/pause.ts';
import type { SeriesMemo } from '../series/series.ts';
import type { Filings } from '../summary/reads.verb.ts';
import type { Args, CommandSpec, Flag } from './command.ts';
import type { Run } from '../record/record.ts';
import type { Labels } from '../labels/labels.ts';
import { labelSegments, runLabelMap } from '../labels/labels.ts';
import { parseSelectors, selectorsRefusal, SELECTOR_FORM, type Selectors } from '../watch/selector.ts';

/**
 * What a caller that lives long keeps between its calls of the table's handlers: the stats' memo of each run's facts (`stats`), the
 * informer of each run's judgement (`runs`), the feed's filing times (`filings`), the series' days read (`series`), and `records`, a memo
 * per read that wants a little of every run (`keptRecords`), each keyed by the run's stamp alone.
 */
export type Kept = {
  readonly stats?: StatsMemo;
  readonly series?: SeriesMemo;
  readonly runs?: InformerMemo;
  readonly filings?: Filings;
  readonly records?: KeptRecords;
};

/**
 * A memo of a projection of every run's record, one per read that polls (`keptRecords`): the factories' schedules and the pause's current
 * tasks. A read handed none reads every record, as the command line does.
 */
export type KeptRecords = {
  readonly factories?: ScheduleRuns;
  readonly pause?: PauseRuns;
};

/**
 * What an entry's handler takes: where it is the CLI's parsed `Args` themselves, an entry may say nothing of it (`input` left out); where
 * it is a shape of its own (`I`), the entry carries `input`, the effect Schema of exactly the keys its handler takes, which the CLI decodes
 * its parsed `Args` through before it calls the handler, and the api calls the handler with the keys typed: a key renamed or reshaped is a
 * type error at the api's call, never a request that fails. An entry read as the table's (`Command` with `Args`) may carry any `input`, so
 * a typed entry joins the table as it is.
 */
export type InputOf<I> = [Args] extends [I] ? { readonly input?: Schema.Decoder<unknown> } : { readonly input: Schema.Decoder<I> };

/**
 * A command whole: its spec, `input`, the keys its handler takes where they are its own (`InputOf`), `handler`, which is the Effect of
 * calling one package verb with the arguments, answering data — never printed lines — and requiring the engine as a service
 * (`EngineService`), run by a caller with `runWith`, and `print`, the lines the CLI prints of that data. The api answers the data in the
 * shape its endpoint's success Schema says. A handler
 * reads its settings (`WF_MAX_RUNS`) from `env`, and a person's own files from the store `home`: the process's own at the command line, the
 * app's on the api; and what a caller that lives long keeps between its calls from `kept` — the api's memos of the stats and of the runs at
 * rest, and the feed's filing times it read — which the command line, calling once, hands none of. `note` is what the CLI says of the data
 * on stderr, beside what it prints.
 */
export type Command<D extends object = Readonly<Record<string, unknown>>, I = Args> = CommandSpec &
  InputOf<I> & {
    handler(args: I, kept?: Kept): Effect.Effect<D, Refusal, EngineService | PlaceService | StoreRoot | StoreConfig>;
    print(data: D, args: I): readonly string[];
    note?(data: D, args: I): readonly string[];
  };

/**
 * A command the CLI serves alone and runs itself, by its runner (`RUNS` in `cli/main.ts`): its spec, and no handler. A runner may run a
 * `Command` too, where the CLI's form spans more than the one call its handler makes: many runs, a person's yes.
 */
export type Ran = CommandSpec & { readonly only: { readonly side: 'cli'; readonly why: string }; readonly handler?: undefined };

/**
 * A typed entry (`Command<D, I>`) as the table holds it, beside the entries that take the CLI's `Args`: its input erased, as the table's
 * callers never hand it what it does not take — the CLI decodes its parsed `Args` through the entry's `input` first (`inputOf`), and the
 * api calls the typed entry itself, by its exported name.
 */
export const tableEntry = <D extends object, I>(command: Command<D, I>): Command => command as unknown as Command;

/**
 * A typed entry's own check of what it was handed: the refusal its spec's `check` words, said before anything is read — nothing where
 * `wrong` is none, else `Invalid` in its words. The CLI runs the `check` on what it parsed first; the api hands the entry's `input`
 * straight to its handler, which runs the same words through this, so a request is refused as the command line is.
 */
export const checked = (wrong: string | null | undefined): Effect.Effect<void, Invalid> =>
  wrong ? Effect.fail(new Invalid({ message: wrong })) : Effect.void;

/**
 * The selectors an entry of the table is given under `selector`, in the order given — `-l` at the command line, each given again for
 * another, and the api's `?selector=`, one or many — none where unset: a list's read takes the runs whose labels one of them takes.
 */
export const selectorTexts = (args: Args): readonly string[] => {
  const value = args['selector'];
  return typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
};

/** Why the selectors under `selector` are refused, or null where each is one: an entry's `check`. */
export const selectorCheck = (args: Args): string | null => selectorsRefusal(selectorTexts(args)) ?? null;

/**
 * The selectors under `selector`, parsed (`parseSelectors`); refused as `Invalid` (exit 2, 422 on the api) where one is no selector, in
 * the grammar's own words (`selectorsRefusal`), which end on the form it takes. None where none was given.
 */
export const selectorsIn = (args: Args): Effect.Effect<Selectors, Invalid> => {
  const refusal = selectorCheck(args);
  return refusal === null ? Effect.succeed(parseSelectors(selectorTexts(args))) : Effect.fail(new Invalid({ message: refusal }));
};

/**
 * `-l <selector>`, `--show-labels` and `-L <key>` of the command `command`: the runs whose labels a selector takes, each given again for
 * another; each line with its whole map; and that label's value beside each line, given again for another (`labelsShown`).
 */
export const labelFlags = (command: string): Flag[] => [
  selectorFlag(command),
  { flag: '--show-labels', kind: 'switch', key: 'showLabels' },
  {
    flag: '-L',
    kind: 'text',
    key: 'labelColumns',
    many: true,
    takes: `${command} -L takes the label key to show beside each line, given again for another: ${command} -L team`,
  },
];

/** What a line of `map`'s ends on as `--show-labels` and `-L` ask under `args` (`labelSegments`): nothing with neither. */
export const labelsShown = (args: Args, map: Labels): string => {
  const columns = args['labelColumns'];
  return labelSegments(map, { all: args['showLabels'] === true, columns: Array.isArray(columns) ? columns : [] });
};

/** What each run's head line ends on as `--show-labels` and `-L` ask under `args`, of the run's whole map (`runLabelMap`). */
export const runsShown =
  (args: Args) =>
  (run: Run): string =>
    labelsShown(args, runLabelMap(run));

/** `-l <selector>`, given again for another, of the command `command`: the runs whose labels one of them takes. */
export const selectorFlag = (command: string): Flag => ({
  flag: '-l',
  kind: 'text',
  key: 'selector',
  many: true,
  takes: `${command} -l takes a selector of the runs' labels: ${SELECTOR_FORM}`,
});

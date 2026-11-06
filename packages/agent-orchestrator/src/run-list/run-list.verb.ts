/**
 * The runs as a list of objects (`RunList`, from `objects`), and one run read in its namespace. A run's namespace is its factory,
 * `default` for one that names none (`runNamespace`, run-list.ts). A list keeps the runs of its namespace (every run where none is
 * given), then those its label selectors take off the record's whole map (`selectedRuns`), sorts them by name and cuts its page
 * (`pageOf`) — all before any run is judged — and only then judges the runs of the page into their objects (`runList`), so a page
 * of `limit` costs at most `limit` judgements. A run a task of which does not read is no `Run`: it is left out of `items` and named in
 * `unjudged` with why, never dropped with no word.
 *
 * A list asked by state (`?fieldSelector=status.state…`, `runStateSelector`) is the board's: it judges every run its namespace and labels
 * keep, to count them by state (`metadata.counts`) before it selects and pages, orders by name — or, for `status.state=finished`, newest
 * first by when their work stopped (`finishedBefore`, its own token) — and lays the frame's parts on each run's status, measured to
 * `metadata.asOf` (`framePartsOf`). A plain list carries none of it.
 */
import { isDeepStrictEqual } from 'node:util';
import { Effect } from 'effect';
import { API_VERSION, type Run as RunObject, type RunList, type RunState, type RunUnjudged } from 'objects';
import type { Run } from '../run.ts';
import type { Engine } from '../runtime-client.ts';
import { finishedAtOf, kindOf, selectedRuns } from '../runlist/runlist.ts';
import { framed, framePartsOf, unjudgedStateOf } from '../runlist/runlist.verb.ts';
import { storeRunsListed, summaryOf, type SummaryHow } from '../summary/summary.verb.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
import { parseSelectors, selectorsRefusal } from '../watch/selector.ts';
import { pageOf } from '../object/page.ts';
import { finishedPageOf, runNamespace, runStateSelector, type RunStateSelector, byFinishedPlace } from './run-list.ts';

export { runNamespace };
import { diskPartsOf, type RunObjectAnswer, runObjectCore, type RunReads, withDiskParts } from '../object/run.verb.ts';
import { readFailed, runReadingOf, stepsReadingOf } from '../object/read.verb.ts';
import { informedJudgements, keepObject, keptObject } from '../rest/informer.verb.ts';
import { filedTimes, folderReader } from '../summary/reads.verb.ts';
import type { Judgement, Judgements, JudgedOrWhy } from '../summary/judgement.verb.ts';

/**
 * What a list of runs is asked: its namespace (none for every run), `?limit=`, `?continue=`, its label selectors, OR'd, and its
 * `?fieldSelector=`, the runs in one state (`runStateSelector`).
 */
export type RunQuery = {
  readonly namespace?: string | undefined;
  readonly limit?: number | null | undefined;
  readonly continue?: string | undefined;
  readonly labelSelector?: readonly string[] | undefined;
  readonly fieldSelector?: string | undefined;
};

/** What a run listed needs for its list: its name, its factory, and what its whole map of labels is made of. */
type Listed = Pick<Run, 'id' | 'factory' | 'workflowDir' | 'labels'>;

/** Runs in the order a list answers them and a token reads them: by name, as `<` compares. */
const byName = (a: Listed, b: Listed): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The runs of `query.namespace` (every run where none is given) that its label selectors keep, sorted by name, or `Invalid` for a label
 * selector that is not one.
 */
const keptOf = <R extends Listed>(runs: readonly R[], query: RunQuery): readonly R[] | Invalid => {
  const selectors = query.labelSelector ?? [];
  const refusal = selectorsRefusal(selectors);
  if (refusal !== undefined)
    return new Invalid({ message: `labelSelector: ${refusal}. Correct it, or leave labelSelector out to list every run` });
  const { namespace } = query;
  const inNamespace = namespace === undefined ? runs : runs.filter((run) => runNamespace(run.factory) === namespace);
  return [...selectedRuns(inNamespace, parseSelectors(selectors))].sort(byName);
};

/** The selector `query.fieldSelector` spells, none where it is not given, or `Invalid` naming the three forms it takes. */
const fieldSelectorOf = (query: RunQuery): RunStateSelector | undefined | Invalid => {
  if (query.fieldSelector === undefined) return undefined;
  return (
    runStateSelector(query.fieldSelector) ??
    new Invalid({
      message: `fieldSelector ${JSON.stringify(query.fieldSelector)} is no selector of the runs: pass one term on the run's state, status.state=<state>, status.state==<state> or status.state!=<state>, the state one of waiting, inFlight or finished, or leave fieldSelector out to list every run`,
    })
  );
};

/**
 * A page of `runs` (`RunList`): those of `query.namespace` (every run where none is given) that its label selectors keep, sorted by
 * name, cut by its `limit` after its `continue`, then judged by `judge`, the page at once, an answer for each run in its order; one it
 * cannot judge named in `unjudged`. `Invalid` for a selector, a limit or a token that is not one, before any run is judged; a list asked
 * by state is `runList`'s, and refused here.
 */
export const runListOf = Effect.fn('runListOf')(function* <R extends Listed, E, S>(
  runs: readonly R[],
  query: RunQuery,
  judge: (page: readonly R[]) => Effect.Effect<readonly RunObjectAnswer[], E, S>,
) {
  const field = fieldSelectorOf(query);
  if (field instanceof Invalid) return yield* Effect.fail(field);
  if (field !== undefined) return yield* Effect.die(new Error('A list asked by state is judged whole by runList, never cut by runListOf.'));
  const kept = keptOf(runs, query);
  if (kept instanceof Invalid) return yield* Effect.fail(kept);
  const page = pageOf(kept, (run) => run.id, { limit: query.limit ?? null, continue: query.continue });
  if (page instanceof Invalid) return yield* Effect.fail(page);
  const answers = yield* judge(page.items);
  const items: RunObject[] = [];
  const unjudged: RunUnjudged[] = [];
  for (const [i, run] of page.items.entries()) {
    const answer = answers[i];
    if (answer === undefined) return yield* Effect.die(new Error(`Run ${run.id} was handed to the list's judgement and not judged.`));
    if ('unjudged' in answer) unjudged.push({ name: run.id, namespace: runNamespace(run.factory), error: answer.unjudged });
    else items.push(answer);
  }
  const answered: RunList = {
    apiVersion: API_VERSION,
    kind: 'RunList',
    metadata: {
      remainingItemCount: page.remainingItemCount,
      ...(page.continue !== undefined ? { continue: page.continue } : {}),
    },
    items,
    ...(unjudged.length ? { unjudged } : {}),
  };
  return answered;
});

/**
 * A page of the store's runs (`runListOf`), listed once through the informer `how.memo` (`storeRunsListed`), the page judged through that
 * one read in one batch (`informedJudgements`) and the feed's filing times read once, then each run of the page answered as a list says
 * it (`listed`: no harness asked, no drift read). A run's object built on the judgement the informer holds is kept beside it
 * (`keepObject`) and served while that judgement is (`keptObject`), its disk parts read now (`diskPartsOf`), each workflow folder loaded
 * once a request (`folderReader`). An object built on a read that failed (`readFailed`) is not kept. Under `how.verify`, an object
 * served from memory is built afresh too, and one that differs dies. A program over the engine, the place, the informer and the
 * store's root.
 */
export const runList = Effect.fn('runList')(function* (e: Engine, how: SummaryHow, reads: RunReads, query: RunQuery) {
  const field = fieldSelectorOf(query);
  if (field instanceof Invalid) return yield* Effect.fail(field);
  const { git, read, all } = yield* storeRunsListed(e, how);
  const judging = (some: readonly Run[]) => informedJudgements(e, home, some, read, git, () => all);
  const { home } = how;
  const objectOf = objectsOf(e, how, reads, read.verify);
  if (field !== undefined) return yield* byState(all, query, field, { home, judging, filed: filedTimes(e, reads.memo.filings), objectOf });
  return yield* runListOf(all, query, (page) =>
    Effect.gen(function* () {
      const judged = yield* judging(page);
      const filed = yield* filedTimes(e, reads.memo.filings);
      return yield* Effect.forEach(page, (run) =>
        Effect.gen(function* () {
          const one = judged.runs.get(run.id) ?? (yield* notJudged(run));
          return 'unjudged' in one ? one : yield* objectOf(run, one.judgement, filed);
        }),
      );
    }),
  );
});

/** The defect of a run handed to its judgement that came back without one. */
const notJudged = (run: Pick<Run, 'id'>) => Effect.die(new Error(`Run ${run.id} was handed to its judgement and not judged.`));

/**
 * How a run's listed object is answered (`listed`: no harness asked, no drift read) off its `judgement` and the feed's filing times: the
 * object kept beside that judgement (`keptObject`), before its disk parts (`runObjectCore`), with them read now and laid over
 * (`withDiskParts`), or one built and its core kept (`keepObject`) where none is and its read did not fail (`readFailed`). Under `verify`,
 * one served from memory is built afresh too, and one that differs dies. Each workflow folder is loaded once a request (`folderReader`).
 */
const objectsOf = (e: Engine, { home, memo }: SummaryHow, reads: RunReads, verify: boolean) => {
  const folders = folderReader(home);
  const built = (run: Run, one: JudgedOrWhy, filed: ReadonlyMap<string, string>) =>
    Effect.gen(function* () {
      const steps = yield* stepsReadingOf(e, home, run, one, folders(run));
      if ('unjudged' in steps) return { core: undefined, answer: steps, failed: false };
      const core = yield* runObjectCore(run, runReadingOf(steps, filed), { said: reads.memo.said, listed: true });
      return { core, answer: withDiskParts(core, diskPartsOf(run, home, folders(run))), failed: readFailed(steps) };
    });
  return (run: Run, judgement: Judgement, filed: ReadonlyMap<string, string>) =>
    Effect.gen(function* () {
      const kept = keptObject(memo, run.id, judgement);
      if (kept !== undefined) {
        memo.objectHits++;
        const parts = diskPartsOf(run, home, folders(run));
        if (verify) {
          const fresh = yield* built(run, { judgement }, filed);
          if (!isDeepStrictEqual(withDiskParts(kept, parts), fresh.answer))
            return yield* Effect.die(
              new Error(
                `The informer served ${run.id}'s listed object differently from one built afresh (WF_VERIFY_REST): something it was built on is not watched — put it into what the informer checks, or into the parts read on every request (diskPartsOf).`,
              ),
            );
        }
        return withDiskParts(kept, parts);
      }
      const { core, answer, failed } = yield* built(run, { judgement }, filed);
      if (!failed && run.workflow !== undefined && core !== undefined) keepObject(memo, run.id, judgement, core);
      return answer;
    });
};

/** What a list asked by state reads through: the store's root, its judgement of many runs at once, the feed's filing times, the objects. */
type ByStateReads<E, R> = {
  readonly home: string;
  readonly judging: (some: readonly Run[]) => Effect.Effect<Judgements, E, R>;
  readonly filed: Effect.Effect<ReadonlyMap<string, string>, E, R>;
  readonly objectOf: (run: Run, judgement: Judgement, filed: ReadonlyMap<string, string>) => Effect.Effect<RunObjectAnswer, E, R>;
};

/** A run a list asked by state keeps: its record, its judgement or why it has none, its state, and when it finished for a finished one. */
type Stated = {
  run: Run;
  one: JudgedOrWhy;
  summary: ReturnType<typeof summaryOf> | undefined;
  state: RunState;
  name: string;
  finishedAt: string;
};

/** The RunList of `page`'s `items` and `unjudged`, its metadata the page's and `frame`'s: the counts and the instant they are read at. */
const framedList = (
  page: { readonly remainingItemCount: number; readonly continue?: string },
  items: RunObject[],
  unjudged: RunUnjudged[],
  frame: { counts: { waiting: number; inFlight: number; finished: number }; asOf: string },
): RunList => ({
  apiVersion: API_VERSION,
  kind: 'RunList',
  metadata: {
    remainingItemCount: page.remainingItemCount,
    ...(page.continue !== undefined ? { continue: page.continue } : {}),
    ...frame,
  },
  items,
  ...(unjudged.length ? { unjudged } : {}),
});

/** How many of `stated` are in each state. */
const countsOf = (stated: readonly Stated[]) => {
  const counts = { waiting: 0, inFlight: 0, finished: 0 };
  for (const { state } of stated) counts[state]++;
  return counts;
};

/** `run` as a list asked by state keeps it: summarized off its judgement (`summaryOf`), or stated as the list counts one left unjudged. */
const statedOf = (run: Run, one: JudgedOrWhy, home: string): Stated => {
  const summary = 'judgement' in one ? summaryOf(one.judgement, home) : undefined;
  const state = summary ? kindOf(summary) : unjudgedStateOf(run);
  return { run, one, summary, state, name: run.id, finishedAt: summary && state === 'finished' ? finishedAtOf(summary) : run.createdAt };
};

/**
 * The list asked by state (`field`): every run the namespace and labels keep judged at once, counted by state, then those `field` selects,
 * by name, or newest first for `status.state=finished` (`finishedPageOf`), cut by the page; each of the page answered as the plain list
 * answers it, with the frame's parts laid on its status (`framePartsOf`), measured to `metadata.asOf`. A run left unjudged is named in
 * `unjudged` with its state.
 */
const byState = Effect.fnUntraced(function* <E, R>(
  all: readonly Run[],
  query: RunQuery,
  field: RunStateSelector,
  reads: ByStateReads<E, R>,
) {
  const kept = keptOf(all, query);
  if (kept instanceof Invalid) return yield* Effect.fail(kept);
  const judged = yield* reads.judging(kept);
  const filed = yield* reads.filed;
  const now = Date.now();
  const stated: Stated[] = [];
  for (const run of kept) stated.push(statedOf(run, judged.runs.get(run.id) ?? (yield* notJudged(run)), reads.home));
  const counts = countsOf(stated);
  const selected = stated.filter(({ state }) => (state === field.state) === field.equal);
  const asked = { limit: query.limit ?? null, continue: query.continue };
  const finishedOrder = field.equal && field.state === 'finished';
  const page = finishedOrder ? finishedPageOf([...selected].sort(byFinishedPlace), asked) : pageOf(selected, ({ name }) => name, asked);
  if (page instanceof Invalid) return yield* Effect.fail(page);
  const items: RunObject[] = [];
  const unjudged: RunUnjudged[] = [];
  for (const one of page.items) {
    const answer = 'judgement' in one.one ? yield* reads.objectOf(one.run, one.one.judgement, filed) : one.one;
    if ('unjudged' in answer || one.summary === undefined || !('judgement' in one.one))
      unjudged.push({
        name: one.name,
        namespace: runNamespace(one.run.factory),
        error: 'unjudged' in answer ? answer.unjudged : '',
        state: one.state,
      });
    else items.push(framed(answer, framePartsOf(one.summary, one.one.judgement, filed, now)));
  }
  return framedList(page, items, unjudged, { counts, asOf: new Date(now).toISOString() });
});

/**
 * Whether `run` is in `namespace`: `Missing` where it is not, in the words of a run no name matches, since a run is in exactly one
 * namespace and a read or an action addressed under another finds none.
 */
export const runIn = (run: Pick<Run, 'id' | 'factory'>, namespace: string): Effect.Effect<void, Missing> =>
  runNamespace(run.factory) === namespace
    ? Effect.void
    : Effect.fail(
        new Missing({
          message: `no run ${run.id} in the namespace ${namespace}: it is in ${runNamespace(run.factory)}, its factory's — address it under /api/namespaces/${runNamespace(run.factory)}/runs/${run.id}, or list the runs at /api/runs`,
        }),
      );

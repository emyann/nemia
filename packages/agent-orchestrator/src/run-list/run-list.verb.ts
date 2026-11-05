/**
 * The runs as a list of objects (`RunList`, from `objects`), and one run read in its namespace. A run's namespace is its factory,
 * `default` for one that names none (`runNamespace`, run-list.ts). A list keeps the runs of its namespace (every run where none is
 * given), then those its label selectors take off the record's whole map (`selectedRuns`), sorts them by name and cuts its page
 * (`pageOf`) — all before any run is judged — and only then judges the runs of the page into their objects (`runList`), so a page
 * of `limit` costs at most `limit` judgements. A run a task of which does not read is no `Run`: it is left out of `items` and named in
 * `unjudged` with why, never dropped with no word.
 */
import { isDeepStrictEqual } from 'node:util';
import { Effect } from 'effect';
import { API_VERSION, type Run as RunObject, type RunList, type RunUnjudged } from 'objects';
import type { Run } from '../run.ts';
import type { Engine } from '../runtime-client.ts';
import { selectedRuns } from '../runlist/runlist.ts';
import { storeRunsListed, type SummaryHow } from '../summary/summary.verb.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
import { parseSelectors, selectorsRefusal } from '../watch/selector.ts';
import { pageOf } from '../object/page.ts';
import { runNamespace } from './run-list.ts';

export { runNamespace };
import { diskPartsOf, type RunObjectAnswer, runObjectOf, type RunReads, withDiskParts } from '../object/run.verb.ts';
import { readFailed, runReadingOf, stepsReadingOf } from '../object/read.verb.ts';
import { informedJudgements, keepObject, keptObject } from '../rest/informer.verb.ts';
import { filedTimes, folderReader } from '../summary/reads.verb.ts';
import type { JudgedOrWhy } from '../summary/judgement.verb.ts';

/** What a list of runs is asked: its namespace (none for every run), `?limit=`, `?continue=`, and its label selectors, OR'd. */
export type RunQuery = {
  readonly namespace?: string | undefined;
  readonly limit?: number | null | undefined;
  readonly continue?: string | undefined;
  readonly labelSelector?: readonly string[] | undefined;
};

/** What a run listed needs for its list: its name, its factory, and what its whole map of labels is made of. */
type Listed = Pick<Run, 'id' | 'factory' | 'workflowDir' | 'labels'>;

/** Runs in the order a list answers them and a token reads them: by name, as `<` compares. */
const byName = (a: Listed, b: Listed): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * A page of `runs` (`RunList`): those of `query.namespace` (every run where none is given) that its label selectors keep, sorted by
 * name, cut by its `limit` after its `continue`, then judged by `judge`, the page at once, an answer for each run in its order; one it
 * cannot judge named in `unjudged`. `Invalid` for a selector, a limit or a token that is not one, before any run is judged.
 */
export const runListOf = Effect.fn('runListOf')(function* <R extends Listed, E, S>(
  runs: readonly R[],
  query: RunQuery,
  judge: (page: readonly R[]) => Effect.Effect<readonly RunObjectAnswer[], E, S>,
) {
  const { namespace } = query;
  const selectors = query.labelSelector ?? [];
  const refusal = selectorsRefusal(selectors);
  if (refusal !== undefined)
    return yield* Effect.fail(
      new Invalid({ message: `labelSelector: ${refusal}. Correct it, or leave labelSelector out to list every run` }),
    );
  const inNamespace = namespace === undefined ? runs : runs.filter((run) => runNamespace(run.factory) === namespace);
  const kept = [...selectedRuns(inNamespace, parseSelectors(selectors))].sort(byName);
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
  const { git, read, all } = yield* storeRunsListed(e, how);
  const { home, memo } = how;
  const folders = folderReader(home);
  return yield* runListOf(all, query, (page) =>
    Effect.gen(function* () {
      const judged = yield* informedJudgements(e, home, page, read, git, () => all);
      const filed = yield* filedTimes(e, reads.memo.filings);
      const built = (run: Run, one: JudgedOrWhy) =>
        Effect.gen(function* () {
          const steps = yield* stepsReadingOf(e, home, run, one, folders(run));
          if ('unjudged' in steps) return { answer: steps, failed: false };
          const object = yield* runObjectOf(run, runReadingOf(steps, filed), { said: reads.memo.said, listed: true });
          return { answer: object, failed: readFailed(steps) };
        });
      return yield* Effect.forEach(page, (run) =>
        Effect.gen(function* () {
          const one = judged.runs.get(run.id) ?? (yield* Effect.die(new Error(`Run ${run.id} was handed to its judgement and not judged.`)));
          if ('unjudged' in one) return one;
          const kept = keptObject(memo, run.id, one.judgement);
          if (kept !== undefined) {
            memo.objectHits++;
            const parts = diskPartsOf(run, home, folders(run));
            if (read.verify) {
              const fresh = yield* built(run, one);
              if (!isDeepStrictEqual(withDiskParts(kept, parts), fresh.answer))
                return yield* Effect.die(
                  new Error(
                    `The informer served ${run.id}'s listed object differently from one built afresh (WF_VERIFY_REST): something it was built on is not watched — put it into what the informer checks, or into the parts read on every request (diskPartsOf).`,
                  ),
                );
            }
            return withDiskParts(kept, parts);
          }
          const { answer, failed } = yield* built(run, one);
          if (!failed && run.workflow !== undefined && !('unjudged' in answer)) keepObject(memo, run.id, one.judgement, answer);
          return answer;
        }),
      );
    }),
  );
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

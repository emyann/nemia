/**
 * `nemia ls [<run>] [-l <key>=<value>]... [--show-labels] [-L <key>]... [-o wide]`, its words parsed against `objects`' `LS_WORDS`, read
 * from the api: the runs, those a label query takes (sent as `labelSelector`, given again for another), as the server prints them — the
 * runs list asked for its `Table` (`TABLE_ACCEPT`), every page of it read on from the `continue` each answers (`everyPage`) so a run is
 * one line however many there are, printed by `tableLines`, each run's status and what waits on you among its columns — with the pause
 * first (`GET /api/pause`, `pausedLines`), and after the table how old what it shows of where the result branches stand is, where the
 * server says so (`Daemon.branchesLine`), a line per schedule of each factory (`GET /api/namespaces/<factory>/schedules`,
 * `scheduleLines`) and the daemon's line last, the server's own (`GET /api/daemon`). One run named is read as its object and printed a
 * step a line (`oneRun`), under any context.
 */
import { Effect } from 'effect';
import { type Args, READ_BOUND_MS, type TableAsked, tableLines } from 'objects';
import { textArg } from '../commands/requests.ts';
import { asked, everyPage, type ObjectsClient, pageOf } from '../objects.ts';
import { runLines } from './run-lines.ts';
import { pausedLines, scheduleLines } from './standing.ts';
import { AS_TABLE, tableAsked, tableOf } from './table.ts';

/** What `nemia ls` says beside the runs: the pause, each factory's schedules, and the daemon. */
const standing = (client: ObjectsClient) =>
  Effect.all(
    {
      paused: client.server.paused(),
      daemon: client.server.daemon(),
      factories: pageOf(everyPage((page) => client.factories.listAll({ query: page }))),
    },
    { concurrency: 'unbounded' },
  ).pipe(
    Effect.flatMap(({ paused, daemon, factories }) =>
      Effect.forEach(
        factories.items,
        ({ metadata: { name } }) =>
          everyPage((page) => client.schedules.list({ params: { namespace: name }, query: page })).pipe(
            Effect.map((listed) => ({ factory: name, schedules: listed.items })),
          ),
        { concurrency: 'unbounded' },
      ).pipe(Effect.map((schedules) => ({ paused, daemon, schedules }))),
    ),
  );

/**
 * `nemia ls <run>`: the pause first, the run's lines off its object (`GET /api/runs/:name`, `runLines`), how old where the branches stand
 * is and the daemon's line, under any context; a run the api cannot judge is its refusal, in its words.
 */
async function oneRun(name: string, how: TableAsked, env: NodeJS.ProcessEnv): Promise<number> {
  const [run, around] = await Promise.all([
    asked('ls', (client) => client.runs.show({ params: { name } }), env),
    asked(
      'ls',
      (client) => Effect.all({ paused: client.server.paused(), daemon: client.server.daemon() }, { concurrency: 'unbounded' }),
      env,
    ),
  ]);
  for (const line of [
    ...pausedLines(around.paused, new Date()),
    ...runLines(run, how),
    ...(around.daemon.branchesLine ? [around.daemon.branchesLine] : []),
    around.daemon.line,
  ])
    process.stdout.write(`${line}\n`);
  return 0;
}

/** Prints the runs `args` asks for, or the one run it names; answers 0. */
export async function ls(args: Args, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const read = tableAsked(args);
  const run = textArg(args, 'runId');
  if (run !== undefined) return oneRun(run, read.asked, env);
  const selector = [...read.selector];
  const [listed, around] = await Promise.all([
    asked(
      'ls',
      (client) => everyPage((page) => client.runs.listAll({ query: selector.length ? { ...page, labelSelector: selector } : page })),
      env,
      READ_BOUND_MS,
      AS_TABLE,
    ),
    asked('ls', standing, env),
  ]);
  const lines = tableLines(tableOf('ls', listed), read.asked);
  const none = selector.length
    ? `no run matches -l ${selector.join(' -l ')} — see them all with nemia ls --show-labels`
    : 'no run yet — start one with nemia start';
  const now = Date.now();
  for (const line of [
    ...pausedLines(around.paused, new Date(now)),
    ...(lines.length ? lines : [none]),
    ...(around.daemon.branchesLine ? [around.daemon.branchesLine] : []),
    ...scheduleLines(around.schedules, now),
    around.daemon.line,
  ])
    process.stdout.write(`${line}\n`);
  return 0;
}

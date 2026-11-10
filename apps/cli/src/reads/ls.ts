/**
 * `nemia ls [-l <selector>]... [--show-labels] [-L <key>]... [-o wide]`, read from the api: the runs, those a selector takes (sent as
 * `labelSelector`, given again for another), as the server prints them — the runs list asked for its `Table` (`TABLE_ACCEPT`), printed by
 * `tableLines`, each run's status and what waits on you among its columns — with the pause first (`GET /api/pause`, `pausedLines`), and
 * after the table how old what it shows of where the result branches stand is, where the server says so (`Daemon.branchesLine`), a
 * line per schedule of each factory (`GET /api/namespaces/<factory>/schedules`, `scheduleLines`) and the daemon's line last, the
 * server's own (`GET /api/daemon`). Any other words go to the old path: `nemia ls <run>` among them.
 */
import { Effect } from 'effect';
import { spawned } from '../local.ts';
import { asked, type ObjectsClient, READ_BOUND_MS } from '../objects.ts';
import { pausedLines, scheduleLines } from './standing.ts';
import { AS_TABLE, tableAsked, tableLines, tableOf } from './table.ts';

/** What `nemia ls` says beside the runs: the pause, each factory's schedules, and the daemon. */
const standing = (client: ObjectsClient) =>
  Effect.all(
    { paused: client.server.paused(), daemon: client.server.daemon(), factories: client.factories.listAll({ query: {} }) },
    { concurrency: 'unbounded' },
  ).pipe(
    Effect.flatMap(({ paused, daemon, factories }) =>
      Effect.forEach(
        factories.items,
        ({ metadata: { name } }) =>
          client.schedules
            .list({ params: { namespace: name }, query: {} })
            .pipe(Effect.map((listed) => ({ factory: name, schedules: listed.items }))),
        { concurrency: 'unbounded' },
      ).pipe(Effect.map((schedules) => ({ paused, daemon, schedules }))),
    ),
  );

export async function ls(args: readonly string[]): Promise<number> {
  const read = tableAsked(args);
  if (read === null || read.rest.length) return spawned(['ls', ...args]);
  const { selector } = read;
  const [listed, around] = await Promise.all([
    asked(
      'ls',
      (client) => client.runs.listAll({ query: selector.length ? { labelSelector: selector } : {} }),
      process.env,
      READ_BOUND_MS,
      AS_TABLE,
    ),
    asked('ls', standing),
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

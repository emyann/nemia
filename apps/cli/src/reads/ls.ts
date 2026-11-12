/**
 * `nemia ls [-l <selector>]... [--show-labels] [-L <key>]... [-o wide]`, read from the api: the runs, those a selector takes (sent as
 * `labelSelector`, given again for another), as the server prints them — the runs list asked for its `Table` (`TABLE_ACCEPT`), every
 * page of it read on from the `continue` each answers (`everyPage`) so a run is one line however many there are, printed by
 * `tableLines`, each run's status and what waits on you among its columns — with the pause first (`GET /api/pause`, `pausedLines`), and
 * after the table how old what it shows of where the result branches stand is, where the server says so (`Daemon.branchesLine`), a
 * line per schedule of each factory (`GET /api/namespaces/<factory>/schedules`, `scheduleLines`) and the daemon's line last, the
 * server's own (`GET /api/daemon`). Any other words go to the old path: `nemia ls <run>` among them, on this machine's daemon; under a
 * remote context a run named is refused, exit 2, naming `nemia show <run>` (`oneRunAway`): the old path forwarded would call `GET
 * /api/runs/:name` and print the Run it answers with the printer of its in-process listing, which no endpoint serves.
 */
import { Effect } from 'effect';
import { READ_BOUND_MS, tableLines } from 'objects';
import { chosenOf } from '../context.ts';
import { handedOn } from '../local.ts';
import { asked, everyPage, type ObjectsClient, pageOf } from '../objects.ts';
import { Refused } from '../refused.ts';
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
 * `nemia ls <run>` under the remote context `context`: refused, exit 2, naming `nemia show <run>`, which reads one run of that daemon, and
 * the same words on this machine's daemon (`NEMIA_CONTEXT=local`).
 */
const oneRunAway = (run: string, context: string): Refused =>
  new Refused(
    `nemia ls ${run}: the daemon of the context ${context} serves no listing of one run's steps yet. Read the run there with \`nemia show ${run}\`, or list it on this machine's daemon with \`NEMIA_CONTEXT=local nemia ls ${run}\``,
  );

export async function ls(args: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const read = tableAsked(args);
  const chosen = chosenOf(env);
  const run = read?.rest.find((word) => !word.startsWith('-'));
  if (chosen.kind === 'remote' && run !== undefined) throw oneRunAway(run, chosen.name);
  if (read === null || read.rest.length) return handedOn(['ls', ...args], env);
  const { selector } = read;
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

/**
 * `nemia ls [-l <selector>]... [--show-labels] [-L <key>]... [-o wide]`, read from the api: the runs, those a selector takes (sent as
 * `labelSelector`, given again for another), as the server prints them — the runs list asked for its `Table` (`TABLE_ACCEPT`), printed by
 * `tableLines`. Any other words go to the old path: `nemia ls <run>`, a run's steps and what each waits on, which no server table prints
 * yet, among them.
 */
import { spawned } from '../local.ts';
import { asked, READ_BOUND_MS } from '../objects.ts';
import { AS_TABLE, tableAsked, tableLines, tableOf } from './table.ts';

export async function ls(args: readonly string[]): Promise<number> {
  const read = tableAsked(args);
  if (read === null || read.rest.length) return spawned(['ls', ...args]);
  const { selector } = read;
  const listed = await asked(
    'ls',
    (client) => client.runs.listAll({ query: selector.length ? { labelSelector: selector } : {} }),
    process.env,
    READ_BOUND_MS,
    AS_TABLE,
  );
  const lines = tableLines(tableOf('ls', listed), read.asked);
  const none = selector.length
    ? `no run matches -l ${selector.join(' -l ')} — see them all with nemia ls --show-labels`
    : 'no run yet — start one with nemia start';
  for (const line of lines.length ? lines : [none]) process.stdout.write(`${line}\n`);
  return 0;
}

/**
 * `nemia show <run> [--raw]`, read from the api: the run object (`GET /api/runs/:runId`), read through the objects' client as `nemia/v1`'s
 * `Run` and printed as JSON as that Schema encodes it, with the line on stderr that points to `--raw`; with `--raw`, the record as the api
 * answers it on `?raw=true`. Any other words go to the old path, whose refusals and help are the table's own.
 */
import { Schema } from 'effect';
import { Run } from 'objects';
import type { RawRecord } from '../../../api/src/client/client.ts';
import { get } from '../client.ts';
import { asked } from '../objects.ts';
import { spawned } from '../local.ts';

/** The run's id and whether `--raw` was typed, or none for words the old path is to read. */
const parsed = (args: readonly string[]): { runId: string; raw: boolean } | undefined => {
  const raw = args.filter((a) => a === '--raw').length;
  const rest = args.filter((a) => a !== '--raw');
  const [runId] = rest;
  return raw <= 1 && rest.length === 1 && runId !== undefined && runId !== '' && !runId.startsWith('-')
    ? { runId, raw: raw === 1 }
    : undefined;
};

export async function show(args: readonly string[]): Promise<number> {
  const typed = parsed(args);
  if (typed === undefined) return spawned(['show', ...args]);
  const { runId, raw } = typed;
  const answer = raw
    ? await get<RawRecord>('show', `/api/runs/${encodeURIComponent(runId)}`, { raw: 'true' })
    : Schema.encodeSync(Run)(await asked('show', (client) => client.runs.show({ params: { runId } })));
  process.stdout.write(`${JSON.stringify(answer, null, 2)}\n`);
  if (!raw) process.stderr.write(`nemia show prints the run as one object; \`nemia show --raw ${runId}\` prints its record.\n`);
  return 0;
}

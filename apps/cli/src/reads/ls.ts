/**
 * `nemia ls [<run>]`, read from the api (`GET /api/listing`, `GET /api/listing/:runId`): every run or the one named, with the pause first
 * and the daemon last, printed as the in-process command prints it (`ls-lines.ts`). Any other words go to the old path.
 */
import type { RunsListed } from '../../../api/src/client/client.ts';
import { get } from '../client.ts';
import { spawned } from '../local.ts';
import { lsLines, pausedLines } from './ls-lines.ts';

export async function ls(args: readonly string[]): Promise<number> {
  const [runId, ...more] = args;
  if (more.length || (runId !== undefined && (runId === '' || runId.startsWith('-')))) return spawned(['ls', ...args]);
  const listed = await get<RunsListed>('ls', runId === undefined ? '/api/listing' : `/api/listing/${encodeURIComponent(runId)}`);
  for (const line of [...(listed.paused ? pausedLines(listed.paused) : []), ...lsLines(listed, Date.now())])
    process.stdout.write(`${line}\n`);
  return 0;
}

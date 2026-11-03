/**
 * `nemia ls [<run>] [-l <selector>]... [--show-labels] [-L <key>]...`, read from the api (`GET /api/listing`, `GET /api/listing/:runId`):
 * every run or the one named, of those a selector takes (`?selector=`, given again for another), with the pause first and the daemon
 * last, printed as the in-process command prints it (`ls-lines.ts`), each run's head line ending on its labels' segments where asked
 * (`labelSegments`). Any other words go to the old path.
 */
import type { RunsListed } from '../../../api/src/client/client.ts';
import { get } from '../client.ts';
import { spawned } from '../local.ts';
import { labelSegments, labelsAsked } from './labels.ts';
import { lsLines, pausedLines, runLabelMap } from './ls-lines.ts';

export async function ls(args: readonly string[]): Promise<number> {
  const read = labelsAsked(args);
  if (read === null) return spawned(['ls', ...args]);
  const [runId, ...more] = read.rest;
  if (more.length || (runId !== undefined && (runId === '' || runId.startsWith('-')))) return spawned(['ls', ...args]);
  const { asked } = read;
  const listed = await get<RunsListed>('ls', runId === undefined ? '/api/listing' : `/api/listing/${encodeURIComponent(runId)}`, {
    selector: asked.selector,
  });
  const lines = lsLines(listed, Date.now(), (run) => labelSegments(runLabelMap(run), asked));
  for (const line of [...(listed.paused ? pausedLines(listed.paused) : []), ...lines]) process.stdout.write(`${line}\n`);
  return 0;
}

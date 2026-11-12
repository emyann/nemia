/**
 * `nemia show <run> [--raw]`, its words parsed against `objects`' `SHOW_WORDS`, read from the api through the objects' client: the run
 * object (`GET /api/runs/:name`), `nemia/v1`'s `Run` printed as JSON as that Schema encodes it, with the line on stderr that points to
 * `--raw`; with `--raw`, its record (`GET /api/runs/:name/record`, `RunRecord`).
 */
import { Schema } from 'effect';
import { type Args, Run } from 'objects';
import { asked } from '../objects.ts';
import { switchArg, textArg } from '../commands/requests.ts';

/** Prints the run `args` names, as one object or, with `--raw`, its record; answers 0. */
export async function show(args: Args): Promise<number> {
  const runId = textArg(args, 'runId') ?? '';
  const raw = switchArg(args, 'raw');
  const answer = raw
    ? await asked('show', (client) => client.runs.record({ params: { name: runId } }))
    : Schema.encodeSync(Run)(await asked('show', (client) => client.runs.show({ params: { name: runId } })));
  process.stdout.write(`${JSON.stringify(answer, null, 2)}\n`);
  if (!raw) process.stderr.write(`nemia show prints the run as one object; \`nemia show --raw ${runId}\` prints its record.\n`);
  return 0;
}

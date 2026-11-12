/**
 * `nemia daemon [--json]`, a read of the client's own: where the daemon of the store the context in use names stands, asked of its api
 * (`GET /api/daemon`), started on demand under this machine's context as any read is (`asked`). It prints the lease's line, or, with
 * `--json`, its state, its holder's kind, its pid and the url it serves at, as one JSON line. Its help is the old path's, which keeps
 * `daemon` as the starter this client spawns (`src/daemon.ts`).
 */
import type { Daemon } from 'objects';
import { asked } from '../objects.ts';
import { Refused } from '../refused.ts';

/** The verb, as a person types it. */
export const DAEMON_VERB = 'daemon';

/** What `nemia daemon` prints of the api's answer: its line, or, `json`, its state, holder, pid and url as one JSON line. */
export const daemonLines = (answer: Daemon, json: boolean): readonly string[] =>
  json ? [JSON.stringify({ state: answer.kind, by: answer.by, pid: answer.pid, url: answer.url })] : [answer.line];

/** `nemia daemon` on the words after its name: `--json` alone, anything else refused, exit 2, naming its usage. */
export async function daemon(args: readonly string[]): Promise<number> {
  const stray = args.find((arg) => arg !== '--json');
  if (stray !== undefined) throw new Refused(`nemia daemon does not take ${stray}: nemia daemon [--json].`);
  const answer = await asked(DAEMON_VERB, (client) => client.server.daemon());
  for (const line of daemonLines(answer, args.includes('--json'))) process.stdout.write(`${line}\n`);
  return 0;
}

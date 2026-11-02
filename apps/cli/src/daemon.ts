/**
 * A daemon started on demand (the intent's Q14), for a read that finds none serving its store: the in-process `nemia daemon`, which
 * starts the store's daemon as any ticking command does (`ensureDaemon`), then the lease read again. Refused where none comes up.
 */
import { Refused } from './refused.ts';
import { servedAt } from './where.ts';

/** The url of a daemon started for the read `verb` names, or refused, naming the command that reads in process and the install. */
export async function daemonStarted(verb: string, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const at = servedAt(env);
  if (at !== undefined) return at;
  throw new Refused(
    `no daemon serves this store. Read it in process, \`nemia ${verb} … --local\`, or install the service that serves it: \`nemia service install\``,
  );
}

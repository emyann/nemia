/**
 * A daemon started on demand (the intent's Q14), for a read that finds none serving its store, or none answering at the url its lease
 * names: the in-process `nemia daemon --json` (`local.ts`), which starts the store's daemon as any ticking command does (`ensureDaemon`)
 * and answers the lease as it then stands, its url said only while the daemon ticks — so a url left by a daemon that died is never
 * answered — asked once more where none came of it. Refused, exit 2, where none comes up or the start is off (`NEMIA_DAEMON_START=off`),
 * naming the command that reads in process and the one that installs the service.
 */
import { captured } from './local.ts';
import { Refused } from './refused.ts';

/** The setting that turns the start off, as the orchestrator reads it. */
export const START_OFF = 'NEMIA_DAEMON_START';

/** The url a `nemia daemon --json` answered on its last line, where it names one: a daemon that ticks and listens. */
const urlIn = (stdout: string): string | undefined => {
  try {
    const answer: unknown = JSON.parse(stdout.trim().split('\n').at(-1) ?? '');
    if (typeof answer !== 'object' || answer === null || !('url' in answer)) return undefined;
    return typeof answer.url === 'string' && answer.url !== '' ? answer.url : undefined;
  } catch {
    return undefined;
  }
};

/** Why none serves the store, and what to type: the read in process, the install, and the setting where it is why. */
const unserved = (verb: string, off: boolean): Refused =>
  new Refused(
    `nemia ${verb}: no daemon serves this store` +
      (off ? `, and ${START_OFF}=off here, so none is started on demand. ` : ', and none came up when one was started. ') +
      `Read it in process, typed again with --local: \`nemia ${verb} --local …\`; or install the service that serves it: \`nemia service install\`` +
      (off ? `; or unset ${START_OFF} to have one started.` : '; what the start said is in daemon.log, in the store.'),
  );

/**
 * The url of a daemon started for the read `verb` names: `nemia daemon --json` run in process and its answer's url, run once more where it
 * answered none (a daemon that took the store but did not listen in time). Refused where neither answers one, or the start is off.
 */
export async function daemonStarted(verb: string, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  if (env[START_OFF] === 'off') throw unserved(verb, true);
  for (let tries = 0; tries < 2; tries++) {
    const { code, stdout } = await captured(['daemon', '--json'], env);
    const url = code === 0 ? urlIn(stdout) : undefined;
    if (url !== undefined) return url;
  }
  throw unserved(verb, false);
}

/**
 * The runner of `nemia assign`: a run put in someone's hand (the Run's `assign`), or given back (`--off`, its `unassign`). It asks its
 * endpoint in the run's namespace (`namespaceOfRun`) and prints what the api answers.
 */
import os from 'node:os';
import { ASSIGN_WORDS, type Args, type RunAssigned } from 'objects';
import { asked } from '../../objects.ts';
import { namespaceOfRun, said, switchArg, textArg } from '../requests.ts';
import { runOf } from './act.ts';

/** Who this client runs as, by the name the system gives the user — or undefined, for a user it has no entry for. */
const osUser = () => {
  try {
    return os.userInfo().username || undefined;
  } catch {
    return undefined;
  }
};

/** How long an ask may wait on an assignee, in words: whole hours, else whole minutes, else seconds. */
const forWords = (ms: number) =>
  ms % 3_600_000 === 0 ? `${ms / 3_600_000}h` : ms % 60_000 === 0 ? `${ms / 60_000}m` : `${Math.round(ms / 1000)}s`;

/** What `nemia assign` prints of an assignee put or given back. */
export const assignLines = ({ id, ended, assignee }: RunAssigned) => {
  const who = assignee.name ?? 'someone';
  return [
    ended
      ? `${id}  given back — what it asks waits on you again`
      : `${id}  assigned to ${who}${assignee.why ? ` (why: ${assignee.why})` : ''} — what it asks is theirs to answer, and back to you once an ask waits ${forWords(assignee.forMs)} on them; nemia assign ${id} --off gives it back`,
  ];
};

/**
 * `nemia assign <runId> [--to <name>] [--why] [--for <d>]`, or `--off`: the run put in someone's hand (`runs.assign`), by default this
 * client's OS user, or given back (`runs.unassign`).
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function assign(args: Args) {
  const name = runOf(args);
  const namespace = await namespaceOfRun(ASSIGN_WORDS.name, name);
  const to = textArg(args, 'to') ?? osUser();
  const why = textArg(args, 'why');
  const time = textArg(args, 'for');
  const payload = {
    ...(to !== undefined ? { to } : {}),
    ...(why !== undefined ? { why } : {}),
    ...(time !== undefined ? { for: time } : {}),
  };
  const done = await asked(ASSIGN_WORDS.name, (c) =>
    switchArg(args, 'off') ? c.runs.unassign({ params: { namespace, name } }) : c.runs.assign({ params: { namespace, name }, payload }),
  );
  said(assignLines(done));
  return 0;
}

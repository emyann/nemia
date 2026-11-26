/**
 * Who has a run in hand (`nemia assign`): what of the run refuses an assignee (`assignStop`), whether one that was put still stands, ran
 * out or ended with its run (`assigneeStanding`), and their words — the refusal a person reads (`assignRefusal`) and the line `nemia ls`
 * prints under the run (`assigneeWord`). Pure: the verb (`assignee.verb.ts`), the tick and the run's judgement read the record and the
 * clock, and ask these.
 */
import type {
  AssignPut,
  AssignStop,
  AssignStopOf,
  AssigneeClock,
  AssigneeStanding,
  AssigneeStandingOf,
} from '../../contracts/assignee.contract.ts';
import { type Actor, actorWords } from 'objects';

export type { AssignPut, AssignStop, AssigneeClock, AssigneeStanding };

/** How long an ask may wait on an assignee when no `--for` was given: an hour. */
export const DEFAULT_FOR_MS = 3_600_000;

/**
 * What of the run refuses an assignee, the first that is so in the order a refusal says it: cancelled, pruned, over, or already in
 * someone's hand; null where nothing does, whether or not the run asks anything yet.
 * @param p What of the run an assignee is judged from.
 */
export const assignStop: AssignStopOf = (p) => {
  if (p.cancelled) return 'cancelled';
  if (p.pruned) return 'pruned';
  if (!p.inPlay) return 'over';
  if (p.assigned) return 'assigned';
  return null;
};

/**
 * Where an assignee stands now: `ended` once its run is over; standing untimed while the run asks nothing of a person; else timed from the
 * later of when the ask began and when the run was assigned, standing until its time is out and `lapsed` at that instant after.
 * @param c The assignment, the run's present ask and whether it is in play, and the instant judged at, each in epoch milliseconds.
 */
export const assigneeStanding: AssigneeStandingOf = (c) => {
  if (!c.inPlay) return { kind: 'ended' };
  if (c.asksSince === null) return { kind: 'stands', comesBackAt: null };
  const due = (c.at > c.asksSince ? c.at : c.asksSince) + c.forMs;
  return c.now < due ? { kind: 'stands', comesBackAt: due } : { kind: 'lapsed', at: due };
};

/** Who has the run, as a refusal or a line says it: their name, else the caller the api resolved (`actorWords`), else someone. */
const whoOf = (a: Who) => a.name ?? (a.actor ? actorWords(a.actor) : 'someone');

/** Who has a run in hand, as a refusal or a line names them: the name given, and the caller who put it. */
type Who = { name?: string; actor?: Actor };

/**
 * Why `id` takes no assignee, naming what to do instead, for a stop `assignStop` said.
 * @param id The run's id.
 * @param stop What of the run refuses it.
 * @param standing Who has it in hand already, read off the record, for the `assigned` stop.
 */
export const assignRefusal = (id: string, stop: AssignStop, standing?: Who) => {
  switch (stop) {
    case 'cancelled':
      return `${id} was cancelled, so nothing of it will be asked of anyone: nemia ls ${id}.`;
    case 'pruned':
      return `${id} was pruned, so nothing of it will be asked of anyone: nemia ls ${id}.`;
    case 'over':
      return `${id} is over, so nothing of it will be asked again: nemia ls ${id}.`;
    case 'assigned':
      return `${whoOf(standing ?? {})} already has ${id} in hand: they give it back with nemia assign ${id} --off, then assign it again.`;
  }
};

/**
 * What `nemia ls` prints under a run for its assignee: who has it, why where they said, and when it comes back to the person if its ask
 * is not answered, or that nothing is timed while it asks nothing.
 * @param a Who has the run, and why.
 * @param comesBackAt When it comes back, an ISO 8601 time; null while nothing is timed.
 */
export const assigneeWord = (a: Who & { why?: string }, comesBackAt: string | null) =>
  `${whoOf(a)} has it in hand${a.why ? ` (${a.why})` : ''} — ${
    comesBackAt === null ? 'not timed while it asks nothing' : `back to you at ${comesBackAt} if unanswered`
  }`;

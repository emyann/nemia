/**
 * A machine's needs, judged: what one check's run says of its need (`needStateOf`), the needs that hold a run before its first session
 * (`needsHolding`), whether a need's fix may be started (`fixRefusal`), and the needs of a run's workflow and of its place as one list
 * (`needsOfRun`). Pure: the sweep runs the checks (`needs.verb.ts`), the pass hands `assess` their reading, and the fixes are filed on the
 * runtime (`fix.verb.ts`). Typed by `contracts/needs.contract.ts`, which proves the first three.
 */
import type { Need, NeedFix } from 'objects';
import type { FixOrigin, FixRefusal, FixRefusalOf, NeedRan, NeedRead, NeedsHolding, NeedStateOf } from '../../contracts/needs.contract.ts';

export type { FixOrigin, FixRefusal, NeedRan, NeedRead };

/** What one check's run says of its need: exit 0 met, any other exit missing, and no answer in its time or no shell `unknown`. */
export const needStateOf: NeedStateOf = (ran) => {
  if (ran.kind !== 'exited') return 'unknown';
  return ran.code === 0 ? 'met' : 'missing';
};

/**
 * The names of the needs that hold a run now: every need read `missing` of a run that has filed nothing (`filedAny` false), in the order
 * read (a name twice where two needs share it), and none of a run that has filed a task, so a need that lapses mid-run never stops work
 * in flight.
 */
export const needsHolding: NeedsHolding = (filedAny, needs) =>
  filedAny ? [] : needs.filter((need) => need.state === 'missing').map((need) => need.name);

/** Whether a fix declared at `origin` may be started: a place's always, a workflow's only where its factory's places are trusted. */
export const fixRefusal: FixRefusalOf = (origin) => (origin.kind === 'place' || origin.trusted ? 'allowed' : 'untrusted');

/**
 * The needs of a run, one list: its workflow's own (`workflow`), then each of its place's (`place`) that no workflow need of that name
 * already holds. A workflow need that `fills` a place need adds no need of its own: its fixes go first among the place need's, the
 * place's own kept after them, and its check stands beside the place's for nothing — the place's check says whether the need is met.
 * A `fills` naming no need of the place is a need of the workflow as it stands. Pure.
 */
export function needsOfRun(workflow: readonly Need[], place: readonly Need[]): Need[] {
  const fillers = new Map<string, NeedFix[]>();
  const own: Need[] = [];
  for (const need of workflow) {
    if (need.fills !== undefined && place.some((p) => p.name === need.fills)) {
      fillers.set(need.fills, [...(fillers.get(need.fills) ?? []), ...(need.fixes ?? [])]);
      continue;
    }
    own.push(need);
  }
  const placed = place
    .filter((p) => !own.some((n) => n.name === p.name))
    .map((p): Need => {
      const filled = fillers.get(p.name) ?? [];
      return filled.length ? { ...p, fixes: [...filled, ...(p.fixes ?? [])] } : p;
    });
  return [...own, ...placed];
}

/** The command a person types to start the first fix of a need, `nemia readiness fix <need>` with the workflow it is declared by. */
export const fixCommandOf = (need: string, workflow?: { factory: string; workflow: string }): string =>
  `nemia readiness fix ${need}${workflow === undefined ? '' : ` --factory ${workflow.factory} --workflow ${workflow.workflow}`}`;

/** What a run waits on for one need: its name, what it is, and what puts it in place, the command to type or the words of its need. */
export type NeedWaited = { readonly name: string; readonly message: string; readonly fix: string };

/**
 * A need as the pass hands it to `assess` (`AssessRead.needs`): its reading (`NeedRead`), what it is, and what puts it in place
 * (`NeedWaited.fix`), so the run's listing says it beside its phase.
 */
export type NeedHeld = NeedRead & Omit<NeedWaited, 'name'>;

/**
 * What a run waits on, from the needs `needsHolding` names among `needs`: each with its words, in the order named. None where nothing
 * holds the run.
 */
export function needsWaited(filedAny: boolean, needs: readonly NeedHeld[]): NeedWaited[] {
  return [...new Set(needsHolding(filedAny, needs))].flatMap((name) => {
    const need = needs.find((n) => n.name === name);
    return need === undefined ? [] : [{ name, message: need.message, fix: need.fix }];
  });
}

/** `waiting on <need>: <fix>` for each need a run waits on, joined: the words its listing says beside its phase. */
export const waitingOnNeedsWord = (waited: readonly NeedWaited[]): string => waited.map((w) => `waiting on ${w.name}: ${w.fix}`).join('; ');

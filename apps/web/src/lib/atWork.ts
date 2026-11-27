/**
 * The steps at work by an agent in the runs not finished (`stepsAtWorkOf`), which the Overview's strip counts and an agent's page lists,
 * and what an agent's page says it is doing (`activityOf`, proved by `contracts/agent-activity.contract.ts`). Pure.
 */
import type { Activity, ActivityOf, AtWorkRow } from '../../contracts/agent-activity.contract.ts';
import { agentOf, sinceOf, type RunView } from './api/judged.ts';
import { titleOf } from './factory.ts';
import { longestFirst } from './longestFirst.ts';
import { stepState } from './status.ts';

export type { Activity, AtWorkRow };

/**
 * Whether a step of `run` is at work: a session working or the run's check of it, as the board draws its state (`stepState`).
 * @param run The run the step is of.
 * @param step The step.
 */
export const working = (run: RunView, step: RunView['steps'][number]) => {
  const state = stepState(step, false, run.holding != null);
  return state === 'working' || state === 'checking';
};

/**
 * The steps of `open` at work by an agent, longest first.
 * @param open The runs not finished, each as the board reads it.
 * @param now The instant, in epoch ms.
 */
export const stepsAtWorkOf = (open: readonly RunView[], now: number) =>
  open
    .flatMap((run) =>
      run.steps.flatMap((step) => {
        const agent = agentOf(step);
        const since = sinceOf(step);
        if (agent === null || since === null || !working(run, step)) return [];
        return [
          {
            agent,
            run: run.id,
            title: titleOf(run),
            workflow: run.labels.workflow ?? '',
            step: step.name,
            try: step.current?.try ?? 1,
            round: step.current?.round ?? 1,
            minutes: Math.max(0, Math.floor((now - Date.parse(since)) / 60_000)),
          } satisfies AtWorkRow,
        ];
      }),
    )
    .sort((a, b) => b.minutes - a.minutes || a.run.localeCompare(b.run) || a.step.localeCompare(b.step));

/**
 * What an agent is doing now: nothing, one session, or several, from the steps at work.
 * @param rows The steps at work.
 * @param agent The agent's name; only the steps given to it count.
 */
export const activityOf: ActivityOf = (rows, agent) => {
  const mine = rows.filter((row) => row.agent === agent);
  const first = mine.at(0);
  if (first === undefined) return { kind: 'none' };
  if (mine.length === 1) return { kind: 'one', row: first };
  return { kind: 'many', rows: longestFirst(mine) };
};

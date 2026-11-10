/**
 * A person's route for a condition's try (`nemia route`): the file it is asked in (`routeAsk`), the routes read off a run's asks
 * (`personRoutes`), laid on its record as it is read (`withRoutes`) and taken off before it is written back (`unrouted`). Pure.
 */
import type { Run, StepRecord } from '../record/record.ts';

/** A person's route for a condition's try, as `runRecord` reads it from its file (`routeAsk`): the route named, and when. */
export type PersonRoute = { step: string; try: number; route: string; at: string };

/** The name of a person's route file in a run's asks folder, `route-<step>-<n>`, beside its approvals: what `nemia route` writes. */
export const routeAsk = (step: string, n: number): string => `route-${step}-${n}`;

/**
 * The routes people named for a run's conditions (`routeAsk`), from the names in its asks folder `dir` and a reader of a file there: a file
 * that names no route, or no time it was given, routes nothing. Never consumed: read on every pass, as an approval is. Pure.
 */
export function personRoutes(
  dir: string,
  names: readonly string[] | undefined,
  read: (file: string) => { read: unknown } | { unreadable: string },
): PersonRoute[] {
  return (names ?? []).flatMap((name): PersonRoute[] => {
    const [, step, n] = /^route-(.+)-(\d+)$/.exec(name) ?? [];
    if (step === undefined || n === undefined) return [];
    const held = read(`${dir}/${name}`);
    const said = 'read' in held && typeof held.read === 'object' && held.read !== null ? (held.read as Record<string, unknown>) : {};
    const { route, at } = said;
    if (typeof route !== 'string' || !route.trim() || typeof at !== 'string' || Number.isNaN(Date.parse(at))) return [];
    return [{ step, try: Number(n), route: route.trim(), at }];
  });
}

/** The run with each person's route laid on its condition's record, for the try the condition is on: it wins over any other answer. */
export const withRoutes = <R extends Pick<Run, 'steps'>>(run: R, routes: readonly PersonRoute[]): R => {
  const steps = { ...run.steps };
  for (const r of routes) {
    const record = steps[r.step];
    if (record && r.try === (record.tries?.length ?? 0) + 1)
      steps[r.step] = { ...record, route: { route: r.route, try: r.try, by: 'person' } };
  }
  return { ...run, steps };
};

/** A record without a person's route on any step, which is their file's and never the record's: what a rewrite writes. Pure. */
export const unrouted = <R extends Pick<Run, 'steps'>>(run: R): R => ({
  ...run,
  steps: Object.fromEntries(
    Object.entries(run.steps).map(([name, record]): [string, StepRecord] => {
      if (record.route?.by !== 'person') return [name, record];
      const { route: _, ...rest } = record;
      return [name, rest];
    }),
  ),
});

/**
 * What the measure wraps around the reads it times (`report.ts`): the engine a pass on the copy is given (`passEngine`), and the count
 * of the run records a read opened (`recordsReadBy`).
 */
import fs from 'node:fs';
import { Effect } from 'effect';
import type { Fence } from './fence.ts';

/** The run records (`runs/<id>.json`) read through `fs.readFileSync` while `read` ran, and what it answered. */
export async function recordsReadBy<T>(read: () => Promise<T>): Promise<{ value: T; records: number }> {
  const original = fs.readFileSync;
  let records = 0;
  fs.readFileSync = ((file: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
    if (typeof file === 'string' && /[/\\]runs[/\\][^/\\]+\.json$/.test(file)) records++;
    return (original as (...a: unknown[]) => unknown)(file, ...rest);
  }) as typeof fs.readFileSync;
  try {
    return { value: await read(), records };
  } finally {
    fs.readFileSync = original;
  }
}

/**
 * The engine's verbs a pass on the copy may call: its reads, the three writes that only append to the copy's journals, and the sessions'
 * drain, which each pass sets from the pause and which writes or removes the copy's own drain file alone.
 */
const PASS_VERBS = new Set([
  'view',
  'list',
  'path',
  'logs',
  'output',
  'transcript',
  'feed',
  'kept',
  'io',
  'tallied',
  'file',
  'admit',
  'stop',
  'drainSessions',
]);

/**
 * `e` for a pass on the copy: its `tick`, the runtime's own pass, answers a report that saw nothing, so nothing is admitted, started,
 * observed or stopped by it; and every verb but `PASS_VERBS` is refused, kept among the fence's refusals, since one may reach a live
 * session (`answer`, `say`, `close`) or run the runtime (`up`).
 */
export function passEngine<E extends Record<string, unknown>>(e: E, fence: Fence): E {
  const wrapped: Record<string, unknown> = { ...e };
  for (const [verb, value] of Object.entries(e)) {
    if (typeof value !== 'function' || PASS_VERBS.has(verb)) continue;
    wrapped[verb] = () => Effect.die(fence.refuse('engine', verb));
  }
  wrapped.tick = () => Effect.succeed({ views: [], refused: [], unreadable: [], unobserved: [], running: {}, ms: 0, observed: {} });
  return wrapped as E;
}

/**
 * How an event about one attempt is written into that attempt's fold (`foldInto`), for `fold` in `domain.ts`: pure, as the fold
 * is. Its end is `domain.ts`'s own (`endAttempt`).
 */
import type { Attempt, Event } from './domain.ts';
import { holdInto } from './deadline.ts';

/** An event about one attempt, `e`, written into that attempt's fold `a`: every one but its end (`endAttempt`, `domain.ts`). */
export function foldInto(
  a: Attempt,
  e: Extract<Event, { kind: 'spawned' | 'measured' | 'counted' | 'denied' | 'image' | 'gap' | 'process' | 'held' | 'released' }>,
): void {
  switch (e.kind) {
    case 'spawned':
      a.spawnedAt = e.at;
      if (e.mono) a.spawnedMono = e.mono;
      a.error = e.error;
      return;
    case 'measured':
      a.usage = { ...a.usage, ...e.usage };
      return;
    case 'counted':
      a.usage = e.usage;
      return;
    case 'denied':
      a.denials = [...(a.denials ?? []), e.what === undefined ? { tool: e.tool } : { tool: e.tool, what: e.what }];
      return;
    case 'image':
      if (e.image !== undefined) a.image = e.image;
      if (e.harnessVersion !== undefined) a.harnessVersion = e.harnessVersion;
      return;
    case 'gap':
      if (a.gapSince === undefined && e.mono) a.gapMono = e.mono;
      a.gapSince ??= e.at;
      return;
    case 'process':
      delete a.gapSince;
      delete a.gapMono;
      if (e.pid !== undefined) a.processes = [...(a.processes ?? []), e.pid];
      return;
    case 'held':
    case 'released':
      holdInto(a, e);
  }
}

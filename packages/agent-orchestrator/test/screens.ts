/**
 * `nemia decide`'s whole screen, line by line, as a pin compares it: each value a test cannot know before it runs (a run id, a scratch
 * path, a branch) put back as the placeholder it is given under, the longest value first, so `wf/<id>` is read before `<id>`. Every other
 * character is the screen's own. `main` is imported on the first call, once the test file has set `WF_ROOT`.
 */
import type { TestContext } from 'node:test';
import type { Engine } from '../src/runtime-client.ts';
import type { Place } from '../src/place/place.store.ts';

/**
 * What `nemia decide <argv>` prints, split on line breaks, with each value of `as` replaced by its key: `{ '<id>': run.id }`. A value that
 * is empty is refused, as it would match between every two characters. `main` is handed `place`, and takes its own where given none.
 */
export async function decideScreen(
  t: TestContext,
  e: Engine,
  argv: string[],
  as: Record<string, string>,
  place?: Place,
): Promise<string[]> {
  const { main } = await import('../src/cli/main.ts');
  const out: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    out.push(args.map(String).join(' '));
  });
  try {
    await main(['decide', ...argv], e, undefined, place);
  } finally {
    log.mock.restore();
  }
  const pairs = Object.entries(as).sort(([, a], [, b]) => b.length - a.length);
  for (const [placeholder, value] of pairs)
    if (!value) throw new Error(`${placeholder} stands for an empty value: give it the value it is`);
  const pinned = pairs.reduce((text, [placeholder, value]) => text.split(value).join(placeholder), out.join('\n')).split('\n');
  return pinned;
}

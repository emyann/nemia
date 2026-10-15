import path from 'node:path';
import type { Locator } from 'playwright';
import { frameTabsOf, photograph, sidebar, themeOf, railPlace, litOf } from '../board.ts';
import { expectApart, expectCount, expectInside, expectTexts, expectUncut, expectVisible, Refused } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The graph the api serves for the task's lifecycle, as much of it as the page is held to. */
type Served = {
  initial: string;
  states: string[];
  final: string[];
  edges: { from: string; to: string }[];
  verbs: { verb: string; from: string[]; to: string; guard: string }[];
};

/** The routes only a person's verb takes, by `from->to`: each pair a verb joins that no edge joins. */
const dashedOf = ({ edges, verbs }: Served): string[] => {
  const joined = new Set(edges.map((e) => `${e.from}->${e.to}`));
  return [...new Set(verbs.flatMap((v) => v.from.map((from) => `${from}->${v.to}`)))].filter((id) => !joined.has(id));
};

/** The ids of the routes matched whose line is drawn dashed, as the page's stylesheet computes it. */
const dashedLines = (frame: Locator): Promise<string[]> =>
  frame.locator('.react-flow__edge').evaluateAll((edges) =>
    edges.flatMap((edge) => {
      const line = edge.querySelector('path.react-flow__edge-path');
      return line && getComputedStyle(line).strokeDasharray !== 'none' ? [edge.getAttribute('data-id') ?? '?'] : [];
    }),
  );

/** Every box matched holds what it draws: nothing inside spills past the room the layout gave it, across or down. */
async function expectHeld(boxes: Locator, assertion: string): Promise<void> {
  const spilled = await boxes.evaluateAll((all) =>
    all.flatMap((box) =>
      box.scrollWidth > box.clientWidth + 1 || box.scrollHeight > box.clientHeight + 1
        ? [
            `${box.getAttribute('data-state') ?? box.getAttribute('data-route')} (${box.scrollWidth}×${box.scrollHeight} in ${box.clientWidth}×${box.clientHeight})`,
          ]
        : [],
    ),
  );
  if (!(await boxes.count())) throw new Refused(`${assertion} — nothing to look at: 0 found`);
  if (spilled.length) throw new Refused(`${assertion} — ${spilled.join(', ')} spill out`);
}

/** No two boxes matched meet: each pair is apart across or down. Fewer than two matched is refused: it proves nothing. */
async function expectNoneMeet(boxes: Locator, assertion: string): Promise<void> {
  const met = await boxes.evaluateAll((all) => {
    const named = all.map((box) => ({
      name: box.getAttribute('data-state') ?? box.getAttribute('data-route'),
      r: box.getBoundingClientRect(),
    }));
    return named.flatMap((a, i) =>
      named
        .slice(i + 1)
        .filter(({ r }) => a.r.left < r.right && r.left < a.r.right && a.r.top < r.bottom && r.top < a.r.bottom)
        .map((b) => `${a.name} and ${b.name}`),
    );
  });
  if ((await boxes.count()) < 2) throw new Refused(`${assertion} — fewer than two boxes to compare`);
  if (met.length) throw new Refused(`${assertion} — ${met.join(', ')} overlap`);
}

/**
 * No route's line runs behind the label of another: each drawn path, walked every two pixels, stays out of every label but its own. A
 * route and a label are matched by their id (`data-id` on React Flow's edge, `data-route` on the label). No label or no path is refused.
 */
async function expectClearOfLabels(frame: Locator, assertion: string): Promise<void> {
  const { labels, paths, crossed } = await frame.evaluate((root) => {
    const boxes = Array.from((root as Element).querySelectorAll('[data-route]')).map((label) => ({
      id: label.getAttribute('data-route'),
      r: label.getBoundingClientRect(),
    }));
    const edges = Array.from((root as Element).querySelectorAll('.react-flow__edge'));
    const found = edges.flatMap((edge) => {
      const id = edge.getAttribute('data-id');
      const line = edge.querySelector('path.react-flow__edge-path') as SVGPathElement | null;
      const ctm = line?.getScreenCTM();
      if (!line || !ctm) return [`${id} is not drawn`];
      const behind = new Set<string>();
      for (let at = 0; at <= line.getTotalLength(); at += 2) {
        const on = line.getPointAtLength(at);
        const p = new DOMPoint(on.x, on.y).matrixTransform(ctm);
        for (const { id: label, r } of boxes) {
          if (label !== id && p.x > r.left + 1 && p.x < r.right - 1 && p.y > r.top + 1 && p.y < r.bottom - 1)
            behind.add(`${id} behind ${label}'s label`);
        }
      }
      return [...behind];
    });
    return { labels: boxes.length, paths: edges.length, crossed: found };
  });
  if (!labels || !paths) throw new Refused(`${assertion} — nothing to look at: ${labels} labels and ${paths} paths found`);
  if (crossed.length) throw new Refused(`${assertion} — ${crossed.join(', ')}`);
}

export default {
  /**
   * The Machines page, a tab of Settings: the task's lifecycle drawn from the graph the api reads off the runtime's code,
   * every state a box and every edge a line of a route's label or of its state's box, every verb a person takes a line on each route it
   * takes, a route only a verb takes dashed, the first state and the final ones marked, and nothing drawn over anything else or cut short
   * at 1280 wide.
   */
  name: 'machines',
  route: '/machines',
  expect: async (page) => {
    await sidebar(page);
    await expectVisible(railPlace(page, 'Settings').and(litOf(page)), 'the rail lights Settings on its page');
    await expectTexts(frameTabsOf(page).locator('[aria-selected="true"]'), ['Machines'], "the strip's Machines tab is selected");
    const served = (await (await page.request.get(new URL('/api/machines/lifecycle', page.url()).href)).json()) as Served;
    const section = page.locator('section[aria-label="A task\'s lifecycle"]');
    await expectVisible(
      section.locator('h2', { hasText: 'packages/agent-runtime/src/core/lifecycle.ts' }),
      'the lifecycle, said drawn from its code',
    );
    const frame = section.locator('[data-machine="lifecycle"]');
    const states = frame.locator('[data-state]');
    await expectCount(states, served.states.length, `a box for each of the lifecycle's ${served.states.length} states`);
    await expectCount(frame.locator('[data-edge-line]'), served.edges.length, `a line for each of its ${served.edges.length} edges`);
    const verbLines = served.verbs.reduce((n, v) => n + v.from.length, 0);
    await expectCount(
      frame.locator('[data-verb]'),
      verbLines,
      `a line for each of its verbs, on each of the ${verbLines} routes they take`,
    );
    const dashed = dashedOf(served);
    if (dashed.length !== 7) throw new Refused(`the lifecycle has 7 routes only a person's verb takes — the api serves ${dashed.length}`);
    const drawn = (await dashedLines(frame)).sort();
    if (drawn.join() !== [...dashed].sort().join())
      throw new Refused(`the routes only a person's verb takes are drawn dashed, ${dashed.join(', ')} — dashed are ${drawn.join(', ')}`);
    await expectCount(frame.locator('[data-route][data-dashed]'), dashed.length, 'their labels say so, and only theirs');
    const close = frame.locator('[data-route="input-required->ending"][data-dashed]');
    await expectTexts(
      close.locator('[data-verb]'),
      ['close [awaitsWord]'],
      "a person's close, from input-required to ending, under its guard",
    );
    await expectVisible(close.getByText('close [awaitsWord]', { exact: true }), 'and it is read on the page');
    await expectVisible(frame.locator(`[data-state="${served.initial}"][data-initial]`), `${served.initial} marked as where a task starts`);
    await expectCount(frame.locator('[data-initial]'), 1, 'one state marked initial');
    await expectCount(frame.locator('[data-final]'), served.final.length, `the ${served.final.length} final states marked`);
    for (const name of served.final) await expectVisible(frame.locator(`[data-state="${name}"][data-final]`), `${name} marked final`);

    const labels = frame.locator('[data-route]');
    await expectApart(states, labels, 'no route label lies over a state');
    await expectNoneMeet(frame.locator('[data-state], [data-route]'), 'no two boxes, states or labels, lie over each other');
    await expectClearOfLabels(frame, "no route's line runs behind another route's label");
    await expectInside(states, frame, 'every state inside the drawing, none cut off at 1280 wide');
    await expectInside(labels, frame, 'every route label inside the drawing');
    await expectUncut(frame.locator('[data-edge-line]'), 'every event line read whole');
    await expectUncut(frame.locator('[data-verb]'), 'every verb line read whole');
    await expectHeld(states, 'each state holds its name and its lines');
    await expectHeld(labels, 'each label holds its lines');
    await photograph(frame, path.join(OUT, `machines-lifecycle-${await themeOf(page)}.png`));
  },
} satisfies PageSpec;

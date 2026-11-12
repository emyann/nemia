import fs from 'node:fs';
import path from 'node:path';
import type { Request } from 'playwright';
import { fed, sidebar } from '../board.ts';
import { expectNone, expectVisible, idle, Refused } from '../checks.ts';
import { attachedFiles, NEIGHBOUR, SAYING } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { store } from '../world.ts';

/** The run whose reads are counted, its step that moves, and the steps that do not. */
const RUN = NEIGHBOUR.id;
const MOVES = SAYING.step;
const STILL = NEIGHBOUR.steps.filter((step) => step !== MOVES);

export default {
  /**
   * What the run's page reads, and when: on its load the run object, its lines and every step's tries and told; on a feed event about one
   * step, the object again and, its stamp having moved, that step's tries and told — nothing of the steps that did not move — and the
   * lines never again. NEIGHBOUR's draft, whose session runs, is settled by hand as the runtime journals it, and said on the feed; the
   * page takes it back, draft's task journal, the engine's feed and its run file as seeded, and says draft runs again.
   */
  name: 'run-reads',
  route: `/runs/${RUN}`,
  expect: async (page) => {
    await sidebar(page);
    const taskId = `${RUN}-${MOVES}`;
    const journal = path.join(store!, 'engine', 'tasks', `${taskId}.jsonl`);
    const engineFeed = path.join(store!, 'engine', 'feed.jsonl');
    const feedBefore = fs.readFileSync(engineFeed, 'utf8');
    const seeded = fs.readFileSync(journal, 'utf8');
    const { run: runFile } = attachedFiles(store!, `ae/${taskId}/1`);
    const listed = fs.readFileSync(runFile, 'utf8');

    const asked: string[] = [];
    const heard = (request: Request) => {
      const url = new URL(request.url());
      if (request.method() === 'GET' && url.pathname.startsWith(`/api/runs/${RUN}`)) asked.push(url.pathname);
    };
    const object = `/api/runs/${RUN}`;
    const lines = `/api/runs/${RUN}/lines`;
    const sub = (step: string, what: 'tries' | 'told') => `/api/runs/${RUN}/steps/${step}/${what}`;
    page.on('request', heard);
    try {
      await page.reload({ waitUntil: 'load' });
      await sidebar(page);
      await expectVisible(page.locator(`section#step-${MOVES}`), `the run's page draws ${MOVES}'s section`);
      await idle(page);
      const loaded = [...asked];
      for (const read of [object, lines, ...NEIGHBOUR.steps.flatMap((step) => [sub(step, 'tries'), sub(step, 'told')])]) {
        if (!loaded.includes(read)) throw new Refused(`the page reads ${read} as it loads — it read ${loaded.join(', ')}`);
      }

      const from = asked.length;
      const end = new Date().toISOString();
      const ended = [
        {
          kind: 'ended',
          at: end,
          attempt: 1,
          sessionId: `ae/${taskId}/1`,
          nativeId: SAYING.sessionId,
          observed: 'done',
          reason: 'harness',
        },
        { kind: 'settled', at: end, outcome: 'succeeded' },
      ];
      fs.appendFileSync(journal, ended.map((event) => `${JSON.stringify(event)}\n`).join(''));
      fs.appendFileSync(engineFeed, ended.map((event) => `${JSON.stringify({ taskId, event })}\n`).join(''));
      fs.writeFileSync(runFile, JSON.stringify({ ...(JSON.parse(listed) as object), state: 'completed' }));
      fed(RUN, MOVES, 'succeeded');

      const moved = () => asked.slice(from);
      await expectNone(
        async () =>
          moved().includes(sub(MOVES, 'tries')) && moved().includes(sub(MOVES, 'told'))
            ? null
            : `after the feed's line the page read ${moved().join(', ') || 'nothing'}`,
        'a step that moved has its tries and told read again',
      );
      await idle(page);
      const after = moved();
      if (!after.includes(object)) throw new Refused(`the feed's line reads the run object again — the page read ${after.join(', ')}`);
      const others = after.filter((read) => STILL.some((step) => read === sub(step, 'tries') || read === sub(step, 'told')));
      if (others.length)
        throw new Refused(`a step that did not move is not read again — after ${MOVES} moved the page read ${others.join(', ')}`);
      const linesRead = asked.filter((read) => read === lines).length;
      if (linesRead !== 1) throw new Refused(`the run's lines are read once over the page's life — they were read ${linesRead} times`);
    } finally {
      page.off('request', heard);
      fs.writeFileSync(journal, seeded);
      fs.writeFileSync(engineFeed, feedBefore);
      fs.writeFileSync(runFile, listed);
      fed(RUN, MOVES, 'running');
    }
    await idle(page);
  },
} satisfies PageSpec;

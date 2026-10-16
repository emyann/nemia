import fs from 'node:fs';
import path from 'node:path';
import { photograph, sidebar, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, settled } from '../checks.ts';
import { lines, NEIGHBOUR } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/**
 * The run the page writes: one step, `implement`, at work in a `claude-detached` job — `claude -p` detached by the engine's worker,
 * whose session the runtime will not stream, since the spec keeps no stdout stream and says nothing of text being written
 * (`followOps` in the runtime's `harness/detached/detached.ts`), while its transcript is Claude Code's own and reads as it grows.
 */
const UNSTREAMED = {
  id: 'cannot-be-streamed-e2e55',
  step: 'implement',
  sessionId: '3d9a7f61-8c24-4b05-a1e7-6b0f2c84d539',
  prompt: 'Say how rivers end.',
  first: 'Rivers run to the sea.',
  next: 'And the sea to the sky.',
} as const;

const TASK = `${UNSTREAMED.id}-${UNSTREAMED.step}`;

/** A line of the session's transcript, as Claude Code writes one. */
const said = (type: 'user' | 'assistant', uuid: string, content: unknown) => ({
  sessionId: UNSTREAMED.sessionId,
  isSidechain: false,
  userType: 'external',
  cwd: '/code/hkb-v2',
  version: '2.1.292',
  gitBranch: 'main',
  type,
  uuid,
  timestamp: new Date().toISOString(),
  message: { id: type === 'assistant' ? `msg_${uuid}` : undefined, role: type, content },
});

/** Where the page writes, each taken back: the run's record, its task's journal, the job's files and the session's transcript. */
const files = () => {
  const job = path.join(store!, 'engine', 'runs', 'claude-detached', `ae_${TASK.replace(/[^a-zA-Z0-9]+/g, '_')}_1`);
  return {
    record: path.join(store!, 'runs', `${UNSTREAMED.id}.json`),
    journal: path.join(store!, 'engine', 'tasks', `${TASK}.jsonl`),
    feed: path.join(store!, 'engine', 'feed.jsonl'),
    run: `${job}.json`,
    log: `${job}.log`,
    transcript: path.join(store!, 'claude', 'projects', '-code-hkb-v2', `${UNSTREAMED.sessionId}.jsonl`),
  };
};

/** The job's run file, as its worker writes it at work: beaten now, so its lease holds while the page reads it. */
const beat = (f: ReturnType<typeof files>) =>
  fs.writeFileSync(
    f.run,
    JSON.stringify({
      name: `ae/${TASK}/1`,
      state: 'working',
      pid: process.pid,
      nativeId: UNSTREAMED.sessionId,
      logFile: f.log,
      heartbeatAt: new Date().toISOString(),
    }),
  );

/**
 * UNSTREAMED written as `nemia start` and the runtime leave a step at work in a `claude-detached` job: its record cloned from
 * NEIGHBOUR's, its task filed, started and spawned on the engine's journal and feed, the job's run file, and the transcript holding the
 * prompt and the first thing the session said.
 */
function written(f: ReturnType<typeof files>): void {
  const neighbour = JSON.parse(fs.readFileSync(path.join(store!, 'runs', `${NEIGHBOUR.id}.json`), 'utf8')) as Record<string, unknown>;
  const at = new Date().toISOString();
  const run = {
    ...neighbour,
    id: UNSTREAMED.id,
    brief: 'Cannot be streamed\n\nA run written by the unstreamed-session page: its step runs a job no live stream can be had of.',
    workflow: [{ name: UNSTREAMED.step, after: [], body: UNSTREAMED.prompt, harness: 'claude-detached' }],
    createdAt: at,
    steps: { [UNSTREAMED.step]: { taskId: TASK } },
  };
  fs.writeFileSync(f.record, JSON.stringify(run, null, 2));
  const events = [
    { kind: 'filed', at, brief: UNSTREAMED.prompt, cwd: '/code/hkb-v2', maxAttempts: 1, harness: 'claude-detached' },
    { kind: 'starting', at, attempt: 1 },
    { kind: 'spawned', at, attempt: 1 },
  ];
  fs.writeFileSync(f.journal, lines(events));
  fs.appendFileSync(f.feed, lines(events.map((event) => ({ taskId: TASK, event }))));
  fs.mkdirSync(path.dirname(f.run), { recursive: true });
  beat(f);
  fs.writeFileSync(f.log, '');
  fs.mkdirSync(path.dirname(f.transcript), { recursive: true });
  fs.writeFileSync(
    f.transcript,
    lines([
      said('user', 'e2e-unstreamed-user-1', UNSTREAMED.prompt),
      said('assistant', 'e2e-unstreamed-1', [{ type: 'text', text: UNSTREAMED.first }]),
    ]),
  );
}

/** What the session says next, written on its transcript, its run file beaten with it. */
const says = (f: ReturnType<typeof files>, uuid: string, text: string) => {
  beat(f);
  fs.appendFileSync(f.transcript, lines([said('assistant', uuid, [{ type: 'text', text }])]));
};

export default {
  /**
   * A step at work whose session no live stream can be had of. The page writes UNSTREAMED, a step in a `claude-detached` job, and opens
   * its session: the header draws the quiet band that says the api is reading it again on a beat, and no red sentence — the page used to
   * close its stream for good there and blank the conversation. What the session said is drawn all the same, and what it says next
   * arrives on the same stream a beat later. It leaves for the list before every file it writes is taken back and the engine's feed cut
   * back, so no session is drawn losing its run, and each page after it, in either theme, reads the store as seeded.
   */
  name: 'unstreamed-session',
  route: '/runs',
  follows: true,
  expect: async (page) => {
    await sidebar(page);
    const f = files();
    const feed = fs.readFileSync(f.feed, 'utf8');
    try {
      written(f);
      await page.goto(new URL(`/runs/${UNSTREAMED.id}/steps/${UNSTREAMED.step}`, page.url()).href, { waitUntil: 'load' });
      const top = page.locator('header[aria-label="The step"]');
      await expectVisible(top.locator('[data-band="retrying"]'), 'the header says the api is reading the session again, quietly');
      await expectCount(top.locator('.text-failure'), 0, 'and says nothing in the colour of a thing gone wrong');
      const talk = page.getByRole('region', { name: "The step's conversation" });
      await expectVisible(talk.getByText(UNSTREAMED.first, { exact: true }), 'what the session said is drawn, not blanked');
      await settled(page);
      await photograph(page, path.join(OUT, `unstreamed-session-${await themeOf(page)}.png`), { fullPage: true });

      says(f, 'e2e-unstreamed-2', UNSTREAMED.next);
      await expectVisible(
        talk.getByText(UNSTREAMED.next, { exact: true }),
        'and what it says next arrives on the same stream, a beat later',
      );
      await expectVisible(top.locator('[data-band="retrying"]'), 'the band stays while no live stream can be had');
    } finally {
      await page.goto(new URL('/runs', page.url()).href, { waitUntil: 'load' });
      await idle(page);
      for (const file of [f.record, f.journal, f.run, f.log, f.transcript]) fs.rmSync(file, { force: true });
      fs.writeFileSync(f.feed, feed);
    }
    await page.reload({ waitUntil: 'load' });
    await idle(page);
    await expectCount(page.locator(`a[href="/runs/${UNSTREAMED.id}"]`), 0, 'taken back: the run is gone from the list');
  },
} satisfies PageSpec;

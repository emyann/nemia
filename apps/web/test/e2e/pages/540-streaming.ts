import fs from 'node:fs';
import path from 'node:path';
import { photograph, sidebar, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled } from '../checks.ts';
import { lines, NEIGHBOUR } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The run the page writes: one step, `implement`, at work in a `claude -p` job whose words come in pieces. */
const STREAMING = {
  id: 'streams-its-words-e2e54',
  step: 'implement',
  sessionId: '7c1e5a2b-4d3f-4e8a-9b6c-2f0d1a3e5b47',
  prompt: 'Say how rivers end.',
  pieces: ['Rivers', ' run to', ' the sea.'],
} as const;

const TASK = `${STREAMING.id}-${STREAMING.step}`;
const WHOLE = STREAMING.pieces.join('');

/** A line of the job's stdout, as `claude -p --include-partial-messages` prints a stream event. */
const streamed = (event: object) => ({ type: 'stream_event', event, session_id: STREAMING.sessionId });

/** A line of the session's transcript, as Claude Code writes one, now. */
const said = (type: 'user' | 'assistant', uuid: string, content: unknown) => ({
  sessionId: STREAMING.sessionId,
  isSidechain: false,
  userType: 'external',
  cwd: '/code/hkb-v2',
  version: '2.1.292',
  gitBranch: 'main',
  type,
  uuid,
  timestamp: new Date().toISOString(),
  message: { id: type === 'assistant' ? 'msg_e2e_1' : undefined, role: type, content },
});

/** Where the page writes, each taken back: the run's record, its task's journal, the job's files and its transcript. */
const files = () => {
  const job = path.join(store!, 'engine', 'runs', 'claude', `ae_${TASK.replace(/[^a-zA-Z0-9]+/g, '_')}_1`);
  return {
    record: path.join(store!, 'runs', `${STREAMING.id}.json`),
    journal: path.join(store!, 'engine', 'tasks', `${TASK}.jsonl`),
    feed: path.join(store!, 'engine', 'feed.jsonl'),
    run: `${job}.json`,
    stdout: `${job}.stdout`,
    log: `${job}.log`,
    transcript: path.join(store!, 'claude', 'projects', '-code-hkb-v2', `${STREAMING.sessionId}.jsonl`),
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
      nativeId: STREAMING.sessionId,
      logFile: f.log,
      heartbeatAt: new Date().toISOString(),
    }),
  );

/**
 * STREAMING written as `nemia start` and the runtime leave a step at work in a job: its record cloned from NEIGHBOUR's, its task filed,
 * started and spawned on the engine's journal and feed, the job's run file, its stdout opened on a message, and the transcript holding
 * the prompt.
 */
function written(f: ReturnType<typeof files>): void {
  const neighbour = JSON.parse(fs.readFileSync(path.join(store!, 'runs', `${NEIGHBOUR.id}.json`), 'utf8')) as Record<string, unknown>;
  const at = new Date().toISOString();
  const run = {
    ...neighbour,
    id: STREAMING.id,
    brief: 'Streams its words\n\nA run written by the streaming page: its step says its message in pieces.',
    workflow: [{ name: STREAMING.step, after: [], body: STREAMING.prompt, harness: 'claude' }],
    createdAt: at,
    steps: { [STREAMING.step]: { taskId: TASK } },
  };
  fs.writeFileSync(f.record, JSON.stringify(run, null, 2));
  const events = [
    { kind: 'filed', at, brief: STREAMING.prompt, cwd: '/code/hkb-v2', maxAttempts: 1 },
    { kind: 'starting', at, attempt: 1 },
    { kind: 'spawned', at, attempt: 1 },
  ];
  fs.writeFileSync(f.journal, lines(events));
  fs.appendFileSync(f.feed, lines(events.map((event) => ({ taskId: TASK, event }))));
  fs.mkdirSync(path.dirname(f.run), { recursive: true });
  beat(f);
  fs.writeFileSync(f.log, '');
  fs.writeFileSync(
    f.stdout,
    lines([
      { type: 'system', subtype: 'init', session_id: STREAMING.sessionId },
      streamed({ type: 'message_start', message: { id: 'msg_e2e_1' } }),
      streamed({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
    ]),
  );
  fs.writeFileSync(f.transcript, lines([said('user', 'e2e-user-1', STREAMING.prompt)]));
}

/** The `n`th piece of the message written on the job's stdout, its run file beaten with it. */
const piece = (f: ReturnType<typeof files>, n: number) => {
  beat(f);
  fs.appendFileSync(
    f.stdout,
    lines([streamed({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: STREAMING.pieces[n] } })]),
  );
};

/**
 * The message written whole: on the stdout, its `assistant` line before its block's stop, as Claude Code prints them, and in the
 * transcript.
 */
const whole = (f: ReturnType<typeof files>) => {
  const message = said('assistant', 'e2e-assistant-1', [{ type: 'text', text: WHOLE }]);
  beat(f);
  fs.appendFileSync(f.transcript, lines([message]));
  fs.appendFileSync(f.stdout, lines([message, streamed({ type: 'content_block_stop', index: 0 })]));
};

export default {
  /**
   * A step whose session says its words in pieces is drawn as they come. The page writes STREAMING, a step at work in a `claude -p` job,
   * and opens its session: the header's `[data-following]` says the session is streamed (`data-streamed`). Each piece the job prints grows
   * the message being written, drawn last and marked `[data-session-partial]`; once the job prints the message whole, it takes the
   * partial's place, drawn once, and the talk is still at its latest, which it follows by what is drawn and not by its items. The
   * session's stream never finishes: the page waits on what it reads, never on the network. It leaves for the list before
   * every file it writes is taken back and the engine's feed cut back, so no session is drawn losing its run, and each page after it, in
   * either theme, reads the store as seeded.
   */
  name: 'streaming',
  route: '/runs',
  follows: true,
  expect: async (page) => {
    await sidebar(page);
    const f = files();
    const feed = fs.readFileSync(f.feed, 'utf8');
    try {
      written(f);
      await page.goto(new URL(`/runs/${STREAMING.id}/steps/${STREAMING.step}`, page.url()).href, { waitUntil: 'load' });
      const top = page.locator('header[aria-label="The step"]');
      await expectVisible(top.locator('[data-following][data-streamed]'), 'the session is followed live, and said streamed');
      const talk = page.getByRole('log', { name: "The step's conversation" });
      const partial = talk.locator('[data-session-partial]');
      await expectCount(partial, 0, 'nothing is being written before the first piece');

      piece(f, 0);
      await expectVisible(partial.getByText(STREAMING.pieces[0], { exact: true }), 'the first piece is drawn as the message being written');
      piece(f, 1);
      piece(f, 2);
      await expectVisible(partial.getByText(WHOLE, { exact: true }), 'the message being written grows with each piece, in order');
      await expectVisible(
        page.locator('[data-session-talk="latest"]'),
        'and the talk is still at its latest as the pieces land: what is drawn grows with the text, which the items alone do not',
      );
      await settled(page);
      await photograph(page, path.join(OUT, `streaming-partial-${await themeOf(page)}.png`), { fullPage: true });

      whole(f);
      await expectCount(partial, 0, 'the message being written is gone once the whole message is read');
      const message = talk.locator('[data-session-bubble="agent"]', { hasText: WHOLE });
      await expectCount(message, 1, 'and the whole message is drawn in its place, once');
      if ((await top.locator('[data-following][data-streamed]').count()) !== 1)
        throw new Refused('the session is still followed live after the message is read whole');
      await settled(page);
      await photograph(page, path.join(OUT, `streaming-whole-${await themeOf(page)}.png`), { fullPage: true });
    } finally {
      await page.goto(new URL('/runs', page.url()).href, { waitUntil: 'load' });
      await idle(page);
      for (const file of [f.record, f.journal, f.run, f.stdout, f.log, f.transcript]) fs.rmSync(file, { force: true });
      fs.writeFileSync(f.feed, feed);
    }
    await page.reload({ waitUntil: 'load' });
    await idle(page);
    await expectCount(page.locator(`a[href="/runs/${STREAMING.id}"]`), 0, 'taken back: the run is gone from the list');
  },
} satisfies PageSpec;

/**
 * POST /api/runs/:id/steps/:step/accept: a person's acceptance of a loop out of rounds, as it stands, from the board — through the
 * package's `acceptRun`, `nemia accept`'s own, which writes the acceptance and nothing else, and refused in the package's words. The api
 * judges none of it: every refusal here is asserted equal to what `acceptRun` itself says.
 *
 * At shipped defaults: the api's own engine over a store this file seeds, the harness's fake `claude` (test/harness.ts) first on PATH.
 */
import { root, stops } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Acceptance } from 'agent-orchestrator';
import type { RunDecision } from '../decide/decision.ts';
import type { RunDetail } from '../detail/detail.ts';
import { app } from '../app.ts';
import { acceptFile, acceptRun, engine, list, roundRun, runStore, runShipped as runWith } from 'agent-orchestrator';
import { acceptWordsRefusal } from 'agent-orchestrator/run';

const T0 = Date.parse('2026-09-22T09:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const jsonl = (lines: object[]) => lines.map((line) => `${JSON.stringify(line)}\n`).join('');
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** A step's task that ran once on Codex and signed off with `closeout`. */
const signedOff = (taskId: string, closeout: object) =>
  write(
    path.join(root, 'engine', 'tasks', `${taskId}.jsonl`),
    jsonl([
      { kind: 'filed', at: at(0), brief: 'Do it.', cwd: '/code/app', maxAttempts: 1, harness: 'codex' },
      { kind: 'starting', at: at(1), attempt: 1 },
      { kind: 'spawned', at: at(1), attempt: 1 },
      { kind: 'ended', at: at(9), attempt: 1, sessionId: `ae/${taskId}/1`, observed: 'done', reason: 'harness', closeout },
      { kind: 'settled', at: at(9), outcome: 'succeeded' },
    ]),
  );

const DONE = { outcome: 'done', summary: 'Done.', needs: null, artifacts: [] };
const AGAIN = { type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false };

/**
 * A run of `implement ⇄ review`, `rounds: 2`, on round `on` of its loop — the tries before it moved aside with `then: 'round'`, as the run
 * moves them when it files a round — whose review signed off saying `again`. On round 2 with `again: true`, the loop is out of rounds.
 * From round 2 its implement signs off with `replies`: a loop's target owes an answer to the findings it was handed (`owesReplies`), and
 * an empty list is no answer. Returns the record as written.
 */
const loopingRun = (id: string, on: number, again: boolean): string => {
  const tries = (name: string) => Array.from({ length: on - 1 }, (_, i) => ({ taskId: `${id}-${name}-${i + 1}`, then: 'round' }));
  const step = (name: string) => ({
    taskId: `${id}-${name}-${on}`,
    branch: `wf/${id}/implement`,
    ...(on > 1 ? { tries: tries(name) } : {}),
  });
  write(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo: '/code/app',
      workspace: '/code/app',
      baseRef: 'abc123',
      branch: 'main',
      isolate: true,
      brief: 'Parse the --flag option',
      workflowDir: path.join(root, 'no-such-workflow'),
      createdAt: at(0),
      workflow: [
        { name: 'implement', after: [], body: 'Implement it.', harness: 'codex' },
        {
          name: 'review',
          after: ['implement'],
          body: 'Review it.',
          harness: 'codex',
          loop: 'implement',
          rounds: 2,
          output: { file: 'review.json', schema: AGAIN },
        },
      ],
      steps: { implement: step('implement'), review: step('review') },
    }),
  );
  const replies = [{ finding: 'src/flag.ts — the flag is not stored', answer: 'fixed', why: 'It is stored now.' }];
  signedOff(`${id}-implement-${on}`, on > 1 ? { ...DONE, replies } : DONE);
  signedOff(`${id}-review-${on}`, { ...DONE, again });
  return fs.readFileSync(path.join(root, 'runs', `${id}.json`), 'utf8');
};

/** Out of rounds: round 2 of 2, and review asked for a third. */
const R = 'r-acc';
const record = loopingRun(R, 2, true);
/** Round 1 of 2, and review asked for another: the run files round 2 itself. */
const LEFT = 'r-acc-left';
loopingRun(LEFT, 1, true);
/** Round 2 of 2, and review said `again: false`: the loop handed on by itself. */
const ENDED = 'r-acc-done';
loopingRun(ENDED, 2, false);
/** The loop out of rounds, and the run called off. */
const CANCELLED = 'r-acc-cancelled';
loopingRun(CANCELLED, 2, true);
write(path.join(root, 'runs', `${CANCELLED}.cancelled`), at(20));

/** What the board sends, through vite's proxy: JSON, same-origin, and Host rewritten to the api's. */
const BOARD = {
  'content-type': 'application/json',
  'sec-fetch-site': 'same-origin',
  origin: 'http://localhost:5173',
  host: '127.0.0.1:8787',
};

const acceptOver = (step: string, body: unknown, headers: Record<string, string> = BOARD, run = R) =>
  app.request(`/api/runs/${run}/steps/${step}/accept`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

/** What the package's `acceptRun` refuses, word for word: what `nemia accept` prints. */
const acceptRefuses = async (step: string, message?: string, run = R): Promise<string> => {
  try {
    await runWith(engine(), acceptRun(run, step, message));
  } catch (err) {
    return (err as Error).message;
  }
  return assert.fail(`accept() accepted ${step} of ${run}, and should have refused`);
};

/** Every file under a run's asks directory. */
const asked = (run = R): string[] => {
  const dir = path.join(root, 'runs', `${run}.asks`);
  return fs.existsSync(dir) ? (fs.readdirSync(dir, { recursive: true }) as string[]).sort() : [];
};

/** Nothing was written: no acceptance nor ask, and the run's record as it was. */
const nothingWritten = (why: string, run = R) => {
  assert.deepEqual(asked(run), [], `no file beside the run: ${why}`);
  if (run === R) assert.equal(fs.readFileSync(path.join(root, 'runs', `${R}.json`), 'utf8'), record, `the run's record untouched: ${why}`);
};

const WHY = 'The findings are follow-up work.';

test('REFUSED at shipped defaults: an acceptance another site could make — a page on another site (403), a name that is not this machine (403), a body not sent as application/json (415) — and nothing is written', async () => {
  const body = { message: WHY };
  for (const site of ['cross-site', 'same-site', 'none']) {
    const res = await acceptOver('review', body, { ...BOARD, 'sec-fetch-site': site });
    assert.equal(res.status, 403, site);
    const { error } = (await res.json()) as { error: string };
    assert.ok(
      error.startsWith(
        `POST /api/runs/${R}/steps/review/accept refuses a request made by a page on another site (Sec-Fetch-Site: ${site}): the next tick files what waits on a loop a person accepts`,
      ),
      error,
    );
    assert.ok(error.endsWith(`Accept it from the run's page on the board, or with \`nemia accept ${R} review --message "<why>"\`.`), error);
  }
  for (const host of ['evil.example', 'evil.example:8787', 'localhost.evil.example:8787']) {
    const res = await acceptOver('review', body, { ...BOARD, host });
    assert.equal(res.status, 403, host);
    assert.ok(
      ((await res.json()) as { error: string }).error.startsWith(
        `POST /api/runs/${R}/steps/review/accept refuses a request addressed to ${host}: the api accepts the work of a loop out of rounds as it stands only for a request to this machine`,
      ),
    );
  }
  for (const type of ['text/plain;charset=UTF-8', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x']) {
    const res = await acceptOver('review', body, { ...BOARD, 'content-type': type });
    assert.equal(res.status, 415, type);
    const { error } = (await res.json()) as { error: string };
    assert.ok(error.startsWith(`POST /api/runs/${R}/steps/review/accept takes its body as \`content-type: application/json\``), error);
    assert.ok(error.endsWith('Send `{ "message": "<why>" }`, with that header.'), error);
  }
  nothingWritten('a request another site could make');
});

test("REFUSED: a body that is not an acceptance (400), a run or a step that does not exist (404), and words missing or empty (422, in `acceptWordsRefusal`'s words, which are `acceptRun`'s) — and nothing is written", async () => {
  const bodies: Array<[unknown, RegExp]> = [
    ['not json', /^POST …\/accept takes a JSON body/],
    [[WHY], /^POST …\/accept takes a JSON object/],
    [null, /^POST …\/accept takes a JSON object/],
    [{ message: 42 }, /^`message` is why the work is good enough with its findings open[\s\S]*This request's was 42/],
    [{ message: null }, /^`message` is why the work is good enough[\s\S]*This request's was null/],
  ];
  for (const [body, words] of bodies) {
    const res = await acceptOver('review', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match(((await res.json()) as { error: string }).error, words);
  }
  const noRun = await acceptOver('review', { message: WHY }, BOARD, 'r-nope');
  assert.equal(noRun.status, 404);
  assert.match(((await noRun.json()) as { error: string }).error, /^No run 'r-nope' in this store/);
  const noStep = await acceptOver('deploy', { message: WHY });
  assert.equal(noStep.status, 404);
  assert.match(((await noStep.json()) as { error: string }).error, new RegExp(`^Run '${R}' has no step 'deploy'`));

  for (const [body, words] of [
    [{}, /^--message says why the work is good enough with its findings open/],
    [{ message: '' }, /^--message is empty, and an acceptance's words are the whole reason the loop ended with findings open/],
    [{ message: ' \n ' }, /^--message is empty/],
  ] as const) {
    const res = await acceptOver('review', body);
    assert.equal(
      res.status,
      422,
      `words are required, as --message is: left out, empty, or nothing but whitespace, on a loop the package would otherwise accept: ${JSON.stringify(body)}`,
    );
    const { error } = (await res.json()) as { error: string };
    const message = (body as { message?: string }).message;
    assert.equal(error, acceptWordsRefusal(message, `nemia accept ${R} review`), "the package's own sentence");
    assert.equal(error, await acceptRefuses('review', message), 'and the one `acceptRun` refuses with');
    assert.match(error, words);
  }
  nothingWritten('a body that is not an acceptance');
});

test("REFUSED at shipped defaults: a round the run files itself, a loop that ended `again: false`, a step with no `loop:`, a run called off, and a round already asked for are 409s in `acceptAsk`'s words — and nothing is written", async () => {
  const cases: Array<[string, string, RegExp]> = [
    [
      LEFT,
      'review',
      /^review asked for another round, and `rounds: 2` has one left, so the next tick files round 2 itself: there is nothing for you to end yet\./,
    ],
    [
      ENDED,
      'review',
      /^review signed off without asking for another round \(`again: false`\), so its loop is over on its own word and there is nothing left open to accept\./,
    ],
    [
      R,
      'implement',
      /^implement has no `loop:`, so it closes no loop and there are no findings to accept — this run's loops close at review\./,
    ],
    [CANCELLED, 'review', new RegExp(`^${CANCELLED} was cancelled at ${at(20).replace(/\./g, '\\.')}, and a cancelled run files nothing`)],
  ];
  for (const [run, step, words] of cases) {
    const res = await acceptOver(step, { message: WHY }, BOARD, run);
    assert.equal(res.status, 409, `${run} ${step}`);
    const { error } = (await res.json()) as { error: string };
    assert.equal(error, await acceptRefuses(step, WHY, run));
    assert.match(error, words);
    nothingWritten(`${run} ${step}, which the package will not accept`, run);
  }

  const { file } = await runWith(engine(), roundRun(R, 'review'));
  try {
    const res = await acceptOver('review', { message: WHY });
    assert.equal(
      res.status,
      409,
      "a round asked for, which the next tick files, written by the package's own `roundRun` as `nemia round` writes it",
    );
    const { error } = (await res.json()) as { error: string };
    assert.equal(error, await acceptRefuses('review', WHY));
    assert.match(error, /^round 3 of review's loop is already asked for \(at [^)]+\), and the next tick files it/);
    assert.deepEqual(asked(), [path.basename(file)], 'the round ask alone');
  } finally {
    fs.rmSync(path.join(root, 'runs', `${R}.asks`), { recursive: true, force: true });
  }
  nothingWritten('a loop about to go round again');
});

test("an acceptance as the board sends it is the package's: 202 with the step, the try, when, the words and its file — the file as `nemia accept` writes it, the record untouched — and the detail reads it under the loop, which waits on nobody and is offered no more; a second acceptance refused", async () => {
  const res = await acceptOver('review', { message: WHY });
  assert.equal(res.status, 202, await res.clone().text());
  const took = (await res.json()) as Acceptance & { file: string };
  assert.deepEqual({ ...took, at: undefined }, { step: 'review', try: 2, at: undefined, message: WHY, file: acceptFile(R, 'review', 2) });
  assert.ok(!Number.isNaN(Date.parse(took.at)), took.at);
  assert.deepEqual(JSON.parse(fs.readFileSync(took.file, 'utf8')), { step: 'review', try: 2, at: took.at, message: WHY });
  assert.deepEqual(asked(), ['accept-review-2']);
  assert.equal(fs.readFileSync(path.join(root, 'runs', `${R}.json`), 'utf8'), record, "the api wrote nothing of the run's record");
  assert.equal(stops(), 0, 'and stopped nothing');

  const run = (await (await app.request(`/api/runs/${R}`)).json()) as RunDetail;
  const review = run.steps.find((s) => s.name === 'review')!;
  assert.deepEqual(review.accepted, { try: 2, at: took.at, message: WHY });
  const words = await runWith(engine(), list(engine(), runStore.runs.read(R)));
  const listed = words.steps.find((s) => s.name === 'review')!;
  assert.equal(review.status, listed.status, 'as `nemia ls` has it until the tick files what waits');
  assert.notEqual(review.status, 'exhausted', "the loop over on the person's word");
  assert.deepEqual(run.waitingOnYou, [], 'and nobody waited on');
  const decision = (await (await app.request(`/api/runs/${R}/decision`)).json()) as RunDecision;
  const commands = 'commands' in decision ? decision.commands : [];
  assert.ok(!commands.some((c) => c.label === 'accept'), `accept is offered no more: ${JSON.stringify(commands)}`);

  const again = await acceptOver('review', { message: 'Something else.' });
  assert.equal(again.status, 409);
  const { error } = (await again.json()) as { error: string };
  assert.ok(error.startsWith(`try 2 of review is already accepted, at ${took.at}: its loop is over on your word`), error);
  assert.equal(error, await acceptRefuses('review', 'Something else.'));
  assert.deepEqual(asked(), ['accept-review-2']);
});

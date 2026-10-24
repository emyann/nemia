/**
 * A loop's rounds on disk, told as a person's stories: implement ⇄ review going round three times until a person accepts the work as it
 * stands, and a loop held past a budget until a person raises it. Each story is one test on the stage (`story.ts`): the tick files each
 * round on the engine's stand-in, the steps are handed what the round before said, and `nemia retry --round` and `nemia approve` write a
 * person's own files beside the record. What `nemia retry --round` and `nemia approve` refuse at the terminal, before a run is read, is one
 * table, with a cancelled run's refusal beside it. What `assess`, `roundAsk`, `acceptAsk` and a round's brief decide is pure, in
 * `assess-rounds.test.ts` and `src/round/round.test.ts`; a merge's send-back is told in `ship.test.ts`. A pass that filed a round and died
 * before writing the run down, and a person's deleted acceptance, stay focused in `store.test.ts`.
 *
 * `WF_ROOT` is set before the runner is imported, which reads it as it loads, and `WF_DEFAULT_FACTORY_STARTS` beside it: its runs start
 * in repositories no factory holds.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { StepRecord } from '../src/run.ts';
import { scratch } from './scratch.ts';
import { staged, story } from './story.ts';
import { names, namesFor } from './assessed.ts';

const ROOT = scratch('wf-rounds-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
const { acceptRun, advanceRun, decideRun, list, retryRun, roundRun, sayRun, startRun, runWith } = await import('../src/runner.ts');
const { asksDir, markCancelled, readRun } = await import('../src/record/record.store.ts');
const { PRECEDENCE } = await import('../src/brief/index.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { main } = await import('../src/cli/main.ts');
const stage = staged({ runWith, main, engineOf });

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
/** A strict `findings` schema and `again`, as the tests' team's `test/fixtures/team/agents/review.schema.json` declares them. */
const LOOPING = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { file: { type: 'string' }, line: { type: ['integer', 'null'] }, what: { type: 'string' } },
        required: ['file', 'line', 'what'],
        additionalProperties: false,
      },
    },
    again: { type: 'boolean' },
  },
  required: ['findings', 'again'],
  additionalProperties: false,
};
const FOUND = [{ file: 'src/flag.ts', line: 12, what: 'the flag is read before it is parsed' }];
const REPLIES = [{ finding: 'src/flag.ts:12', answer: 'fixed', why: 'the flag is parsed before it is read' }];
const reviewSays = (again: boolean) => ({ ...SIGNED, summary: 'REVIEWER-SUMMARY', findings: FOUND, again });
const ANSWERED = { ...SIGNED, summary: 'IMPLEMENTER-SUMMARY', replies: REPLIES };
/** Why a person judged the loop's findings later work rather than this run's. */
const ENOUGH = 'the finding is a case no shipped team has: follow-up work, not this run.';
const CHECK_SAID = "## What implement's check said";

/** One pass of the tick over the run `id`, on the stage's engine. */
const tick = (id: string) => stage.runWith(stage.board().e, advanceRun(readRun(id)));
/** `program` over the stage's engine. */
const over = <A, E>(program: Parameters<typeof stage.runWith<A, E>>[1]) => stage.runWith(stage.board().e, program);
/** What the engine was filed with for the task `id`. */
const specOf = (id: string) => stage.board().tasks.get(id)!.spec;
/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, {});
  return repo;
};
/**
 * implement, checked → review, looping back to it with `rounds:` at its default unless `reviewKeys` say, then `after` steps waiting on
 * review, each a name and its frontmatter lines. Each key set ends with a newline.
 */
const looped = (reviewKeys = '', implementKeys = '', after: Record<string, string[]> = {}) => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), `---\nplace: git\ncheck: npm test\n${implementKeys}---\nimplement it\n`);
  fs.writeFileSync(
    path.join(dir, 'review.md'),
    `---\nafter: implement\nplace: git\noutput: review.schema.json\nloop: implement\n${reviewKeys}---\nreview it\n`,
  );
  fs.writeFileSync(path.join(dir, 'review.schema.json'), JSON.stringify(LOOPING, null, 2));
  for (const [name, lines] of Object.entries(after))
    fs.writeFileSync(path.join(dir, `${name}.md`), `---\n${['after: review', 'place: git', ...lines].join('\n')}\n---\n${name} it\n`);
  return dir;
};
/** A looped run started on a fresh repository, the steps working in its checkout, and its first pass ticked: implement filed. */
const startedLoop = async (dir: string): Promise<string> => {
  const run = await stage.runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: dir, isolate: false }));
  await tick(run.id);
  return run.id;
};
/** The task the record names for `step` now. */
const taskOf = (id: string, step: string): string => readRun(id).steps[step].taskId!;
/**
 * A round up to review's word: implement's try now signs off as `implementSaid`, its check is filed and passes having printed `printed`,
 * then review is filed and signs off saying `again`. The pass that reads that word is the caller's.
 */
const toReview = async (id: string, again: boolean, implementSaid: object = ANSWERED, printed = 'ok\n') => {
  const implement = taskOf(id, 'implement');
  stage.board().settle(implement, 'succeeded', implementSaid);
  assert.deepEqual((await tick(id)).checked, ['implement'], `${implement}'s check`);
  stage.board().settle(`${implement}-check`, 'succeeded', undefined, 0);
  stage.board().tasks.get(`${implement}-check`)!.printed = { stdout: printed };
  assert.deepEqual((await tick(id)).filed, ['review'], `review after ${implement}`);
  const review = taskOf(id, 'review');
  stage.board().settle(review, 'succeeded', reviewSays(again));
  return review;
};
const asksOf = (id: string, kind: string) =>
  fs.existsSync(asksDir(id)) ? fs.readdirSync(asksDir(id)).filter((f) => f.startsWith(`${kind}-`)) : [];
/** The JSON under a brief's `heading`. */
const dataUnder = (brief: string, heading: string) =>
  JSON.parse(new RegExp(`${heading}\\n[\\s\\S]*?\\n\`\`\`json\\n([\\s\\S]*?)\\n\`\`\``).exec(brief)![1]);
/** A step's record without the revisions every filing pins (`pinned`, `closeoutHash`), whose subject is `revisions.test.ts`. */
const filedAs = (record: StepRecord | undefined): Partial<StepRecord> => {
  const { pinned: _, closeoutHash: __, ...rest } = record ?? { taskId: null };
  return rest;
};
/** That `err` is a refusal of kind `tag` with exit 2, naming each of `facts`. */
const refusedAs =
  (tag: string, ...facts: string[]) =>
  (err: Error & { exitCode?: number; _tag?: string }): true => {
    assert.equal(err._tag, tag, err.message);
    assert.equal(err.exitCode, 2, err.message);
    names(err.message, ...facts);
    return true;
  };
/**
 * `nemia <argv>` typed on the stage, as a person types it: the lines it printed on stdout, and each line on stderr that names a former
 * spelling as the one to type now (`renamedIn`).
 */
const typedOn = async (t: TestContext, argv: string[]): Promise<{ out: string[]; hints: string[] }> => {
  const out: string[] = [];
  const err: string[] = [];
  const log = t.mock.method(console, 'log', (...a: unknown[]) => {
    out.push(a.join(' '));
  });
  const write = t.mock.method(process.stderr, 'write', (chunk: string | Uint8Array) => err.push(String(chunk)) > 0);
  try {
    await stage.main(argv);
  } finally {
    log.mock.restore();
    write.mock.restore();
  }
  return {
    out,
    hints: err
      .join('')
      .split('\n')
      .filter((l) => / is now /.test(l)),
  };
};
/** A wf pictures line a check printed, naming the picture `n`. */
const named = (n: string) => `wf pictures: named ${n}`;

test('three rounds, then a person accepts the work as it stands', async (t) => {
  const s = story(t);
  let id = '';
  await s.test(
    'round 1: implement is filed and told something while it works; `nemia retry --round` refuses a round still running',
    async () => {
      id = await startedLoop(looped('', '', { ship: ['gate: true'] }));
      stage.board().settle(`${id}-implement`, 'working');
      await over(sayRun(id, 'implement', 'Leave the parser alone.'));
      await assert.rejects(
        over(roundRun(id)),
        refusedAs('Conflict', "round 1 of review's loop is still running", `nemia ls ${id}`, `nemia cancel ${id}`),
      );
      assert.deepEqual(asksOf(id, 'round'), [], 'no ask written');
    },
  );
  await s.test(
    'review is handed what the check said, and asks again: `nemia retry --round` refuses a round the run files itself',
    async () => {
      await toReview(id, true, SIGNED, `${named('#1 run-dark.png')}\nok\n`);
      assert.ok(
        (dataUnder(specOf(`${id}-review`).brief, CHECK_SAID) as { reported: string[] }).reported.includes(named('#1 run-dark.png')),
      );
      await assert.rejects(
        over(roundRun(id)),
        refusedAs('Conflict', 'the run goes round again itself', '`rounds: 3` has 2 left', `nemia ls ${id}`),
      );
      assert.deepEqual(asksOf(id, 'round'), []);
    },
  );
  await s.test(
    'round 2: implement continued, handed what was said to it, then the findings and not the summary; owing replies',
    async () => {
      const pass = await tick(id);
      const try2 = `${id}-implement-try2`;
      assert.deepEqual([pass.looped, pass.filed, pass.tried, pass.status], [['review'], [], [], 'running']);
      namesFor(
        'the note',
        pass.notes.find((n) => n.startsWith('review: round 2')),
        'round 2',
        'rounds: 3',
        'implement goes again',
      );
      const spec = specOf(try2);
      const run = readRun(id);
      assert.deepEqual(
        { resumeFrom: spec.resumeFrom, cwd: spec.cwd },
        { resumeFrom: `native-${id}-implement`, cwd: run.workspace },
        "implement's own session, continued",
      );
      assert.match(spec.brief, /^## Round 2 of 3\n/);
      const said = spec.brief.indexOf('## Said to your session');
      assert.ok(said > 0 && said < spec.brief.indexOf('## From review'), 'what was said to it, before the findings');
      assert.ok(spec.brief.includes('```text\nLeave the parser alone.\n```'));
      assert.deepEqual(dataUnder(spec.brief, '## From review'), { findings: FOUND });
      assert.doesNotMatch(spec.brief, /REVIEWER-SUMMARY|"again"/);
      assert.deepEqual((spec.closeoutSchema as { required: string[] }).required, [
        'apiVersion',
        'outcome',
        'summary',
        'body',
        'artifacts',
        'needs',
        'replies',
      ]);
      const branch = run.steps.implement.branch;
      const implemented = [{ taskId: `${id}-implement`, check: { taskId: `${id}-implement-check` }, cause: 'round' }];
      const reviewed = [{ taskId: `${id}-review`, cause: 'round' }];
      assert.deepEqual(Object.fromEntries(Object.entries(run.steps).map(([name, record]) => [name, filedAs(record)])), {
        implement: { taskId: try2, workspace: run.workspace, branch, tries: implemented },
        review: { taskId: null, workspace: run.workspace, branch, tries: reviewed },
        ship: { taskId: null },
      });
      assert.deepEqual(
        (await over(list(stage.board().e, readRun(id)))).steps.slice(0, 2).map((x) => [x.name, x.note]),
        [
          ['implement', 'round 2 of 3'],
          ['review', 'round 2 of 3'],
        ],
      );
      await tick(id);
      assert.equal(stage.board().filings.filter((f) => f === try2).length, 1, 'filed once, however many passes');
    },
  );
  await s.test('UNSIGNED: try 2 signs off answering nothing, so it is not checked and review waits', async () => {
    stage.board().settle(`${id}-implement-try2`, 'succeeded', { ...SIGNED, summary: 'IMPLEMENTER-SUMMARY' });
    const pass = await tick(id);
    assert.deepEqual([pass.checked, pass.unreachable], [[], ['review']]);
    assert.match((await over(list(stage.board().e, readRun(id)))).steps[0].status, /^unsigned/);
  });
  await s.test(
    "a fresh try inside round 2 is a new session handed the round's findings, off review's try that asked, owing replies",
    async () => {
      await over(retryRun(id, 'implement', { mode: 'fresh' }));
      assert.deepEqual((await tick(id)).tried, ['implement']);
      const spec = specOf(`${id}-implement-try3`);
      assert.equal(spec.resumeFrom, undefined, 'a new session');
      assert.match(spec.brief, /\n## Try 3\n[\s\S]*\n## Round 2 of 3\n[\s\S]*\*\*Say why not\.\*\*/);
      assert.deepEqual(dataUnder(spec.brief, '## From review'), { findings: FOUND });
      assert.doesNotMatch(spec.brief, /REVIEWER-SUMMARY|IMPLEMENTER-SUMMARY/);
      assert.ok((spec.closeoutSchema as { required: string[] }).required.includes('replies'));
    },
  );
  await s.test("the reviewer of round 2 is a new session, handed the replies and its own round's check", async () => {
    await toReview(id, true, ANSWERED, `${named('#9 card-dark.png')}\nok\n`);
    const review2 = specOf(`${id}-review-try2`);
    assert.equal(review2.resumeFrom, undefined, 'the reviewer is a new session each round');
    assert.ok(review2.brief.startsWith(`${PRECEDENCE}\n\nreview it\n\n## What was asked for\n\nadd a flag`), review2.brief);
    assert.deepEqual(dataUnder(review2.brief, '## Replies from implement'), { replies: REPLIES });
    assert.doesNotMatch(review2.brief, /IMPLEMENTER-SUMMARY|REVIEWER-SUMMARY/);
    const reported = (dataUnder(review2.brief, CHECK_SAID) as { reported: string[] }).reported;
    assert.ok(reported.includes(named('#9 card-dark.png')), reported.join('\n'));
    assert.ok(!reported.some((l) => l.includes('#1 ')), 'round 2 reads its own check, not the first try’s');
  });
  await s.test('REFUSED at the cap, at shipped defaults: round 3 asks again, files nothing, reads exhausted and waits on you', async () => {
    assert.deepEqual((await tick(id)).looped, ['review'], 'round 3');
    await toReview(id, true);
    const filed = [...stage.board().filings];
    for (let i = 0; i < 3; i++) {
      const pass = await tick(id);
      assert.deepEqual([pass.looped, pass.filed, pass.tried, pass.checked, pass.status], [[], [], [], [], 'blocked'], `pass ${i + 1}`);
    }
    assert.deepEqual(stage.board().filings, filed, 'nothing filed at the cap: the ending is never filed');
    const l = await over(list(stage.board().e, readRun(id)));
    assert.deepEqual([l.steps[1].status, l.waitingOnYou], ['rounds exhausted', ['review']]);
    namesFor('the note', l.steps[1].note, 'round 3 of 3', `nemia retry ${id} review --round`);
    const { decision: d, offers, closeouts } = await over(decideRun(id));
    assert.deepEqual(d.kind === 'awaiting' && [d.outcome, d.exhausted, d.failed], ['blocked', ['review'], []]);
    assert.equal(offers.length, 2);
    namesFor('once more', offers[0], 'round 4', '`rounds: 3`', `nemia retry ${id} review --round`);
    namesFor('enough', offers[1], `nemia approve ${id} review --message "<why>"`);
    assert.deepEqual((closeouts.review as { output?: object }).output, { findings: FOUND, again: true }, 'the last findings');
  });
  await s.test('a round ask file the run cannot read is not honoured, and not touched: the pass says so, and files nothing', async () => {
    fs.mkdirSync(asksDir(id), { recursive: true });
    fs.writeFileSync(path.join(asksDir(id), 'round-review-4'), 'once more, please');
    fs.writeFileSync(path.join(asksDir(id), 'round-review-5'), '[]');
    const filed = stage.board().filings.length;
    const pass = await tick(id);
    assert.deepEqual(pass.looped, []);
    const noteOf = (file: string) => pass.notes.find((n) => n.includes(`${file}:`));
    namesFor('unreadable', noteOf('round-review-4'), 'unreadable', 'not honoured', 'nemia retry --round');
    namesFor('not an ask', noteOf('round-review-5'), 'not an ask nemia retry --round wrote', 'not honoured');
    assert.deepEqual(asksOf(id, 'round'), ['round-review-4', 'round-review-5']);
    assert.equal(stage.board().filings.length, filed);
    for (const f of asksOf(id, 'round')) fs.rmSync(path.join(asksDir(id), f));
  });
  let file = '';
  await s.test('`nemia retry --round` takes it once more, once: the ask written whole, and no record', async () => {
    const { out, hints } = await typedOn(t, ['retry', id, 'review', '--round']);
    file = path.join(asksDir(id), 'round-review-4');
    assert.deepEqual([out[1]?.trim(), hints], [file, []], 'the file `nemia round` wrote, and no hint: this is the spelling to type');
    names(out[0] ?? '', `${id}  asked: round 4 of review's loop`, 'the next tick files it, once');
    const ask = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepEqual([ask.step, ask.round, ask.budget, taskOf(id, 'implement')], ['review', 4, undefined, `${id}-implement-try4`]);
    assert.deepEqual(asksOf(id, 'round'), ['round-review-4'], "a person's once more is an ask, written whole");
    await assert.rejects(over(roundRun(id)), refusedAs('Conflict', "round 4 of review's loop is already asked for"));
    assert.match((await over(list(stage.board().e, readRun(id)))).steps[1].note ?? '', /^round 4 asked \(nemia retry --round\)/);
  });
  await s.test('the next pass files round 4, past the cap, and spends the ask; a round is refused while it runs', async () => {
    assert.deepEqual((await tick(id)).looped, ['review']);
    assert.match(specOf(`${id}-implement-try5`).brief, /^## Round 4, past rounds: 3\n/);
    assert.deepEqual(asksOf(id, 'round'), [], 'consumed');
    assert.ok(fs.existsSync(path.join(asksDir(id), 'done', 'round-review-4')), 'moved whole');
    await assert.rejects(over(roundRun(id)), refusedAs('Conflict', "round 4 of review's loop is still running"));
  });
  await s.test('an ask a pass filed and wrote down, then died before moving, is spent: it files nothing', async () => {
    fs.copyFileSync(path.join(asksDir(id), 'done', 'round-review-4'), file);
    const again = await tick(id);
    assert.deepEqual([again.looped, again.filed, asksOf(id, 'round')], [[], [], []]);
    assert.equal(stage.board().filings.filter((f) => f === `${id}-implement-try5`).length, 1);
  });
  await s.test('an acceptance file the run cannot read is not honoured, and not touched: the loop is still out of rounds', async () => {
    await toReview(id, true);
    assert.deepEqual((await tick(id)).filed, [], 'round 4 asks again, past its cap: nothing after the loop');
    const accept = path.join(asksDir(id), 'accept-review-4');
    const bad = [
      ['{ not json', 'unreadable'],
      ['[]', 'not an acceptance nemia approve wrote'],
      ['{"at":"now","message":"enough"}', 'no time it was given'],
      ['{"at":"2026-09-20T14:05:00.000Z"}', 'nothing of why the work is good enough'],
      ['{"at":"2026-09-20T14:05:00.000Z","message":"  "}', 'its message is empty'],
    ] as const;
    for (const [written, why] of bad) {
      fs.writeFileSync(accept, written);
      const pass = await tick(id);
      assert.deepEqual([pass.filed, pass.status], [[], 'blocked'], written);
      assert.ok(
        pass.notes.some((n) => n.includes(why)),
        `${written}: ${pass.notes.join(' | ')}`,
      );
      assert.equal(fs.readFileSync(accept, 'utf8'), written, 'not touched');
      assert.equal((await over(list(stage.board().e, readRun(id)))).steps[1].status, 'rounds exhausted');
    }
    fs.rmSync(accept);
  });
  let at = '';
  await s.test(
    "`nemia approve` of the loop out of rounds ends it on a person's word, refused without `--message`: the acceptance written whole, beside the asks, and no record; the former `nemia accept` still runs as it",
    async () => {
      const accepted = path.join(asksDir(id), 'accept-review-4');
      await assert.rejects(typedOn(t, ['approve', id, 'review']), refusedAs('Invalid', '--message'));
      assert.deepEqual(asksOf(id, 'accept'), [], 'refused without your words: nothing written');
      const { out, hints } = await typedOn(t, ['approve', id, 'review', '--message', ENOUGH]);
      assert.deepEqual([out[1]?.trim(), hints], [accepted, []], 'the file `nemia accept` wrote, and no hint');
      names(out[0] ?? '', `${id}  accepted: try 4 of review as it stands`);
      const acceptance = JSON.parse(fs.readFileSync(accepted, 'utf8'));
      at = acceptance.at;
      assert.deepEqual([acceptance.step, acceptance.try, acceptance.message], ['review', 4, ENOUGH], 'written whole');
      await assert.rejects(
        typedOn(t, ['accept', id, 'review', '--message', ENOUGH]),
        refusedAs('Conflict', 'try 4 of review is already accepted'),
        'the former spelling, typed on purpose: `nemia accept` still runs, as `nemia approve` of the loop, which has accepted try 4',
      );
      assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${id}.json`), 'utf8')).acceptances, undefined, 'no record');
      assert.deepEqual(readRun(id).acceptances, [acceptance], 'the tick composes it on read');
      await assert.rejects(over(acceptRun(id, undefined, ENOUGH)), refusedAs('Conflict', 'try 4 of review is already accepted'));
      await assert.rejects(
        over(roundRun(id)),
        refusedAs('Conflict', 'review asked for round 5', 'accept-review-4', `nemia retry ${id} review --round`),
      );
      const l = await over(list(stage.board().e, readRun(id)));
      assert.equal(l.steps[1].status, 'unverified · done');
      namesFor('the note', l.steps[1].note, `accepted as it stands at ${at}`, 'its findings open');
    },
  );
  await s.test('the next pass files the ending, handed the words and the findings open', async () => {
    const pass = await tick(id);
    assert.deepEqual([pass.filed, pass.looped, pass.tried, pass.status], [['ship'], [], [], 'running']);
    assert.deepEqual(asksOf(id, 'accept'), ['accept-review-4'], 'the acceptance stays where it was written, as an approval does');
    const brief = specOf(`${id}-ship`).brief;
    assert.match(brief, /\n## Accepted\n/);
    assert.match(brief, /\(`nemia approve`, try 4, at /);
    assert.ok(brief.includes(ENOUGH), 'the words they gave, for the shipper and whoever reads the merge');
    assert.deepEqual(dataUnder(brief, '## From review'), { findings: FOUND }, 'and the findings the loop ended with open');
    assert.doesNotMatch(brief, /REVIEWER-SUMMARY|"again"/);
    assert.deepEqual((await tick(id)).filed, [], 'filed once, however many passes');
  });
  await s.test('the gated ending goes to its gate as ever, offered no round, and approved the run succeeds', async () => {
    stage.board().settle(`${id}-ship`, 'succeeded', SIGNED);
    await tick(id);
    const held = await over(list(stage.board().e, readRun(id)));
    assert.deepEqual([held.steps[2].status, held.waitingOnYou], ['awaiting approval', ['ship']]);
    const { decision: d, offers, accepted } = await over(decideRun(id));
    assert.deepEqual(d.kind === 'awaiting' && [d.outcome, d.exhausted, d.awaitingApproval], ['blocked', [], ['ship']]);
    assert.deepEqual(offers, [], 'the loop is over');
    namesFor('accepted', accepted.review, `${at.slice(11, 16)}Z`, ENOUGH);
    const { out } = await typedOn(t, ['approve', id, 'ship', '--message', 'the findings are filed as follow-up']);
    assert.equal(out[1]?.trim(), path.join(asksDir(id), 'approve-ship-1'), 'the same verb, at a gate: the approval');
    assert.equal((await tick(id)).status, 'succeeded');
  });
});

test('a loop past its budget waits for a person to raise it, then goes round and ends', async (t) => {
  const s = story(t);
  let id = '';
  await s.test("REFUSED past a budget: review's `again: true` files no round while implement is over its budget", async () => {
    id = await startedLoop(looped('', 'budget: 3\n'));
    await toReview(id, true, SIGNED);
    stage.board().tasks.get(`${id}-implement`)!.attempt!.usage = { costUsd: 4.25 };
    const filed = [...stage.board().filings];
    for (let i = 0; i < 2; i++) {
      const pass = await tick(id);
      assert.deepEqual([pass.looped, pass.filed, pass.tried, pass.status], [[], [], [], 'blocked'], `pass ${i + 1}`);
    }
    assert.deepEqual(stage.board().filings, filed, 'no round');
    const l = await over(list(stage.board().e, readRun(id)));
    assert.deepEqual(
      [l.steps.map((x) => x.status), l.waitingOnYou],
      [
        ['over budget $4.25 of $3', 'over budget — implement $4.25 of $3'],
        ['implement', 'review'],
      ],
    );
  });
  await s.test('`nemia retry --round` is refused without `--budget`, and no ask written', async () => {
    await assert.rejects(
      over(roundRun(id)),
      refusedAs('Conflict', 'review asked for round 2', '$4.25 of its $3 budget', `nemia retry ${id} review --round --budget <amount>`),
    );
    assert.deepEqual(asksOf(id, 'round'), []);
  });
  await s.test(
    'with `--budget` the round is asked, typed in its former spelling `nemia round`, which still runs as `nemia retry --round` and says so: no step of the loop is held on its budget, and the run waits on nobody',
    async () => {
      const { hints } = await typedOn(t, ['round', id, '--budget', '10']);
      assert.equal(hints.length, 1, 'one hint line');
      names(hints[0], 'nemia round is now nemia retry --round', `nemia retry ${id} `);
      const ask = JSON.parse(fs.readFileSync(path.join(asksDir(id), 'round-review-2'), 'utf8'));
      assert.deepEqual([ask.step, ask.round, ask.budget], ['review', 2, 10], 'the ask `nemia retry --round --budget 10` writes');
      const asked = await over(list(stage.board().e, readRun(id)));
      assert.deepEqual([asked.steps.map((x) => x.status), asked.waitingOnYou], [['verified ✓', 'unverified · done'], []]);
      assert.deepEqual((await over(decideRun(id))).decision, { kind: 'running', waiting: ['review'] });
      const printed: string[] = [];
      const log = t.mock.method(console, 'log', (...args: unknown[]) => {
        printed.push(args.join(' '));
      });
      try {
        await stage.main(['ls', id]);
        await stage.main(['decide', id]);
      } finally {
        log.mock.restore();
      }
      const out = printed.join('\n');
      assert.doesNotMatch(out, /over budget|waiting on you|OVER BUDGET/i, out);
      assert.match(out, /still running: review\n {2}review: round 2 asked \(nemia retry --round --budget 10\)/);
      assert.match(out, /\n {2}nothing to decide yet/);
    },
  );
  await s.test("the next pass files the round, the raised cap on implement's record, handed what is left of it", async () => {
    const pass = await tick(id);
    assert.deepEqual(pass.looped, ['review']);
    namesFor(
      'the note',
      pass.notes.find((n) => n.startsWith('review: round 2')),
      'nemia retry --round --budget 10',
      'implement goes again',
    );
    assert.deepEqual(readRun(id).steps.implement?.tries, [
      { taskId: `${id}-implement`, check: { taskId: `${id}-implement-check` }, cause: 'round', budget: 10 },
    ]);
    assert.equal(specOf(`${id}-implement-try2`).config?.budgetUsd, 5.75, 'on claude, a job, what is left of the raised cap');
    assert.equal((await over(list(stage.board().e, readRun(id)))).steps[0].note, 'round 2 of 3, budget $10');
  });
  await s.test('`again: false` ends the loop: the run succeeded, and `nemia decide` prints the replies beside the findings', async () => {
    await toReview(id, false);
    const last = await tick(id);
    assert.deepEqual([last.looped, last.filed, last.status], [[], [], 'succeeded']);
    assert.deepEqual(stage.board().filings, [
      `${id}-implement`,
      `${id}-implement-check`,
      `${id}-review`,
      `${id}-implement-try2`,
      `${id}-implement-try2-check`,
      `${id}-review-try2`,
    ]);
    const { decision: d, closeouts } = await over(decideRun(id));
    assert.deepEqual(d.kind === 'awaiting' && [d.outcome, d.exhausted], ['succeeded', []]);
    assert.deepEqual((closeouts.implement as { output?: object }).output, { replies: REPLIES });
  });
});

test('REFUSED: `nemia retry --round` and `nemia approve`, and their former spellings `nemia round` and `nemia accept` typed on purpose, before anything is written', async (t) => {
  const refused = (argv: string[], tag: string, ...facts: string[]) =>
    t.test(`nemia ${argv.join(' ')}`, async () => {
      await assert.rejects(stage.main(argv), refusedAs(tag, ...facts));
    });
  await refused(['retry', 'no-such-run', 'review', 'again', '--round'], 'Invalid', 'does not take again', '--round');
  await refused(['retry', 'no-such-run', '--round', '--budget', 'lots'], 'Invalid', 'lots is not one', '--budget <amount>');
  await refused(
    ['approve', 'no-such-run', 'review', '--message', ' '],
    'Invalid',
    '--message is empty',
    'nemia approve no-such-run review',
  );
  await refused(['approve', 'no-such-run', 'review'], 'Missing', 'no such run: no-such-run');
  await refused(['round', 'no-such-run', 'review', 'again'], 'Invalid', 'does not take again', '--round');
  await refused(['accept', 'no-such-run', 'review', '--message', ' '], 'Invalid', '--message is empty', 'nemia approve no-such-run review');
  await t.test('a cancelled run: a round would never be honoured, and no ask is written', async () => {
    const id = await startedLoop(looped('rounds: 1\n'));
    markCancelled(id);
    await assert.rejects(over(roundRun(id)), refusedAs('Conflict', 'was cancelled at', 'never be honoured'));
    await assert.rejects(over(roundRun(id, 'review')), refusedAs('Conflict', 'was cancelled at'));
    assert.deepEqual(asksOf(id, 'round'), []);
  });
});

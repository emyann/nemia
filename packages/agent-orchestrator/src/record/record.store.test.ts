/**
 * What the store reads back, read against what the tick and the verbs write: a run record, a person's asks and markers. A record that does
 * not read as a run is refused by `readRun` with its fix and left out of `listRuns`; an ask a verb would not write is not honoured, and
 * says why in the verb's words; a marker that does not read still holds its run. Every shape a former `nemia` wrote reads as it did.
 * `WF_ROOT` is set before the import, since the module reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';

const ROOT = scratch('wf-record-read-');
process.env.WF_ROOT = ROOT;
const store = await import('./record.store.ts');
const {
  UnreadableRecord,
  acceptanceIn,
  approvalIn,
  askIn,
  listRuns,
  readRun,
  rewriteRun,
  roundAskIn,
  runFile,
  runsDir,
  pruneFile,
  holdFile,
} = store;

fs.mkdirSync(runsDir(), { recursive: true });

/** A repository run's record as the tick writes one today, frozen steps and all. */
const aRecord = (id: string): Record<string, unknown> => ({
  id,
  repo: '/repo',
  workspace: '/repo',
  baseRef: 'abc123',
  branch: 'main',
  isolate: true,
  brief: 'add a flag',
  workflowDir: '/repo/workflows/dev',
  workflow: [
    { name: 'implement', after: [], body: 'do it', harness: 'claude' },
    { name: 'review', after: ['implement'], body: 'read it', harness: 'claude' },
  ],
  steps: { implement: { taskId: `${id}-implement`, workspace: '/w/implement', branch: `wf/${id}/implement` }, review: { taskId: null } },
  createdAt: '2026-09-01T00:00:00.000Z',
});

const put = (id: string, record: unknown): void =>
  fs.writeFileSync(runFile(id), typeof record === 'string' ? record : JSON.stringify(record, null, 2));

/** What `readRun` is refused with, as its message — exit code 2, and an `UnreadableRecord`. */
const refusalOf = (id: string): string => {
  try {
    readRun(id);
  } catch (err) {
    assert.ok(err instanceof UnreadableRecord, `refused as unreadable, not ${String(err)}`);
    assert.equal(err.exitCode, 2);
    return err.message;
  }
  assert.fail(`run ${id} read`);
};

const FIX = 'Only the tick writes a record: if a person or another program edited it, put it back as the tick wrote it';

/** A frozen step with the agent it names, as the parser resolves one: what each refusal below breaks one field of. */
const withAgent = (id: string): Record<string, unknown> => {
  const record = aRecord(id);
  (record.workflow as Array<Record<string, unknown>>)[1] = {
    name: 'review',
    after: ['implement'],
    body: 'read it',
    harness: 'claude',
    tools: ['Read'],
    retries: 2,
    gate: true,
    workspace: 'base',
    output: {
      file: 'review.json',
      schema: { type: 'object', properties: { verdict: { type: 'string' } }, required: ['verdict'], additionalProperties: false },
    },
    agent: { name: 'reviewer', keys: ['gate'], body: 'You review.', given: { gate: 'true' }, skills: ['look'], harnessPrompt: 'keep' },
  };
  return record;
};

/** Each frozen step key the parser types, broken as a person's edit would break it: where it is, and what `readRun` says is there. */
const BROKEN: ReadonlyArray<[string, (step: Record<string, unknown>) => void, string]> = [
  ['retries', (step) => (step.retries = '2'), 'its `workflow.1.retries` is "2", where nemia writes number'],
  [
    'workspace',
    (step) => (step.workspace = 'shelf'),
    'its `workflow.1.workspace` is "shelf", where nemia writes "main" | "base" | "folder"',
  ],
  ['gate', (step) => (step.gate = 'yes'), 'its `workflow.1.gate` is "yes", where nemia writes true'],
  ['tools', (step) => (step.tools = 'Read'), 'its `workflow.1.tools` is "Read", where nemia writes array'],
  [
    'agent.keys',
    (step) => ((step.agent as { keys: string[] }).keys = ['gates']),
    'its `workflow.1.agent.keys.0` is "gates", where nemia writes "after" |',
  ],
  [
    'output.schema',
    (step) => ((step.output as { schema: Record<string, unknown> }).schema.additionalProperties = true),
    'its `workflow.1.output.schema.additionalProperties` is true, where nemia writes false',
  ],
];

/** A record with one try on `implement` whose cause is `cause`, or none. */
const withTry = (id: string, cause?: string): Record<string, unknown> => {
  const record = aRecord(id);
  (record.steps as Record<string, Record<string, unknown>>).implement.tries = [{ taskId: `${id}-implement`, ...(cause ? { cause } : {}) }];
  return record;
};

/** A record whose first frozen step is changed by `edit`. */
const firstStep = (id: string, edit: (step: Record<string, unknown>) => void): Record<string, unknown> => {
  const record = aRecord(id);
  edit((record.workflow as Array<Record<string, unknown>>)[0]);
  return record;
};

const { repo: _r, baseRef: _b, branch: _br, isolate: _i, ...folderRun } = aRecord('r-place');

/** Each record a person's edit or a torn write leaves, and the fragment `readRun`'s refusal says it at. */
const REFUSED: ReadonlyArray<[row: string, id: string, record: unknown, says: string]> = [
  ['no `id`', 'r-noid', (({ id: _, ...rest }) => rest)(aRecord('r-noid')), 'does not read as a run: its `id` is missing.'],
  [
    "a frozen step's `after` that is no list",
    'r-after',
    firstStep('r-after', (step) => (step.after = 'implement')),
    'its `workflow.0.after` is "implement", where nemia writes',
  ],
  ['a frozen step with no name', 'r-noname', firstStep('r-noname', (step) => delete step.name), 'its `workflow.0.name` is missing'],
  [
    'a step record with no task',
    'r-notask',
    { ...aRecord('r-notask'), steps: { implement: {}, review: { taskId: null } } },
    'its `steps.implement.taskId` is missing',
  ],
  [
    'a folder run with no place kind it knows',
    'r-place',
    { ...folderRun, id: 'r-place', place: { kind: 'shelf' } },
    'its `place.kind` is "shelf", where nemia writes "folder"',
  ],
  ['a `factory` that is no name', 'r-factory', { ...aRecord('r-factory'), factory: 42 }, 'its `factory` is 42'],
  ['a `placeSkill` that is no skill', 'r-misplaced', { ...aRecord('r-misplaced'), placeSkill: 'git' }, 'its `placeSkill` is "git"'],
  ['a try with no cause', 'r-nocause', withTry('r-nocause'), '`steps.implement.tries.0.cause`'],
  ['a try whose cause is no word nemia writes', 'r-later', withTry('r-later', 'later'), '`steps.implement.tries.0.cause`'],
  [
    'a list under its former name that is no list, checked as the key it is now',
    'r-disallow-text',
    firstStep('r-disallow-text', (step) => (step.disallow = 'SendMessage')),
    'its `workflow.0.disallow` is "SendMessage"',
  ],
  [
    'a frozen place outside its words',
    'r-cloud',
    firstStep('r-cloud', (step) => (step.place = 'cloud')),
    'its `workflow.0.place` is "cloud"',
  ],
  ['no JSON', 'r-half', '{"id": "r-half", "repo"', 'is not JSON ('],
  ['no object', 'r-list', '[]', 'is no run record: it holds no object'],
  ...BROKEN.map(([key, breaks, says]): [string, string, unknown, string] => {
    const id = `r-bad-${key.replace('.', '-')}`;
    const record = withAgent(id);
    breaks((record.workflow as Array<Record<string, unknown>>)[1]);
    return [`a frozen step's \`${key}\` of the wrong type`, id, record, says];
  }),
];

test("a record the tick did not write is refused by `readRun` at its field, exit 2, in nemia's words with the fix, and left out of `listRuns`", async (t) => {
  for (const [row, id, record, says] of REFUSED)
    await t.test(row, () => {
      put(id, record);
      const said = refusalOf(id);
      assert.ok(said.includes(says), said);
      assert.ok(said.startsWith(`run ${id}: its record, ${runFile(id)}, `), said);
      assert.ok(said.includes(FIX), said);
      if (typeof record !== 'string') assert.ok(!said.includes('Expected'), `in wf's words, not the parser's: ${said}`);
    });

  await t.test('a field that holds a huge value is said in bounded words: its first 60 characters as JSON, cut marked `…`', () => {
    put(
      'r-huge',
      firstStep('r-huge', (step) => (step.after = 'x'.repeat(100_000))),
    );
    const said = refusalOf('r-huge');
    assert.ok(said.includes(`its \`workflow.0.after\` is "${'x'.repeat(59)}…, where nemia writes`), said.slice(0, 300));
    assert.ok(said.length < 2_000, `${said.length} characters`);
    fs.rmSync(runFile('r-huge'));
  });

  await t.test('a run id with no record is told to try `nemia ls`, not called unreadable', () => {
    assert.throws(
      () => readRun('r-nobody'),
      (err: Error) => !(err instanceof UnreadableRecord) && err.message === "no such run: r-nobody  (try 'nemia ls')",
    );
  });

  await t.test('the step with every key right reads as it was frozen; a record with no `factory` is in the default one', () => {
    put('r-agent', withAgent('r-agent'));
    assert.deepEqual(readRun('r-agent').workflow![1], (withAgent('r-agent').workflow as unknown[])[1], 'read as it was frozen');
    put('r-nofactory', aRecord('r-nofactory'));
    assert.equal('factory' in readRun('r-nofactory'), false);
    put('r-other', { ...aRecord('r-other'), factory: 'acme' });
    assert.equal(readRun('r-other').factory, 'acme');
  });

  await t.test('`listRuns` leaves out each record refused above, says each with its fix, and lists every other run', () => {
    const said: string[] = [];
    const listed = listRuns((line) => said.push(line)).map((r) => r.id);
    assert.ok(
      ['r-agent', 'r-nofactory', 'r-other'].every((id) => listed.includes(id)),
      listed.join(', '),
    );
    for (const [, id] of REFUSED) {
      assert.ok(!listed.includes(id), `${id} left out`);
      assert.ok(
        said.some((l) => l.startsWith(`left out: run ${id}: its record, `) && l.includes(FIX)),
        `${id} said: ${said.join('\n')}`,
      );
      fs.rmSync(runFile(id));
    }
  });
});

test('`listRuns` lists the run `kept` answers for an id as given, its record never read; an id it does not answer is read as before', () => {
  put('r-kept', '{"id": "r-kept", "repo"');
  put('r-read', aRecord('r-read'));
  const stand = { ...readRun('r-read'), id: 'r-kept', brief: 'what the memo holds' };
  const said: string[] = [];
  const listed = listRuns(
    (line) => said.push(line),
    (id) => (id === 'r-kept' ? stand : undefined),
  );
  assert.equal(
    listed.find((r) => r.id === 'r-kept'),
    stand,
    'the record that is not JSON is listed as kept answers it',
  );
  assert.ok(!said.some((l) => l.includes('r-kept')), `and nothing is said of it, since it was not read: ${said.join('\n')}`);
  assert.equal(listed.find((r) => r.id === 'r-read')?.brief, 'add a flag', 'an id kept does not answer is read off disk');
  const unkept: string[] = [];
  assert.ok(!listRuns((line) => unkept.push(line)).some((r) => r.id === 'r-kept'), 'with no kept, the record is read, and left out');
  assert.ok(unkept.some((l) => l.startsWith('left out: run r-kept: its record, ')));
  for (const id of ['r-kept', 'r-read']) fs.rmSync(runFile(id));
});

test("what the tick does not name survives a read and a rewrite: a key on the record and on a frozen step, and a git record's `placeSkill`", () => {
  const record: Record<string, unknown> = { ...aRecord('r-newer'), fromANewerWf: { kept: true } };
  (record.workflow as Array<Record<string, unknown>>)[0].aNewStepKey = 3;
  put('r-newer', record);
  assert.ok(rewriteRun(readRun('r-newer')));
  const written = JSON.parse(fs.readFileSync(runFile('r-newer'), 'utf8')) as Record<string, unknown>;
  assert.deepEqual(written.fromANewerWf, { kept: true });
  assert.equal((written.workflow as Array<Record<string, unknown>>)[0].aNewStepKey, 3);

  const placeSkill = { skill: 'git', version: 'abc123def456' };
  put('r-placed', { ...aRecord('r-placed'), placeSkill });
  const run = readRun('r-placed');
  assert.deepEqual(run.placeSkill, placeSkill);
  assert.ok(rewriteRun(run));
  assert.deepEqual((JSON.parse(fs.readFileSync(runFile('r-placed'), 'utf8')) as Record<string, unknown>).placeSkill, placeSkill);
  put('r-unplaced', { ...aRecord('r-unplaced'), fromAnOlderWf: 1 });
  const older = readRun('r-unplaced');
  assert.equal('placeSkill' in older, false, 'one with none reads as before');
  assert.equal((older as unknown as Record<string, unknown>).fromAnOlderWf, 1);
});

test('a marker that does not read still holds its run: a prune marker is pruned, a hold holds, whatever their fields say', () => {
  put('r-marked', aRecord('r-marked'));
  fs.writeFileSync(
    pruneFile('r-marked'),
    JSON.stringify({
      at: 7,
      worktrees: [
        { path: '/w', bytes: 'lots' },
        { path: '/v', bytes: 2 },
      ],
      artifacts: {},
    }),
  );
  fs.writeFileSync(holdFile('r-marked'), 'not json');
  const run = readRun('r-marked');
  assert.deepEqual(run.pruned, { at: '', worktrees: [{ path: '/v', bytes: 2 }], artifacts: { at: '', bytes: 0 } });
  assert.deepEqual(run.hold, { at: '', until: [] });
});

/** An ask file with `body`, as a person might have written it by hand. */
const ask = (name: string, body: unknown): string => {
  const dir = path.join(ROOT, 'asks');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, typeof body === 'string' ? body : JSON.stringify(body));
  return file;
};

const AT = '2026-09-01T00:00:00.000Z';

test("an ask a verb would not write is refused in that verb's words, reason by reason; one it writes, or one a former nemia wrote, reads", async (t) => {
  await t.test('an approval, as `nemia approve` writes it', () => {
    assert.equal(approvalIn(ask('a1', { message: 'go' }), 'plan', 1), 'it says no time it was given');
    assert.equal(approvalIn(ask('a2', { at: 'tuesday' }), 'plan', 1), 'it says no time it was given');
    assert.equal(approvalIn(ask('a3', { at: AT, message: 7 }), 'plan', 1), 'its message is not text');
    assert.equal(approvalIn(ask('a4', { at: AT, message: '  ' }), 'plan', 1), 'its message is empty');
    assert.equal(approvalIn(ask('a5', [AT]), 'plan', 1), 'it is not an approval nemia approve wrote');
    assert.ok(String(approvalIn(ask('a6', '{'), 'plan', 1)).startsWith('unreadable ('));
    assert.deepEqual(approvalIn(ask('a7', { at: AT }), 'plan', 1), { step: 'plan', try: 1, at: AT });
    assert.deepEqual(approvalIn(ask('a8', { at: AT, message: 'go', by: 'a newer wf' }), 'plan', 2), {
      step: 'plan',
      try: 2,
      at: AT,
      message: 'go',
    });
  });

  await t.test('an acceptance, with words of why the work is good enough', () => {
    assert.equal(acceptanceIn(ask('c1', { message: 'fine' }), 'implement', 3), 'it says no time it was given');
    assert.equal(
      acceptanceIn(ask('c2', { at: AT }), 'implement', 3),
      'it says nothing of why the work is good enough with its findings open',
    );
    assert.match(String(acceptanceIn(ask('c3', { at: AT, message: ' ' }), 'implement', 3)), /^its message is empty, /);
    assert.equal(acceptanceIn(ask('c5', 'null'), 'implement', 3), 'it is not an acceptance nemia approve wrote');
    assert.deepEqual(acceptanceIn(ask('c4', { at: AT, message: 'fine' }), 'implement', 3), {
      step: 'implement',
      try: 3,
      at: AT,
      message: 'fine',
    });
  });

  await t.test('a round ask, its budget dollars above zero', () => {
    assert.equal(roundAskIn(ask('r1', { at: AT, budget: 0 }), 'implement', 4), 'its budget is not an amount of dollars above zero');
    assert.equal(roundAskIn(ask('r2', { at: AT, budget: '5' }), 'implement', 4), 'its budget is not an amount of dollars above zero');
    assert.equal(roundAskIn(ask('r3', 'null'), 'implement', 4), 'it is not an ask nemia retry --round wrote');
    assert.deepEqual(roundAskIn(ask('r4', {}), 'implement', 4), { step: 'implement', round: 4, at: '' });
    assert.deepEqual(roundAskIn(ask('r5', { at: 12, budget: 2.5 }), 'implement', 4), { step: 'implement', round: 4, budget: 2.5, at: '' });
  });

  await t.test('a retry ask, held to `nemia retry`’s word; the former `nudge` read as `continue`', () => {
    const said = (body: unknown): unknown => askIn(ask('t', body), 'implement', 2);
    assert.equal(said({ mode: 'again' }), 'it asks for no mode nemia retry knows ("again")');
    assert.equal(said({}), 'it asks for no mode nemia retry knows (undefined)');
    assert.equal(said({ mode: 'fresh', model: '' }), 'its model is not a name');
    assert.equal(said({ mode: 'continue', message: ['go'] }), 'its message is not text');
    assert.equal(said({ mode: 'continue', message: '\n' }), 'its message is empty');
    assert.equal(said({ mode: 'continue', budget: -1 }), 'its budget is not an amount of dollars above zero');
    assert.match(String(said({ mode: 'recheck', message: 'look' })), /^it carries a message and asks for a recheck, /);

    assert.equal(said({ mode: 'recheck', budget: 3 }), 'it carries a budget and asks for a recheck, which files no session to spend it');
    assert.deepEqual(said({ mode: 'fresh', at: AT }), { step: 'implement', try: 2, mode: 'fresh', at: AT });
    assert.deepEqual(
      said({ mode: 'nudge', at: AT }),
      { step: 'implement', try: 2, mode: 'continue', at: AT },
      'the former `nudge` reads as `continue`',
    );
    assert.deepEqual(said({ mode: 'continue', model: 'haiku', message: 'go on', budget: 4, at: AT }), {
      step: 'implement',
      try: 2,
      mode: 'continue',
      model: 'haiku',
      message: 'go on',
      budget: 4,
      at: AT,
    });
  });
});

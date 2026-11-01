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
import type { Run } from './record.ts';
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

test('a record with no `id` is refused by name, with where it is and what to do — never a parse error', () => {
  const { id: _, ...record } = aRecord('r-noid');
  put('r-noid', record);
  const said = refusalOf('r-noid');
  assert.ok(said.startsWith(`run r-noid: its record, ${runFile('r-noid')}, does not read as a run: its \`id\` is missing.`), said);
  assert.ok(said.includes(FIX), said);
  assert.ok(!said.includes('Expected'), `in wf's words: ${said}`);
});

test("a frozen step's `after` that is no list is refused at its path, saying what is there and what nemia writes", () => {
  const record = aRecord('r-after');
  (record.workflow as Array<Record<string, unknown>>)[1].after = 'implement';
  put('r-after', record);
  const said = refusalOf('r-after');
  assert.ok(said.includes('its `workflow.1.after` is "implement", where nemia writes'), said);
});

test("a field that holds a huge value is refused in bounded words: the value's first 60 characters as JSON, cut marked `…`", () => {
  const record = aRecord('r-huge');
  (record.workflow as Array<Record<string, unknown>>)[1].after = 'x'.repeat(100_000);
  put('r-huge', record);
  const said = refusalOf('r-huge');
  assert.ok(said.includes(`its \`workflow.1.after\` is "${'x'.repeat(59)}…, where nemia writes`), said.slice(0, 300));
  assert.ok(said.length < 2_000, `${said.length} characters`);
});

test('a frozen step with no name, a step record with no task, and a folder run with no place kind are each refused at their field', () => {
  const noName = aRecord('r-noname');
  delete (noName.workflow as Array<Record<string, unknown>>)[0].name;
  put('r-noname', noName);
  assert.ok(refusalOf('r-noname').includes('its `workflow.0.name` is missing'));

  const noTask = aRecord('r-notask');
  (noTask.steps as Record<string, unknown>).review = {};
  put('r-notask', noTask);
  assert.ok(refusalOf('r-notask').includes('its `steps.review.taskId` is missing'));

  const { repo: _r, baseRef: _b, branch: _br, isolate: _i, ...folder } = aRecord('r-place');
  put('r-place', { ...folder, place: { kind: 'shelf' } });
  assert.ok(
    refusalOf('r-place').includes('its `place.kind` is "shelf", where nemia writes "folder"'),
    'as the folder run it says it is, not a repository run',
  );
});

test("a record's `factory` that is no name is refused at its field; a record with none reads as it is, in the default factory", () => {
  put('r-factory', { ...aRecord('r-factory'), factory: 42 });
  assert.ok(refusalOf('r-factory').includes('its `factory` is 42'), refusalOf('r-factory'));
  put('r-nofactory', aRecord('r-nofactory'));
  assert.equal('factory' in readRun('r-nofactory'), false);
  put('r-pipao', { ...aRecord('r-pipao'), factory: 'pipao' });
  assert.equal(readRun('r-pipao').factory, 'pipao');
});

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
    workspace: 'main',
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
  ['workspace', (step) => (step.workspace = 'shelf'), 'its `workflow.1.workspace` is "shelf", where nemia writes "main" | "folder"'],
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

test("a frozen step's key of the wrong type is refused at its path, in wf's words, and the step with every key right reads", () => {
  put('r-agent', withAgent('r-agent'));
  const run = readRun('r-agent');
  assert.deepEqual(run.workflow![1], (withAgent('r-agent').workflow as unknown[])[1], 'read as it was frozen');
  for (const [key, breaks, words] of BROKEN) {
    const id = `r-bad-${key.replace('.', '-')}`;
    const record = withAgent(id);
    breaks((record.workflow as Array<Record<string, unknown>>)[1]);
    put(id, record);
    const said = refusalOf(id);
    assert.ok(said.includes(words), `${key}: ${said}`);
    assert.ok(!said.includes('Expected'), `in wf's words: ${said}`);
  }
  const listed = listRuns(() => undefined).map((r) => r.id);
  assert.ok(listed.includes('r-agent'));
  for (const [key] of BROKEN) {
    const id = `r-bad-${key.replace('.', '-')}`;
    assert.ok(!listed.includes(id), `${id} left out of listRuns`);
    fs.rmSync(runFile(id));
  }
});

test('a record that is not JSON, or holds no object, is refused saying so', () => {
  put('r-half', '{"id": "r-half", "repo"');
  assert.ok(refusalOf('r-half').includes('is not JSON ('));
  put('r-list', '[]');
  assert.ok(refusalOf('r-list').includes('is no run record: it holds no object'));
});

test('a run id with no record is still told to try `nemia ls`, not called unreadable', () => {
  assert.throws(
    () => readRun('r-nobody'),
    (err: Error) => !(err instanceof UnreadableRecord) && err.message === "no such run: r-nobody  (try 'nemia ls')",
  );
});

test('`listRuns` leaves out a record that does not read, says so with its fix, and lists every other run', () => {
  const said: string[] = [];
  put('r-good', aRecord('r-good'));
  const listed = listRuns((line) => said.push(line)).map((r) => r.id);
  assert.ok(listed.includes('r-good'));
  for (const bad of ['r-noid', 'r-after', 'r-noname', 'r-notask', 'r-place', 'r-half', 'r-list']) {
    assert.ok(!listed.includes(bad), `${bad} left out`);
    assert.ok(
      said.some((l) => l.startsWith(`left out: run ${bad}: its record, `)),
      `${bad} said: ${said.join('\n')}`,
    );
  }
  for (const bad of ['r-noid', 'r-after', 'r-noname', 'r-notask', 'r-place', 'r-half', 'r-list']) fs.rmSync(runFile(bad));
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

test('a key the tick does not name survives a read and a rewrite, and so does a frozen step key it does not name', () => {
  const record: Record<string, unknown> = { ...aRecord('r-newer'), fromANewerWf: { kept: true } };
  (record.workflow as Array<Record<string, unknown>>)[0].aNewStepKey = 3;
  put('r-newer', record);
  const run = readRun('r-newer');
  assert.ok(rewriteRun(run));
  const written = JSON.parse(fs.readFileSync(runFile('r-newer'), 'utf8')) as Record<string, unknown>;
  assert.deepEqual(written.fromANewerWf, { kept: true });
  assert.equal((written.workflow as Array<Record<string, unknown>>)[0].aNewStepKey, 3);
});

test("a git record's `placeSkill` reads and survives a rewrite; one with none reads as before; one that is no skill is refused at it", () => {
  const placeSkill = { skill: 'git', version: 'abc123def456' };
  put('r-placed', { ...aRecord('r-placed'), placeSkill });
  const run = readRun('r-placed');
  assert.deepEqual(run.placeSkill, placeSkill);
  assert.ok(rewriteRun(run));
  assert.deepEqual((JSON.parse(fs.readFileSync(runFile('r-placed'), 'utf8')) as Record<string, unknown>).placeSkill, placeSkill);
  put('r-unplaced', { ...aRecord('r-unplaced'), fromAnOlderWf: 1 });
  const older = readRun('r-unplaced');
  assert.equal('placeSkill' in older, false);
  assert.equal((older as unknown as Record<string, unknown>).fromAnOlderWf, 1);
  put('r-misplaced', { ...aRecord('r-misplaced'), placeSkill: 'git' });
  assert.ok(refusalOf('r-misplaced').includes('its `placeSkill` is "git"'), refusalOf('r-misplaced'));
});

test("the oldest shapes on the owner's store read: no frozen workflow, `disallow:` on a frozen step, an earlier try, a landing and a slot", () => {
  const { workflow: _, ...unfrozen } = aRecord('r-old');
  put('r-old', {
    ...unfrozen,
    after: ['r-parent'],
    slotHeldAt: '2026-09-01T00:00:00.000Z',
    tips: { implement: 'def456' },
    steps: {
      implement: {
        taskId: 'r-old-implement-try2',
        workspace: '/w/implement',
        branch: 'wf/r-old/implement',
        check: { taskId: 'r-old-implement-try2-check' },
        tries: [
          { taskId: 'r-old-implement', check: { taskId: 'r-old-implement-check' }, then: 'retries' },
          { taskId: 'r-old-implement-try1b', cause: 'nudge' },
        ],
        handedOff: 'r-old-implement-try2',
      },
      ship: { taskId: 'r-old-ship', landed: { commit: 'fed789' } },
    },
  });
  const old = readRun('r-old');
  assert.equal(
    old.workflow,
    undefined,
    "a record with no frozen workflow reads, with a retried try, a check, a hand-off and the ship's landing",
  );
  assert.equal(old.steps.implement.tries![0].cause, 'retries', 'a try written with the former `then` reads as its `cause`');
  assert.equal(Object.hasOwn(old.steps.implement.tries![0], 'then'), false, 'and holds no `then`');
  assert.equal(old.steps.implement.tries![1].cause, 'continue', 'a try whose cause is the former `nudge` reads as `continue`');
  rewriteRun(old);
  const triesWritten = (JSON.parse(fs.readFileSync(runFile('r-old'), 'utf8')) as { steps: { implement: { tries: object[] } } }).steps
    .implement.tries;
  assert.equal(Reflect.get(triesWritten[0], 'cause'), 'retries');
  assert.equal(Object.hasOwn(triesWritten[0], 'then'), false, 'written back under `cause` alone');
  assert.equal(Reflect.get(triesWritten[1], 'cause'), 'continue', 'written back in the word it has now');

  const noCause = aRecord('r-nocause');
  (noCause.steps as Record<string, Record<string, unknown>>).implement.tries = [{ taskId: 'r-nocause-implement' }];
  put('r-nocause', noCause);
  assert.ok(refusalOf('r-nocause').includes('`steps.implement.tries.0.cause`'), refusalOf('r-nocause'));
  const later = aRecord('r-later');
  (later.steps as Record<string, Record<string, unknown>>).implement.tries = [{ taskId: 'r-later-implement', cause: 'later' }];
  put('r-later', later);
  assert.ok(refusalOf('r-later').includes('`steps.implement.tries.0.cause`'), refusalOf('r-later'));

  const renamed = aRecord('r-renamed');
  (renamed.workflow as Array<Record<string, unknown>>)[0].disallow = ['SendMessage'];
  put('r-renamed', renamed);
  const run: Run = readRun('r-renamed');
  assert.deepEqual(run.workflow![0].disallowedTools, ['SendMessage'], 'a step frozen with `disallow:` reads under the name it has now');
  rewriteRun(run);
  const written = JSON.parse(fs.readFileSync(runFile('r-renamed'), 'utf8')) as { workflow: Array<Record<string, unknown>> };
  assert.deepEqual(written.workflow[0].disallowedTools, ['SendMessage']);
  assert.equal(Object.hasOwn(written.workflow[0], 'disallow'), false, 'and is written back under that name alone');

  const both = aRecord('r-both');
  (both.workflow as Array<Record<string, unknown>>)[0] = {
    name: 'implement',
    after: [],
    body: 'do it',
    disallowedTools: ['SendMessage'],
    disallow: ['SendMessage'],
    agent: { name: 'implementer', keys: ['disallowedTools'], body: '', given: { disallowedTools: 'SendMessage', disallow: 'SendMessage' } },
  };
  put('r-both', both);
  const step = readRun('r-both').workflow![0];
  assert.deepEqual(
    step,
    {
      name: 'implement',
      after: [],
      body: 'do it',
      disallowedTools: ['SendMessage'],
      agent: { name: 'implementer', keys: ['disallowedTools'], body: '', given: { disallowedTools: 'SendMessage' } },
    },
    "a step a nemia before 4612aa2a froze, the former name beside the new one on the step and in its agent's `given`, reads under the new",
  );

  const allowed = aRecord('r-allow');
  (allowed.workflow as Array<Record<string, unknown>>)[0] = {
    name: 'implement',
    after: [],
    body: 'do it',
    allow: ['Edit(**)'],
    agent: { name: 'implementer', keys: ['allow'], body: '', given: { allow: 'Edit(**)' } },
  };
  put('r-allow', allowed);
  assert.deepEqual(
    readRun('r-allow').workflow![0],
    {
      name: 'implement',
      after: [],
      body: 'do it',
      allowedTools: ['Edit(**)'],
      agent: { name: 'implementer', keys: ['allowedTools'], body: '', given: { allowedTools: 'Edit(**)' } },
    },
    'an agent that gave a key under its former name reads with the new one among its `keys`, and is listed',
  );
  assert.ok(listRuns(() => undefined).some((r) => r.id === 'r-allow'));

  const text = aRecord('r-disallow-text');
  (text.workflow as Array<Record<string, unknown>>)[0].disallow = 'SendMessage';
  put('r-disallow-text', text);
  const disallow = refusalOf('r-disallow-text');
  assert.ok(disallow.includes('its `workflow.0.disallow` is "SendMessage"'), disallow);
  assert.ok(disallow.includes('where nemia writes array'), 'a field under a former name is checked as the key it is now');
  fs.rmSync(runFile('r-disallow-text'));
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

test('an approval `nemia approve` would not write is refused in its words; one it writes, with or without words, reads', () => {
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

test('an acceptance with no words, blank words or no time is refused in `nemia approve`’s words', () => {
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

test('a round ask whose budget is not dollars above zero is refused; one with no time or a time that is no text reads as before', () => {
  assert.equal(roundAskIn(ask('r1', { at: AT, budget: 0 }), 'implement', 4), 'its budget is not an amount of dollars above zero');
  assert.equal(roundAskIn(ask('r2', { at: AT, budget: '5' }), 'implement', 4), 'its budget is not an amount of dollars above zero');
  assert.equal(roundAskIn(ask('r3', 'null'), 'implement', 4), 'it is not an ask nemia retry --round wrote');
  assert.deepEqual(roundAskIn(ask('r4', {}), 'implement', 4), { step: 'implement', round: 4, at: '' });
  assert.deepEqual(roundAskIn(ask('r5', { at: 12, budget: 2.5 }), 'implement', 4), { step: 'implement', round: 4, budget: 2.5, at: '' });
});

test('a retry ask is held to `nemia retry`’s word, reason by reason; one from before asks carried a message reads as it did', () => {
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

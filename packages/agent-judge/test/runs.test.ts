/**
 * `judge runs`: what it reads off a store, what it sends, what it prints, and what it refuses. Over a fixture store of
 * hand-written run records, a stub fetch and a record in a temp directory. No live call, and no real store is read.
 */
import { answering, ENV, stub, tmp, type Call, type Reply } from './hermetic.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defaultRecord, main, wouldAsk } from '../src/cli.ts';
import { defaultStore, readRuns } from '../src/runs.ts';

// ─── the fixture store ──────────────────────────────────────────────────────────────────────────

/** A step's frozen body, full of the words a brief would be searched for: nothing may read the workflow as a person's. */
const WORKFLOW = [{
  name: 'implement', after: [], agent: 'implementer',
  body: 'Read apps/web/src and apps/api/src. Decide the design, plan the change across packages/agent-engine, packages/agent-workflows and workflows/.',
}];

/** The runs, by the folder a person chose. Each brief is the only thing of a record that is ever read. */
const RUNS: { id: string; folder: string; brief: string; createdAt: string; extra?: Record<string, unknown> }[] = [
  { id: 'typo', folder: 'dev', createdAt: '2026-09-10T00:00:00Z', brief: 'A typo in the engine\'s README\n\nOne word is wrong. Done when it is right.' },
  { id: 'inbox', folder: 'dev-build', createdAt: '2026-09-11T00:00:00Z', brief: 'Sort the inbox on the board\n\nNewest first, in apps/web/src. Done when the e2e sees the order.' },
  { id: 'store', folder: 'dev-planned', createdAt: '2026-09-12T00:00:00Z', brief: 'Decide where the store interface lives\n\nIt spans packages/agent-engine, packages/agent-workflows and workflows/.' },
  { id: 'agents', folder: 'dev-planned-build', createdAt: '2026-09-13T00:00:00Z', brief: 'Design the agents page\n\nIt spans apps/web, apps/api and packages/agent-workflows, and nobody has decided its shape.' },
  // A folder run: no repo, and a workspace that is a directory of its own. Only `brief` and `workflowDir` are read.
  { id: 'note', folder: 'dev', createdAt: '2026-09-14T00:00:00Z', brief: 'Write a note about the week\n\nOne page at most.', extra: { workspace: '/tmp/somewhere/work', repo: undefined } },
  { id: 'colours', folder: 'dev-build', createdAt: '2026-09-15T00:00:00Z', brief: 'Warmer colours\n\nMake the board warmer. Done when it looks better.' },
];

/** What the judge answers, by the run whose brief it was given. `colours` is unsure about the web app. */
const ANSWERS: Record<string, Record<string, number>> = {
  typo: { web: 0.05, plan: 0.05, clear: 3, size: 1 },
  inbox: { web: 0.95, plan: 0.05, clear: 3, size: 2 },
  store: { web: 0.05, plan: 0.95, clear: 3, size: 3 },
  agents: { web: 0.95, plan: 0.95, clear: 3, size: 3 },
  note: { web: 0.9, plan: 0.05, clear: 3, size: 1 },
  colours: { web: 0.5, plan: 0.05, clear: 3, size: 1 },
};

const forCard = (call: Call): Reply => {
  const card = (call.body.state as { card: string }).card;
  const id = RUNS.find((r) => card.startsWith(r.brief.split('\n')[0]!))?.id;
  assert.ok(id, `the stub was given a card it does not know: ${card.slice(0, 40)}`);
  return answering(ANSWERS[id]!)(call);
};

/** A store on disk: the six runs above, and every record the command must skip and name. */
const fixture = () => {
  const store = tmp('store');
  const dir = path.join(store, 'runs');
  fs.mkdirSync(dir);
  const write = (name: string, record: unknown) => fs.writeFileSync(path.join(dir, `${name}.json`), typeof record === 'string' ? record : JSON.stringify(record));
  for (const r of RUNS) {
    write(r.id, {
      id: r.id, brief: r.brief, createdAt: r.createdAt,
      workflowDir: `/home/someone/hkb-v2/workflows/${r.folder}`, workflow: WORKFLOW, steps: {}, ...r.extra,
    });
  }
  const other = (name: string, over: Record<string, unknown>) =>
    write(name, { id: name, brief: 'A brief that says a thing about apps/web.', createdAt: '2026-09-16T00:00:00Z', workflow: WORKFLOW, ...over });
  other('look', { workflowDir: '/home/someone/hkb-v2/workflows/ui' });
  other('elsewhere', { workflowDir: '/home/someone/projects/agent-workflows/workflows' });
  other('early', { workflowDir: '/home/someone/hkb-v2/workflows/dev', brief: undefined });
  other('older', { workflowDir: undefined });
  other('empty', { workflowDir: '/home/someone/hkb-v2/workflows/dev', brief: '---\nworkflow: dev\n---\n   \n' });
  write('broken', '{"id": "broken", "brief": ');
  return store;
};

const run = async (argv: string[], replies: Parameters<typeof stub> = [forCard], env: Record<string, string> = ENV) => {
  const s = stub(...replies);
  const out: string[] = [];
  const code = await main(argv, { env, out: (l) => out.push(l), fetch: s.fetch, retries: 0 });
  return { code, lines: out, calls: s.calls, text: out.join('\n') };
};

// ─── reading the store ──────────────────────────────────────────────────────────────────────────

test('the six dispatched runs are in scope, oldest first, and every other record is skipped by name', () => {
  const { runs, skipped, read } = readRuns(fixture());
  assert.equal(read, 12);
  assert.deepEqual(runs.map((r) => r.id), ['typo', 'inbox', 'store', 'agents', 'note', 'colours']);
  assert.deepEqual(runs.map((r) => r.folder), ['dev', 'dev-build', 'dev-planned', 'dev-planned-build', 'dev', 'dev-build']);
  assert.deepEqual(runs.map((r) => [r.web, r.plan]), [[false, false], [true, false], [false, true], [true, true], [false, false], [true, false]]);
  // A skipped record is named by its file, exactly as it sits in the store: a person greps for it.
  assert.deepEqual(skipped.map((s) => `${s.file}: ${s.why}`).sort(), [
    'broken.json: is not a run record: Unexpected end of JSON input',
    'early: has no brief: it was written before the field existed',
    'elsewhere: was run on workflows, not one of dev, dev-build, dev-planned, dev-planned-build',
    'empty: says nothing once its frontmatter is taken off',
    'look: was run on ui, not one of dev, dev-build, dev-planned, dev-planned-build',
    'older: has no workflowDir: it was written before the field existed',
  ]);
});

test('two runs of the same millisecond are ordered by their id, whatever the files are called', () => {
  // The files are read in name order, and these two names are the opposite of their ids: without the tiebreak the sort
  // is stable and leaves them as the directory gave them.
  const store = tmp('store');
  fs.mkdirSync(path.join(store, 'runs'));
  for (const [file, id] of [['a-first', 'zed'], ['z-last', 'abe']]) {
    fs.writeFileSync(path.join(store, 'runs', `${file}.json`),
      JSON.stringify({ id, brief: 'Do a thing.', createdAt: '2026-09-10T00:00:00.000Z', workflowDir: '/w/dev' }));
  }
  assert.deepEqual(readRuns(store).runs.map((r) => r.id), ['abe', 'zed']);
});

test('and a run started earlier comes first, whatever the files are called', () => {
  const store = tmp('store');
  fs.mkdirSync(path.join(store, 'runs'));
  for (const [id, at] of [['abe', '2026-09-11T00:00:00Z'], ['zed', '2026-09-10T00:00:00Z']]) {
    fs.writeFileSync(path.join(store, 'runs', `${id}.json`),
      JSON.stringify({ id, brief: 'Do a thing.', createdAt: at, workflowDir: '/w/dev' }));
  }
  assert.deepEqual(readRuns(store).runs.map((r) => r.id), ['zed', 'abe']);
});

test('--since keeps the runs started at or after it, and names what it dropped', () => {
  const { runs, skipped } = readRuns(fixture(), { since: Date.parse('2026-09-13T00:00:00Z') });
  assert.deepEqual(runs.map((r) => r.id), ['agents', 'note', 'colours']);
  assert.equal(skipped.filter((s) => s.why === 'was started before --since').length, 3);
});

test('the store defaults to $WF_ROOT, then ~/.agent-workflows, and the record beside it', () => {
  assert.equal(defaultStore({ WF_ROOT: '/srv/wf' }), '/srv/wf');
  assert.equal(defaultStore({}), path.join(os.homedir(), '.agent-workflows'));
  assert.equal(defaultRecord({ WF_ROOT: '/srv/wf' }), '/srv/wf/judge');
});

// ─── what it sends, and what it prints ──────────────────────────────────────────────────────────

test('one request per run in scope, carrying the brief and the fixed repository text and nothing else', async () => {
  const store = fixture();
  const record = tmp('runs');
  const { code, calls, text } = await run(['runs', '--store', store, '--record', record, '--yes']);
  assert.equal(code, 0);
  assert.equal(calls.length, 6, 'one request each, and none for a record that was skipped');
  const sent = calls[0]!.body.state as { card: string; repository: Record<string, string> };
  assert.equal(sent.card, RUNS[0]!.brief);
  assert.deepEqual(Object.keys(sent.repository).sort(), ['apps/api', 'apps/web', 'packages/agent-engine', 'packages/agent-workflows', 'workflows/']);
  assert.deepEqual(Object.keys(calls[0]!.body.state as object).sort(), ['card', 'repository'], 'nothing of the record travels but the brief');
  const whole = JSON.stringify(calls.map((c) => c.body));
  for (const leak of ['workflowDir', 'hkb-v2/workflows', 'createdAt', 'implementer']) assert.ok(!whole.includes(leak), leak);
  assert.deepEqual(Object.keys(calls[0]!.body.questions), ['web', 'plan', 'clear', 'size']);
  assert.match(text, /^judge runs: 6 runs in scope, 6 skipped, of 12 records in /m);
  assert.match(text, /^ {2}24 of 24 questions would be asked; the rest are on record in /m);
  assert.match(text, /^ {2}about \d+ characters of briefs would go to TypeSafe, with the fixed description of the repository and nothing else$/m);
  assert.match(text, /^ {2}TypeSafe's retention terms have not been read by this project: assume that what is sent may be kept\.$/m);
  assert.match(text, /^6 requests · 24 questions · 6000 input tokens · \d+ ms$/m);
});

test('the tables read the judge and the rival against the folder the person chose', async () => {
  const { text } = await run(['runs', '--store', fixture(), '--record', tmp('runs'), '--yes']);
  const block = (property: string) => text.split(`${property} · `)[1]!.split('\n\n')[0]!;
  assert.deepEqual(block('web').split('\n').slice(1), [
    '  judge     label yes  label no',
    '    yes             2         1    P 0.67',
    '    no              0         2    R 1.00',
    '    unsure          1                       kept out of both',
    '  rival     label yes  label no',
    '    yes             2         0    P 1.00',
    '    no              1         3    R 0.67',
  ]);
  assert.deepEqual(block('plan').split('\n').slice(1), [
    '  judge     label yes  label no',
    '    yes             2         0    P 1.00',
    '    no              0         4    R 1.00',
    '    unsure          0                       kept out of both',
    '  rival     label yes  label no',
    '    yes             2         0    P 1.00',
    '    no              0         4    R 1.00',
  ]);
  assert.match(text, /^ {2}judge {3}4 of 6 agree · 1 differ · 1 stayed in the inbox, counted apart$/m);
  assert.match(text, /^ {2}rival {3}5 of 6 agree · 1 differ$/m);
});

test('the disagreements name the run, both folders, the probabilities and the brief\'s first line', async () => {
  const { text } = await run(['runs', '--store', fixture(), '--record', tmp('runs'), '--yes']);
  assert.match(text, /^where the judge and the person differ · 2 of 6; the person's choice is not always right \(pivot §2\.4\)$/m);
  assert.match(text, /^ {2}note\n {4}dev → dev-build\n {4}web P 0\.90 · plan P 0\.05 · clear score 3\.00\n {4}Write a note about the week$/m);
  assert.match(text, /^ {2}colours\n {4}dev-build → the inbox: unsure about the web app\n {4}web P 0\.50 · plan P 0\.05 · clear score 3\.00\n {4}Warmer colours$/m);
  assert.ok(!text.includes('  typo\n'), 'a run the judge and the person agree on is not in the list');
  assert.match(text, /^nothing was filed, started or shown to anyone: this command gates nothing\.$/m);
});

test('a second pass makes no request and reads the same tables off the record', async () => {
  const store = fixture();
  const record = tmp('runs');
  const first = await run(['runs', '--store', store, '--record', record, '--yes']);
  const again = await run(['runs', '--store', store, '--record', record]);
  assert.equal(again.calls.length, 0, 'every answer is on record');
  assert.equal(again.code, 0, 'with nothing to send, --yes is not needed');
  assert.match(again.text, /^ {2}0 of 24 questions would be asked; the rest are on record in /m);
  assert.match(again.text, /^ {2}nothing would be sent: every answer is already on record\.$/m);
  // Everything read off the record, down to the cost line: the same numbers, from the same facts.
  const tables = (text: string) => text.slice(text.indexOf('web · '), text.search(/^\d+ requests /m));
  assert.equal(tables(again.text), tables(first.text));
  assert.match(again.text, /^0 requests · 0 questions · 0 input tokens · 0 ms$/m, 'and it cost nothing, as it said it would');
});

test('--json writes the same report whole, judgments and all', async () => {
  const store = fixture();
  const file = path.join(tmp('runs'), 'report.json');
  await run(['runs', '--store', store, '--record', tmp('runs'), '--yes', '--json', file]);
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(doc.v, 1);
  assert.equal(doc.inScope, 6);
  assert.equal(doc.read, 12);
  assert.equal(doc.skipped.length, 6);
  assert.deepEqual(doc.web.judge, { yesYes: 2, yesNo: 1, noYes: 0, noNo: 2, unsure: 1, decided: 5, right: 4, precision: 2 / 3, recall: 1 });
  assert.deepEqual(doc.folder.judge, { same: 4, differ: 1, inbox: 1, of: 6 });
  assert.deepEqual(doc.disagreements.map((d: { id: string }) => d.id), ['note', 'colours']);
  assert.deepEqual(doc.runs.map((r: { id: string }) => r.id), RUNS.map((r) => r.id));
  const note = doc.runs.find((r: { id: string }) => r.id === 'note');
  assert.deepEqual([note.folder, note.judge.folder, note.rival.folder], ['dev', 'dev-build', 'dev']);
  assert.equal(note.judge.answers.web.answer.noul, 0.9, 'the judgment is in it, as it was read');
  assert.equal(note.judge.answers.web.key.length, 64);
});

test('with no key it asks nothing, records nothing, and scores the rival alone', async () => {
  const record = tmp('runs');
  const { code, calls, text } = await run(['runs', '--store', fixture(), '--record', record], [forCard], {});
  assert.equal(code, 0);
  assert.equal(calls.length, 0);
  assert.match(text, /^ {2}the judge is off: no TYPESAFE_API_KEY in the environment; nothing would be sent, and only the rival is scored\.$/m);
  assert.match(text, /^ {2}the judge is off: no TYPESAFE_API_KEY in the environment; only the rival is scored\.$/m);
  assert.ok(!/^ {2}judge/m.test(text), 'no judge column, and no folder agreement claimed for it');
  assert.ok(!text.includes('where the judge and the person differ'));
  assert.match(text, /^ {2}rival {3}5 of 6 agree · 1 differ$/m);
  assert.deepEqual(fs.existsSync(record) ? fs.readdirSync(record) : [], [], 'nothing is recorded');
});

test('what it would ask is counted without asking, and a failure on record is asked again only with --reask', async () => {
  const store = fixture();
  const record = tmp('runs');
  const briefs = readRuns(store).runs.map((r) => r.brief);
  assert.equal(wouldAsk(record, briefs, false), 24);
  const failed = await run(['runs', '--store', store, '--record', record, '--yes'], [{ status: 500 }]);
  assert.match(failed.text, /^ {2}rival {3}5 of 6 agree/m, 'a pass that answered nothing still scores the rival');
  assert.equal(wouldAsk(record, briefs, false), 0, 'a failure is a fact: nothing is asked again by itself');
  assert.equal(wouldAsk(record, briefs, true), 24, 'and --reask would ask each of them again');
  const kept = await run(['runs', '--store', store, '--record', record]);
  assert.equal(kept.calls.length, 0);
  const again = await run(['runs', '--store', store, '--record', record, '--reask', '--yes']);
  assert.equal(again.calls.length, 6);
  assert.match(again.text, /^ {2}judge {3}4 of 6 agree/m);
});

// ─── what it refuses ────────────────────────────────────────────────────────────────────────────

test('nothing is sent without --yes, and what it would cost is printed first', async () => {
  const store = fixture();
  const s = stub(forCard);
  const out: string[] = [];
  await assert.rejects(
    main(['runs', '--store', store, '--record', tmp('runs')], { env: ENV, out: (l) => out.push(l), fetch: s.fetch, retries: 0 }),
    (e: Error & { exitCode?: number }) => e.exitCode === 2 && /^judge runs: nothing was sent\. Read what it costs above, then run it again with --yes\.$/.test(e.message),
  );
  assert.equal(s.calls.length, 0, 'the gate is not inert: no request was made');
  assert.match(out.join('\n'), /^ {2}24 of 24 questions would be asked/m, 'and the cost was printed before the refusal');
});

test('judge runs refuses what it cannot score', async () => {
  const refuses = (argv: string[], pattern: RegExp) =>
    assert.rejects(run(argv), (e: Error & { exitCode?: number }) => e.exitCode === 2 && pattern.test(e.message));
  const missing = path.join(tmp('runs'), 'nowhere');
  await refuses(['runs', '--store', missing], new RegExp(`^judge runs: there is no store at ${missing}\\. Pass --store <dir>, or set WF_ROOT\\.$`));
  await refuses(['runs', '--store', tmp('runs')], /^judge runs: cannot read .*runs: ENOENT\. A store keeps its run records there; pass --store <dir>\.$/);
  await refuses(['runs', '--store', fixture(), '--since', 'abc'], /^judge runs: --since takes a date, such as 2026-09-01 or 2026-09-01T00:00:00Z; "abc" is not one\.$/);
  await refuses(['runs', '--store'], /^judge runs: --store takes a value\./);
  await refuses(['runs', '--json'], /^judge runs: --json takes a value\./);
  await refuses(['runs', '--force'], /^judge runs: unknown option --force\./);
  await refuses(['runs', 'somewhere'], /^judge runs: it takes no argument; it was given somewhere\./);
});

test('a report that cannot be written is refused by name, after the tables have been printed', async () => {
  const store = fixture();
  const into = path.join(tmp('runs'), 'no-such-directory', 'report.json');
  const s = stub(forCard);
  const out: string[] = [];
  await assert.rejects(
    main(['runs', '--store', store, '--record', tmp('runs'), '--yes', '--json', into], { env: ENV, out: (l) => out.push(l), fetch: s.fetch, retries: 0 }),
    (e: Error & { exitCode?: number }) => e.exitCode === 2 && new RegExp(`^judge runs: cannot write ${into.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: ENOENT\\.$`).test(e.message),
  );
  assert.match(out.join('\n'), /^ {2}rival {3}5 of 6 agree/m);
});

test('the usage names the verb, and an unknown verb still does not', async () => {
  const bare = await run([]);
  assert.match(bare.text, /^judge runs \[--store <dir>\] \[--record <dir>\] \[--since <date>\] \[--json <file>\] \[--yes\] \[--reask\]$/m);
  await assert.rejects(run(['walk']), (e: Error) => /^judge: no command walk/.test(e.message));
});

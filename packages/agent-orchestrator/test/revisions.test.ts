/**
 * Revisions: the ledger per kind and name, the pins a run records of what it resolved, the drift between the two, and `nemia refresh`.
 *
 * What is proven here, each at shipped defaults: a run that has filed nothing resolves the folder afresh on every pass, so an edit made
 * while it waits `--after` reaches its first step's prompt and its pins; a run that has filed keeps its freeze; the ledger appends only
 * where the digest moved; the verb re-pins and the next try is filed on the new revision with the prompt re-rendered; a filing whose
 * closeout schema has moved starts a fresh session, and one whose schema has not still resumes; and the verb's refusals.
 *
 * The place is the stand-in (`testPlace`): the subject is the ledger and the pin, not git, and the steps work in the checkout itself. Each
 * team is given a folder, an agent and a skill named for itself, so no test's edit of a kind moves another's number.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runGiven, runOver } from './placed.ts';
import { digestOf, kindsDrift, revisionNow, stepsDrift, type Pin } from '../src/revisions/revisions.ts';

const ROOT = scratch('wf-revisions-');
process.env.WF_ROOT = ROOT;
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const stand = eachTest(testPlace);
const { advanceRun, startRun, retryRun, runWith: runEngine } = await import('../src/runner.ts');
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
const engine = eachTest(testEngine);
const { engineOf } = await import('../src/runtime-client.ts');
const { readRun } = await import('../src/record/record.store.ts');
const { agentFilesDir } = await import('../src/agents/agents.store.ts');
const { ledgerOf, topsOf } = await import('../src/revisions/revisions.store.ts');
const { refreshRun } = await import('../src/revisions/pin.verb.ts');

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/** The engine's stand-in, with what each task was filed with: a filing is read off `tasks`, and settled by hand. */
const board = () => {
  const { layer, tasks, settle } = engine();
  return { e: engineOf(layer), tasks, settle };
};

/** A workflow folder, its agent and its skill, each named for the team: what a test edits, and the names its pins carry. */
type Team = { dir: string; name: string; agent: string; skill: string; agentFile: string; stepFile: string };

let teams = 0;

/** A team of one step `build` on `place: git`, with an agent of its own given one skill of its own. */
function team(note = "The step's own note."): Team {
  teams += 1;
  const name = `team-${teams}`;
  const [agent, skill] = [`builder-${teams}`, `build-a-thing-${teams}`];
  const root = fs.mkdtempSync(path.join(ROOT, 'tree-'));
  const dir = path.join(root, 'workflows', name);
  fs.mkdirSync(path.join(root, 'workflows', 'agents'), { recursive: true });
  fs.mkdirSync(path.join(root, 'workflows', 'skills', skill), { recursive: true });
  fs.mkdirSync(dir, { recursive: true });
  const [stepFile, agentFile] = [path.join(dir, 'build.md'), path.join(root, 'workflows', 'agents', `${agent}.md`)];
  fs.writeFileSync(stepFile, `---\nplace: git\nagent: ${agent}\n---\n${note}\n`);
  fs.writeFileSync(agentFile, `---\nskills: ${skill}\n---\nYou build.\n`);
  fs.writeFileSync(
    path.join(root, 'workflows', 'skills', skill, 'SKILL.md'),
    `---\nname: ${skill}\ndescription: Use this when a thing is to be built.\n---\nHow to build a thing.\n`,
  );
  return { dir, name, agent, skill, agentFile, stepFile };
}

/** A repository with one commit, so `nemia start` has a base to record and `--after` a branch to wait for. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stand().world.repository(repo, {});
  return repo;
};

/** The step's rendered prompt, as the session is given it. */
const promptOf = (id: string, step: string): string => fs.readFileSync(path.join(agentFilesDir({ id }, step), 'prompt.md'), 'utf8');

/** The pin of one kind and name on a record. */
const pinOf = (pinned: readonly Pin[] | undefined, kind: Pin['kind'], name: string): Pin | undefined =>
  (pinned ?? []).find((p) => p.kind === kind && p.name === name);

const started = (dir: string, repo: string, how: { after?: string[]; isolate?: boolean } = {}) =>
  runPlaced(startRun({ brief: 'build a thing', repo, workflowDir: dir, isolate: false, ...how }));

/** `branch` merged into `repo`'s checkout and committed, as a person ships a result by hand: what `--after` waits for. */
const shippedByHand = (repo: string, branch: string): void => {
  stand().world.stage(repo, branch);
  stand().world.commit(repo, `merge ${branch}`);
};

test('a run that has filed nothing resolves the folder afresh: an edit made while it waits `--after` reaches its first step', async () => {
  const repo = aRepo();
  const first = team();
  const parent = await started(first.dir, repo, { isolate: true });
  const b = board();
  await runWith(b.e, advanceRun(readRun(parent.id)));
  b.settle(`${parent.id}-build`, 'succeeded', { closeout: SIGNED });
  const done = await runWith(b.e, advanceRun(readRun(parent.id)));
  assert.equal(done.status, 'succeeded', 'the parent is finished');
  shippedByHand(repo, readRun(parent.id).branch!);

  const t = team('Do it as asked.');
  const run = await started(t.dir, repo, { after: [parent.id], isolate: true });
  assert.equal(pinOf(readRun(run.id).pinned, 'agent', t.agent)!.n, 1, 'the run records the revision of each kind it resolved at the start');

  fs.writeFileSync(t.agentFile, `---\nskills: ${t.skill}\n---\nYou build it differently.\n`);
  fs.writeFileSync(t.stepFile, `---\nplace: git\nagent: ${t.agent}\n---\nDo it differently.\n`);

  const pass = await runWith(b.e, advanceRun(readRun(run.id)));
  assert.deepEqual(pass.filed, ['build'], 'the parent shipped, so the first step is filed');
  const after = readRun(run.id);
  assert.equal(pinOf(after.pinned, 'agent', t.agent)!.n, 2, 'the edited agent is pinned at its new revision');
  assert.equal(pinOf(after.pinned, 'workflow', t.name)!.n, 2, 'and so is the folder, whose files and agents it digests');
  assert.equal(pinOf(after.pinned, 'skill', t.skill)!.n, 1, 'the skill nobody edited keeps revision 1');
  assert.match(promptOf(run.id, 'build'), /You build it differently/, 'the edit reaches the prompt the session reads');
  assert.match(b.tasks.get(`${run.id}-build`)!.spec.brief, /Do it differently/, 'and the edited step reaches the brief');
  assert.deepEqual(
    after.steps.build?.pinned?.map((p) => [p.kind, p.n]),
    [
      ['agent', 2],
      ['skill', 1],
    ],
    "the step's own record says which revisions its try ran on",
  );
});

test('a run that has filed keeps its pins: the folder edited after its first filing reaches neither the record nor the prompt', async () => {
  const t = team();
  const run = await started(t.dir, aRepo());
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  const pinned = readRun(run.id).pinned;

  fs.writeFileSync(t.agentFile, `---\nskills: ${t.skill}\n---\nSomething else entirely.\n`);
  await runWith(b.e, advanceRun(readRun(run.id)));

  assert.deepEqual(readRun(run.id).pinned, pinned, 'the pins are the ones it filed on');
  assert.doesNotMatch(promptOf(run.id, 'build'), /Something else/, 'and the prompt is the one it was rendered with');
  assert.deepEqual(
    ledgerOf('agent', t.agent).map((r) => r.n),
    [1, 2],
    'and the edit is numbered all the same, so the board can say what the run is behind on',
  );
});

test('the ledger appends only where the digest moved, and a content it already holds keeps the number it was given', async () => {
  const t = team();
  const run = await started(t.dir, aRepo());
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  assert.deepEqual(
    ledgerOf('agent', t.agent).map((r) => r.n),
    [1],
    'resolved at the start and again on the pass, with no edit, the ledger holds one entry',
  );
  assert.match(ledgerOf('agent', t.agent)[0].at, /^\d{4}-\d{2}-\d{2}T/, 'and says when it was first seen');

  const first = fs.readFileSync(t.agentFile, 'utf8');
  fs.writeFileSync(t.agentFile, `---\nskills: ${t.skill}\n---\nYou build it differently.\n`);
  await runPlaced(refreshRun(run.id));
  assert.deepEqual(
    ledgerOf('agent', t.agent).map((r) => r.n),
    [1, 2],
    'the edit takes the next number',
  );

  fs.writeFileSync(t.agentFile, first);
  const again = await started(t.dir, aRepo());
  assert.deepEqual(
    ledgerOf('agent', t.agent).map((r) => r.n),
    [1, 2],
    'and the content back as it was takes no third number',
  );
  assert.equal(pinOf(readRun(again.id).pinned, 'agent', t.agent)!.n, 1, 'a run resolving it now is pinned at the number that content has');
});

test('`nemia refresh` re-pins, and the next try is filed on the new revision with its prompt rendered again', async () => {
  const t = team();
  const run = await started(t.dir, aRepo());
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-build`, 'failed');

  fs.writeFileSync(t.agentFile, `---\nskills: ${t.skill}\n---\nYou build it differently.\n`);
  const drift = await runPlaced(refreshRun(run.id));
  assert.deepEqual(
    drift.map((d) => [d.kind, d.name, d.pinned, d.now]),
    [
      ['workflow', t.name, 1, 2],
      ['agent', t.agent, 1, 2],
    ],
    'the verb answers with the drift it was asked on, per kind',
  );

  await runWith(b.e, advanceRun(readRun(run.id)));
  assert.equal(pinOf(readRun(run.id).pinned, 'agent', t.agent)!.n, 2, 'the pass takes the new revisions');
  assert.match(promptOf(run.id, 'build'), /You build it differently/, 'and renders the prompt again');
  assert.equal(fs.existsSync(path.join(ROOT, 'runs', `${run.id}.refresh`)), false, 'the ask is spent, its file taken off');
  assert.equal(readRun(run.id).steps.build?.pinned?.[0].n, 1, 'the try that already ran keeps the revision it ran on');

  await runWith(b.e, retryRun(run.id, 'build', { mode: 'fresh' }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  assert.deepEqual(
    readRun(run.id).steps.build?.pinned?.map((p) => [p.kind, p.n]),
    [
      ['agent', 2],
      ['skill', 1],
    ],
    'and the retry is filed on them',
  );
});

test('a filing whose closeout schema has moved starts a fresh session; one whose schema has not resumes', async () => {
  const schema = { type: 'object', properties: { verdict: { type: 'string' } }, required: ['verdict'], additionalProperties: false };
  const declared = (t: Team) => `---\nplace: git\nagent: ${t.agent}\noutput: build.schema.json\n---\nBuild it.\n`;

  const kept = team();
  fs.writeFileSync(path.join(kept.dir, 'build.schema.json'), JSON.stringify(schema));
  fs.writeFileSync(kept.stepFile, declared(kept));
  const run = await started(kept.dir, aRepo());
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-build`, 'failed');
  fs.writeFileSync(kept.agentFile, `---\nskills: ${kept.skill}\n---\nYou build it differently.\n`);
  await runPlaced(refreshRun(run.id));
  await runWith(b.e, retryRun(run.id, 'build', { mode: 'nudge' }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  assert.equal(
    b.tasks.get(`${run.id}-build-try2`)!.spec.resumeFrom,
    `native-${run.id}-build`,
    'a refresh that leaves the closeout schema alone still continues the session',
  );

  const moved = team();
  fs.writeFileSync(path.join(moved.dir, 'build.schema.json'), JSON.stringify(schema));
  fs.writeFileSync(moved.stepFile, declared(moved));
  const other = await started(moved.dir, aRepo());
  const b2 = board();
  await runWith(b2.e, advanceRun(readRun(other.id)));
  b2.settle(`${other.id}-build`, 'failed');
  fs.writeFileSync(
    path.join(moved.dir, 'build.schema.json'),
    JSON.stringify({ ...schema, properties: { ...schema.properties, why: { type: 'string' } }, required: ['verdict', 'why'] }),
  );
  await runPlaced(refreshRun(other.id));
  await runWith(b2.e, retryRun(other.id, 'build', { mode: 'nudge' }));
  await runWith(b2.e, advanceRun(readRun(other.id)));
  assert.equal(
    b2.tasks.get(`${other.id}-build-try2`)!.spec.resumeFrom,
    undefined,
    'the schema moved, so try 2 is a fresh session rather than one asked in the wrong shape',
  );
});

test('`nemia refresh` refuses a run that has filed nothing, one already on the newest revision, and no such run — at shipped defaults', async () => {
  const t = team();
  const run = await started(t.dir, aRepo());
  await assert.rejects(
    () => runPlaced(refreshRun(run.id)),
    (err: Error & { exitCode?: number }) => err.exitCode === 2 && err.message.startsWith(`run ${run.id} has filed nothing yet`),
  );

  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  await assert.rejects(
    () => runPlaced(refreshRun(run.id)),
    (err: Error & { exitCode?: number }) =>
      err.exitCode === 2 && err.message.startsWith(`run ${run.id} is already on the newest revision of every kind it resolved`),
  );

  await assert.rejects(
    () => runPlaced(refreshRun('no-such-run')),
    (err: Error & { exitCode?: number }) => err.exitCode === 2 && /no such run/.test(err.message),
  );
});

test("`nemia refresh` adds and removes no step, and a run that has filed nothing takes the folder's step set whole", async () => {
  const t = team();
  const run = await started(t.dir, aRepo());
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));

  fs.writeFileSync(path.join(t.dir, 'review.md'), `---\nplace: git\nafter: build\nagent: ${t.agent}\n---\nReview it.\n`);
  await runPlaced(refreshRun(run.id));
  await runWith(b.e, advanceRun(readRun(run.id)));
  assert.deepEqual(Object.keys(readRun(run.id).steps), ['build'], 'the verb re-pins content, never a step set');

  const waiting = await started(t.dir, aRepo());
  await runWith(b.e, advanceRun(readRun(waiting.id)));
  assert.deepEqual(
    Object.keys(readRun(waiting.id).steps),
    ['build', 'review'],
    'a run that has filed nothing takes the folder as it stands, the added step included',
  );
});

test('the pure parts: a revision already given keeps its number, and the drift reads per kind and per step', () => {
  const entries = [
    { n: 1, hash: 'a', at: 'then' },
    { n: 2, hash: 'b', at: 'later' },
  ];
  assert.deepEqual(revisionNow(entries, 'a', 'now'), { n: 1, hash: 'a', at: 'then' }, 'a content the ledger holds keeps its number');
  assert.deepEqual(revisionNow(entries, 'c', 'now'), { n: 3, hash: 'c', at: 'now' }, 'a new content takes one past the highest');
  assert.deepEqual(revisionNow([], 'a', 'now'), { n: 1, hash: 'a', at: 'now' }, 'an empty ledger gives revision 1');

  const pinned: Pin[] = [{ kind: 'agent', name: 'coder', n: 5, hash: 'e' }];
  const tops: Pin[] = [{ kind: 'agent', name: 'coder', n: 6, hash: 'f' }];
  assert.deepEqual(kindsDrift(pinned, tops), [{ kind: 'agent', name: 'coder', pinned: 5, now: 6 }]);
  assert.deepEqual(kindsDrift(pinned, pinned), [], 'a pin that is the top drifts not at all');
  assert.deepEqual(kindsDrift(undefined, tops), [], 'a record written before revisions pinned nothing, and drifts not at all');
  assert.deepEqual(
    stepsDrift([['build', pinned]], tops, tops),
    [{ kind: 'agent', name: 'coder', pinned: 5, now: 6, step: 'build' }],
    'a filed step behind the top, where the run has moved past it, says which step ran on it',
  );
  assert.deepEqual(stepsDrift([['build', pinned]], pinned, tops), [], "a step whose pin is the run's is left out: the run's line says it");
  assert.notEqual(digestOf([{ a: 1 }]), digestOf([{ a: 2 }]));
  assert.equal(digestOf([{ a: 1 }]), digestOf([{ a: 1 }]), 'the digest is of the content alone');
  assert.equal(digestOf([{ a: 1 }]).length, 16);
});

test('the ledger reads as empty where its file does not read, and the tops of a kind nobody resolved are none', () => {
  assert.deepEqual(ledgerOf('workflow', 'never-resolved'), []);
  assert.deepEqual(topsOf([{ kind: 'skill', name: 'never-resolved' }]), []);
  const file = path.join(ROOT, 'revisions', 'workflow', 'broken.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'not json');
  assert.deepEqual(ledgerOf('workflow', 'broken'), [], 'a file a hand edit broke leaves every other kind readable');
});

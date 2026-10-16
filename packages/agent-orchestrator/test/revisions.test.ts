/**
 * Revisions: the ledger per kind and name, the pins a run records of what it resolved, the drift between the two, and `nemia refresh`.
 *
 * What is proven here, each at shipped defaults: a run that has filed nothing resolves the folder afresh on every pass, so an edit made
 * while it waits `--after` reaches its first step's prompt and its pins; a run that has filed keeps its freeze; the ledger appends only
 * where the digest moved; the verb re-pins and the next try is filed on the new revision with the prompt re-rendered; a filing whose
 * closeout schema has moved starts a fresh session, and one whose schema has not still resumes; a folder whose steps are a set
 * `nemia start` refuses is not taken, and a kind that stops reading between passes stops that run alone; and the verb's refusals.
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
const { addFactory, advanceRun, attachWorkflow, startRun, retryRun, runWith: runEngine } = await import('../src/runner.ts');
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
const engine = eachTest(testEngine);
const { engineOf } = await import('../src/runtime-client.ts');
const { readRun, stepsOf } = await import('../src/record/record.store.ts');
const { agentFilesDir } = await import('../src/agents/agents.store.ts');
const { ledgerOf, topsOf } = await import('../src/revisions/revisions.store.ts');
const { refreshRun } = await import('../src/revisions/pin.verb.ts');
const { writeRules } = await import('../src/rules/rules.store.ts');

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

const started = (dir: string, repo: string, how: { after?: string[]; isolate?: boolean; factory?: string } = {}) =>
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

test("the factory's rules are a kind of their own: a run in a factory pins their revision, and an edit while it waits is numbered", async () => {
  const t = team();
  const repo = aRepo();
  const factory = `factory-${t.name}`;
  addFactory({ name: factory, repos: [repo] });
  attachWorkflow({ factory, workflow: t.name });
  writeRules({ name: factory }, 'Never push on a Friday.');
  const parent = await started(team().dir, repo, { isolate: true });
  const run = await started(t.dir, repo, { after: [parent.id], isolate: true, factory });

  assert.equal(
    pinOf(readRun(run.id).pinned, 'rules', factory)!.n,
    1,
    "the run records the revision of its factory's rules, beside the rest",
  );
  assert.equal(ledgerOf('rules', factory).length, 1, 'and the ledger of the kind holds the one content it was given');

  writeRules({ name: factory }, 'Never push on a Friday, nor on a Monday.');
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));

  assert.equal(
    pinOf(readRun(run.id).pinned, 'rules', factory)!.n,
    2,
    'the rules edited while the run waits are pinned at their new revision',
  );
  assert.deepEqual(
    ledgerOf('rules', factory).map((r) => r.n),
    [1, 2],
    'which the ledger numbered as it numbers any other kind',
  );
  assert.match(promptOf(run.id, 'build'), /nor on a Monday/, "and the new rules reach the prompt the step's session reads");
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
    [1],
    'and nothing of the edit is resolved on its account: a filed run nobody asked pays for no resolve',
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
  const repo = aRepo();
  const run = await started(t.dir, repo);
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));

  fs.writeFileSync(path.join(t.dir, 'review.md'), `---\nplace: git\nafter: build\nagent: ${t.agent}\n---\nReview it.\n`);
  await runPlaced(refreshRun(run.id));
  await runWith(b.e, advanceRun(readRun(run.id)));
  assert.deepEqual(Object.keys(readRun(run.id).steps), ['build'], 'the verb re-pins content, never a step set');

  const held = team();
  const parent = await started(held.dir, repo, { isolate: true });
  const waiting = await started(t.dir, repo, { after: [parent.id], isolate: true });
  await runWith(b.e, advanceRun(readRun(waiting.id)));
  assert.deepEqual(
    Object.keys(readRun(waiting.id).steps),
    ['build', 'review'],
    'a run that has filed nothing takes the folder as it stands, the added step included',
  );

  fs.rmSync(path.join(t.dir, 'review.md'));
  await runWith(b.e, advanceRun(readRun(waiting.id)));
  assert.deepEqual(
    Object.keys(readRun(waiting.id).steps),
    ['build'],
    'and the step the folder has since dropped goes with it: the step set is the one the folder holds now',
  );
});

test('`nemia refresh` keeps a step the folder has lost since the run filed, with its whole record', async () => {
  const t = team();
  fs.writeFileSync(path.join(t.dir, 'review.md'), `---\nplace: git\nafter: build\nagent: ${t.agent}\n---\nReview it.\n`);
  const run = await started(t.dir, aRepo());
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-build`, 'succeeded', { closeout: SIGNED });
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-review`, 'failed');
  await runWith(b.e, retryRun(run.id, 'review', { mode: 'fresh' }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  const before = readRun(run.id).steps.review;
  assert.equal(before?.taskId, `${run.id}-review-try2`, 'the removed-to-be step has filed a second try');
  assert.equal(before?.tries?.length, 1, 'so its record holds the try it already ran');
  assert.ok(before?.pinned?.length, 'and the revisions that try was filed on');

  fs.rmSync(path.join(t.dir, 'review.md'));
  await runPlaced(refreshRun(run.id));
  await runWith(b.e, advanceRun(readRun(run.id)));

  const after = readRun(run.id);
  assert.deepEqual(
    stepsOf(after).map((s) => s.name),
    ['build', 'review'],
    'the verb takes new content, never a new step set: the step the folder lost after the run filed is kept',
  );
  assert.deepEqual(after.steps.review, before, "and the kept step's whole record — its task, its tries, its pins — is untouched");
});

/** A run of `t` that waits `--after` a run that never settles: one that has filed nothing, and will not file while the test edits. */
const waiting = async (t: Team, repo: string) => {
  const parent = await started(team().dir, repo, { isolate: true });
  return await started(t.dir, repo, { after: [parent.id], isolate: true });
};

test('a kind that stops reading between passes stops that run alone: it keeps the revisions it had, and the pass judges it', async () => {
  const repo = aRepo();
  const t = team();
  const run = await waiting(t, repo);
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  const before = readRun(run.id);
  const prompt = promptOf(run.id, 'build');

  fs.writeFileSync(t.agentFile, `---\nskills: ${t.skill}\n---\nYou build it differently.\n`);
  const ledger = path.join(ROOT, 'revisions', 'agent', `${t.agent}.json`);
  fs.rmSync(ledger);
  fs.mkdirSync(ledger);
  const pass = await runWith(b.e, advanceRun(readRun(run.id)));

  assert.match(
    pass.notes.join('\n'),
    /keeps the revisions it had, since resolving them did not read: EISDIR[^\n]*revisions\/agent/,
    'the pass says the run took nothing of the world, and what did not read',
  );
  assert.equal(pass.status, 'running', 'and the pass judged the run all the same, rather than dying of what did not read');
  assert.deepEqual(readRun(run.id).pinned, before.pinned, 'the run keeps the pins it had');
  assert.deepEqual(Object.keys(readRun(run.id).steps), Object.keys(before.steps), 'and the step set it froze');
  assert.equal(promptOf(run.id, 'build'), prompt, 'and the prompt its next filing reads, since the record is changed after the render');
});

test('a run that has filed nothing keeps the step set it froze where the folder holds a set `nemia start` refuses', async () => {
  const repo = aRepo();
  const t = team();
  fs.writeFileSync(t.stepFile, `---\nplace: git\nagent: ${t.agent}\ncheck: echo ok\n---\nBuild it.\n`);
  const run = await waiting(t, repo);
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));

  fs.writeFileSync(path.join(t.dir, 'build-check.md'), `---\nplace: git\nafter: build\nagent: ${t.agent}\n---\nCheck it.\n`);
  const pass = await runWith(b.e, advanceRun(readRun(run.id)));

  assert.deepEqual(
    Object.keys(readRun(run.id).steps),
    ['build'],
    "a step named for build's check is no step set to file: the run keeps the one it froze",
  );
  assert.match(
    pass.notes.join('\n'),
    /keeps the step set it froze: build-check: a step may not be named for another step's check/,
    'and the pass says why, in the words `nemia start` refuses that folder with',
  );
});

/** What a loop's target owes from round 2 on: an answer to each finding it was handed. */
const ANSWERED = [{ finding: 'build.md:1', answer: 'fixed', why: 'built it again' }];

/** A closeout schema of one required field, as a step's `output:` names one beside the folder. */
const schemaOf = (field: string): object => ({
  type: 'object',
  properties: { [field]: { type: 'string' } },
  required: [field],
  additionalProperties: false,
});

test("a step that continues another step's session is judged by its own closeout schema, never by the schema of the step it resumes", async () => {
  const t = team();
  fs.writeFileSync(
    path.join(t.dir, 'write.md'),
    `---\nplace: git\nafter: build\nresume: build\noutput: write.schema.json\n---\nWrite it up.\n`,
  );
  fs.writeFileSync(path.join(t.dir, 'write.schema.json'), JSON.stringify(schemaOf('wrote')));
  const run = await started(t.dir, aRepo());
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-build`, 'succeeded', { closeout: SIGNED });
  await runWith(b.e, advanceRun(readRun(run.id)));

  const filed = readRun(run.id);
  assert.notEqual(
    filed.steps.build?.closeoutHash,
    filed.steps.write?.closeoutHash,
    'build declares no closeout schema and write declares one, so their digests differ',
  );
  assert.equal(
    b.tasks.get(`${run.id}-write`)!.spec.resumeFrom,
    b.tasks.get(`${run.id}-build`)!.attempt?.nativeId,
    "write continues build's session all the same: what is compared is the schema write itself was last filed with, and it has none yet",
  );
});

test('a round files its target on the closeout schema the folder declares now: continued where it has not moved, fresh where it has', async () => {
  const t = team();
  fs.writeFileSync(t.stepFile, `---\nplace: git\nagent: ${t.agent}\noutput: build.schema.json\n---\nBuild it.\n`);
  fs.writeFileSync(path.join(t.dir, 'build.schema.json'), JSON.stringify(schemaOf('built')));
  fs.writeFileSync(
    path.join(t.dir, 'review.md'),
    `---\nplace: git\nafter: build\nloop: build\nrounds: 3\noutput: review.schema.json\n---\nReview it.\n`,
  );
  fs.writeFileSync(
    path.join(t.dir, 'review.schema.json'),
    JSON.stringify({ type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false }),
  );
  const run = await started(t.dir, aRepo());
  const b = board();

  const filed = async (step: string): Promise<string> => {
    for (let passes = 0; passes < 6; passes += 1) {
      const taskId = readRun(run.id).steps[step]?.taskId;
      if (taskId) return taskId;
      await runWith(b.e, advanceRun(readRun(run.id)));
    }
    throw new Error(`${step} was never filed: ${JSON.stringify(readRun(run.id).steps)}`);
  };

  const first = await filed('build');
  b.settle(first, 'succeeded', { closeout: { ...SIGNED, built: 'once' } });
  b.settle(await filed('review'), 'succeeded', { closeout: { ...SIGNED, again: true } });
  await runWith(b.e, advanceRun(readRun(run.id)));

  const second = await filed('build');
  assert.notEqual(second, first, 'the round files build again, under its next try');
  assert.equal(
    b.tasks.get(second)!.spec.resumeFrom,
    b.tasks.get(first)!.attempt?.nativeId,
    'it continues the session it ran, its own closeout schema unmoved',
  );

  b.settle(second, 'succeeded', { closeout: { ...SIGNED, built: 'twice', replies: ANSWERED } });
  const reviewing = await filed('review');
  fs.writeFileSync(path.join(t.dir, 'build.schema.json'), JSON.stringify(schemaOf('builtAgain')));
  const drift = await runPlaced(refreshRun(run.id));
  assert.ok(drift.length, 'the schema beside the step moves the folder on, which the refresh takes');
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(reviewing, 'succeeded', { closeout: { ...SIGNED, again: true } });
  await runWith(b.e, advanceRun(readRun(run.id)));

  const third = await filed('build');
  assert.notEqual(third, second, 'the second round files build again');
  assert.equal(
    b.tasks.get(third)!.spec.resumeFrom,
    undefined,
    'and asks a fresh session, since the schema it is now given is not the one its last try answered in',
  );
});

test('the pure parts: a revision already given keeps its number, a gap gives no number twice, and the drift reads per kind and per step', () => {
  const entries = [
    { n: 1, hash: 'a', at: 'then' },
    { n: 2, hash: 'b', at: 'later' },
  ];
  assert.deepEqual(revisionNow(entries, 'a', 'now'), { n: 1, hash: 'a', at: 'then' }, 'a content the ledger holds keeps its number');
  assert.deepEqual(revisionNow(entries, 'c', 'now'), { n: 3, hash: 'c', at: 'now' }, 'a new content takes one past the highest');
  assert.deepEqual(revisionNow([], 'a', 'now'), { n: 1, hash: 'a', at: 'now' }, 'an empty ledger gives revision 1');
  assert.deepEqual(
    revisionNow(
      [
        { n: 1, hash: 'a', at: 'then' },
        { n: 3, hash: 'c', at: 'later' },
      ],
      'd',
      'now',
    ),
    { n: 4, hash: 'd', at: 'now' },
    'a ledger with a gap in it — an entry that did not decode, or a hand edit — gives one past its highest, never its count, which would give a number twice',
  );

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

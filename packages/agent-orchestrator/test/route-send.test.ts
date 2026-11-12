/**
 * A route to a workflow, as a person meets it: a condition routes to a workflow node, which files one queued card `<run>-<node>-routed`
 * with `workflow:` and `from:`, the node reads `sent`, and no pass — a second one, or one after a crash between the filing and the record —
 * files a second card; the caller's result is then what the condition read. And `nemia route`: a person's route wins over the table,
 * refused off the route list, on a step that is no condition, and once a node after the condition is filed or sent. And a gated table
 * condition on the tests' team, approved with `nemia approve` once its table answered, which sends its workflow node. Each story one test
 * on the stage (`story.ts`).
 *
 * The store is the file's own, at `ROOT`, given as `ENV`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { staged, story } from './story.ts';
import { TEAM } from './team.ts';
import { advanceRun, startRun, startFromInbox, runWith, list } from '../src/runner.ts';
import { artifactsDir, inputsDir, runRecord, rewriteRun } from '../src/record/record.store.ts';
import { mountHolds, readsAt, writesAt, type Filed } from './mounted.ts';
import { resultSteps } from '../src/branches/branches.ts';
import { stepsOf } from '../src/steps/steps.verb.ts';
import { inboxAt } from '../src/cards/cards.store.ts';
import { filesStoreAt } from '../src/record/files.store.ts';
import { parseInboxCard } from '../src/inbox/inbox.ts';
import { engineOf } from '../src/runtime-client.ts';
import { main } from '../src/cli/main.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-route-send-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_DEFAULT_FACTORY_STARTS: '1', WF_MAX_CONCURRENT: undefined, WF_MAX_RUNS: undefined };
process.env.NEMIA_DAEMON_START = 'off';
const stage = staged({ runWith, main, engineOf, env: ENV });
const files = filesStoreAt(ROOT);

const SCHEMA = JSON.stringify({
  type: 'object',
  properties: { surface: { type: 'string', enum: ['web', 'docs'] }, title: { type: ['string', 'null'] } },
  required: ['surface', 'title'],
  additionalProperties: false,
});

/** plan → triage (a table over plan's surface: web routes on to `build`, docs ends) → ship, the workflow node on `deliver`. */
const folder = (): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  const files: Record<string, string> = {
    'plan.md': '---\nplace: git\noutput: plan.schema.json\n---\nplan it\n',
    'plan.schema.json': SCHEMA,
    'triage.md':
      '---\nplace: git\nafter: plan\nroutes: [build, docs]\nroute: { from: plan.surface, table: { web: build, docs: docs } }\nends: [docs]\n---\nroute it\n',
    'ship.md': '---\nplace: git\nafter: triage\nwhen: [build]\nworkflow: deliver\n---\nsend it on\n',
  };
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
};

const started = async (inputs: readonly string[] = []) => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, { 'a.txt': 'one\n' });
  return stage.runPlaced(startRun({ brief: 'add a flag', repo, workflowDir: folder(), inputs }));
};

const pass = (id: string) => stage.runWith(stage.board().e, advanceRun(runRecord(ROOT, id)));

/** The inbox's cards, by file. */
const cards = (): string[] => (fs.existsSync(inboxAt(ROOT)) ? fs.readdirSync(inboxAt(ROOT)).filter((f) => f.endsWith('.md')) : []);

/**
 * A run whose plan has signed off on `surface`, which triage's table routes by, and on the routed card's `title`, null when none is
 * given; labelled with `labels` when given.
 */
const planned = async (surface: string, given: { title?: string; labels?: Record<string, string>; inputs?: readonly string[] } = {}) => {
  const run = await started(given.inputs);
  if (given.labels) files.labels.put(run.id, given.labels);
  assert.deepEqual((await pass(run.id)).filed, ['plan']);
  stage.board().settle(`${run.id}-plan`, 'succeeded', {
    outcome: 'done',
    summary: 'planned',
    artifacts: [],
    needs: null,
    surface,
    title: given.title ?? null,
  });
  return run.id;
};

/** The routed card of a run's `ship` node, read as the inbox reads a card. */
const routedCard = (id: string) => {
  const file = `${id}-ship-routed.md`;
  return parseInboxCard(file, fs.readFileSync(path.join(inboxAt(ROOT), file), 'utf8'));
};

/** What `nemia ls <id>` words each step. */
const words = async (id: string) =>
  Object.fromEntries(
    (await stage.runWith(stage.board().e, list(stage.board().e, runRecord(ROOT, id)))).steps.map((s) => [s.name, s.message]),
  );

/** The refusal's kind and exit code, never its sentence. */
const refusedAs = (tag: string) => (err: Error & { _tag?: string; exitCode?: number }) => {
  assert.equal(err._tag, tag);
  assert.equal(err.exitCode, 2);
  return true;
};

test('a condition that routes to a workflow node files one queued card, and no pass files a second', async (t) => {
  const s = story(t);
  const id = await planned('web');
  const card = `${id}-ship-routed`;

  await s.test('the pass files the card with workflow: and from:, and the node reads sent', async () => {
    const before = cards().length;
    await pass(id);
    assert.equal(cards().length, before + 1);
    const text = fs.readFileSync(path.join(inboxAt(ROOT), `${card}.md`), 'utf8');
    assert.match(text, /^workflow: deliver$/m);
    assert.match(text, new RegExp(`^from: ${id}$`, 'm'));
    assert.match(text, /^queued: /m);
    assert.equal(runRecord(ROOT, id).steps.ship?.sent?.card, card);
    assert.equal((await words(id)).ship, `sent → ${card}`);
  });

  await s.test('a second pass files no second card', async () => {
    const before = cards().length;
    const at = runRecord(ROOT, id).steps.ship?.sent?.at;
    await pass(id);
    assert.equal(cards().length, before);
    assert.equal(runRecord(ROOT, id).steps.ship?.sent?.at, at);
  });

  await s.test('a pass after a crash between the filing and the record adopts the card', async () => {
    const run = runRecord(ROOT, id);
    const { sent: _gone, ...rest } = run.steps.ship ?? { taskId: null };
    run.steps.ship = rest;
    rewriteRun(ROOT, run);
    const before = cards().length;
    await pass(id);
    assert.equal(cards().length, before);
    assert.equal(runRecord(ROOT, id).steps.ship?.sent?.card, card);
  });

  await s.test("the caller's result is what the condition read", async () => {
    const run = runRecord(ROOT, id);
    const steps = await stage.runPlaced(stepsOf(run));
    assert.deepEqual(
      resultSteps(steps, run).map((x) => x.name),
      ['plan'],
    );
  });

  await s.test('nemia route is refused once the node after the condition is sent', async () => {
    await assert.rejects(stage.main(['route', id, 'triage', 'docs']), refusedAs('Conflict'));
  });
});

test('nemia route: refused off the list and on a step that is no condition, accepted before, and it wins over the table', async (t) => {
  const s = story(t);
  const id = await planned('web');

  await s.test('a route not in routes: is refused', async () => {
    await assert.rejects(stage.main(['route', id, 'triage', 'nope']), refusedAs('Invalid'));
  });

  await s.test('a step that is no condition is refused', async () => {
    await assert.rejects(stage.main(['route', id, 'plan', 'build']), refusedAs('Invalid'));
  });

  await s.test("the person's route wins over the table's: docs ends the run and ship is skipped", async () => {
    await stage.main(['route', id, 'triage', 'docs']);
    await pass(id);
    assert.equal(runRecord(ROOT, id).steps.ship?.sent, undefined);
    assert.equal((await words(id)).ship, 'skipped (triage: docs)');
    assert.ok(!cards().includes(`${id}-ship-routed.md`));
  });
});

test("a routed card takes its title from the producer's closeout, else the run's, and carries the run's labels", async (t) => {
  const s = story(t);
  const labels = { area: 'src', work: 'feature', initiative: 'routing' };

  await s.test("a producer that signs off on a title names the card by it, the run's labels on it", async () => {
    const id = await planned('web', { title: 'src: examples are found by running', labels });
    await pass(id);
    const card = routedCard(id);
    assert.equal(card.body.split('\n')[0], 'src: examples are found by running');
    assert.deepEqual(card.labels, labels);
    assert.equal(card.workflow, 'deliver');
    assert.deepEqual(card.from, [id]);
  });

  await s.test("a producer that signs off on no title leaves the run's title on the card, the run's labels on it", async () => {
    const id = await planned('web', { labels });
    await pass(id);
    const card = routedCard(id);
    assert.equal(card.body.split('\n')[0], 'add a flag');
    assert.deepEqual(card.labels, labels);
  });

  await s.test('a run with no labels files a card with none', async () => {
    const id = await planned('web');
    await pass(id);
    assert.equal(routedCard(id).labels, undefined);
  });
});

test("the run a routed card starts mounts the caller's artifacts and inputs read-only on every step, and each brief names them", async (t) => {
  const s = story(t);
  const notes = path.join(fs.mkdtempSync(path.join(ROOT, 'given-')), 'notes.md');
  fs.writeFileSync(notes, 'the rows\n');
  const id = await planned('web', { inputs: [notes] });
  const repo = runRecord(ROOT, id).repo ?? '';
  const deliver = path.join(repo, 'workflows', 'deliver');
  fs.mkdirSync(deliver, { recursive: true });
  fs.writeFileSync(path.join(deliver, 'implement.md'), '---\nplace: git\n---\nbuild it\n');
  fs.writeFileSync(path.join(deliver, 'review.md'), '---\nplace: git\nafter: implement\n---\nreview it\n');
  await pass(id);
  const card = runRecord(ROOT, id).steps.ship?.sent?.card ?? '';
  const artifacts = path.dirname(artifactsDir(ROOT, runRecord(ROOT, id), 'plan'));
  const inputs = inputsDir(ROOT, runRecord(ROOT, id));
  let routed = '';

  const handedTo = (name: string) => {
    const spec = stage.board().specs.find((x) => x.id === `${routed}-${name}`);
    assert.ok(spec, `${name} is filed`);
    const config = spec.config as Filed;
    for (const folder of [artifacts, inputs])
      assert.ok(mountHolds(config, `${folder}/x`, true), `${folder} is mounted read-only: ${JSON.stringify(config.mounts)}`);
    assert.ok(readsAt(config, path.join(inputs, 'notes.md')), "the caller's input is read");
    assert.ok(readsAt(config, path.join(artifacts, 'plan', 'closeout.json')), "the caller's plan folder is read");
    assert.ok(!writesAt(config, path.join(inputs, 'notes.md')), "the caller's input is never written");
    const named = spec.brief.split('## What was asked for')[1]?.split('\n## ')[0] ?? '';
    assert.ok(named.includes(artifacts) && named.includes(inputs), 'the mount line under what was asked for names both folders');
  };

  await s.test(
    'the card starts as the tick starts one, and the pass files its root with the caller folders mounted read-only',
    async () => {
      assert.ok(card, 'the card was sent');
      routed = (await stage.runPlaced(startFromInbox({ name: card, callerRepo: repo }))).run.id;
      assert.deepEqual(runRecord(ROOT, routed).context, [id], 'handed the caller as context');
      await pass(routed);
      handedTo('implement');
    },
  );

  await s.test('the step after the root is filed with the same folders, not the root alone', async () => {
    stage.board().settle(`${routed}-implement`, 'succeeded', { outcome: 'done', summary: 'built', artifacts: [], needs: null });
    await pass(routed);
    handedTo('review');
  });
});

test("a gated table condition on the tests' team: its producer signs off, a person approves it, and its workflow node is sent", async (t) => {
  const s = story(t);
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, { 'a.txt': 'one\n' });
  const run = await stage.runPlaced(startRun({ brief: 'add a flag', repo, workflowDir: path.join(TEAM, 'triage'), gates: ['triage'] }));
  const id = run.id;

  await s.test('plan is filed, and signs off on the board', async () => {
    assert.deepEqual((await pass(id)).filed, ['plan']);
    const closeout = { outcome: 'done', summary: 'planned', artifacts: [], needs: null, findings: [], again: false, surface: 'web' };
    stage.board().settle(`${id}-plan`, 'succeeded', closeout);
  });

  await s.test('the pass files nothing after triage, which nemia ls says waits at its gate on you', async () => {
    const after = await pass(id);
    assert.deepEqual(after.filed, []);
    const listed = await stage.runWith(stage.board().e, list(stage.board().e, runRecord(ROOT, id)));
    assert.equal(listed.steps.find((x) => x.name === 'triage')?.message, 'awaiting approval · proposes web');
    assert.deepEqual(listed.waitingOnYou, ['triage']);
  });

  await s.test('nemia approve <run> triage is accepted', async () => {
    await stage.main(['approve', id, 'triage']);
    assert.ok(runRecord(ROOT, id).approvals?.some((a) => a.step === 'triage' && a.try === 1));
  });

  await s.test('the next pass files build-web and sends handoff its card', async () => {
    const after = await pass(id);
    assert.ok(after.filed.includes('build-web'), JSON.stringify(after.filed));
    assert.equal(runRecord(ROOT, id).steps.handoff?.sent?.card, `${id}-handoff-routed`);
    assert.equal((await words(id))['build-backend'], 'skipped (triage: web)');
  });

  await s.test('a second approval is refused, as the try is already approved', async () => {
    await assert.rejects(stage.main(['approve', id, 'triage']), refusedAs('Conflict'));
  });
});

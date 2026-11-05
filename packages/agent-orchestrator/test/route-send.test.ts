/**
 * A route to a workflow, as a person meets it: a condition routes to a workflow node, which files one queued card `<run>-<node>-routed`
 * with `workflow:` and `from:`, the node reads `sent`, and no pass — a second one, or one after a crash between the filing and the record —
 * files a second card; the caller's result is then what the condition read. And `nemia route`: a person's route wins over the table,
 * refused off the route list, on a step that is no condition, and once a node after the condition is filed or sent. Each story one test
 * on the stage (`story.ts`).
 *
 * `WF_ROOT` is set before the runner is imported, which reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { staged, story } from './story.ts';

const ROOT = scratch('wf-route-send-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
process.env.NEMIA_DAEMON_START = 'off';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { advanceRun, startRun, startFromInbox, runWith, list } = await import('../src/runner.ts');
const { artifactsDir, readRun, rewriteRun } = await import('../src/record/record.store.ts');
const { resultSteps } = await import('../src/branches/branches.ts');
const { stepsOf } = await import('../src/steps/steps.verb.ts');
const { inboxAt } = await import('../src/cards/cards.store.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { main } = await import('../src/cli/main.ts');
const stage = staged({ runWith, main, engineOf });

const SCHEMA = JSON.stringify({
  type: 'object',
  properties: { surface: { type: 'string', enum: ['web', 'docs'] } },
  required: ['surface'],
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

const started = async () => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, { 'a.txt': 'one\n' });
  return stage.runPlaced(startRun({ brief: 'add a flag', repo, workflowDir: folder() }));
};

const pass = (id: string) => stage.runWith(stage.board().e, advanceRun(readRun(id)));

/** The inbox's cards, by file. */
const cards = (): string[] => (fs.existsSync(inboxAt(ROOT)) ? fs.readdirSync(inboxAt(ROOT)).filter((f) => f.endsWith('.md')) : []);

/** A run whose plan has signed off on `surface`, which triage's table routes by. */
const planned = async (surface: string) => {
  const run = await started();
  assert.deepEqual((await pass(run.id)).filed, ['plan']);
  stage.board().settle(`${run.id}-plan`, 'succeeded', { outcome: 'done', summary: 'planned', artifacts: [], needs: null, surface });
  return run.id;
};

/** What `nemia ls <id>` words each step. */
const words = async (id: string) =>
  Object.fromEntries((await stage.runWith(stage.board().e, list(stage.board().e, readRun(id)))).steps.map((s) => [s.name, s.message]));

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
    assert.equal(readRun(id).steps.ship?.sent?.card, card);
    assert.equal((await words(id)).ship, `sent → ${card}`);
  });

  await s.test('a second pass files no second card', async () => {
    const before = cards().length;
    const at = readRun(id).steps.ship?.sent?.at;
    await pass(id);
    assert.equal(cards().length, before);
    assert.equal(readRun(id).steps.ship?.sent?.at, at);
  });

  await s.test('a pass after a crash between the filing and the record adopts the card', async () => {
    const run = readRun(id);
    const { sent: _gone, ...rest } = run.steps.ship ?? { taskId: null };
    run.steps.ship = rest;
    rewriteRun(run);
    const before = cards().length;
    await pass(id);
    assert.equal(cards().length, before);
    assert.equal(readRun(id).steps.ship?.sent?.card, card);
  });

  await s.test("the caller's result is what the condition read", async () => {
    const run = readRun(id);
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
    assert.equal(readRun(id).steps.ship?.sent, undefined);
    assert.equal((await words(id)).ship, 'skipped (triage: docs)');
    assert.ok(!cards().includes(`${id}-ship-routed.md`));
  });
});

test("the run a routed card starts mounts the caller's result folders read-only on its root, and its brief names them", async (t) => {
  const s = story(t);
  const id = await planned('web');
  const repo = readRun(id).repo ?? '';
  const deliver = path.join(repo, 'workflows', 'deliver');
  fs.mkdirSync(deliver, { recursive: true });
  fs.writeFileSync(path.join(deliver, 'implement.md'), '---\nplace: git\n---\nbuild it\n');
  await pass(id);
  const card = readRun(id).steps.ship?.sent?.card ?? '';
  const plan = artifactsDir(readRun(id), 'plan');

  await s.test('the card starts as the tick starts one, and the pass files its root with the caller folder mounted read-only', async () => {
    assert.ok(card, 'the card was sent');
    const routed = (await stage.runPlaced(startFromInbox({ name: card, callerRepo: repo }))).run.id;
    assert.deepEqual(readRun(routed).context, [id], 'handed the caller as context');
    await pass(routed);
    const spec = stage.board().specs.find((x) => x.id === `${routed}-implement`);
    assert.ok(spec, 'the root is filed');
    const mounts = (spec.config as { mounts?: { path: string; readOnly?: boolean }[] }).mounts ?? [];
    assert.ok(
      mounts.some((m) => m.path === plan && m.readOnly === true),
      JSON.stringify(mounts),
    );
    const named = spec.brief.split('## What was asked for')[1]?.split('\n## ')[0] ?? '';
    assert.ok(named.includes(plan), "the mount line under what was asked for names the caller's folder");
  });
});

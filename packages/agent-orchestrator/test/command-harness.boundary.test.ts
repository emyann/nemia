/**
 * The runtime's command harness on the daemon's own engine (`engine(env)`, built from `HARNESSES`), never the stand-in, which takes any
 * harness: a need's fix (`startFix`) and a script condition (`fileScripts`, through a run's pass) are each filed on it and run to their
 * end — the fix's output read back as it succeeded, the condition's answer taken as its route. An engine whose harnesses had no
 * `command` refused both at their filing, and every fix on a daemon with it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { until, WAITED, type Waiter } from 'agent-runtime/testing';
import { scratch } from 'test-kit/scratch';
import type { Need } from 'objects';
import { testPlace } from '../place/memory/index.ts';
import { declared } from '../place/memory/place.ts';
import { eachTest, runOver } from './placed.ts';
import { engine, runWith, type Engine } from '../src/runtime-client.ts';
import { advanceRun, startRun, runWith as runEngine } from '../src/runner.ts';
import { runRecord } from '../src/record/record.store.ts';
import { main as cli } from '../src/cli/main.ts';
import { engineOf } from '../src/runtime-client.ts';
import { PlaceService } from '../src/place/place.store.ts';
import { fixOf, startFix } from '../src/needs/fix.verb.ts';
import { staged } from './story.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-command-harness-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
const ENV: Env = {
  ...process.env,
  WF_ROOT: ROOT,
  WF_VERIFY_REST: '1',
  WF_MAX_CONCURRENT: '4',
  WF_MAX_RUNS: undefined,
  WF_DEFAULT_FACTORY_STARTS: '1',
};

/** A need of the machine, fixed by a command that prints what it did and needs no answer. */
const TOOL: Need = {
  name: 'tool',
  message: 'the tool is installed',
  check: 'exit 1',
  fixes: [{ command: 'echo installed', message: 'install it' }],
};

const stand = eachTest(testPlace);
const stage = staged({ runWith: runEngine, main: cli, engineOf, env: ENV });

/** Tick `e` until the task `id` has settled, and answer its view. */
const settled = (t: Waiter, e: Engine, id: string) => {
  let phase = '';
  return until(
    t,
    async () => {
      await Effect.runPromise(e.tick());
      const v = await Effect.runPromise(e.view(id));
      phase = v.phase;
      return Boolean(v.state.settled) && v;
    },
    () => `${id} settled; phase ${phase}`,
    { everyMs: 150 },
  );
};

test("LIVE: a need's fix is filed on the daemon's engine, runs on its command harness, and reads back succeeded", WAITED, async (t) => {
  const e = engine(ENV);
  const run = runOver(runWith, () => PlaceService.layer({ ...stand().place, declared: { ...declared, needs: [TOOL] } }), ENV);
  const fix = await run(e, startFix({ need: 'tool' }));
  assert.equal(fix.phase, 'pending');
  const v = await settled(t, e, fix.id);
  assert.equal(v.state.settled, 'succeeded');
  const ended = await run(e, fixOf(fix.id));
  assert.equal(ended.phase, 'succeeded');
  assert.equal(ended.exitCode, 0);
  assert.equal(ended.output, 'installed\n');
});

test(
  "LIVE: a script condition is filed on the daemon's engine, runs on its command harness, and its answer is taken as its route",
  WAITED,
  async (t) => {
    const e = engine(ENV);
    const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
    const write = (name: string, lines: string[]) =>
      fs.writeFileSync(path.join(dir, `${name}.md`), `---\n${['place: git', ...lines].join('\n')}\n---\n${name} it\n`);
    write('pick', ['routes: [web, docs]', 'route: { script: pick.ts }']);
    write('web', ['after: pick', 'when: [web]']);
    write('docs', ['after: pick', 'when: [docs]']);
    fs.writeFileSync(
      path.join(dir, 'pick.ts'),
      "import fs from 'node:fs';\nfs.writeFileSync(process.env.WF_ANSWER ?? '', JSON.stringify({ route: 'docs', why: 'a page of docs' }));\n",
    );
    const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
    stage.place().world.repository(repo, {});
    const { id } = await stage.runPlaced(startRun({ brief: 'route it', repo, workflowDir: dir }));

    await stage.runWith(e, advanceRun(runRecord(ROOT, id)));
    assert.equal(runRecord(ROOT, id).steps.pick?.taskId, `${id}-pick`, 'the condition is filed on the engine');
    const v = await settled(t, e, `${id}-pick`);
    assert.equal(v.state.settled, 'succeeded');

    await stage.runWith(e, advanceRun(runRecord(ROOT, id)));
    assert.deepEqual(runRecord(ROOT, id).steps.pick?.route, { route: 'docs', try: 1, by: 'script' });
  },
);

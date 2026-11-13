/**
 * A run handed an earlier run (`nemia start --from`), as a person meets it: every step of it, not its roots alone, is filed with the
 * earlier run's `artifacts/` and `inputs/` read-only, so a session that cannot read the store finds the earlier design's closeout by a
 * search under the mounted path, which its brief names; a run handed one whose folders are gone since is filed with no mount of them, and
 * told so. One story on the stage (`story.ts`); a step on a remote agent is filed no mount (`noneOffThisMachine`,
 * contracts/handed-runs.contract.ts).
 *
 * The store is the file's own, at `ROOT`, given as `ENV`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { staged, story } from './story.ts';
import { advanceRun, runWith } from '../src/runner.ts';
import { artifactsDir, inputsDir, runRecord } from '../src/record/record.store.ts';
import { engineOf } from '../src/runtime-client.ts';
import { main } from '../src/cli/main.ts';
import { mountHolds, readsAt, writesAt, type Filed } from './mounted.ts';
import type { Env } from '../src/config/config.store.ts';
import { factsOf, typed } from './typed.ts';
import type { Started } from '../src/start/commands.verb.ts';
import { COMMAND_WORDS } from 'objects';
import type { Place } from '../src/runner.ts';
import type { Engine } from '../src/cli/flags.ts';

const ROOT = scratch('wf-handed-runs-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
const ENV: Env = {
  ...process.env,
  WF_ROOT: ROOT,
  WF_VERIFY_REST: '1',
  WF_DEFAULT_FACTORY_STARTS: '1',
  WF_MAX_CONCURRENT: undefined,
  WF_MAX_RUNS: undefined,
  NEMIA_DAEMON_START: 'off',
};
/**
 * A command line as a person types it: a verb the client holds (`objects`' `COMMAND_WORDS`) run on its entry's handler (`typed`), as the
 * api runs it; any other through this CLI's `main`.
 */
const typedOrMain = (argv: string[], e?: Engine, _demand?: unknown, place?: Place, env?: Env): Promise<unknown> =>
  COMMAND_WORDS.some((w) => w.name === argv[0]) ? typed(argv, e, undefined, place, env) : main(argv, e, undefined, place, env);
const stage = staged({ runWith, main: typedOrMain, engineOf, env: ENV });

/** A repository of the stage's place with one file, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, { 'a.txt': 'one\n' });
  return repo;
};

/** A workflow folder of these steps, each `place: git`, by name to its own keys. */
const folderOf = (steps: Record<string, string>): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  for (const [name, own] of Object.entries(steps))
    fs.writeFileSync(path.join(dir, `${name}.md`), `---\nplace: git\n${own}---\n${name} it\n`);
  return dir;
};

/** What `nemia start <argv>` answered, with the facts the client words. */
const answeredBy = async (argv: string[]) => factsOf((await stage.main(argv)) as Started);

/** The id `nemia <argv>` started. */
const startedBy = async (argv: string[]) => (await answeredBy(argv)).id;

const pass = (id: string) => stage.runWith(stage.board().e, advanceRun(runRecord(ROOT, id)));

/** The step `name` of run `id` as the pass filed it. */
const filedStep = (id: string, name: string) => {
  const spec = stage.board().specs.find((x) => x.id === `${id}-${name}`);
  assert.ok(spec, `${name} is filed`);
  return { config: spec.config as Filed, brief: spec.brief };
};

test('a run started --from an earlier run reads its artifacts and inputs on every step, and is told once they are gone', async (t) => {
  const s = story(t);
  const repo = aRepo();
  const given = path.join(fs.mkdtempSync(path.join(ROOT, 'given-')), 'rows-C.md');
  fs.writeFileSync(given, 'the rows\n');
  const earlier = await startedBy(['start', 'design it', '--workflows', folderOf({ design: '' }), '--repo', repo, '--input', given]);
  const design = artifactsDir(ROOT, runRecord(ROOT, earlier), 'design');
  fs.mkdirSync(design, { recursive: true });
  fs.writeFileSync(path.join(design, 'closeout.json'), '{"outcome":"done","summary":"designed, not built"}\n');
  const artifacts = path.dirname(design);
  const inputs = inputsDir(ROOT, runRecord(ROOT, earlier));
  let id = '';

  await s.test(
    "every step's first filing reads the earlier run's design closeout and its input, writes neither, and is told where",
    async () => {
      const started = await answeredBy([
        'start',
        'build what it designed',
        '--workflows',
        folderOf({ implement: '', review: 'after: implement\n' }),
        '--repo',
        repo,
        '--no-worktree',
        '--from',
        earlier,
      ]);
      id = started.id;
      assert.deepEqual(runRecord(ROOT, id).context, [earlier]);
      assert.deepEqual(
        [started.facts.context, started.landed ?? []],
        [[earlier], []],
        'the start says the run it reads as context, still in flight, not landed',
      );
      assert.deepEqual((await pass(id)).filed, ['implement']);
      stage.board().settle(`${id}-implement`, 'succeeded', { outcome: 'done', summary: 'built', artifacts: [], needs: null });
      assert.deepEqual((await pass(id)).filed, ['review']);
      for (const name of ['implement', 'review']) {
        const { config, brief } = filedStep(id, name);
        assert.ok(readsAt(config, path.join(design, 'closeout.json')), `${name} reads the design closeout`);
        assert.ok(readsAt(config, path.join(inputs, 'rows-C.md')), `${name} reads the earlier run's input`);
        assert.ok(!writesAt(config, path.join(design, 'closeout.json')), `${name} writes nothing of the earlier run`);
        assert.ok(brief.includes(`\`${artifacts}/**\``), `${name}'s brief says to search under the mounted path`);
      }
    },
  );

  await s.test('a run handed one whose folders are gone since is filed with no mount of them, and told so', async () => {
    const after = await startedBy([
      'start',
      'check it',
      '--workflows',
      folderOf({ check: '' }),
      '--repo',
      repo,
      '--no-worktree',
      '--from',
      id,
    ]);
    fs.rmSync(path.join(ROOT, 'runs', id), { recursive: true, force: true });
    assert.deepEqual((await pass(after)).filed, ['check']);
    const { config, brief } = filedStep(after, 'check');
    const gone = path.join(ROOT, 'runs', id, 'artifacts');
    assert.ok(!mountHolds(config, `${gone}/x`, true), 'no folder that is gone is mounted');
    assert.ok(brief.includes(`handed run ${id}, whose folders are no longer in the store`), 'the brief says they are gone');
    assert.ok(!brief.includes(`\`${gone}/**\``), 'and sends the step to no folder that is gone');
  });
});

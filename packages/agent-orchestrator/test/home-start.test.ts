/**
 * Where a step's session starts, from `nemia start` to the tick's filings — a person's story on the stage (`story.ts`). A factory whose
 * tree holds a home (`home/CLAUDE.md`), its worked-on repository switched to load its memory files: the start freezes the home under
 * `runs/<id>/home/<hex>/` and records `homeFiles` and the switches (`worked`); the first filing of implement starts its session in that
 * copy, its workspace added beside it; and a try of it starts there again. What `filedConfig` makes of a home, row by row, is
 * `src/filed/session-start/session-start.test.ts`.
 *
 * The store is the file's own, at `ROOT`, given as `ENV`.
 */
import { beforeAll, describe, test } from 'vitest';
import { teardowns } from 'test-kit/checkpoints';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { teamCopy } from './team.ts';
import { staged, story } from './story.ts';
import { advanceRun, retryRun, runWith } from '../src/runner.ts';
import { addFactoryAt, attachWorkflowAt } from '../src/factory/factory.store.ts';
import { engineOf } from '../src/runtime-client.ts';
import { runRecord } from '../src/record/record.store.ts';
import { homeFilesDir } from '../src/frozen/frozen.store.ts';
import { main } from '../src/cli/main.ts';
import type { Env } from '../src/config/config.store.ts';
import { factsOf, typed as onHandler } from './typed.ts';
import type { Started } from '../src/start/commands.verb.ts';
import { COMMAND_WORDS } from 'objects';
import type { Place } from '../src/runner.ts';
import type { Engine } from '../src/cli/flags.ts';

const ROOT = scratch('wf-home-start-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1', WF_MAX_RUNS: '100' };
/**
 * A command line as a person types it: a verb the client holds (`objects`' `COMMAND_WORDS`) run on its entry's handler (`typed`), as the
 * api runs it; any other through this CLI's `main`.
 */
const typedOrMain = (argv: string[], e?: Engine, _demand?: unknown, place?: Place, env?: Env) =>
  (COMMAND_WORDS.some((w) => w.name === argv[0])
    ? onHandler(argv, e, undefined, place, env)
    : main(argv, e, undefined, place, env)) satisfies Promise<unknown>;
const stage = staged({ runWith, main: typedOrMain, engineOf, env: ENV });

/** Each task the stage's engine was filed, by id, as the run handed it. */
const filings = () => new Map(stage.board().specs.map((spec) => [spec.id, spec]));
/** The task filed for `step` of the run `id` now. */
const filedFor = (id: string, step: string) => filings().get(runRecord(ROOT, id).steps[step].taskId!)!;
/** One pass of the run `id`, on the stage's engine. */
const pass = (id: string) => stage.runWith(stage.board().e, advanceRun(runRecord(ROOT, id)));
/** What `nemia start` answers: what its handler answered, and the facts the client words (`StartedAnswer`). */
const started = async (argv: string[]) => factsOf((await stage.main(['start', ...argv])) as Started);

describe("a run of a factory with a home: frozen at start, its switches recorded, and every filing of a step started in the run's copy", () => {
  let repo = '';
  let plain = '';
  beforeAll(() => {
    const t = teardowns();
    const team = teamCopy();
    plain = path.join(team, 'plain');
    fs.mkdirSync(plain, { recursive: true });
    fs.writeFileSync(path.join(plain, 'implement.md'), '---\nplace: git\nagent: implementer\n---\nBuild what was asked.\n');
    repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
    stage.place().world.repository(repo, { 'README.md': 'x\n' });
    const tree = scratch('wf-home-tree-');
    fs.mkdirSync(path.join(tree, 'home'), { recursive: true });
    fs.writeFileSync(path.join(tree, 'home', 'CLAUDE.md'), '# Where you stand\n');
    addFactoryAt(ROOT, { name: 'homed', volumes: [`${repo}:rw`] });
    attachWorkflowAt(ROOT, { factory: 'homed', workflow: 'plain', repo: path.basename(repo) });
    const file = path.join(ROOT, 'factories', 'homed.json');
    const filed = JSON.parse(fs.readFileSync(file, 'utf8')) as { volumes: Array<Record<string, unknown>> };
    fs.writeFileSync(file, `${JSON.stringify({ ...filed, tree, volumes: filed.volumes.map((v) => ({ ...v, claudeMd: true })) })}\n`);
    return t.end;
  });
  const s = story(test);
  let id = '';
  let home = '';
  s.test("nemia start copies the factory's home into the run and records it, with the switches of the volume it works on", async () => {
    id = (await started(['build it', '--workflows', plain, '--factory', 'homed', '--repo', repo])).id;
    const run = runRecord(ROOT, id);
    assert.equal(typeof run.homeFiles, 'string', 'the copy recorded');
    home = homeFilesDir(ROOT, run, run.homeFiles);
    assert.equal(fs.readFileSync(path.join(home, 'CLAUDE.md'), 'utf8'), '# Where you stand\n');
    assert.deepEqual(run.worked, { claudeMd: true });
  });
  s.test("implement's first filing starts its session in the run's home, its workspace added beside it, writable", async () => {
    await pass(id);
    const first = filedFor(id, 'implement');
    assert.equal(first.cwd, home);
    const workspace = runRecord(ROOT, id).steps.implement.workspace ?? runRecord(ROOT, id).workspace;
    assert.deepEqual((first.config?.mounts as unknown[] | undefined)?.[0], { path: workspace, readOnly: false, ruled: true });
  });
  s.test('a try of implement starts its session in the home again', async () => {
    const b = stage.board();
    b.settle(`${id}-implement`, 'failed');
    await pass(id);
    await stage.runWith(b.e, retryRun(id, 'implement', { mode: 'fresh' }));
    await pass(id);
    const tried = filedFor(id, 'implement');
    assert.notEqual(tried.id, `${id}-implement`, 'a try is filed');
    assert.equal(tried.cwd, home);
  });
});

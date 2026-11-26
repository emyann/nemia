/**
 * Where a step's session starts, from `nemia start` to the tick's filings — a person's story on the stage (`story.ts`). A factory made
 * from a template, whose tree (`treeDir`) holds a home (`home/CLAUDE.md`) and its wiring, its worked-on repository switched to load its
 * memory files: the start freezes the home under `runs/<id>/home/<hex>/` and records `homeFiles` and the switches (`worked`); the first
 * filing of implement starts its session in that copy, its workspace added beside it; and a try of it starts there again. The copy is
 * trusted by its harness's own record before its first session, in the scratch `.claude.json` the seat gives (`CLAUDE_CONFIG_DIR`):
 * at the start, again at a filing that finds it gone, never while the file does not read (the step left unfiled with a note), and
 * every record under the run's home is taken back at `nemia rm`; a start whose home cannot be trusted is refused, and leaves no run.
 * What `filedConfig` makes of a home, row by row, is `src/filed/session-start/session-start.test.ts`.
 *
 * The store is the file's own, at `ROOT`, given as `ENV`.
 */
import { keysUnder, runRecord } from '../testing.ts';
import { beforeAll, describe, test } from 'vitest';
import { teardowns } from 'test-kit/checkpoints';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { teamCopy } from './team.ts';
import { staged, story } from './story.ts';
import { advanceRun, forgetRun, retryRun, runWith } from '../src/runner.ts';
import { addFactoryAt, attachWorkflowAt } from '../testing.ts';
import { treeDir, writeTreeWiring } from '../src/factory/applied/applied.store.ts';
import { engineOf } from '../src/runtime-client.ts';
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

/** The scratch `.claude.json` the harness keeps its trust in (`test/ambient.ts` sets `CLAUDE_CONFIG_DIR`). */
const CONFIG_FILE = path.join(process.env.CLAUDE_CONFIG_DIR!, '.claude.json');
/** The `projects` the harness's file holds now, by folder. */
const projects = () =>
  (fs.existsSync(CONFIG_FILE) ? (JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')).projects ?? {}) : {}) as Record<
    string,
    { hasTrustDialogAccepted?: boolean }
  >;
/** The `projects` the harness's file holds now, but the record of `dir`. */
const projectsBut = (dir: string) => {
  const all: Record<string, unknown> = projects();
  delete all[fs.realpathSync(dir)];
  return all;
};
/** Whether the harness's file trusts `dir`, by its own record. */
const trusts = (dir: string) => projects()[fs.realpathSync(dir)]?.hasTrustDialogAccepted === true;

/**
 * A factory `name` made from a template, whose tree holds a home (`home/CLAUDE.md`), its worked-on repository switched to load its
 * memory files, and a workflow `plain` of one step, implement: the repository and the workflow's folder.
 */
function homedFactory(name: string) {
  const team = teamCopy();
  const plain = path.join(team, 'plain');
  fs.mkdirSync(plain, { recursive: true });
  fs.writeFileSync(path.join(plain, 'implement.md'), '---\nplace: git\nagent: implementer\n---\nBuild what was asked.\n');
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, { 'README.md': 'x\n' });
  addFactoryAt(ROOT, { name, volumes: [`${repo}:rw`] });
  attachWorkflowAt(ROOT, { factory: name, workflow: 'plain', repo: path.basename(repo) });
  const file = path.join(ROOT, 'factories', `${name}.json`);
  const filed = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    volumes: Array<Record<string, unknown>>;
    workflows?: string[];
    hires?: Record<string, string>;
    workflowRepos?: Record<string, string>;
  };
  const { workflows = [], hires = {}, workflowRepos, ...rest } = filed;
  const tree = treeDir(ROOT, name);
  fs.mkdirSync(path.join(tree, 'home'), { recursive: true });
  fs.writeFileSync(path.join(tree, 'home', 'CLAUDE.md'), '# Where you stand\n');
  writeTreeWiring(ROOT, name, { workflows, hires, ...(workflowRepos === undefined ? {} : { workflowRepos }) });
  const template = { source: scratch('wf-home-template-'), version: '1.0.0', params: {} };
  fs.writeFileSync(file, `${JSON.stringify({ ...rest, template, volumes: filed.volumes.map((v) => ({ ...v, claudeMd: true })) })}\n`);
  return { repo, plain };
}

describe("a run of a factory with a home: frozen at start, its switches recorded, and every filing of a step started in the run's copy", () => {
  let repo = '';
  let plain = '';
  beforeAll(() => {
    const t = teardowns();
    ({ repo, plain } = homedFactory('homed'));
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
  s.test("the start trusts the run's home by its own record, so the allow rules of its settings apply", () => {
    assert.ok(trusts(home), `the harness's file trusts ${home}: ${JSON.stringify(projects())}`);
  });
  s.test('a record taken out of the file by hand is given again by the first filing, and implement is filed', async () => {
    fs.writeFileSync(CONFIG_FILE, `${JSON.stringify({ projects: projectsBut(home) })}\n`);
    assert.equal(trusts(home), false);
    await pass(id);
    assert.ok(trusts(home), 'the filing trusted the home again');
    assert.ok(filedFor(id, 'implement'), 'and filed the step');
  });
  s.test("implement's first filing starts its session in the run's home, its workspace added beside it, writable", () => {
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
  s.test(
    "REFUSED: a harness's file that does not read leaves the next try unfiled, with a note naming it; mended, the next pass files it",
    async () => {
      const b = stage.board();
      const before = runRecord(ROOT, id).steps.implement.taskId;
      b.settle(before!, 'failed');
      await pass(id);
      const others = projectsBut(home);
      fs.writeFileSync(CONFIG_FILE, '{');
      await stage.runWith(b.e, retryRun(id, 'implement', { mode: 'fresh' }));
      const count = b.specs.length;
      const refused = await pass(id);
      assert.equal(stage.board().specs.length, count, 'the try is not filed');
      assert.ok(
        refused.notes.some((note) => note.startsWith('implement: not filed') && note.includes(CONFIG_FILE)),
        `a note names the file: ${JSON.stringify(refused.notes)}`,
      );
      assert.equal(fs.readFileSync(CONFIG_FILE, 'utf8'), '{', 'and the file is left as it is');
      fs.writeFileSync(CONFIG_FILE, `${JSON.stringify({ projects: others })}\n`);
      await pass(id);
      assert.notEqual(runRecord(ROOT, id).steps.implement.taskId, before, 'the try is filed once the file reads');
      assert.equal(filedFor(id, 'implement').cwd, home);
      assert.ok(trusts(home), 'and the home trusted again');
    },
  );
  s.test("nemia rm takes back every record under the run's home, and keeps a sibling run's whose id begins alike", async () => {
    const homes = path.join(fs.realpathSync(path.join(ROOT, 'runs')), id, 'home');
    const sibling = path.join(fs.realpathSync(path.join(ROOT, 'runs')), `${id}0`, 'home', 'x');
    const inner = path.join(homes, 'inner');
    fs.writeFileSync(
      CONFIG_FILE,
      `${JSON.stringify({ projects: { ...projects(), [inner]: { lastCost: 1 }, [sibling]: { hasTrustDialogAccepted: true } } })}\n`,
    );
    const b = stage.board();
    const now = runRecord(ROOT, id).steps.implement.taskId;
    b.settle(now!, 'failed');
    await pass(id);
    await stage.runWith(b.e, forgetRun(id));
    const left = Object.keys(projects());
    assert.deepEqual(
      left.filter((key) => key === homes || key.startsWith(`${homes}/`)),
      [],
      `no record under ${homes} is left`,
    );
    assert.ok(left.includes(sibling), "the sibling run's record is kept");
  });
});

describe("a start whose run's home cannot be trusted is refused, and leaves no run", () => {
  let repo = '';
  let plain = '';
  beforeAll(() => {
    const t = teardowns();
    ({ repo, plain } = homedFactory('unhomed'));
    return t.end;
  });
  test("REFUSED: a harness's file that does not read refuses the start Invalid, naming the file, and nothing is started", async () => {
    const kept = fs.existsSync(CONFIG_FILE) ? fs.readFileSync(CONFIG_FILE, 'utf8') : undefined;
    const runs = () =>
      [
        ...(fs.existsSync(path.join(ROOT, 'runs')) ? fs.readdirSync(path.join(ROOT, 'runs')) : []),
        ...keysUnder(ROOT, '/registry/runs/'),
      ].sort();
    const before = runs();
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, '[]');
    try {
      await assert.rejects(started(['build it', '--workflows', plain, '--factory', 'unhomed', '--repo', repo]), (err: unknown) => {
        const refused = err as Error & { _tag?: string; exitCode?: number };
        assert.equal(refused._tag, 'Invalid');
        assert.equal(refused.exitCode, 2);
        assert.ok(refused.message.includes(CONFIG_FILE), `the refusal names the file: ${refused.message}`);
        return true;
      });
      assert.deepEqual(runs(), before, 'no run record and no run folder is left');
      assert.equal(fs.readFileSync(CONFIG_FILE, 'utf8'), '[]', "the harness's file is left as it is");
    } finally {
      if (kept === undefined) fs.rmSync(CONFIG_FILE, { force: true });
      else fs.writeFileSync(CONFIG_FILE, kept);
    }
  });
});

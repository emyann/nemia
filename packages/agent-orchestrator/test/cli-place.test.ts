/**
 * A command of the CLI asks the place `main` is handed, as it talks to the engine it is handed: `nemia start`, `nemia decide` and
 * `nemia rm`, typed in this process over the test place, on a repository git never made. No file of `src/cli` names the git place but
 * `main`, once, as the place it takes when it is handed none (`placeNamed`), which holds the commands this file does not type.
 *
 * `WF_ROOT` is set before the runner is imported, which reads it as it loads. The file sets what its starts depend on itself: a run on a
 * repository no factory holds goes to the default factory (`WF_DEFAULT_FACTORY_STARTS`), and a command that ticks starts no daemon.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runOver } from './placed.ts';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-cli-place-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
process.env.NEMIA_DAEMON_START = 'off';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const { main } = await import('../src/cli/main.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { advanceRun, runWith: runEngine } = await import('../src/runner.ts');
const { readRun } = await import('../src/record/record.store.ts');

const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
const runWith = runOver(runEngine, () => stand().layer);

/** One pass over the run `id`, on this test's engine and place. */
const advanced = (id: string) => runWith(engineOf(engine().layer), advanceRun(readRun(id)));

/** `nemia`, typed with `argv` and handed this test's engine and place: the lines it printed. */
async function typed(t: TestContext, ...argv: string[]): Promise<string[]> {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  try {
    await main(argv, engineOf(engine().layer), undefined, stand().place);
  } finally {
    log.mock.restore();
  }
  return printed.join('\n').split('\n');
}

/** A workflow folder of one step, `implement`, which works in a workspace of its own. */
function oneStep(): string {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  return dir;
}

test('a run started, read and removed through `main` is answered by the place `main` was handed, on a repository git never made', async (t) => {
  const { world } = stand();
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const base = world.repository(repo, { 'a.txt': 'one\n' });

  const id = (await typed(t, 'start', 'add a flag', '--workflows', oneStep(), '--repo', repo))[0].split(' ')[0];
  assert.equal(readRun(id).baseRef, base, 'nemia start opened the place it was handed, which answered the commit the handle made');
  assert.equal(fs.existsSync(path.join(repo, '.git')), false, 'and git made nothing there');

  await advanced(id);
  const workspace = readRun(id).steps.implement.workspace!;
  assert.equal(world.tip(repo, `wf/${id}/implement`), base, 'its workspace is cut on the same place');
  assert.equal(world.head(workspace), base);

  fs.writeFileSync(path.join(workspace, 'flag.ts'), 'export const flag = true;\n');
  engine().settle(`${id}-implement`, 'failed', {});
  await advanced(id);
  const decided = (await typed(t, 'decide', id)).join('\n').split('\n');
  assert.match(decided[0], new RegExp(`^${id}`), 'nemia decide read the run');
  assert.ok(
    decided.includes(`  branch    wf/${id}/implement is ahead of main by 1 commit`),
    `where the branch stands is the handed place's answer: git never made this repository\n${decided.join('\n')}`,
  );
  assert.ok(decided.includes(`  wf/${id}/implement  — 1 file: +1 −0`), `and what it changed is too\n${decided.join('\n')}`);

  await typed(t, 'rm', id);
  assert.equal(fs.existsSync(path.join(ROOT, 'runs', `${id}.json`)), false, 'nemia rm forgot the run');
  assert.equal(fs.existsSync(workspace), false, 'its workspace removed by the place it was handed');
  assert.notEqual(world.tip(repo, `wf/${id}/implement`), base, 'what the step left handed off on its branch first');
});

/** Every file of the CLI's code, by its path from the package, with its text. */
function cliFiles(): { file: string; text: string }[] {
  const dir = path.join(import.meta.dirname, '..', 'src', 'cli');
  return fs
    .readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .map((file) => ({ file: path.posix.join('src/cli', file), text: fs.readFileSync(path.join(dir, file), 'utf8') }));
}

/** The place `main` takes when it is handed none: the one line of the CLI that names the git place. */
const DEFAULT = /\bplace:\s*Place\s*=\s*shippedGitPlace\b/;

/** Each naming of the git place in `text`, its imports and `main`'s one default aside: a program given it, its layer, or the place. */
const placeNamed = (text: string): string[] =>
  text
    .replace(/import\s*(?:type\s*)?\{[^}]*\}\s*from\s*'[^']*';/g, '')
    .replace(DEFAULT, '')
    .match(/\bshipped\s*\(|\bgitPlaceLayer\b|\bshippedGitPlace\b/g) ?? [];

test('REFUSED: a file of `src/cli` that names the git place — a program given it with `shipped(`, its layer, the place itself — but `main`, once, as its default', () => {
  assert.deepEqual(placeNamed('const data = await runWith(e, shipped(command.handler(args)));'), ['shipped(']);
  assert.deepEqual(placeNamed('runWith(\n  e,\n  shipped\n  (x),\n)'), ['shipped\n  ('], 'across a line break');
  assert.deepEqual(placeNamed('Layer.mergeAll(feedHubLayer(), gitPlaceLayer)'), ['gitPlaceLayer']);
  assert.deepEqual(placeNamed('changesOf(shippedGitPlace, run, branches)'), ['shippedGitPlace']);
  assert.deepEqual(
    placeNamed('main(argv, given, demand, place: Place = shippedGitPlace) { f(shippedGitPlace); }'),
    ['shippedGitPlace'],
    'a second naming beside the default',
  );
  assert.deepEqual(placeNamed("import { shipped, shippedGitPlace } from '../runner.ts';\nconst shipped = run.kind === 'shipped';"), []);

  const files = cliFiles();
  const mainFile = files.find(({ file }) => file === 'src/cli/main.ts');
  assert.ok(mainFile, 'src/cli/main.ts is read');
  assert.match(mainFile.text, DEFAULT, '`main` takes the git place when it is handed none');
  assert.ok(files.length >= 5, `the CLI's files are read: ${files.map(({ file }) => file).join(', ')}`);
  assert.deepEqual(
    files.flatMap(({ file, text }) => placeNamed(text).map((named) => `${file}: ${named}`)),
    [],
  );
});

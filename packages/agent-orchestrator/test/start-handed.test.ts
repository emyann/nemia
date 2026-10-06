/**
 * A step is filed the artifacts folder of each step it comes after, read-only (`handedMounts`), under the store's `runs/`: a store whose
 * path no permission rule can name refuses `wf start` of a workflow with a later step on Claude Code, in the runtime's words, before
 * anything is written, rather than a filing mid-run, and so does a step whose `reads:` names the inbox (`readsMounts`). A workflow of
 * one step, handed nothing and reading no store folder, starts there.
 *
 * `WF_ROOT` is set before the runner is imported, since it is read as the module loads; its path holds a space.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scratch } from './scratch.ts';
import { Effect } from 'effect';

const ROOT = path.join(scratch('wf-start-handed-'), 'First Last');
fs.mkdirSync(ROOT);
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
const { addFactory, attachWorkflow, startRun } = await import('../src/runner.ts');
const { artifactsDir } = await import('../src/record/record.store.ts');

/** A git repository with one commit on `main`, under the store. */
function aRepo(): string {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'README.md'), 'x\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  return repo;
}

/** A workflow folder of steps on Claude Code, by name and frontmatter, each with a one-line body. */
function folderOf(steps: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  for (const [name, front] of Object.entries(steps)) fs.writeFileSync(path.join(dir, `${name}.md`), `---\nplace: git\n${front}\n---\n${name} it\n`);
  return dir;
}

/** The runs on disk, by file name. */
const runs = (): string[] => (fs.existsSync(path.join(ROOT, 'runs')) ? fs.readdirSync(path.join(ROOT, 'runs')).sort() : []);

test('REFUSED at shipped defaults: a store no permission rule can name refuses a later step on Claude Code at start, before anything is written', async () => {
  const repo = aRepo();
  const before = runs();
  let message = '';
  try {
    await Effect.runPromise(
      startRun({
        brief: 'build it',
        repo,
        workflowDir: folderOf({ implement: 'harness: claude', review: 'after: implement' }),
        isolate: false,
      }),
    );
  } catch (err) {
    message = (err as Error).message;
  }
  const handed = artifactsDir({ id: 'run' }, 'implement');
  assert.match(message, /^review: /, "the later step's name first");
  assert.ok(message.includes(`\`mounts\` gives the session ${JSON.stringify(handed)} read-only, and Claude Code holds a folder`), message);
  assert.deepEqual(runs(), before, 'nothing was written');
});

test('a workflow of one step, handed nothing, starts in the same store', async () => {
  const run = await Effect.runPromise(
    startRun({ brief: 'build it', repo: aRepo(), workflowDir: folderOf({ implement: 'harness: claude' }), isolate: false }),
  );
  assert.ok(runs().includes(`${run.id}.json`), runs().join('\n'));
});

test("REFUSED at shipped defaults: a store no permission rule can name refuses a step's `reads: inbox` at start, quoting the line, before anything is written", async () => {
  const before = runs();
  let message = '';
  try {
    await Effect.runPromise(
      startRun({ brief: 'read it', repo: aRepo(), workflowDir: folderOf({ argus: 'reads: inbox' }), isolate: false }),
    );
  } catch (err) {
    message = (err as Error).message;
  }
  const inbox = path.join(ROOT, 'inbox');
  assert.match(message, /^argus: `reads: inbox` \(filed as `mounts`\): /, message);
  assert.ok(message.includes(`\`mounts\` gives the session ${JSON.stringify(inbox)} read-only, and Claude Code holds a folder`), message);
  assert.deepEqual(runs(), before, 'nothing was written');
});

test('REFUSED at shipped defaults: a step with both `writable:` and `reads: inbox`, refused its mounts at start, quotes both lines', async () => {
  const repos = [aRepo(), aRepo()].sort();
  addFactory({ name: 'both', repos });
  const web = path.basename(repos[1]);
  fs.mkdirSync(path.join(ROOT, 'agents'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'agents', 'reader.md'), '---\nharness: claude\n---\nRead what you are asked.\n');
  const workflowDir = folderOf({ argus: `agent: reader\nwritable: ${web}\nreads: inbox` });
  attachWorkflow({ factory: 'both', workflow: path.basename(workflowDir) });
  const before = runs();
  let message = '';
  try {
    await Effect.runPromise(startRun({ brief: 'read it', repo: repos[0], workflowDir, isolate: false, factory: 'both' }));
  } catch (err) {
    message = (err as Error).message;
  }
  assert.ok(message.startsWith(`argus: \`writable: ${web}\` and \`reads: inbox\` (filed as \`mounts\`): `), message);
  assert.deepEqual(runs(), before, 'nothing was written');
});

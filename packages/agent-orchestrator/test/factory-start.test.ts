/**
 * `wf start --factory`: a run started in a factory, of a workflow attached to it, whose hires fill the workflow's steps. Refused, before
 * anything is written: a workflow the factory has not attached, first; then a step left unfilled, or filled twice — by its own `agent:` and
 * a hire. Started in the default factory, every workflow is offered, and a step that names no agent is a plain session, as it always was.
 *
 * And the factory on the run: its name frozen on the record, a factory with one repository giving the run its repository, and a git run on
 * a repository outside the factory refused, naming its list; a folder team works on none, and a run in the default factory records none.
 *
 * `WF_ROOT` is set before the runner is imported, since it is read as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Engine } from 'agent-runtime';
import { scratch } from './scratch.ts';
import { teamCopy } from './team.ts';

const ROOT = scratch('wf-factory-start-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
const { addFactory, attachWorkflow, hireAgent, inboxDir, repoFor, start } = await import('../src/runner.ts');
const { readRun } = await import('../src/record/record.store.ts');
const { startHow } = await import('../src/cli/start.ts');
const { main } = await import('../src/cli/main.ts');

/** Refused by kind, exit 2, and the message — never `String(err)`, which starts with `Error: `. */
const refusedWith = (tag: 'Missing' | 'Invalid', pattern: RegExp) => (err: Error & { exitCode?: number; _tag?: string }) =>
  err._tag === tag && err.exitCode === 2 && pattern.test(err.message);

/** A git repository with one commit on `main`, for a run with no worktree to stand on. */
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

/**
 * The tests' team with one more workflow, `build`: `implement` and `review` name no agent, and `named` names its own, `reviewer`. The
 * factory `pipao` is filed afresh, hiring no one, with `attached` attached to it: `build`, unless another list is given.
 */
function fresh(attached: readonly string[] = ['build']): { repo: string; build: string; dev: string } {
  fs.rmSync(path.join(ROOT, 'factories'), { recursive: true, force: true });
  const team = teamCopy();
  const build = path.join(team, 'build');
  fs.mkdirSync(build);
  fs.writeFileSync(path.join(build, 'implement.md'), 'Build what was asked.\n');
  fs.writeFileSync(path.join(build, 'review.md'), '---\nafter: implement\n---\nReview it.\n');
  fs.writeFileSync(path.join(build, 'named.md'), '---\nafter: review\nagent: reviewer\n---\nSay what you found.\n');
  const repo = aRepo();
  addFactory({ name: 'pipao', repos: [repo] });
  for (const workflow of attached) attachWorkflow({ factory: 'pipao', workflow });
  return { repo, build, dev: path.join(team, 'dev') };
}

/** The runs written under the store: none after a refusal. */
const runsWritten = (): string[] => (fs.existsSync(path.join(ROOT, 'runs')) ? fs.readdirSync(path.join(ROOT, 'runs')) : []);

test('REFUSED: a start in a factory that has attached no workflow offers none, names the attach, and writes no run', () => {
  const { repo, build } = fresh([]);
  const before = runsWritten();
  assert.throws(
    () => start({ brief: 'build it', repo, workflowDir: build, isolate: false, factory: 'pipao' }),
    refusedWith(
      'Invalid',
      /^build: the factory pipao does not offer this workflow — it offers none yet\. Attach it — wf factory attach pipao build — or start it in the default factory, which offers every workflow\. Nothing was started\.$/,
    ),
  );
  assert.deepEqual(runsWritten(), before);
});

test('REFUSED: a start of a workflow its factory has not attached, before its steps are judged, naming what it offers', () => {
  const { repo, build, dev } = fresh(['dev']);
  const before = runsWritten();
  assert.throws(
    () => start({ brief: 'build it', repo, workflowDir: build, isolate: false, factory: 'pipao' }),
    refusedWith(
      'Invalid',
      /^build: the factory pipao does not offer this workflow — it offers: dev\. Attach it — wf factory attach pipao build — /,
    ),
    'the unattached refusal, not the unfilled one, though build has steps no one fills',
  );
  attachWorkflow({ factory: 'pipao', workflow: 'build' });
  assert.throws(
    () => start({ brief: 'build it', repo, workflowDir: build, isolate: false, factory: 'pipao' }),
    refusedWith('Invalid', /^build: in the factory pipao, 2 steps name no agent/),
    'once attached, its steps are judged',
  );
  fresh(['build']);
  assert.throws(
    () => start({ brief: 'dev it', repo, workflowDir: dev, isolate: false, factory: 'pipao' }),
    refusedWith('Invalid', /^dev: the factory pipao does not offer this workflow — it offers: build\. /),
  );
  assert.deepEqual(runsWritten(), before);
});

test('REFUSED: a start in a factory that hires no one into its steps names each unfilled step and the hire for it, and writes no run', () => {
  const { repo, build } = fresh();
  const before = runsWritten();
  assert.throws(
    () => start({ brief: 'build it', repo, workflowDir: build, isolate: false, factory: 'pipao' }),
    refusedWith(
      'Invalid',
      /^build: in the factory pipao, 2 steps name no agent, and pipao hires none into them: implement, review\. Hire an agent into each — wf factory hire pipao <agent> --step build\/implement; wf factory hire pipao <agent> --step build\/review — or start it in the default factory, where such a step runs as a plain session\. Nothing was started\.$/,
    ),
  );
  assert.deepEqual(runsWritten(), before);
});

test('once a factory hires into each step, a start in it runs each as its hire, frozen on the run: a later hire changes no step of it', () => {
  const { repo, build } = fresh();
  hireAgent({ factory: 'pipao', agent: 'implementer', step: 'build/implement' });
  hireAgent({ factory: 'pipao', agent: 'reviewer', step: 'build/review' });
  const run = start({ brief: 'build it', repo, workflowDir: build, isolate: false, factory: 'pipao' });
  hireAgent({ factory: 'pipao', agent: 'shipper', step: 'build/implement' });
  const steps = Object.fromEntries((run.workflow ?? []).map((s) => [s.name, s]));
  assert.equal(steps.implement.agent?.name, 'implementer');
  assert.match(steps.implement.body, /^Make the change you were asked for, in this repository\.[\s\S]*\n\nBuild what was asked\.$/);
  assert.equal(steps.implement.model, 'opus', "the hire's keys are the step's");
  assert.equal(steps.review.agent?.name, 'reviewer');
  assert.equal(steps.named.agent?.name, 'reviewer', 'a step that names its own agent is filled in any factory');
  const record = JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8'));
  assert.equal(record.workflow[0].agent.name, 'implementer', 'frozen as started');
});

test('in the default factory — no --factory, or default — every workflow is offered, a step that names no agent runs as a plain session, and nothing is read', () => {
  const { repo, build } = fresh();
  fs.writeFileSync(
    path.join(ROOT, 'factories', 'pipao.json'),
    `${JSON.stringify({ repos: [repo], hires: { 'build/implement': 'implementer' } })}\n`,
  );
  fs.writeFileSync(path.join(ROOT, 'factories', 'default.json'), '{"repos": ["/x"], "hires": {"build/implement": "shipper"}}\n');
  for (const factory of [undefined, 'default']) {
    const run = start({ brief: 'build it', repo, workflowDir: build, isolate: false, ...(factory ? { factory } : {}) });
    const steps = Object.fromEntries((run.workflow ?? []).map((s) => [s.name, s]));
    assert.equal(steps.implement.agent, undefined, String(factory));
    assert.equal(steps.implement.body, 'Build what was asked.');
    assert.equal(steps.review.agent, undefined);
  }
});

test("REFUSED: a factory's hires into another workflow's steps of the same names fill none of this one's", () => {
  const { repo, build } = fresh(['build', 'builder', 'other']);
  hireAgent({ factory: 'pipao', agent: 'implementer', step: 'other/implement' });
  hireAgent({ factory: 'pipao', agent: 'reviewer', step: 'builder/review' });
  hireAgent({ factory: 'pipao', agent: 'reviewer', step: 'build/review' });
  assert.throws(
    () => start({ brief: 'build it', repo, workflowDir: build, isolate: false, factory: 'pipao' }),
    refusedWith('Invalid', /^build: in the factory pipao, the step implement names no agent, and pipao hires none into it\. /),
  );
});

test('REFUSED: a hire into a step whose file names its own agent, naming both and the fire, with no run written', () => {
  const { repo, build } = fresh();
  hireAgent({ factory: 'pipao', agent: 'implementer', step: 'build/implement' });
  hireAgent({ factory: 'pipao', agent: 'reviewer', step: 'build/review' });
  hireAgent({ factory: 'pipao', agent: 'implementer', step: 'build/named' });
  const before = runsWritten();
  assert.throws(
    () => start({ brief: 'build it', repo, workflowDir: build, isolate: false, factory: 'pipao' }),
    refusedWith(
      'Invalid',
      /^named: `agent: reviewer` fills this step in every factory, and the factory pipao hires implementer into it too\. Take the hire back — wf factory fire pipao --step build\/named — /,
    ),
  );
  assert.deepEqual(runsWritten(), before);
});

test('REFUSED: a hire of an agent there is not, in the words of the factory that hires it', () => {
  const { repo, build } = fresh();
  hireAgent({ factory: 'pipao', agent: 'ada', step: 'build/implement' });
  hireAgent({ factory: 'pipao', agent: 'reviewer', step: 'build/review' });
  assert.throws(
    () => start({ brief: 'build it', repo, workflowDir: build, isolate: false, factory: 'pipao' }),
    refusedWith(
      'Invalid',
      /^implement: the factory pipao hires `ada` into it, which is not an agent here\. The agents are: implementer, reviewer, shipper — hire one — wf factory hire pipao <agent> --step build\/implement, /,
    ),
  );
});

test('REFUSED: a start in a factory the store does not have is Missing, naming those it has', () => {
  const { repo, build } = fresh();
  assert.throws(
    () => start({ brief: 'build it', repo, workflowDir: build, isolate: false, factory: 'nope' }),
    refusedWith('Missing', /^no factory nope in the store\. Its factories are: pipao\. Nothing was started\.$/),
  );
});

test('wf start reads --factory once, and refuses it twice; on a card of the inbox it is refused, never dropped', async () => {
  assert.equal(startHow(['--factory', 'pipao']).factory, 'pipao');
  assert.equal(startHow(['--factory=pipao']).factory, 'pipao');
  assert.equal(startHow([]).factory, undefined);
  assert.throws(
    () => startHow(['--factory', 'pipao', '--factory', 'nemia']),
    refusedWith('Invalid', /^wf start takes --factory once: a run is started in one factory\.$/),
  );
  const { build } = fresh();
  fs.mkdirSync(inboxDir(), { recursive: true });
  const card = path.join(inboxDir(), 'build-it.md');
  fs.writeFileSync(card, 'Build it.\n');
  const before = runsWritten();
  await assert.rejects(
    main(['start', card, '--workflows', build, '--factory', 'pipao'], {} as Engine),
    refusedWith(
      'Invalid',
      /^wf start --factory pipao starts a run in a factory, and a card of the inbox is started in the default factory for now/,
    ),
  );
  assert.ok(fs.existsSync(card), 'the card is left in the inbox');
  assert.deepEqual(runsWritten(), before);
});

/** Every step of `build` filled in `factory`: `implement` and `review` hired, `named` naming its own. */
function hired(factory = 'pipao'): void {
  hireAgent({ factory, agent: 'implementer', step: 'build/implement' });
  hireAgent({ factory, agent: 'reviewer', step: 'build/review' });
}

/** What `wf <argv>` prints, typed from `cwd`, a line each. */
async function typedFrom(cwd: string, argv: string[]): Promise<string[]> {
  const lines: string[] = [];
  const log = console.log;
  const was = process.cwd();
  console.log = (...args: unknown[]) => {
    lines.push(args.join(' '));
  };
  process.chdir(cwd);
  try {
    await main(argv, {} as Engine);
  } finally {
    process.chdir(was);
    console.log = log;
  }
  return lines.join('\n').split('\n');
}

/** The id of the run `wf start` printed first. */
const startedId = (lines: readonly string[]): string => lines[0].split(' ')[0];

test('a run started in a factory names it on its record, as written to disk', () => {
  const { repo, build } = fresh();
  hired();
  const run = start({ brief: 'build it', repo, workflowDir: build, isolate: false, factory: 'pipao' });
  assert.equal(run.factory, 'pipao');
  assert.equal(readRun(run.id).factory, 'pipao');
  assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8')).factory, 'pipao');
});

test("REFUSED: a git run on a repository outside its factory, naming the factory's list, with no run written", () => {
  const { repo, build } = fresh();
  hired();
  const other = aRepo();
  const before = runsWritten();
  assert.throws(
    () => start({ brief: 'build it', repo: other, repoNamed: true, workflowDir: build, isolate: false, factory: 'pipao' }),
    (err: Error & { exitCode?: number; _tag?: string }) =>
      err._tag === 'Invalid' &&
      err.exitCode === 2 &&
      err.message ===
        `${other}: the factory pipao works on ${repo}, and this repository is not one of them. Name one of them — --repo ${repo} — or start it in the default factory. Nothing was started.`,
  );
  assert.deepEqual(runsWritten(), before);
});

test('a factory with one repository gives the run its repository: wf start --factory from any directory runs on it', async () => {
  const { repo, build } = fresh();
  hired();
  assert.equal(repoFor('pipao', undefined, ROOT), repo);
  assert.equal(repoFor('pipao', '/elsewhere', ROOT), '/elsewhere', 'a repository named is kept, for the start to judge');
  assert.equal(repoFor(undefined, undefined, ROOT), ROOT);
  const out = await typedFrom(ROOT, ['start', 'build it', '--workflows', build, '--factory', 'pipao', '--no-worktree']);
  const run = readRun(startedId(out));
  assert.equal(run.repo, repo);
  assert.equal(run.factory, 'pipao');
  assert.ok(out.includes(`factory: pipao, on ${repo}`), out.join('\n'));
});

test('a factory with two repositories: the one named, else where wf start is typed if it is one of them, else refused naming both', async () => {
  const { build } = fresh();
  const [first, second] = [aRepo(), aRepo()];
  addFactory({ name: 'duo', repos: [first, second] });
  attachWorkflow({ factory: 'duo', workflow: 'build' });
  hired('duo');
  const named = await typedFrom(ROOT, ['start', 'x', '--workflows', build, '--factory', 'duo', '--repo', second, '--no-worktree']);
  assert.equal(readRun(startedId(named)).repo, second);
  const inside = await typedFrom(first, ['start', 'x', '--workflows', build, '--factory', 'duo', '--no-worktree']);
  assert.equal(readRun(startedId(inside)).repo, first);
  const before = runsWritten();
  const listed = [first, second].sort().join(', ');
  await assert.rejects(
    typedFrom(ROOT, ['start', 'x', '--workflows', build, '--factory', 'duo', '--no-worktree']),
    (err: Error & { _tag?: string }) =>
      err._tag === 'Invalid' &&
      err.message.startsWith(`${ROOT}: the factory duo works on ${listed}, and this repository is not one of them`),
  );
  assert.deepEqual(runsWritten(), before);
});

test('a folder team started in a factory names it and works on no repository, wherever it is typed from', () => {
  const { build } = fresh(['notes']);
  const notes = path.join(path.dirname(build), 'notes');
  fs.mkdirSync(notes);
  fs.writeFileSync(path.join(notes, 'write.md'), '---\nworkspace: folder\nagent: implementer\n---\nWrite it.\n');
  const run = start({ brief: 'a note', repo: ROOT, workflowDir: notes, factory: 'pipao' });
  assert.equal(run.place?.kind, 'folder');
  assert.equal(run.factory, 'pipao');
  assert.equal(readRun(run.id).repo, undefined);
});

test('a run in the default factory — no --factory, or default — records no factory, and runs on the repository given', () => {
  const { build } = fresh();
  const other = aRepo();
  for (const factory of [undefined, 'default']) {
    const run = start({ brief: 'build it', repo: other, workflowDir: build, isolate: false, ...(factory ? { factory } : {}) });
    assert.equal('factory' in run, false, String(factory));
    assert.equal(run.repo, other);
    assert.equal('factory' in readRun(run.id), false);
  }
});

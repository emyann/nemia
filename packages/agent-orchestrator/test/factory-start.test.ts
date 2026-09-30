/**
 * `wf start --factory`: a run started in a factory, whose hires fill the workflow's steps. Refused while a step is left unfilled, or filled
 * twice — by its own `agent:` and a hire — before anything is written; started in the default factory, a step that names no agent is a
 * plain session, as it always was.
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
const { addFactory, hireAgent, inboxDir, start } = await import('../src/runner.ts');
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
 * factory `pipao` is filed afresh, hiring no one.
 */
function fresh(): { repo: string; build: string; dev: string } {
  fs.rmSync(path.join(ROOT, 'factories'), { recursive: true, force: true });
  const team = teamCopy();
  const build = path.join(team, 'build');
  fs.mkdirSync(build);
  fs.writeFileSync(path.join(build, 'implement.md'), 'Build what was asked.\n');
  fs.writeFileSync(path.join(build, 'review.md'), '---\nafter: implement\n---\nReview it.\n');
  fs.writeFileSync(path.join(build, 'named.md'), '---\nafter: review\nagent: reviewer\n---\nSay what you found.\n');
  const repo = aRepo();
  addFactory({ name: 'pipao', repos: [repo] });
  return { repo, build, dev: path.join(team, 'dev') };
}

/** The runs written under the store: none after a refusal. */
const runsWritten = (): string[] => (fs.existsSync(path.join(ROOT, 'runs')) ? fs.readdirSync(path.join(ROOT, 'runs')) : []);

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

test('in the default factory — no --factory, or default — a step that names no agent runs as a plain session, and nothing is read', () => {
  const { repo, build } = fresh();
  hireAgent({ factory: 'pipao', agent: 'implementer', step: 'build/implement' });
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
  const { repo, build } = fresh();
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

/**
 * `nemia start --factory`: a run started in a factory, of a workflow attached to it, whose hires fill the workflow's steps. Refused, before
 * anything is written: a workflow the factory has not attached, first; then a step left unfilled, or filled twice — by its own `agent:` and
 * a hire. Started in the default factory, every workflow is offered, and a step that names no agent is a plain session, as it always was.
 *
 * And the factory on the run: its name frozen on the record, a factory with one repository giving the run its repository, and a repository
 * run on a repository outside the factory refused, naming its list; a folder team works on none, and a run in the default factory records
 * none.
 *
 * And every run in a factory, as shipped (`asShipped` deletes `WF_DEFAULT_FACTORY_STARTS`, which `test/ambient.ts` sets): a start that
 * names none runs in the one factory whose repository holds its folder, and is refused where none or two do; a card names its own, never
 * one found.
 *
 * `WF_ROOT` is set before the runner is imported, since it is read as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { teamCopy } from './team.ts';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runGiven } from './placed.ts';

const ROOT = scratch('wf-factory-start-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
const { addFactory, attachWorkflow, hireAgent, inboxDir, parseArgv, repoFor, START, startRun, startFromInbox } =
  await import('../src/runner.ts');
const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
const runPlaced = runGiven(() => stand().layer);
const { readRun } = await import('../src/record/record.store.ts');
const { main } = await import('../src/cli/main.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { nemiaDefinition } = await import('../src/nemia/level.store.ts');

/** Refused by kind, exit 2, and the message — never `String(err)`, which starts with `Error: `. */
const refusedWith = (tag: 'Missing' | 'Invalid', pattern: RegExp) => (err: Error & { exitCode?: number; _tag?: string }) =>
  err._tag === tag && err.exitCode === 2 && pattern.test(err.message);

/** A repository with one commit on `main`, for a run with no worktree to stand on. */
function aRepo(): string {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stand().world.repository(repo, { 'README.md': 'x\n' });
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
  fs.writeFileSync(path.join(build, 'implement.md'), '---\nplace: git\n---\nBuild what was asked.\n');
  fs.writeFileSync(path.join(build, 'review.md'), '---\nafter: implement\nplace: git\n---\nReview it.\n');
  fs.writeFileSync(path.join(build, 'named.md'), '---\nafter: review\nplace: git\nagent: reviewer\n---\nSay what you found.\n');
  const repo = aRepo();
  addFactory({ name: 'pipao', repos: [repo] });
  for (const workflow of attached) attachWorkflow({ factory: 'pipao', workflow });
  return { repo, build, dev: path.join(team, 'dev') };
}

/** The runs written under the store: none after a refusal. */
const runsWritten = (): string[] => (fs.existsSync(path.join(ROOT, 'runs')) ? fs.readdirSync(path.join(ROOT, 'runs')) : []);

test('REFUSED: a start in a factory that has attached no workflow offers none, names the attach, and writes no run', async () => {
  const { repo, build } = fresh([]);
  const before = runsWritten();
  await assert.rejects(
    async () => await runPlaced(startRun({ brief: 'build it', repo, workflowDir: build, isolate: false, factory: 'pipao' })),
    refusedWith(
      'Invalid',
      /^build: the factory pipao does not offer this workflow — it offers none yet\. Attach it: nemia factory attach pipao build\. Nothing was started\.$/,
    ),
  );
  await assert.rejects(
    async () => await runPlaced(startRun({ brief: 'build it', repo, workflowDir: build, isolate: false, factory: 'pipao' })),
    (err: Error) => !/default factory/.test(err.message),
    "only the factory's own fix, never the default factory",
  );
  assert.deepEqual(runsWritten(), before);
});

test('REFUSED: a start of a workflow its factory has not attached, before its steps are judged, naming what it offers', async () => {
  const { repo, build, dev } = fresh(['dev']);
  const before = runsWritten();
  await assert.rejects(
    async () => await runPlaced(startRun({ brief: 'build it', repo, workflowDir: build, isolate: false, factory: 'pipao' })),
    refusedWith(
      'Invalid',
      /^build: the factory pipao does not offer this workflow — it offers: dev\. Attach it: nemia factory attach pipao build\. Nothing was started\.$/,
    ),
    'the unattached refusal, not the unfilled one, though build has steps no one fills',
  );
  attachWorkflow({ factory: 'pipao', workflow: 'build' });
  await assert.rejects(
    async () => await runPlaced(startRun({ brief: 'build it', repo, workflowDir: build, isolate: false, factory: 'pipao' })),
    refusedWith('Invalid', /^build: in the factory pipao, 2 steps name no agent/),
    'once attached, its steps are judged',
  );
  fresh(['build']);
  await assert.rejects(
    async () => await runPlaced(startRun({ brief: 'dev it', repo, workflowDir: dev, isolate: false, factory: 'pipao' })),
    refusedWith('Invalid', /^dev: the factory pipao does not offer this workflow — it offers: build\. /),
  );
  assert.deepEqual(runsWritten(), before);
});

test('REFUSED: a start in a factory that hires no one into its steps names each unfilled step and the hire for it, and writes no run', async () => {
  const { repo, build } = fresh();
  const before = runsWritten();
  await assert.rejects(
    async () => await runPlaced(startRun({ brief: 'build it', repo, workflowDir: build, isolate: false, factory: 'pipao' })),
    refusedWith(
      'Invalid',
      /^build: in the factory pipao, 2 steps name no agent, and pipao hires none into them: implement, review\. Hire an agent into each — nemia factory hire pipao <agent> --step build\/implement; nemia factory hire pipao <agent> --step build\/review\. Nothing was started\.$/,
    ),
  );
  assert.deepEqual(runsWritten(), before);
});

test('once a factory hires into each step, a start in it runs each as its hire, frozen on the run: a later hire changes no step of it', async () => {
  const { repo, build } = fresh();
  hireAgent({ factory: 'pipao', agent: 'implementer', step: 'build/implement' });
  hireAgent({ factory: 'pipao', agent: 'reviewer', step: 'build/review' });
  const run = await runPlaced(startRun({ brief: 'build it', repo, workflowDir: build, isolate: false, factory: 'pipao' }));
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

test('in the default factory — no --factory, or default — every workflow is offered, a step that names no agent runs as a plain session, and nothing is read', async () => {
  const { repo, build } = fresh();
  fs.writeFileSync(
    path.join(ROOT, 'factories', 'pipao.json'),
    `${JSON.stringify({ repos: [repo], hires: { 'build/implement': 'implementer' } })}\n`,
  );
  fs.writeFileSync(path.join(ROOT, 'factories', 'default.json'), '{"repos": ["/x"], "hires": {"build/implement": "shipper"}}\n');
  for (const factory of [undefined, 'default']) {
    const run = await runPlaced(startRun({ brief: 'build it', repo, workflowDir: build, isolate: false, ...(factory ? { factory } : {}) }));
    const steps = Object.fromEntries((run.workflow ?? []).map((s) => [s.name, s]));
    assert.equal(steps.implement.agent, undefined, String(factory));
    assert.equal(steps.implement.body, 'Build what was asked.');
    assert.equal(steps.review.agent, undefined);
  }
});

test("REFUSED: a factory's hires into another workflow's steps of the same names fill none of this one's", async () => {
  const { repo, build } = fresh(['build', 'builder', 'other']);
  hireAgent({ factory: 'pipao', agent: 'implementer', step: 'other/implement' });
  hireAgent({ factory: 'pipao', agent: 'reviewer', step: 'builder/review' });
  hireAgent({ factory: 'pipao', agent: 'reviewer', step: 'build/review' });
  await assert.rejects(
    async () => await runPlaced(startRun({ brief: 'build it', repo, workflowDir: build, isolate: false, factory: 'pipao' })),
    refusedWith('Invalid', /^build: in the factory pipao, the step implement names no agent, and pipao hires none into it\. /),
  );
});

test('REFUSED: a hire into a step whose file names its own agent, naming both and the fire, with no run written', async () => {
  const { repo, build } = fresh();
  hireAgent({ factory: 'pipao', agent: 'implementer', step: 'build/implement' });
  hireAgent({ factory: 'pipao', agent: 'reviewer', step: 'build/review' });
  hireAgent({ factory: 'pipao', agent: 'implementer', step: 'build/named' });
  const before = runsWritten();
  await assert.rejects(
    async () => await runPlaced(startRun({ brief: 'build it', repo, workflowDir: build, isolate: false, factory: 'pipao' })),
    refusedWith(
      'Invalid',
      /^named: `agent: reviewer` fills this step in every factory, and the factory pipao hires implementer into it too\. Take the hire back — nemia factory fire pipao --step build\/named — /,
    ),
  );
  assert.deepEqual(runsWritten(), before);
});

test('REFUSED: a hire of an agent there is not, in the words of the factory that hires it', async () => {
  const { repo, build } = fresh();
  hireAgent({ factory: 'pipao', agent: 'ada', step: 'build/implement' });
  hireAgent({ factory: 'pipao', agent: 'reviewer', step: 'build/review' });
  await assert.rejects(
    async () => await runPlaced(startRun({ brief: 'build it', repo, workflowDir: build, isolate: false, factory: 'pipao' })),
    refusedWith(
      'Invalid',
      /^implement: the factory pipao hires `ada` into it, which is not an agent here\. The agents are: implementer, reviewer, shipper — hire one — nemia factory hire pipao <agent> --step build\/implement, /,
    ),
  );
});

test('REFUSED: Nemia is never a hire: a factory that hires nemia into a step starts nothing, her folder and her words in the store being no agent', async () => {
  const { repo, build } = fresh();
  fs.mkdirSync(path.join(ROOT, 'nemia'), { recursive: true });
  fs.copyFileSync(nemiaDefinition(), path.join(ROOT, 'nemia', 'nemia.md'));
  fs.mkdirSync(path.join(ROOT, 'custom-instructions'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'custom-instructions', 'nemia.md'), 'Answer in French.\n');
  hireAgent({ factory: 'pipao', agent: 'nemia', step: 'build/implement' });
  hireAgent({ factory: 'pipao', agent: 'reviewer', step: 'build/review' });
  const before = runsWritten();
  await assert.rejects(
    async () => await runPlaced(startRun({ brief: 'build it', repo, workflowDir: build, isolate: false, factory: 'pipao' })),
    refusedWith(
      'Invalid',
      /^implement: the factory pipao hires `nemia` into it, which is not an agent here\. The agents are: implementer, /,
    ),
  );
  assert.deepEqual(runsWritten(), before);
});

test('REFUSED: a start in a factory the store does not have is Missing, naming those it has', async () => {
  const { repo, build } = fresh();
  await assert.rejects(
    async () => await runPlaced(startRun({ brief: 'build it', repo, workflowDir: build, isolate: false, factory: 'nope' })),
    refusedWith('Missing', /^no factory nope in the store\. Its factories are: pipao\. Nothing was started\.$/),
  );
});

test('nemia start reads --factory once, and refuses it twice', () => {
  const factoryOf = (...argv: string[]) => parseArgv(START.spec, ['build it', ...argv])?.factory;
  assert.equal(factoryOf('--factory', 'pipao'), 'pipao');
  assert.equal(factoryOf('--factory=pipao'), 'pipao');
  assert.equal(factoryOf(), undefined);
  assert.throws(
    () => factoryOf('--factory', 'pipao', '--factory', 'nemia'),
    refusedWith('Invalid', /^nemia start takes --factory once: a run is started in one factory\.$/),
  );
});

/** Every step of `build` filled in `factory`: `implement` and `review` hired, `named` naming its own. */
function hired(factory = 'pipao'): void {
  hireAgent({ factory, agent: 'implementer', step: 'build/implement' });
  hireAgent({ factory, agent: 'reviewer', step: 'build/review' });
}

/** What `nemia <argv>` prints, typed from `cwd`, a line each. */
async function typedFrom(cwd: string, argv: string[]): Promise<string[]> {
  const lines: string[] = [];
  const log = console.log;
  const was = process.cwd();
  console.log = (...args: unknown[]) => {
    lines.push(args.join(' '));
  };
  process.chdir(cwd);
  try {
    await main(argv, engineOf(engine().layer), undefined, stand().place);
  } finally {
    process.chdir(was);
    console.log = log;
  }
  return lines.join('\n').split('\n');
}

/** The id of the run `nemia start` printed first. */
const startedId = (lines: readonly string[]): string => lines[0].split(' ')[0];

test('a run started in a factory names it on its record, as written to disk', async () => {
  const { repo, build } = fresh();
  hired();
  const run = await runPlaced(startRun({ brief: 'build it', repo, workflowDir: build, isolate: false, factory: 'pipao' }));
  assert.equal(run.factory, 'pipao');
  assert.equal(readRun(run.id).factory, 'pipao');
  assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8')).factory, 'pipao');
});

test("REFUSED: a repository run on a repository outside its factory, naming the factory's list, with no run written", async () => {
  const { repo, build } = fresh();
  hired();
  const other = aRepo();
  const before = runsWritten();
  await assert.rejects(
    async () =>
      await runPlaced(startRun({ brief: 'build it', repo: other, repoNamed: true, workflowDir: build, isolate: false, factory: 'pipao' })),
    (err: Error & { exitCode?: number; _tag?: string }) =>
      err._tag === 'Invalid' &&
      err.exitCode === 2 &&
      err.message ===
        `${other}: the factory pipao works on ${repo}, and this repository is not one of them. Name one of them — --repo ${repo} — or file a factory on this one: nemia factory add <name> --repo ${other}. Nothing was started.`,
  );
  await assert.rejects(
    async () =>
      await runPlaced(startRun({ brief: 'build it', repo: other, repoNamed: true, workflowDir: build, isolate: false, factory: 'pipao' })),
    (err: Error) => !/default factory/.test(err.message),
    "only the factory's own fix, never the default factory",
  );
  assert.deepEqual(runsWritten(), before);
});

test('a factory with one repository gives the run its repository: nemia start --factory from any directory runs on it', async () => {
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

test('a factory with two repositories: the one named, else where nemia start is typed if it is one of them, else refused naming both', async () => {
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

test('a folder team started in a factory names it and works on no repository, wherever it is typed from', async () => {
  const { build } = fresh(['notes']);
  const notes = path.join(path.dirname(build), 'notes');
  fs.mkdirSync(notes);
  fs.writeFileSync(path.join(notes, 'write.md'), '---\nworkspace: folder\nagent: implementer\n---\nWrite it.\n');
  const run = await runPlaced(startRun({ brief: 'a note', repo: ROOT, workflowDir: notes, factory: 'pipao' }));
  assert.equal(run.place?.kind, 'folder');
  assert.equal(run.factory, 'pipao');
  assert.equal(readRun(run.id).repo, undefined);
});

test('a run in the default factory — no --factory, or default — records no factory, and runs on the repository given', async () => {
  const { build } = fresh();
  const other = aRepo();
  for (const factory of [undefined, 'default']) {
    const run = await runPlaced(
      startRun({ brief: 'build it', repo: other, workflowDir: build, isolate: false, ...(factory ? { factory } : {}) }),
    );
    assert.equal('factory' in run, false, String(factory));
    assert.equal(run.repo, other);
    assert.equal('factory' in readRun(run.id), false);
  }
});

/** A card filed in the inbox as `<name>.md`, with `text` whole: its path. */
function aCard(name: string, text: string): string {
  fs.mkdirSync(inboxDir(), { recursive: true });
  const card = path.join(inboxDir(), `${name}.md`);
  fs.writeFileSync(card, text);
  return card;
}

test('nemia start <card> --factory starts the card in the factory, on its one repository from any directory, and removes it', async () => {
  const { repo, build } = fresh();
  hired();
  const card = aCard('build-it', 'Build it.\n');
  const out = await typedFrom(ROOT, ['start', card, '--workflows', build, '--factory', 'pipao', '--no-worktree']);
  const run = readRun(startedId(out));
  assert.equal(run.factory, 'pipao');
  assert.equal(run.repo, repo);
  assert.deepEqual(run.from, { inbox: 'build-it' });
  assert.ok(out.includes(`factory: pipao, on ${repo}`), out.join('\n'));
  assert.equal(fs.existsSync(card), false, 'the card is removed');
});

test("a card's factory: starts it in that factory, on its one repository, its workflow: found there — and --factory is over it", async () => {
  const { repo, build } = fresh();
  hired();
  fs.cpSync(path.dirname(build), path.join(repo, 'workflows'), { recursive: true });
  aCard('in-pipao', '---\nworkflow: build\nfactory: pipao\n---\nBuild it.\n');
  const run = readRun(startedId(await typedFrom(ROOT, ['start', path.join(inboxDir(), 'in-pipao.md'), '--no-worktree'])));
  assert.equal(run.factory, 'pipao');
  assert.equal(run.repo, repo);
  assert.equal(run.workflowDir, path.join(repo, 'workflows', 'build'), "the card's workflow: found in the factory's repository");

  const other = aRepo();
  addFactory({ name: 'other', repos: [other] });
  attachWorkflow({ factory: 'other', workflow: 'build' });
  hired('other');
  aCard('over', '---\nfactory: pipao\n---\nBuild it.\n');
  const over = await runPlaced(startFromInbox({ name: 'over', workflow: build, callerRepo: ROOT, isolate: false, factory: 'other' }));
  assert.equal(over.run.factory, 'other');
  assert.equal(readRun(over.run.id).repo, other);
});

test('nemia start <name> of an inbox card starts it as its path does: its body, its keys, and the card out of the inbox', async () => {
  const { repo, build } = fresh();
  hired();
  fs.cpSync(path.dirname(build), path.join(repo, 'workflows'), { recursive: true });
  const before = await runPlaced(startRun({ brief: 'read first', repo, workflowDir: build, isolate: false, factory: 'pipao' }));
  const card = aCard('by-its-name', `---\nworkflow: build\nfactory: pipao\nfrom: ${before.id}\n---\nBuild it by name.\n`);
  const elsewhere = fs.mkdtempSync(path.join(ROOT, 'typed-'));
  const run = readRun(startedId(await typedFrom(elsewhere, ['start', 'by-its-name', '--no-worktree'])));
  assert.equal(run.brief, 'Build it by name.');
  assert.equal(run.factory, 'pipao');
  assert.equal(run.workflowDir, path.join(repo, 'workflows', 'build'));
  assert.deepEqual(run.context, [before.id]);
  assert.deepEqual(run.from, { inbox: 'by-its-name' });
  assert.equal(fs.existsSync(card), false, 'the card is removed');

  const text = readRun(
    startedId(await typedFrom(elsewhere, ['start', 'no-such-card', '--factory', 'pipao', '--workflows', build, '--no-worktree'])),
  );
  assert.equal(text.brief, 'no-such-card', 'a name no card has stays a text brief');
  assert.equal('from' in text, false);

  const shadowed = aCard('shadowed', 'From the card.\n');
  fs.writeFileSync(path.join(elsewhere, 'shadowed'), 'From the file.\n');
  const file = readRun(
    startedId(await typedFrom(elsewhere, ['start', 'shadowed', '--factory', 'pipao', '--workflows', build, '--no-worktree'])),
  );
  assert.equal(file.brief, 'From the file.', 'a file of that name where it is typed is the brief');
  assert.ok(fs.existsSync(shadowed), 'the card of that name stays in the inbox');
});

test('a card of a factory with two repositories runs where it is started when that is one of them, else is refused naming both, nothing written and the card kept', async () => {
  const { build } = fresh();
  const [first, second] = [aRepo(), aRepo()];
  addFactory({ name: 'duo', repos: [first, second] });
  attachWorkflow({ factory: 'duo', workflow: 'build' });
  hired('duo');
  aCard('in-duo', '---\nfactory: duo\n---\nBuild it.\n');
  const inside = await runPlaced(startFromInbox({ name: 'in-duo', workflow: build, callerRepo: first, isolate: false }));
  assert.equal(readRun(inside.run.id).repo, first);
  assert.equal(inside.run.factory, 'duo');

  const card = aCard('outside-duo', '---\nfactory: duo\n---\nBuild it.\n');
  const before = runsWritten();
  const listed = [first, second].sort().join(', ');
  await assert.rejects(
    async () => await runPlaced(startFromInbox({ name: 'outside-duo', workflow: build, callerRepo: ROOT, isolate: false })),
    (err: Error & { exitCode?: number; _tag?: string }) =>
      err._tag === 'Invalid' &&
      err.exitCode === 2 &&
      err.message.startsWith(`${ROOT}: the factory duo works on ${listed}, and this repository is not one of them`),
  );
  assert.deepEqual(runsWritten(), before);
  assert.ok(fs.existsSync(card), 'the card is left in the inbox');
});

test("REFUSED: a card's factory: the store does not have, and one that does not offer the card's workflow — nothing written, the card kept", async () => {
  const { repo, build } = fresh(['dev']);
  const before = runsWritten();
  const nosuch = aCard('nosuch', '---\nfactory: nosuch\n---\nBuild it.\n');
  await assert.rejects(
    async () => await runPlaced(startFromInbox({ name: 'nosuch', workflow: build, callerRepo: repo, isolate: false })),
    refusedWith('Missing', /^no factory nosuch in the store\. Its factories are: pipao\. Nothing was started\.$/),
  );
  const unattached = aCard('unattached', '---\nfactory: pipao\n---\nBuild it.\n');
  await assert.rejects(
    async () => await runPlaced(startFromInbox({ name: 'unattached', workflow: build, callerRepo: repo, isolate: false })),
    refusedWith(
      'Invalid',
      /^build: the factory pipao does not offer this workflow — it offers: dev\. Attach it: nemia factory attach pipao build\. Nothing was started\.$/,
    ),
  );
  assert.deepEqual(runsWritten(), before);
  assert.ok(fs.existsSync(nosuch) && fs.existsSync(unattached), 'both cards are left in the inbox');
});

test('with WF_DEFAULT_FACTORY_STARTS=1, a card that names no factory records none, and runs on the repository it is started in', async () => {
  const { build } = fresh();
  const other = aRepo();
  aCard('no-key', 'Build it.\n');
  const { run } = await runPlaced(startFromInbox({ name: 'no-key', workflow: build, callerRepo: other, isolate: false }));
  assert.equal('factory' in readRun(run.id), false);
  assert.equal(readRun(run.id).repo, other);
});

test('REFUSED: a card that says factory: default, or is started with --factory default, even with WF_DEFAULT_FACTORY_STARTS=1; the card stays', async () => {
  const { build } = fresh();
  const other = aRepo();
  const before = runsWritten();
  const card = aCard('by-name', '---\nfactory: default\n---\nBuild it.\n');
  await assert.rejects(
    async () => await runPlaced(startFromInbox({ name: 'by-name', workflow: build, callerRepo: other, isolate: false })),
    refusedWith('Invalid', /^`default` is the default factory: .* Name a factory — `factory: <name>` in .*by-name\.md, one of pipao\./),
  );
  aCard('plain', 'Build it.\n');
  await assert.rejects(
    async () =>
      await runPlaced(
        startFromInbox({ name: 'plain', workflow: build, callerRepo: other, isolate: false, factory: 'default', fix: '--factory <name>' }),
      ),
    refusedWith(
      'Invalid',
      /^`default` is the default factory: .* Name a factory — --factory <name>, one of pipao\. Nothing was started\.$/,
    ),
  );
  assert.deepEqual(runsWritten(), before);
  assert.ok(fs.existsSync(card), 'the card is left in the inbox');
});

/** `text` as a pattern that matches it alone. */
const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The switch off, as shipped, for the test `t`: put back as it was once it ends. */
function asShipped(t: { after: (fn: () => void) => void }): void {
  const was = process.env.WF_DEFAULT_FACTORY_STARTS;
  delete process.env.WF_DEFAULT_FACTORY_STARTS;
  t.after(() => {
    if (was === undefined) delete process.env.WF_DEFAULT_FACTORY_STARTS;
    else process.env.WF_DEFAULT_FACTORY_STARTS = was;
  });
}

/** A factory `name` filed on `repos`, with `build` attached and every step of it hired. */
function filed(name: string, ...repos: string[]): void {
  addFactory({ name, repos });
  attachWorkflow({ factory: name, workflow: 'build' });
  hired(name);
}

/** The workspaces the place lists under the store's worktrees for `repo`, as a string to compare. */
const worktrees = (repo: string): string => {
  const read = stand().place.askNow('inventory', { repo, under: path.join(ROOT, 'worktrees'), prefix: 'wf/', base: 'main' });
  assert.ok('answer' in read, 'the place answered');
  return JSON.stringify(read.answer.workspaces.map((w) => w.path));
};

test('the workspaces a refused start is compared by are read off the place: one cut under the store lists, and the reading changes', () => {
  const repo = aRepo();
  const none = worktrees(repo);
  const at = path.join(ROOT, 'worktrees', 'cut-by-hand', 'implement');
  const made = stand().place.askNow('make', { repo, at, name: 'wf/cut-by-hand/implement', from: 'main', also: [] });
  assert.ok('answer' in made, JSON.stringify(made));
  assert.notEqual(worktrees(repo), none, 'a workspace cut since is a reading that differs');
  assert.deepEqual(JSON.parse(worktrees(repo)), [fs.realpathSync(at)]);
});

test('REFUSED as shipped: nemia start with no --factory in a folder two factories hold, naming each and the fix, with nothing written; --factory picks one', async (t) => {
  asShipped(t);
  const { build } = fresh();
  const shared = aRepo();
  filed('a', shared);
  filed('b', shared);
  const before = runsWritten();
  const trees = worktrees(shared);
  await assert.rejects(
    typedFrom(shared, ['start', 'build it', '--workflows', build]),
    refusedWith(
      'Invalid',
      new RegExp(
        `^${escaped(shared)}: 2 factories work on this folder — a on ${escaped(shared)}, b on ${escaped(shared)} — .* Name the one: --factory a, or --factory b\\. Nothing was started\\.$`,
      ),
    ),
  );
  assert.deepEqual(runsWritten(), before, 'no run written');
  assert.equal(worktrees(shared), trees, 'no worktree made');
  const run = readRun(startedId(await typedFrom(shared, ['start', 'build it', '--workflows', build, '--factory', 'b', '--no-worktree'])));
  assert.equal(run.factory, 'b');
});

test('REFUSED as shipped: nested repositories of two factories are two holders, with no deepest chosen', async (t) => {
  asShipped(t);
  const { build } = fresh();
  const outer = aRepo();
  const inner = path.join(outer, 'inner');
  fs.mkdirSync(inner);
  stand().world.repository(inner, {});
  filed('outer', outer);
  filed('inner', inner);
  const before = runsWritten();
  await assert.rejects(
    typedFrom(inner, ['start', 'build it', '--workflows', build, '--no-worktree']),
    refusedWith(
      'Invalid',
      /2 factories work on this folder — inner on .*, outer on .* Name the one: --factory inner, or --factory outer\./,
    ),
  );
  assert.deepEqual(runsWritten(), before);
});

test('REFUSED as shipped: nemia start with no --factory in a repository no factory holds, naming --factory and nemia factory add, with nothing written', async (t) => {
  asShipped(t);
  const { build } = fresh();
  const loose = aRepo();
  const before = runsWritten();
  await assert.rejects(
    typedFrom(loose, ['start', 'build it', '--workflows', build, '--no-worktree']),
    refusedWith(
      'Invalid',
      new RegExp(
        `^${escaped(loose)}: no factory works on this folder, .* Name the factory — --factory <name>, one of pipao — or file one on this repository .*: nemia factory add <name> --repo <root>,`,
      ),
    ),
  );
  assert.deepEqual(runsWritten(), before);
});

test("as shipped, nemia start with no --factory typed in a subfolder of a repository one factory alone holds runs in it, on that repository's root", async (t) => {
  asShipped(t);
  const { repo, build } = fresh();
  hired();
  const sub = path.join(repo, 'src', 'deep');
  fs.mkdirSync(sub, { recursive: true });
  const run = readRun(startedId(await typedFrom(sub, ['start', 'build it', '--workflows', build, '--no-worktree'])));
  assert.equal(run.factory, 'pipao');
  assert.equal(run.repo, repo);
  const named = readRun(startedId(await typedFrom(ROOT, ['start', 'again', '--workflows', build, '--repo', sub, '--no-worktree'])));
  assert.equal(named.factory, 'pipao', '--repo is the folder the factory is found from');
  assert.equal(named.repo, repo);
});

test('REFUSED: nemia start --factory default, as shipped and with WF_DEFAULT_FACTORY_STARTS=1, with nothing written', async (t) => {
  const { repo, build } = fresh();
  const before = runsWritten();
  const refusal = /^`default` is the default factory: .* Name a factory — --factory <name>, one of pipao\. Nothing was started\.$/;
  await assert.rejects(
    typedFrom(repo, ['start', 'x', '--workflows', build, '--factory', 'default', '--no-worktree']),
    refusedWith('Invalid', refusal),
  );
  asShipped(t);
  await assert.rejects(
    typedFrom(repo, ['start', 'x', '--workflows', build, '--factory', 'default', '--no-worktree']),
    refusedWith('Invalid', refusal),
  );
  assert.deepEqual(runsWritten(), before);
});

test('with WF_DEFAULT_FACTORY_STARTS=1, nemia start no factory holds goes to the default factory; a folder two hold is refused all the same', async () => {
  const { build } = fresh();
  const loose = aRepo();
  const run = readRun(startedId(await typedFrom(loose, ['start', 'build it', '--workflows', build, '--no-worktree'])));
  assert.equal('factory' in run, false);
  assert.equal(run.repo, loose);
  const shared = aRepo();
  filed('a', shared);
  filed('b', shared);
  await assert.rejects(
    typedFrom(shared, ['start', 'x', '--workflows', build, '--no-worktree']),
    refusedWith('Invalid', /2 factories work on this folder/),
  );
});

/** A plan folder of two cards on `build`, `b` after `a`. */
function aPlanOf(build: string): string {
  const dir = fs.mkdtempSync(path.join(ROOT, 'plan-'));
  fs.writeFileSync(path.join(dir, 'a.md'), `---\nworkflow: ${build}\n---\nThe first.\n`);
  fs.writeFileSync(path.join(dir, 'b.md'), `---\nworkflow: ${build}\nafter: a\n---\nThe second.\n`);
  return dir;
}

/** The runs `nemia plan` started: the records written since `before`. */
const plannedRuns = (before: readonly string[]) =>
  runsWritten()
    .filter((f) => f.endsWith('.json') && !before.includes(f))
    .map((f) => readRun(f.slice(0, -'.json'.length)));

test('REFUSED as shipped: nemia plan with no --factory where no factory, or two, holds the folder, before its first card is started', async (t) => {
  asShipped(t);
  const { build } = fresh();
  const plan = aPlanOf(build);
  const loose = aRepo();
  const before = runsWritten();
  await assert.rejects(typedFrom(loose, ['plan', plan]), refusedWith('Invalid', /no factory works on this folder, .*--factory <name>/));
  const shared = aRepo();
  filed('a', shared);
  filed('b', shared);
  await assert.rejects(
    typedFrom(ROOT, ['plan', plan, '--repo', shared]),
    refusedWith('Invalid', /Name the one: --factory a, or --factory b\./),
  );
  assert.deepEqual(runsWritten(), before);
});

test('as shipped, nemia plan runs every card in the factory one alone holds the folder of, or in --factory', async (t) => {
  asShipped(t);
  const { repo, build } = fresh();
  hired();
  const before = runsWritten();
  await typedFrom(repo, ['plan', aPlanOf(build)]);
  const found = plannedRuns(before);
  assert.equal(found.length, 2);
  for (const run of found) assert.deepEqual([run.factory, run.repo], ['pipao', repo]);
  const second = aRepo();
  filed('duo', second);
  const between = runsWritten();
  await typedFrom(ROOT, ['plan', aPlanOf(build), '--factory', 'duo']);
  const named = plannedRuns(between);
  assert.equal(named.length, 2);
  for (const run of named) assert.deepEqual([run.factory, run.repo], ['duo', second]);
});

test("REFUSED as shipped: nemia start <card> naming no factory, though one alone holds where it is typed and its repo:; --factory or the card's factory: starts it", async (t) => {
  asShipped(t);
  const { repo, build } = fresh();
  hired();
  const before = runsWritten();
  const card = aCard('loose', `---\nrepo: ${repo}\n---\nBuild it.\n`);
  await assert.rejects(
    typedFrom(repo, ['start', card, '--workflows', build, '--no-worktree']),
    refusedWith(
      'Invalid',
      new RegExp(
        `^${escaped(card)}: this card names no factory, .* Write \`factory: <name>\` in its frontmatter — one of pipao, or name it at start: --factory <name>; .* Nothing was started\\.$`,
      ),
    ),
  );
  assert.deepEqual(runsWritten(), before);
  assert.ok(fs.existsSync(card), 'the card stays in the inbox');
  const flagged = readRun(startedId(await typedFrom(repo, ['start', card, '--workflows', build, '--factory', 'pipao', '--no-worktree'])));
  assert.equal(flagged.factory, 'pipao');
  const own = aCard('own', `---\nfactory: pipao\n---\nBuild it.\n`);
  assert.equal(readRun(startedId(await typedFrom(ROOT, ['start', own, '--workflows', build, '--no-worktree']))).factory, 'pipao');
});

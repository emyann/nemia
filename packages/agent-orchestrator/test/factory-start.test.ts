/**
 * Factories, told as a person's stories on the stage (`story.ts`): a factory filed from nothing, given its workflows, its hires and a
 * schedule, listed, started in from a subfolder and removed with its rules and instruction; a start in it refused step by step, each
 * refusal by kind (`_tag`), exit 2 and the facts it names, with no run written; and an inbox card started in its factory.
 *
 * The rest of the area: the argument refusals of `nemia factory` as tables, and two adds racing, in `src/factory/factory.store.test.ts`;
 * names, holders and what `nemia factory ls` says, pure, in `src/factory/factory.test.ts`; the rules and the instruction in
 * `factory-rules.test.ts`, `src/factory/rules/` and `src/factory/instruction.store.test.ts`; schedules over time in `schedule.test.ts`.
 *
 * The test's store is its own, at `ROOT`, given as `ENV`. Every run here is filed in a factory as shipped,
 * or in the default one where `WF_DEFAULT_FACTORY_STARTS` (which `test/ambient.ts` sets, and `ENV` keeps) lets it: `asShipped` takes
 * the switch out of `ENV` for a checkpoint.

 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { factoryLines } from '../src/factory/factory.ts';
import { teamCopy } from './team.ts';
import { names } from './assessed.ts';
import { staged, story } from './story.ts';
import { advanceRun, inboxDir, parseArgv, repoFor, START, startRun, startFromInbox, runWith as runEngine } from '../src/runner.ts';
import {
  addFactoryAt,
  attachWorkflowAt,
  fireAgentAt,
  hireAgentAt,
  readFactoriesAt,
  readFactoryAt,
  setInstructionAt,
  setScheduleAt,
} from '../src/factory/factory.store.ts';
import { runRecord } from '../src/record/record.store.ts';
import { detached } from './factory-planted.ts';
import { engineOf } from '../src/runtime-client.ts';
import { nemiaDefinition } from '../src/nemia/level.store.ts';
import { writeRules } from '../src/factory/rules/rules.store.ts';
import { writeInstructionText } from '../src/factory/instruction.store.ts';
import { told } from './typed.ts';
import { startedLines, startFactoryAtOnce, wiredRepoFor, workflowFolder, type StartInput } from '../src/runner.ts';
import { inboxNameAt } from '../src/inbox/inbox.store.ts';
import { settingsOf } from '../src/config/config.store.ts';

const ROOT = scratch('wf-factory-start-');
const FACTORIES = path.join(ROOT, 'factories');
/** The test's store and its settings: `asShipped` takes the default factory's switch out of it, for a checkpoint's scope. */
const ENV: Record<string, string | undefined> = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1' };
/** A command line as a person types it: a verb the client holds on its entry's handler, its lines said (`told`); else `main`. */
const stage = staged({ runWith: runEngine, main: told, engineOf, env: ENV });
/** The test place of this test, as the focused test below reads it. */
const stand = stage.place;
const { runPlaced } = stage;

type Refusal = Error & { exitCode?: number; _tag?: string };

/** What `act` was refused with: its kind, exit 2 and each of `facts` named, never its sentence. */
async function refusedBy(act: () => unknown, tag: 'Missing' | 'Invalid' | 'Conflict', ...facts: string[]): Promise<string> {
  let caught: Refusal | undefined;
  try {
    await act();
  } catch (err) {
    caught = err as Refusal;
  }
  assert.ok(caught, 'refused');
  assert.deepEqual([caught._tag, caught.exitCode], [tag, 2], caught.message);
  names(caught.message, ...facts);
  return caught.message;
}

/** The runs written under the store: none after a refusal. */
const runsWritten = (): string[] => (fs.existsSync(path.join(ROOT, 'runs')) ? fs.readdirSync(path.join(ROOT, 'runs')) : []);

/** `refusedBy`, and no run written by it. */
async function startRefused(act: () => unknown, tag: 'Missing' | 'Invalid', ...facts: string[]): Promise<string> {
  const before = runsWritten();
  const said = await refusedBy(act, tag, ...facts);
  assert.deepEqual(runsWritten(), before, 'no run written');
  return said;
}

/** A repository with one commit on `main`, for a run with no worktree to stand on. */
function aRepo(): string {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stand().world.repository(repo, { 'README.md': 'x\n' });
  return repo;
}

/**
 * The tests' team with one more workflow, `build`: `implement` and `review` name no agent, and `named` names its own, `reviewer`; no
 * factory filed.
 */
function aTeam(): { build: string; dev: string } {
  fs.rmSync(FACTORIES, { recursive: true, force: true });
  const team = teamCopy();
  const build = path.join(team, 'build');
  fs.mkdirSync(build);
  fs.writeFileSync(path.join(build, 'implement.md'), '---\nplace: git\n---\nBuild what was asked.\n');
  fs.writeFileSync(path.join(build, 'review.md'), '---\nafter: implement\nplace: git\n---\nReview it.\n');
  fs.writeFileSync(path.join(build, 'named.md'), '---\nafter: review\nplace: git\nagent: reviewer\n---\nSay what you found.\n');
  return { build, dev: path.join(team, 'dev') };
}

/** `aTeam`, and the factory `pipao` filed on a repository of its own, hiring no one, with `attached` attached. */
function fresh(attached: readonly string[] = ['build']): { repo: string; build: string; dev: string } {
  const team = aTeam();
  const repo = aRepo();
  addFactoryAt(ROOT, { name: 'pipao', repos: [repo] });
  for (const workflow of attached) attachWorkflowAt(ROOT, { factory: 'pipao', workflow });
  return { repo, ...team };
}

/** Every step of `build` filled in `factory`: `implement` and `review` hired, `named` naming its own. */
function hired(factory = 'pipao'): void {
  hireAgentAt(ROOT, { factory, agent: 'implementer', step: 'build/implement' });
  hireAgentAt(ROOT, { factory, agent: 'reviewer', step: 'build/review' });
}

/** A factory `name` filed on `repos`, with `build` attached and every step of it hired. */
function filed(name: string, ...repos: string[]): void {
  addFactoryAt(ROOT, { name, repos });
  attachWorkflowAt(ROOT, { factory: name, workflow: 'build' });
  hired(name);
}

/** What `nemia <argv>` prints, typed from `cwd`, a line each. */
async function typedFrom(cwd: string, argv: string[]): Promise<string[]> {
  if (argv[0] === 'start') return startTypedFrom(cwd, argv);
  const lines: string[] = [];
  const log = console.log;
  const was = process.cwd();
  console.log = (...args: unknown[]) => {
    lines.push(args.join(' '));
  };
  process.chdir(cwd);
  try {
    await stage.main(argv);
  } finally {
    process.chdir(was);
    console.log = log;
  }
  return lines.join('\n').split('\n');
}

/**
 * `nemia start <argv>` typed in `cwd`, as the client and the api run it together: a file there read as the brief; else an inbox card, by
 * its path or its name, started as the
 * Card's `start` starts it (`START` given the `card`, from `cwd`); any other brief in the factory `--factory` names, else the one whose
 * repository holds `--repo` or `cwd`, as the Run's `create` finds it (`startFactoryAtOnce`), on the repository its wiring names for the
 * workflow (`wiredRepoFor`), a `--repo` that names another said to have only found the factory. The lines the client prints of the answer.
 */
async function startTypedFrom(cwd: string, argv: string[]): Promise<string[]> {
  const args = parseArgv(START.spec, argv.slice(1)) ?? {};
  const text = (key: string) => (typeof args[key] === 'string' ? args[key] : undefined);
  const named = text('repo') === undefined ? undefined : path.resolve(cwd, text('repo') ?? '');
  const file = path.resolve(cwd, text('brief') ?? '');
  const was = process.cwd();
  process.chdir(cwd);
  try {
    const card = inboxNameAt(ROOT, text('brief') ?? '');
    const here = fs.statSync(file, { throwIfNoEntry: false })?.isFile() === true;
    if (card !== null)
      return startedLines(
        await stage.runWith(
          stage.board().e,
          START.handler({ ...args, brief: undefined, card, at: cwd, fix: '--factory <name>', repo: named }),
        ),
      );
    const found = startFactoryAtOnce(ROOT, text('factory'), named ?? cwd, '--factory <name>', settingsOf(ENV).defaultFactoryStarts);
    const typed = text('workflows');
    const wired =
      found.factory === undefined || typed === undefined
        ? undefined
        : wiredRepoFor(ROOT, found.factory.name, path.basename(path.resolve(cwd, typed)));
    const repo = wired ?? found.repo ?? repoFor(ROOT, found.factory?.name, named, cwd);
    const foundFactory = wired !== undefined && named !== undefined && named !== wired ? text('repo') : undefined;
    const workflows = typed === undefined ? undefined : workflowFolder(typed, cwd, repo, found.factory?.tree);
    const brief = here ? fs.readFileSync(file, 'utf8').trim() : text('brief');
    const given = {
      ...args,
      brief,
      repo,
      repoNamed: named !== undefined && foundFactory === undefined,
      factory: found.factory?.name,
      ...(workflows !== undefined ? { workflows } : {}),
      ...(foundFactory !== undefined ? { repoFoundFactory: foundFactory } : {}),
    } as StartInput;
    return startedLines(await stage.runWith(stage.board().e, START.handler(given)));
  } finally {
    process.chdir(was);
  }
}

/** The id of the run `nemia start` printed first. */
const startedId = (lines: readonly string[]): string => lines[0].split(' ')[0];

/** The switch off, as shipped, for the test or checkpoint `t`: put back as it was once it ends. */
function asShipped(t: { after: (fn: () => void) => void }): void {
  const was = ENV.WF_DEFAULT_FACTORY_STARTS;
  ENV.WF_DEFAULT_FACTORY_STARTS = undefined;
  t.after(() => {
    ENV.WF_DEFAULT_FACTORY_STARTS = was;
  });
}

/** The factory `name`'s file, as JSON. */
const fileOf = (name: string): Record<string, unknown> => JSON.parse(fs.readFileSync(path.join(FACTORIES, `${name}.json`), 'utf8'));

/** The files in the factories folder, hidden ones too, by name. */
const factoryFiles = () => (fs.existsSync(FACTORIES) ? fs.readdirSync(FACTORIES).sort() : []);

/** The workspaces the place lists under the store's worktrees for `repo`, as a string to compare. */
const worktrees = (repo: string): string => {
  const read = stand().place.askNow('inventory', { repo, under: path.join(ROOT, 'worktrees'), run: 'r', base: 'main' });
  assert.ok('answer' in read, 'the place answered');
  return JSON.stringify(read.answer.workspaces.map((w) => w.path));
};

/** A plan folder of two cards on `build`, `b` after `a`. */
function aPlanOf(build: string): string {
  const dir = fs.mkdtempSync(path.join(ROOT, 'plan-'));
  fs.writeFileSync(path.join(dir, 'a.md'), `---\nworkflow: ${build}\n---\nThe first.\n`);
  fs.writeFileSync(path.join(dir, 'b.md'), `---\nworkflow: ${build}\nafter: a\n---\nThe second.\n`);
  return dir;
}

/** A card filed in the inbox as `<name>.md`, with `text` whole: its path. */
function aCard(name: string, text: string): string {
  fs.mkdirSync(inboxDir(ROOT), { recursive: true });
  const card = path.join(inboxDir(ROOT), `${name}.md`);
  fs.writeFileSync(card, text);
  return card;
}

/** What `nemia factory ls` lists of the store's factories, as the orchestrator words a listing (`factoryLines`); the client's own. */
const listedHere = (): string[] => factoryLines(readFactoriesAt(ROOT));
const DEFAULT_LINE = 'default  every run and card that names no factory — read, never written';

test('a factory from nothing to a run: filed, given workflows, hires and a schedule, listed, started in, and removed', async (t) => {
  const s = story(t);
  const { build } = aTeam();
  const [a, b] = [aRepo(), aRepo()];
  const file = path.join(FACTORIES, 'pipao.json');
  let run = '';

  await s.test(
    "no factory is filed before the first `nemia factory add` (its listing and help are the client's: apps/cli/test)",
    async () => {
      assert.deepEqual(readFactoriesAt(ROOT), []);
    },
  );

  await s.test(
    '`nemia factory add` files <name>.json, each repository absolute and named once, no workflows key, a plain directory enough',
    async () => {
      await typedFrom(ROOT, ['factory', 'add', 'pipao', '--repo', a, '--repo', path.relative(ROOT, a), '--repo', b]);
      assert.deepEqual(factoryFiles(), ['pipao.json']);
      assert.deepEqual(fileOf('pipao'), { repos: [a, b], generation: 1 }, 'an add writes no workflows key, and its generation 1');
      assert.ok(!fs.existsSync(path.join(a, '.git')));
      assert.deepEqual(readFactoryAt(ROOT, 'pipao'), {
        name: 'pipao',
        repos: [a, b],
        workflows: [],
        hires: {},
        schedules: {},
        generation: 1,
      });
      const listed = readFactoriesAt(ROOT).find((f) => f.name === 'pipao');
      assert.ok(listed && !('error' in listed) && listed.workflows.length === 0, 'it has attached, hired and scheduled none');
    },
  );

  await s.test(
    '`nemia factory attach` adds a workflow by name, sorted and once, keeping every other key; detach takes it back',
    async () => {
      fs.writeFileSync(file, JSON.stringify({ ...fileOf('pipao'), later: { kept: true } }));
      await typedFrom(ROOT, ['factory', 'attach', 'pipao', 'intake']);
      attachWorkflowAt(ROOT, { factory: 'pipao', workflow: 'build' });
      attachWorkflowAt(ROOT, { factory: 'pipao', workflow: 'notes' });
      const before = fs.readFileSync(file);
      await typedFrom(ROOT, ['factory', 'attach', 'pipao', 'build']);
      assert.deepEqual(attachWorkflowAt(ROOT, { factory: 'pipao', workflow: 'build' }), { file, already: true });
      assert.deepEqual(fs.readFileSync(file), before, 'an attach of one attached already writes nothing');
      assert.deepEqual(readFactoryAt(ROOT, 'pipao').workflows, ['build', 'intake', 'notes']);
      assert.deepEqual(factoryFiles(), ['pipao.json'], 'no hidden file left behind');
    },
  );

  await s.test(
    '`nemia factory hire` files one agent a step, a second hire replacing the first; fire takes one back and keeps the rest',
    async () => {
      await typedFrom(ROOT, ['factory', 'hire', 'pipao', 'otto', '--step', 'build/implement']);
      await typedFrom(ROOT, ['factory', 'hire', 'pipao', 'implementer', '--step=build/implement']);
      assert.deepEqual(hireAgentAt(ROOT, { factory: 'pipao', agent: 'reviewer', step: 'build/review' }), { file });
      hireAgentAt(ROOT, { factory: 'pipao', agent: 'shipper', step: 'intake/frame' });
      await typedFrom(ROOT, ['factory', 'fire', 'pipao', '--step', 'intake/frame']);
      await typedFrom(ROOT, ['factory', 'detach', 'pipao', 'intake']);
      assert.deepEqual(fileOf('pipao'), {
        repos: [a, b],
        later: { kept: true },
        workflows: ['build', 'notes'],
        hires: { 'build/implement': 'implementer', 'build/review': 'reviewer' },
        generation: 10,
      });
      assert.deepEqual(factoryFiles(), ['pipao.json']);
    },
  );

  await s.test(
    '`nemia factory schedule` writes a schedule stamped with since, read back, written again whole; unschedule takes it',
    async () => {
      const typed = ['factory', 'schedule', 'pipao', 'build', '--cron', '0 9 * * 1', '--brief', 'Read the stats', '--tz', 'UTC'];
      await typedFrom(ROOT, [...typed, '--repo', a]);
      const first = readFactoryAt(ROOT, 'pipao').schedules.build;
      assert.deepEqual([first.brief, first.tz, first.repo], ['Read the stats', 'UTC', a]);
      const before = Date.now();
      const again = setScheduleAt(ROOT, { factory: 'pipao', workflow: 'build', cron: '0 9 * * 1', brief: 'Read the stats', repo: a });
      assert.deepEqual(again.replaced, first);
      assert.ok(Date.parse(again.schedule.since) >= before - 1000 && Date.parse(again.schedule.since) <= Date.now());
      assert.deepEqual(
        readFactoryAt(ROOT, 'pipao').schedules,
        { build: { cron: '0 9 * * 1', brief: 'Read the stats', repo: a, since: again.schedule.since } },
        'a schedule written again is written whole: no zone',
      );
      assert.deepEqual((fileOf('pipao') as { later: unknown }).later, { kept: true });
    },
  );

  await s.test('`nemia factory ls` lists the factory with its workflows, its hires and its schedule', async () => {
    const listed = listedHere();
    assert.deepEqual(listed.slice(0, 5), [
      DEFAULT_LINE,
      `pipao    ${a}, ${b}`,
      '         workflows: build, notes',
      '         build/implement ← implementer',
      '         build/review ← reviewer',
    ]);
    await typedFrom(ROOT, ['factory', 'unschedule', 'pipao', 'build']);
    assert.deepEqual(readFactoryAt(ROOT, 'pipao').schedules, {});
  });

  await s.test(
    'REFUSED: a start of a workflow the factory of two repositories names none for, naming the attach; the attach names one',
    async () => {
      await startRefused(
        () => typedFrom(a, ['start', 'build it', '--workflows', build, '--no-worktree']),
        'Invalid',
        'nemia factory attach',
        'build --repo',
        path.basename(a),
        path.basename(b),
      );
      const attach = ['factory', 'attach', 'pipao', 'build', '--repo', path.basename(a)];
      await typedFrom(ROOT, attach);
      assert.equal(readFactoryAt(ROOT, attach[2]).workflowRepos?.build, path.basename(a), 'the attach names the repository build works on');
    },
  );

  await s.test('as shipped, `nemia start` typed in a subfolder of a repository it alone holds runs in it, on that root', async (sub) => {
    asShipped(sub);
    const deep = path.join(a, 'src', 'deep');
    fs.mkdirSync(deep, { recursive: true });
    const out = await typedFrom(deep, ['start', 'build it', '--workflows', build, '--no-worktree']);
    run = startedId(out);
    assert.deepEqual([runRecord(ROOT, run).factory, runRecord(ROOT, run).repo], ['pipao', a]);
    assert.ok(out.includes(`factory: pipao, on ${a}`), out.join('\n'));
    const named = runRecord(
      ROOT,
      startedId(await typedFrom(ROOT, ['start', 'again', '--workflows', build, '--repo', deep, '--no-worktree'])),
    );
    assert.deepEqual([named.factory, named.repo], ['pipao', a], '--repo is the folder the factory is found from');
  });

  await s.test('the run names its factory on its record, and runs each step as its hire, frozen as started', () => {
    const record = JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${run}.json`), 'utf8'));
    assert.equal(record.factory, 'pipao');
    const steps = Object.fromEntries((runRecord(ROOT, run).workflow ?? []).map((st) => [st.name, st]));
    assert.equal(steps.implement.agent?.name, 'implementer');
    assert.match(
      steps.implement.body,
      /^## 1\. [^\n]+\n\nMake the change you were asked for, in this repository\.[\s\S]*\n## 5\. [^\n]+\n\nBuild what was asked\.$/,
    );
    assert.equal(steps.implement.model, 'opus', "the hire's keys are the step's");
    assert.equal(steps.review.agent?.name, 'reviewer');
    assert.equal(steps.named.agent?.name, 'reviewer', 'a step that names its own agent is filled in any factory');
    assert.equal(record.workflow[0].agent.name, 'implementer');
  });

  await s.test('a later hire and fire change no step of the run started', () => {
    const before = fs.readFileSync(path.join(ROOT, 'runs', `${run}.json`), 'utf8');
    hireAgentAt(ROOT, { factory: 'pipao', agent: 'shipper', step: 'build/implement' });
    fireAgentAt(ROOT, { factory: 'pipao', step: 'build/review' });
    assert.equal(fs.readFileSync(path.join(ROOT, 'runs', `${run}.json`), 'utf8'), before);
    assert.equal(runRecord(ROOT, run).workflow?.[0].agent?.name, 'implementer');
    hired();
  });

  await s.test(
    '`nemia factory volume add` writes a marked volume into the file, a second of its path replacing it; REFUSED unmarked or on default',
    async () => {
      const f = path.basename(file, '.json');
      const [notes, scratchpad] = [scratch('wf-volume-notes-'), scratch('wf-volume-pad-')];
      await typedFrom(ROOT, ['factory', 'volume', 'add', f, `${notes}:rw`]);
      await typedFrom(ROOT, ['factory', 'volume', 'add', f, `${notes}:ro`]);
      await typedFrom(ROOT, ['factory', 'volume', 'add', f, `${scratchpad}:rw`]);
      const volumes = [
        { path: notes, readOnly: true, name: path.basename(notes).toLowerCase() },
        { path: scratchpad, readOnly: false, name: path.basename(scratchpad).toLowerCase() },
      ].sort((x, y) => x.path.localeCompare(y.path));
      assert.deepEqual((fileOf(f) as { volumes: unknown }).volumes, volumes);
      assert.deepEqual((fileOf(f) as { later: unknown }).later, { kept: true }, 'every other key kept');
      await typedFrom(ROOT, ['factory', 'detach', f, 'notes']);
      await typedFrom(ROOT, ['factory', 'attach', f, 'notes']);
      assert.deepEqual((fileOf(f) as { volumes: unknown }).volumes, volumes, 'a wiring change keeps the volumes');
      await refusedBy(() => typedFrom(ROOT, ['factory', 'volume', 'add', f, notes]), 'Invalid', notes);
      await refusedBy(() => typedFrom(ROOT, ['factory', 'volume', 'add', 'default', `${notes}:ro`]), 'Conflict');
      await refusedBy(() => typedFrom(ROOT, ['factory', 'volume', 'add', f, `${ROOT}:ro`]), 'Invalid', ROOT);
      const listed = listedHere().filter((l) => l.includes(' volume '));
      assert.deepEqual(
        listed.map((l) => l.trim().split(' ').slice(0, 3).join(' ')),
        volumes.map((v) => `volume ${v.path} ${v.readOnly ? ':ro' : ':rw'}`),
      );
    },
  );

  await s.test(
    'a run started then mounts the volumes, frozen on its record and said at its start; a volume removed after changes no run started',
    async () => {
      const f = path.basename(file, '.json');
      const volumes = (readFactoryAt(ROOT, f).volumes ?? []).map(({ path: at, readOnly }) => ({ path: at, readOnly }));
      const out = await typedFrom(b, ['start', 'x', '--workflows', build, '--factory', f, '--no-worktree']);
      const id = startedId(out);
      assert.deepEqual(runRecord(ROOT, id).volumes, volumes);
      const writable = volumes.find((v) => !v.readOnly);
      assert.ok(writable);
      assert.ok(
        out.some((l) => l.startsWith(`volume: ${writable.path} — writable for `) && l.includes("not the run's workspace")),
        out.join('\n'),
      );
      const before = fs.readFileSync(path.join(ROOT, 'runs', `${id}.json`), 'utf8');
      for (const v of volumes) await typedFrom(ROOT, ['factory', 'volume', 'rm', f, v.path]);
      assert.equal('volumes' in fileOf(f), false, 'the key is gone once none is left');
      assert.equal(fs.readFileSync(path.join(ROOT, 'runs', `${id}.json`), 'utf8'), before);
      await refusedBy(() => typedFrom(ROOT, ['factory', 'volume', 'rm', f, writable.path]), 'Missing', writable.path);
    },
  );

  await s.test(
    '`nemia factory setting set` writes a harness setting into the file, listed and kept by a wiring change; REFUSED a widening key or on default',
    async () => {
      const f = path.basename(file, '.json');
      const off = { commit: '', pr: '' };
      await typedFrom(ROOT, ['factory', 'setting', 'set', f, 'claude.attribution', JSON.stringify(off)]);
      assert.deepEqual(fileOf(f).harnessSettings, { claude: { attribution: off } });
      assert.deepEqual((fileOf(f) as { later: unknown }).later, { kept: true }, 'every other key kept');
      const before = fs.readFileSync(file, 'utf8');
      await refusedBy(
        () => typedFrom(ROOT, ['factory', 'setting', 'set', f, 'claude.permissions', '{"allow":["Bash(*)"]}']),
        'Invalid',
        'permissions',
      );
      await refusedBy(() => typedFrom(ROOT, ['factory', 'setting', 'set', f, 'codex.model', '"x"']), 'Invalid', 'codex');
      await refusedBy(() => typedFrom(ROOT, ['factory', 'setting', 'set', f, 'claude.language', 'french']), 'Invalid', 'french');
      await refusedBy(() => typedFrom(ROOT, ['factory', 'setting', 'set', 'default', 'claude.attribution', 'false']), 'Conflict');
      assert.equal(fs.readFileSync(file, 'utf8'), before, 'nothing written');
      await typedFrom(ROOT, ['factory', 'detach', f, 'notes']);
      await typedFrom(ROOT, ['factory', 'attach', f, 'notes']);
      assert.deepEqual(fileOf(f).harnessSettings, { claude: { attribution: off } }, 'a wiring change keeps the settings');
      const listed = listedHere().filter((l) => l.includes(' setting '));
      assert.deepEqual(
        listed.map((l) => l.trim()),
        ['setting claude.attribution {"commit":"","pr":""}'],
      );
    },
  );

  await s.test(
    "a run started then freezes the settings, says them, and files them to each Claude Code step's session; a setting removed after changes no run started",
    async () => {
      const f = path.basename(file, '.json');
      const out = await typedFrom(b, ['start', 'x', '--workflows', build, '--factory', f, '--no-worktree']);
      const id = startedId(out);
      assert.deepEqual(runRecord(ROOT, id).harnessSettings, { claude: { attribution: { commit: '', pr: '' } } });
      assert.ok(
        out.some((l) => l.startsWith('harness settings: claude.attribution')),
        out.join('\n'),
      );
      await stage.runWith(stage.board().e, advanceRun(runRecord(ROOT, id)));
      const filed = stage.board().specs.filter((spec) => Object.values(runRecord(ROOT, id).steps).some((st) => st.taskId === spec.id));
      assert.ok(filed.length, 'a step was filed');
      for (const spec of filed) {
        const settings = spec.config?.claude?.settings;
        assert.deepEqual(JSON.parse(settings ?? '{}').attribution, { commit: '', pr: '' }, spec.id);
      }
      const record = fs.readFileSync(path.join(ROOT, 'runs', `${id}.json`), 'utf8');
      await typedFrom(ROOT, ['factory', 'setting', 'rm', f, 'claude.attribution']);
      assert.equal('harnessSettings' in fileOf(f), false, 'the key is gone once none is left');
      assert.equal(fs.readFileSync(path.join(ROOT, 'runs', `${id}.json`), 'utf8'), record);
      await refusedBy(() => typedFrom(ROOT, ['factory', 'setting', 'rm', f, 'claude.attribution']), 'Missing', 'claude.attribution');
    },
  );

  await s.test(
    "a run started then freezes its workflow's cost line, and no other's; a run in the default factory has none; a line changed after changes no run started",
    async () => {
      const f = path.basename(file, '.json');
      const start = async (cwd: string, ...factory: string[]) =>
        runRecord(ROOT, startedId(await typedFrom(cwd, ['start', 'x', '--workflows', build, ...factory, '--no-worktree'])));
      await typedFrom(ROOT, ['factory', 'cost-line', 'set', f, 'notes', '30']);
      assert.equal((await start(b, '--factory', f)).costLine, undefined, "notes' line is not build's");
      await typedFrom(ROOT, ['factory', 'cost-line', 'set', f, 'build', '80']);
      const frozen = await start(b, '--factory', f);
      assert.equal(frozen.costLine, 80);
      assert.equal((await start(aRepo())).costLine, undefined, 'a run in the default factory');
      const record = fs.readFileSync(path.join(ROOT, 'runs', `${frozen.id}.json`), 'utf8');
      await typedFrom(ROOT, ['factory', 'cost-line', 'set', f, 'build', '95']);
      await typedFrom(ROOT, ['factory', 'cost-line', 'rm', f, 'notes']);
      assert.equal(fs.readFileSync(path.join(ROOT, 'runs', `${frozen.id}.json`), 'utf8'), record, 'the run keeps the line it began with');
      await refusedBy(() => typedFrom(ROOT, ['factory', 'detach', f, 'build']), 'Invalid');
      await typedFrom(ROOT, ['factory', 'cost-line', 'rm', f, 'build']);
      assert.equal('costLines' in fileOf(f), false, 'the key is gone once none is left');
    },
  );

  await s.test(
    'REFUSED: a start in a factory whose file a person gave a widening setting by hand, naming it, and no run written',
    async () => {
      const f = path.basename(file, '.json');
      const before = fs.readFileSync(file, 'utf8');
      fs.writeFileSync(file, JSON.stringify({ ...fileOf(f), harnessSettings: { claude: { hooks: {} } } }));
      const runs = runsWritten();
      await refusedBy(() => typedFrom(b, ['start', 'x', '--workflows', build, '--factory', f, '--no-worktree']), 'Invalid', 'hooks');
      assert.deepEqual(runsWritten(), runs);
      fs.writeFileSync(file, before);
    },
  );

  await s.test('of two repositories: the one its wiring names, wherever it is typed and whatever --repo names, saying so', async () => {
    const inside = await typedFrom(b, ['start', 'x', '--workflows', build, '--factory', 'pipao', '--no-worktree']);
    assert.equal(runRecord(ROOT, startedId(inside)).repo, a);
    const named = await typedFrom(ROOT, ['start', 'x', '--workflows', build, '--factory', 'pipao', '--repo', b, '--no-worktree']);
    assert.equal(runRecord(ROOT, startedId(named)).repo, a);
    const said = named.find((l) => l.startsWith(`--repo ${b} `));
    assert.ok(said, named.join('\n'));
    names(said, 'build', a);
    const elsewhere = await typedFrom(ROOT, ['start', 'x', '--workflows', build, '--factory', 'pipao', '--no-worktree']);
    assert.equal(runRecord(ROOT, startedId(elsewhere)).repo, a, 'typed outside its repositories, on the one wired');
  });

  await s.test('a factory of one repository gives the run its repository, from any directory', async () => {
    const c = aRepo();
    await typedFrom(ROOT, ['factory', 'add', 'mono', '--repo', c]);
    attachWorkflowAt(ROOT, { factory: 'mono', workflow: 'build' });
    hired('mono');
    assert.equal(repoFor(ROOT, 'mono', undefined, ROOT), c);
    assert.equal(repoFor(ROOT, 'mono', '/elsewhere', ROOT), '/elsewhere', 'a repository named is kept, for the start to judge');
    assert.equal(repoFor(ROOT, undefined, undefined, ROOT), ROOT);
    const out = await typedFrom(ROOT, ['start', 'build it', '--workflows', build, '--factory', 'mono', '--no-worktree']);
    assert.deepEqual([runRecord(ROOT, startedId(out)).repo, runRecord(ROOT, startedId(out)).factory], [c, 'mono']);
    assert.ok(out.includes(`factory: mono, on ${c}`), out.join('\n'));
    assert.deepEqual(listedHere().slice(0, 2), [DEFAULT_LINE, `mono     ${c}`], 'listed by name, not as filed');
  });

  await s.test('a folder team started in the factory names it and works on no repository', async () => {
    const notes = path.join(path.dirname(build), 'notes');
    fs.mkdirSync(notes);
    fs.writeFileSync(path.join(notes, 'write.md'), '---\nworkspace: folder\nagent: implementer\n---\nWrite it.\n');
    const folder = await runPlaced(startRun({ brief: 'a note', repo: ROOT, workflowDir: notes, factory: 'pipao' }));
    assert.deepEqual([folder.place?.kind, folder.factory, runRecord(ROOT, folder.id).repo], ['folder', 'pipao', undefined]);
  });

  await s.test(
    'with WF_DEFAULT_FACTORY_STARTS=1, a start no factory holds is in the default factory: plain sessions, no factory recorded',
    async () => {
      fs.writeFileSync(path.join(FACTORIES, 'default.json'), '{"repos": ["/x"], "hires": {"build/implement": "shipper"}}\n');
      const loose = aRepo();
      for (const factory of [undefined, 'default']) {
        const started = await runPlaced(
          startRun({ brief: 'build it', repo: loose, workflowDir: build, isolate: false, ...(factory ? { factory } : {}) }),
        );
        const steps = Object.fromEntries((started.workflow ?? []).map((st) => [st.name, st]));
        assert.deepEqual([steps.implement.agent, steps.review.agent], [undefined, undefined], String(factory));
        assert.equal(steps.implement.body, 'Build what was asked.');
        assert.deepEqual(['factory' in started, started.repo, 'factory' in runRecord(ROOT, started.id)], [false, loose, false]);
      }
      const typed = runRecord(ROOT, startedId(await typedFrom(loose, ['start', 'build it', '--workflows', build, '--no-worktree'])));
      assert.deepEqual(['factory' in typed, typed.repo], [false, loose]);
      fs.rmSync(path.join(FACTORIES, 'default.json'));
    },
  );

  await s.test('`nemia factory rm` removes the file, its rules and its instruction, and nothing of another factory', async () => {
    const rules = writeRules(ROOT, { name: 'pipao' }, 'Be kind.');
    setInstructionAt(ROOT, { factory: 'pipao', at: { store: true } });
    writeInstructionText(ROOT, 'pipao', 'Ship small.');
    const mono = fs.readFileSync(path.join(FACTORIES, 'mono.json'));
    await typedFrom(ROOT, ['factory', 'rm', 'pipao']);
    assert.deepEqual([fs.existsSync(rules), fs.existsSync(path.join(FACTORIES, 'pipao'))], [false, false]);
    assert.deepEqual(factoryFiles(), ['mono.json']);
    assert.deepEqual(fs.readFileSync(path.join(FACTORIES, 'mono.json')), mono);
    fs.writeFileSync(path.join(FACTORIES, 'torn.json'), '{');
    await typedFrom(ROOT, ['factory', 'rm', 'torn']);
    await typedFrom(ROOT, ['factory', 'rm', 'mono']);
    assert.deepEqual(factoryFiles(), []);
  });

  await s.test('REFUSED: an rm of a name with no factory touches no folder of that name', async () => {
    fs.mkdirSync(path.join(FACTORIES, 'orphan'), { recursive: true });
    fs.writeFileSync(path.join(FACTORIES, 'orphan', 'NEMIA.md'), 'kept\n');
    await refusedBy(() => typedFrom(ROOT, ['factory', 'rm', 'orphan']), 'Missing', 'orphan');
    assert.ok(fs.existsSync(path.join(FACTORIES, 'orphan', 'NEMIA.md')), 'a refused rm leaves the folder');
    fs.rmSync(path.join(FACTORIES, 'orphan'), { recursive: true });
  });
});

test('a start in a factory refused step by step, each naming its fix, until it starts', async (t) => {
  const s = story(t);
  const { repo, build, dev } = fresh([]);
  const start = (factory = 'pipao') => runPlaced(startRun({ brief: 'build it', repo, workflowDir: build, isolate: false, factory }));

  await s.test('REFUSED: a factory that has attached no workflow offers none, naming the attach, never the default factory', async () => {
    const said = await startRefused(start, 'Invalid', 'build', 'pipao', 'none', 'nemia factory attach pipao build');
    assert.ok(!said.includes('default factory'), "only the factory's own fix");
  });

  await s.test('REFUSED: a workflow it has not attached, before its steps are judged, naming what it offers', async () => {
    attachWorkflowAt(ROOT, { factory: 'pipao', workflow: 'dev' });
    await startRefused(start, 'Invalid', 'build', 'pipao', 'dev', 'nemia factory attach pipao build');
    attachWorkflowAt(ROOT, { factory: 'pipao', workflow: 'build' });
    detached(ROOT, 'pipao', 'dev');
    await startRefused(
      () => runPlaced(startRun({ brief: 'dev it', repo, workflowDir: dev, isolate: false, factory: 'pipao' })),
      'Invalid',
      'dev',
      'pipao',
      'build',
      'nemia factory attach pipao dev',
    );
  });

  await s.test('REFUSED: once attached, every step no one fills, a hire line for each', async () => {
    await startRefused(
      start,
      'Invalid',
      'build',
      'pipao',
      'implement, review',
      'nemia factory hire pipao <agent> --step build/implement',
      'nemia factory hire pipao <agent> --step build/review',
    );
  });

  await s.test("REFUSED: hires into another workflow's steps of the same names fill none of this one's", async () => {
    for (const workflow of ['builder', 'other']) attachWorkflowAt(ROOT, { factory: 'pipao', workflow });
    hireAgentAt(ROOT, { factory: 'pipao', agent: 'implementer', step: 'other/implement' });
    hireAgentAt(ROOT, { factory: 'pipao', agent: 'reviewer', step: 'builder/review' });
    hireAgentAt(ROOT, { factory: 'pipao', agent: 'reviewer', step: 'build/review' });
    const said = await startRefused(start, 'Invalid', 'implement', 'nemia factory hire pipao <agent> --step build/implement');
    assert.ok(!said.includes('--step build/review'), 'review is filled');
  });

  await s.test('REFUSED: a hire of an agent there is not, naming the agents there are', async () => {
    hireAgentAt(ROOT, { factory: 'pipao', agent: 'ada', step: 'build/implement' });
    await startRefused(
      start,
      'Invalid',
      'implement',
      'pipao',
      '`ada`',
      'implementer, reviewer, shipper',
      'nemia factory hire pipao <agent> --step build/implement',
    );
  });

  await s.test('REFUSED: Nemia is never a hire, her folder and her words in the store being no agent', async () => {
    fs.mkdirSync(path.join(ROOT, 'nemia'), { recursive: true });
    fs.copyFileSync(nemiaDefinition(), path.join(ROOT, 'nemia', 'nemia.md'));
    fs.mkdirSync(path.join(ROOT, 'custom-instructions'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'custom-instructions', 'nemia.md'), 'Answer in French.\n');
    hireAgentAt(ROOT, { factory: 'pipao', agent: 'nemia', step: 'build/implement' });
    await startRefused(start, 'Invalid', 'implement', 'pipao', '`nemia`', 'implementer, ');
  });

  await s.test('REFUSED: a hire into a step whose file names its own agent, naming both and the fire', async () => {
    hireAgentAt(ROOT, { factory: 'pipao', agent: 'implementer', step: 'build/implement' });
    hireAgentAt(ROOT, { factory: 'pipao', agent: 'implementer', step: 'build/named' });
    await startRefused(start, 'Invalid', 'named', '`agent: reviewer`', 'implementer', 'nemia factory fire pipao --step build/named');
    fireAgentAt(ROOT, { factory: 'pipao', step: 'build/named' });
  });

  await s.test('REFUSED: a factory the store does not have is Missing, naming those it has', async () => {
    await startRefused(() => start('nope'), 'Missing', 'nope', 'pipao');
  });

  await s.test("REFUSED: a repository outside the factory, naming the factory's list, the --repo and the add", async () => {
    const other = aRepo();
    const said = await startRefused(
      () => runPlaced(startRun({ brief: 'build it', repo: other, repoNamed: true, workflowDir: build, isolate: false, factory: 'pipao' })),
      'Invalid',
      other,
      'pipao',
      `--repo ${repo}`,
      `nemia factory add <name> --repo ${other}`,
    );
    assert.ok(!said.includes('default factory'), "only the factory's own fix");
  });

  await s.test('REFUSED: `nemia start` reads --factory once', () => {
    const factoryOf = (...argv: string[]) => parseArgv(START.spec, ['build it', ...argv])?.factory;
    assert.deepEqual([factoryOf('--factory', 'pipao'), factoryOf('--factory=pipao'), factoryOf()], ['pipao', 'pipao', undefined]);
    assert.throws(
      () => factoryOf('--factory', 'pipao', '--factory', 'nemia'),
      (err: Refusal) => {
        assert.deepEqual([err._tag, err.exitCode], ['Invalid', 2]);
        names(err.message, 'nemia start', '--factory');
        return true;
      },
    );
  });

  await s.test('every step filled, it starts', async () => {
    assert.equal((await start()).factory, 'pipao');
  });

  await s.test(
    'REFUSED as shipped: no --factory in a folder two factories hold, naming each and the fix, no worktree made',
    async (sub) => {
      asShipped(sub);
      const shared = aRepo();
      filed('a', shared);
      filed('b', shared);
      const trees = worktrees(shared);
      await startRefused(
        () => typedFrom(shared, ['start', 'build it', '--workflows', build]),
        'Invalid',
        shared,
        '2',
        '--factory a, or --factory b',
      );
      assert.equal(worktrees(shared), trees, 'no worktree made');
      const run = runRecord(
        ROOT,
        startedId(await typedFrom(shared, ['start', 'build it', '--workflows', build, '--factory', 'b', '--no-worktree'])),
      );
      assert.equal(run.factory, 'b', '--factory picks one');
    },
  );

  await s.test('REFUSED as shipped: nested repositories of two factories are two holders, with no deepest chosen', async (sub) => {
    asShipped(sub);
    const outer = aRepo();
    const inner = path.join(outer, 'inner');
    fs.mkdirSync(inner);
    stand().world.repository(inner, {});
    filed('outer', outer);
    filed('inner', inner);
    await startRefused(
      () => typedFrom(inner, ['start', 'build it', '--workflows', build, '--no-worktree']),
      'Invalid',
      `inner on ${inner}`,
      `outer on ${outer}`,
      '--factory inner, or --factory outer',
    );
  });

  await s.test('REFUSED as shipped: no --factory in a repository no factory holds, naming --factory and the add', async (sub) => {
    asShipped(sub);
    const loose = aRepo();
    await startRefused(
      () => typedFrom(loose, ['start', 'build it', '--workflows', build, '--no-worktree']),
      'Invalid',
      loose,
      '--factory <name>',
      'pipao',
      'nemia factory add <name> --repo <root>',
    );
  });

  await s.test(
    'REFUSED as shipped: `nemia start <folder>` where no factory, or two, holds the folder, before its first card starts',
    async (sub) => {
      asShipped(sub);
      const plan = aPlanOf(build);
      await startRefused(() => typedFrom(aRepo(), ['start', plan]), 'Invalid', '--factory <name>');
      const shared = aRepo();
      filed('c', shared);
      filed('d', shared);
      await startRefused(() => typedFrom(ROOT, ['start', plan, '--repo', shared]), 'Invalid', '--factory c, or --factory d');
    },
  );

  await s.test('REFUSED: `nemia start --factory default`, with WF_DEFAULT_FACTORY_STARTS=1 and as shipped', async (sub) => {
    const typed = ['start', 'x', '--workflows', build, '--factory', 'default', '--no-worktree'];
    await startRefused(() => typedFrom(repo, typed), 'Invalid', '`default`', '--factory <name>', 'pipao');
    asShipped(sub);
    await startRefused(() => typedFrom(repo, typed), 'Invalid', '`default`', '--factory <name>', 'pipao');
  });

  await s.test('REFUSED with WF_DEFAULT_FACTORY_STARTS=1 all the same: a folder two factories hold', async () => {
    const shared = aRepo();
    filed('e', shared);
    filed('f', shared);
    await startRefused(
      () => typedFrom(shared, ['start', 'x', '--workflows', build, '--no-worktree']),
      'Invalid',
      '--factory e, or --factory f',
    );
  });
});

test('the workspaces a refused start is compared by are read off the place: one cut under the store lists, and the reading changes', () => {
  const repo = aRepo();
  const none = worktrees(repo);
  const at = path.join(ROOT, 'worktrees', 'cut-by-hand', 'implement');
  const made = stand().place.askNow('make', { repo, at, run: 'cut-by-hand', leaf: 'implement', from: 'main', also: [] });
  assert.ok('answer' in made, JSON.stringify(made));
  assert.notEqual(worktrees(repo), none, 'a workspace cut since is a reading that differs');
  assert.deepEqual(JSON.parse(worktrees(repo)), [fs.realpathSync(at)]);
});

test('an inbox card started in its factory, or refused with the card kept', async (t) => {
  const s = story(t);
  const { repo, build } = fresh();
  hired();
  const teamIn = (at: string): string => {
    fs.cpSync(path.dirname(build), path.join(at, 'workflows'), { recursive: true });
    return at;
  };
  teamIn(repo);

  await s.test(
    '`nemia start <card> --factory` starts it in the factory, on its one repository from any directory, and keeps it',
    async () => {
      const card = aCard('build-it', 'Build it.\n');
      const out = await typedFrom(ROOT, ['start', card, '--workflows', 'build', '--factory', 'pipao', '--no-worktree']);
      const run = runRecord(ROOT, startedId(out));
      assert.deepEqual([run.factory, run.repo, run.from], ['pipao', repo, { inbox: 'build-it' }]);
      assert.ok(out.includes(`factory: pipao, on ${repo}`), out.join('\n'));
      assert.ok(fs.existsSync(card), 'the card is kept');
    },
  );

  await s.test("a card's factory: starts it there, its workflow: found in the factory's repository; --factory is over it", async () => {
    aCard('in-pipao', '---\nworkflow: build\nfactory: pipao\n---\nBuild it.\n');
    const run = runRecord(ROOT, startedId(await typedFrom(ROOT, ['start', path.join(inboxDir(ROOT), 'in-pipao.md'), '--no-worktree'])));
    assert.deepEqual([run.factory, run.repo, run.workflowDir], ['pipao', repo, path.join(repo, 'workflows', 'build')]);
    const other = teamIn(aRepo());
    filed('other', other);
    aCard('over', '---\nfactory: pipao\n---\nBuild it.\n');
    const over = await runPlaced(startFromInbox({ name: 'over', workflow: 'build', callerRepo: ROOT, isolate: false, factory: 'other' }));
    assert.deepEqual([over.run.factory, runRecord(ROOT, over.run.id).repo], ['other', other]);
  });

  await s.test(
    '`nemia start <name>` of a card starts it as its path does; a name no card has is a brief, a file of that name over it',
    async () => {
      const before = await runPlaced(startRun({ brief: 'read first', repo, workflowDir: build, isolate: false, factory: 'pipao' }));
      const card = aCard('by-its-name', `---\nworkflow: build\nfactory: pipao\nfrom: ${before.id}\n---\nBuild it by name.\n`);
      const elsewhere = fs.mkdtempSync(path.join(ROOT, 'typed-'));
      const run = runRecord(ROOT, startedId(await typedFrom(elsewhere, ['start', 'by-its-name', '--no-worktree'])));
      assert.deepEqual(
        [run.brief, run.factory, run.workflowDir, run.context, run.from],
        ['Build it by name.', 'pipao', path.join(repo, 'workflows', 'build'), [before.id], { inbox: 'by-its-name' }],
      );
      assert.ok(fs.existsSync(card), 'the card is kept');
      const flags = ['--factory', 'pipao', '--workflows', build, '--no-worktree'];
      const text = runRecord(ROOT, startedId(await typedFrom(elsewhere, ['start', 'no-such-card', ...flags])));
      assert.deepEqual([text.brief, 'from' in text], ['no-such-card', false], 'a name no card has stays a text brief');
      const shadowed = aCard('shadowed', 'From the card.\n');
      fs.writeFileSync(path.join(elsewhere, 'shadowed'), 'From the file.\n');
      const file = runRecord(ROOT, startedId(await typedFrom(elsewhere, ['start', 'shadowed', ...flags])));
      assert.equal(file.brief, 'From the file.', 'a file of that name where it is typed is the brief');
      assert.ok(fs.existsSync(shadowed), 'the card of that name stays in the inbox');
    },
  );

  await s.test(
    'a card of a factory of two repositories runs on the one its wiring names, wherever it is started; REFUSED unwired, the card kept',
    async () => {
      const [first, second] = [teamIn(aRepo()), teamIn(aRepo())];
      filed('duo', first, second);
      const card = aCard('in-duo', '---\nfactory: duo\n---\nBuild it.\n');
      await startRefused(
        () => runPlaced(startFromInbox({ name: 'in-duo', workflow: 'build', callerRepo: first, isolate: false })),
        'Invalid',
        'nemia factory attach duo build --repo',
        path.basename(first),
        path.basename(second),
      );
      assert.ok(fs.existsSync(card), 'the card is left in the inbox');
      attachWorkflowAt(ROOT, { factory: 'duo', workflow: 'build', repo: path.basename(second) });
      const wired = await runPlaced(startFromInbox({ name: 'in-duo', workflow: 'build', callerRepo: first, isolate: false }));
      assert.deepEqual([runRecord(ROOT, wired.run.id).repo, wired.run.factory], [second, 'duo']);
    },
  );

  await s.test("REFUSED: a card's factory: the store does not have, and one not offering its workflow, the cards kept", async () => {
    const nosuch = aCard('nosuch', '---\nfactory: nosuch\n---\nBuild it.\n');
    await startRefused(
      () => runPlaced(startFromInbox({ name: 'nosuch', workflow: 'build', callerRepo: repo, isolate: false })),
      'Missing',
      'nosuch',
      'pipao',
    );
    addFactoryAt(ROOT, { name: 'devs', repos: [repo] });
    attachWorkflowAt(ROOT, { factory: 'devs', workflow: 'dev' });
    const unattached = aCard('unattached', '---\nfactory: devs\n---\nBuild it.\n');
    await startRefused(
      () => runPlaced(startFromInbox({ name: 'unattached', workflow: 'build', callerRepo: repo, isolate: false })),
      'Invalid',
      'build',
      'devs',
      'dev',
      'nemia factory attach devs build',
    );
    assert.ok(fs.existsSync(nosuch) && fs.existsSync(unattached), 'both cards are left in the inbox');
  });

  await s.test('with WF_DEFAULT_FACTORY_STARTS=1, a card naming no factory records none, on the repository it is started in', async () => {
    const other = teamIn(aRepo());
    aCard('no-key', 'Build it.\n');
    const { run } = await runPlaced(startFromInbox({ name: 'no-key', workflow: 'build', callerRepo: other, isolate: false }));
    assert.deepEqual(['factory' in runRecord(ROOT, run.id), runRecord(ROOT, run.id).repo], [false, other]);
  });

  await s.test(
    'REFUSED: a card that says factory: default, or started with --factory default, even with WF_DEFAULT_FACTORY_STARTS=1',
    async () => {
      const other = aRepo();
      const card = aCard('by-name', '---\nfactory: default\n---\nBuild it.\n');
      await startRefused(
        () => runPlaced(startFromInbox({ name: 'by-name', workflow: 'build', callerRepo: other, isolate: false })),
        'Invalid',
        '`default`',
        '`factory: <name>`',
        'by-name.md',
        'pipao',
      );
      aCard('plain', 'Build it.\n');
      await startRefused(
        () =>
          runPlaced(
            startFromInbox({
              name: 'plain',
              workflow: 'build',
              callerRepo: other,
              isolate: false,
              factory: 'default',
              fix: '--factory <name>',
            }),
          ),
        'Invalid',
        '`default`',
        '--factory <name>',
        'pipao',
      );
      assert.ok(fs.existsSync(card), 'the card is left in the inbox');
    },
  );

  await s.test(
    'REFUSED as shipped: a card naming no factory, though one alone holds where it is typed; --factory or its factory: starts it',
    async (sub) => {
      asShipped(sub);
      const card = aCard('loose', `---\nrepo: ${repo}\n---\nBuild it.\n`);
      await startRefused(
        () => typedFrom(repo, ['start', card, '--workflows', 'build', '--no-worktree']),
        'Invalid',
        card,
        '`factory: <name>`',
        'pipao',
        '--factory <name>',
      );
      assert.ok(fs.existsSync(card), 'the card stays in the inbox');
      const flagged = runRecord(
        ROOT,
        startedId(await typedFrom(repo, ['start', card, '--workflows', 'build', '--factory', 'pipao', '--no-worktree'])),
      );
      assert.equal(flagged.factory, 'pipao');
      const own = aCard('own', '---\nfactory: pipao\n---\nBuild it.\n');
      assert.equal(
        runRecord(ROOT, startedId(await typedFrom(ROOT, ['start', own, '--workflows', 'build', '--no-worktree']))).factory,
        'pipao',
      );
    },
  );
});

test("a card and a brief work on the repository the factory's wiring names, never one a card or --repo names", async (t) => {
  const s = story(t);
  const { dev } = aTeam();
  const withTeam = (repo: string): string => {
    fs.cpSync(path.dirname(dev), path.join(repo, 'workflows'), { recursive: true });
    return repo;
  };
  const [a, b] = [withTeam(aRepo()), withTeam(aRepo())];
  addFactoryAt(ROOT, { name: 'f', repos: [a, b] });
  attachWorkflowAt(ROOT, { factory: 'f', workflow: 'dev' });

  await s.test('REFUSED: a card of a factory of two repositories that names none for its workflow, naming the attach', async () => {
    const card = aCard('pick', '---\nworkflow: dev\nfactory: f\n---\nPick a repository.\n');
    await startRefused(
      () => typedFrom(ROOT, ['start', 'pick']),
      'Invalid',
      'nemia factory attach f dev --repo',
      path.basename(a),
      path.basename(b),
    );
    assert.ok(fs.existsSync(card), 'the card is kept');
  });

  await s.test(
    "after `nemia factory attach f dev --repo <b>`, a card's run works on b; an old card's repo: is said and not read",
    async () => {
      await typedFrom(ROOT, ['factory', 'attach', 'f', 'dev', '--repo', path.basename(b)]);
      const run = runRecord(ROOT, startedId(await typedFrom(ROOT, ['start', 'pick'])));
      assert.deepEqual([run.factory, run.repo, run.workflowDir], ['f', b, path.join(b, 'workflows', 'dev')]);
      aCard('old', `---\nworkflow: dev\nrepo: ${a}\nfactory: f\n---\nAn old card.\n`);
      const out = await typedFrom(ROOT, ['start', 'old']);
      assert.equal(runRecord(ROOT, startedId(out)).repo, b);
      names(out.join('\n'), `repo: ${a}`, 'retired');
    },
  );

  await s.test('`nemia start "x" --workflows dev --repo <a>` starts on b, saying --repo only found the factory', async () => {
    const out = await typedFrom(ROOT, ['start', 'x', '--workflows', 'dev', '--repo', a]);
    assert.deepEqual([runRecord(ROOT, startedId(out)).factory, runRecord(ROOT, startedId(out)).repo], ['f', b]);
    const said = out.find((l) => l.startsWith(`--repo ${a} `));
    assert.ok(said, out.join('\n'));
    names(said, 'the factory f', 'dev', b);
  });

  await s.test('REFUSED: `nemia start <card> --repo`, naming the attach, nothing started', async () => {
    aCard('with-repo', '---\nworkflow: dev\nfactory: f\n---\nStarted with a repo.\n');
    await startRefused(() => typedFrom(ROOT, ['start', 'with-repo', '--repo', a]), 'Invalid', 'nemia factory attach');
  });

  await s.test('a factory of one repository: a card naming none starts on it, with no --repo on the attach', async () => {
    const c = withTeam(aRepo());
    addFactoryAt(ROOT, { name: 'g', repos: [c] });
    attachWorkflowAt(ROOT, { factory: 'g', workflow: 'dev' });
    aCard('in-g', '---\nworkflow: dev\nfactory: g\n---\nOne repository.\n');
    const run = runRecord(ROOT, startedId(await typedFrom(ROOT, ['start', 'in-g'])));
    assert.deepEqual([run.factory, run.repo], ['g', c]);
  });

  await s.test("a card's workflow by name that only yours holds starts from yours, on the factory's repository", async () => {
    const d = aRepo();
    addFactoryAt(ROOT, { name: 'h', repos: [d] });
    attachWorkflowAt(ROOT, { factory: 'h', workflow: 'dev' });
    const yours = path.join(ROOT, 'workflows');
    fs.cpSync(path.dirname(dev), yours, { recursive: true });
    try {
      aCard('in-h', '---\nworkflow: dev\nfactory: h\n---\nFrom yours.\n');
      const run = runRecord(ROOT, startedId(await typedFrom(ROOT, ['start', 'in-h'])));
      assert.deepEqual([run.repo, run.workflowDir], [d, path.join(yours, 'dev')]);
    } finally {
      fs.rmSync(yours, { recursive: true, force: true });
    }
  });
});

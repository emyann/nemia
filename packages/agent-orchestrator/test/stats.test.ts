/**
 * `nemia stats` as a person reads it, told as three stories on the stage (`story.ts`), over a store of seeded records and the engine's
 * stand-in, each task's facts planted on the attempt it ended (`settle(id, phase, end)`): the numbers its handler answers over a store,
 * read through its words (`typed.ts`), a check that refused told from one that did not finish, the deadline a landing check was filed
 * with read off the engine; every try nothing measured — on codex, in the background, a recheck, filed before steps ran as jobs, a
 * session whose ends do not say — read as null, never 0, and left out of every mean; and a change to what a workflow's runs froze
 * marked once, on the later run of its workflow folder and factory.
 *
 * Every story plants its runs in the one store and takes them out once it ends, so the next reads none of them. What `factsOf` and
 * `statsOf` decide off hand-built timelines is the tables of `src/stats/stats.test.ts`; the memo over the runtime's feed,
 * `src/stats/stats-memo.test.ts`; the words the client prints of them, `apps/cli`'s `rest-lines.test.ts`. Its store is its own at `ROOT`,
 * given as `ENV`.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import type { TestEnd } from 'agent-runtime/testing';
import type { Stats } from '../src/runner.ts';
import { scratch } from 'test-kit/scratch';
import { staged, story } from './story.ts';
import { typed } from './typed.ts';
import { engineOf, runWith } from '../src/runtime-client.ts';
import { Invalid } from '../src/refusal/refusal.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-stats-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1' };
const stage = staged({ runWith, main: typed, engineOf, env: ENV });

const DAY = '2026-09-28';
const at = (hour: number, day = DAY): string => `${day}T${String(hour).padStart(2, '0')}:00:00.000Z`;
const SIGNED = { outcome: 'done', summary: 'Did it.', needs: null, artifacts: [] };

/**
 * How a task ran: from and to an hour of `day` or `DAY`, or to `endedAt`; a session's cost, closeout and what each attempt said; a check's
 * exit code and deadline.
 */
type How = {
  from: number;
  to: number;
  day?: string;
  costUsd?: number;
  closeout?: object;
  exitCode?: number | null;
  deadline?: number;
  endedAt?: string;
  attempts?: TestEnd[];
};

/**
 * Files the task `taskId` on the stage's engine, filed at `from`, and settles it as it ran to `to`: a session signing `closeout` and
 * measured at `costUsd`, an attempt per entry of `attempts` (each saying what its end said, the last one succeeding); or a check exiting
 * `exitCode`, or ended without one where it is null. A check is filed with its `deadline` in seconds, where given.
 */
function ran(taskId: string, how: How) {
  const b = stage.board();
  const check = how.exitCode !== undefined;
  const from = at(how.from, how.day);
  const to = how.endedAt ?? at(how.to, how.day);
  Effect.runSync(
    b.e.file({
      id: taskId,
      brief: 'Do it.',
      cwd: ROOT,
      harness: check ? 'check' : 'claude',
      ...(how.deadline === undefined ? {} : { deadlineSeconds: how.deadline }),
    }),
  );
  const task = b.tasks.get(taskId);
  assert.ok(task, `${taskId} was filed`);
  task.filedAt = from;
  const times = { startedAt: from, spawnedAt: from, endedAt: to };
  if (check) {
    const passed = how.exitCode === 0;
    b.end(taskId, passed ? 'succeeded' : 'failed', { ...times, ...(how.exitCode === null ? {} : { exitCode: how.exitCode }) });
    return;
  }
  const attempts = how.attempts ?? [{}];
  attempts.forEach((said, i) => {
    if (i > 0) b.restart(taskId);
    const last = i === attempts.length - 1;
    b.end(taskId, last ? 'succeeded' : 'failed', {
      ...times,
      closeout: how.closeout ?? SIGNED,
      ...(last && how.costUsd !== undefined ? { usage: { costUsd: how.costUsd } } : {}),
      ...said,
    });
  });
}

const agent = (name: string) => ({ name, keys: [], body: '', given: {} });

/** Each file and folder a story planted in the store, taken out once it ends (`plantedFor`). */
const planted: string[] = [];

/** Takes out, once the story `t` ends, every run it planted: the next story reads a store with none of them. */
const plantedFor = (t: TestContext) =>
  t.after(() => {
    for (const file of planted.splice(0)) fs.rmSync(file, { recursive: true, force: true });
  });

function writeRun(id: string, workflow: object[], steps: Record<string, object>, more: object = {}) {
  const file = path.join(ROOT, 'runs', `${id}.json`);
  planted.push(file, path.join(ROOT, 'runs', id));
  fs.writeFileSync(
    file,
    JSON.stringify({
      id,
      repo: '/repos/one',
      baseRef: 'abc',
      workspace: '/repos/one',
      branch: 'main',
      isolate: true,
      brief: `The brief of ${id}`,
      createdAt: at(0),
      workflowDir: '/repos/one/workflows/dev',
      workflow,
      steps,
      ...more,
    }),
  );
}

/** The skill `name` as `nemia start` rendered it for `agentName` on the step `step` of the run `id`, with `rules.json` and `applies:`. */
function rendered(
  id: string,
  step: string,
  agentName: string,
  name: string,
  more: { text?: string; rules?: string; applies?: string } = {},
) {
  const dir = path.join(ROOT, 'runs', id, 'agents', step, `nemia-${agentName}`, 'skills', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: A skill.\n${more.applies ?? ''}---\n${more.text ?? 'Do it.'}\n`,
  );
  if (more.rules !== undefined) fs.writeFileSync(path.join(dir, 'rules.json'), more.rules);
}

/** What `nemia stats argv` answered, over the stage's engine. */
const answered = async (argv: string[]) => JSON.parse(JSON.stringify(await stage.main(['stats', ...argv]))) as Stats;

/** A run of three steps that landed on its first try, its implement checked, its review accepting the first round. */
function aLanding() {
  ran('landed-implement', { from: 1, to: 2, costUsd: 2 });
  ran('landed-implement-check', { from: 2, to: 3, exitCode: 0 });
  ran('landed-review', { from: 3, to: 4, costUsd: 1, closeout: { ...SIGNED, again: false } });
  ran('landed-land', { from: 4, to: 5, costUsd: 0.5 });
  writeRun(
    'landed',
    [
      { name: 'implement', after: [], body: 'Do it.', check: 'true', agent: agent('implementer') },
      { name: 'review', after: ['implement'], body: 'Review it.', loop: 'implement', rounds: 3, agent: agent('reviewer') },
      { name: 'land', after: ['review'], body: 'Land it.', workspace: 'main' },
    ],
    {
      implement: { taskId: 'landed-implement', check: { taskId: 'landed-implement-check' } },
      review: { taskId: 'landed-review' },
      land: { taskId: 'landed-land', landed: { commit: 'def' } },
    },
  );
}

/** A run of another factory and repository whose one step's check refused, then did not finish. */
function aCheckedRun() {
  ran('checked-build', { from: 1, to: 2 });
  ran('checked-build-check', { from: 2, to: 3, exitCode: 1 });
  ran('checked-build-2', { from: 3, to: 4 });
  ran('checked-build-2-check', { from: 4, to: 5, exitCode: null });
  writeRun(
    'checked',
    [{ name: 'build', after: [], body: 'Build it.', check: 'false' }],
    {
      build: {
        taskId: 'checked-build-2',
        check: { taskId: 'checked-build-2-check' },
        tries: [{ taskId: 'checked-build', cause: 'retries', check: { taskId: 'checked-build-check' } }],
      },
    },
    { factory: 'other', repo: '/repos/two', workspace: '/repos/two' },
  );
}

const LANDING_DAY = '2026-10-01';

/** A run whose one step lands it on its check: a session of an hour, then a check that ran `checkSeconds`, filed with `deadline`. */
function aLandingCheck(id: string, checkSeconds: number, deadline: number) {
  ran(`${id}-land`, { from: 9, to: 10, day: LANDING_DAY });
  const check = `${id}-land-check`;
  const endedAt = new Date(Date.parse(at(10, LANDING_DAY)) + checkSeconds * 1000).toISOString();
  ran(check, { from: 10, to: 10, day: LANDING_DAY, exitCode: 0, deadline, endedAt });
  writeRun(
    id,
    [{ name: 'land', after: [], body: 'Land it.', workspace: 'main', gate: true, check: 'npm test' }],
    { land: { taskId: `${id}-land`, check: { taskId: check } } },
    { factory: 'landings', createdAt: at(9, LANDING_DAY) },
  );
}

const TOUCHED_DAY = '2026-09-16';

/** A run whose design's two sessions touched apps/web, one loading the skills whose paths say so. */
function aTouchedRun() {
  ran('touched-design', { from: 1, to: 1, day: TOUCHED_DAY, attempts: [{ skills: [], files: ['apps/web/src/a.tsx'] }] });
  ran('touched-design-2', {
    from: 2,
    to: 2,
    day: TOUCHED_DAY,
    attempts: [{ skills: ['change-the-board', 'shadcn', 'y'], files: ['apps/web/src/b.tsx'] }],
  });
  writeRun(
    'touched',
    [{ name: 'design', after: [], body: 'Design it.', agent: { ...agent('planner'), skills: ['change-the-board', 'shadcn', 'app:y'] } }],
    { design: { taskId: 'touched-design-2', tries: [{ taskId: 'touched-design', cause: 'retries' }] } },
    { factory: 'touched', createdAt: `${TOUCHED_DAY}T00:00:00.000Z` },
  );
  for (const [name, applies] of [
    ['change-the-board', 'applies: ["apps/web/**"]\n'],
    ['shadcn', ''],
    ['y', 'applies: ["apps/web/**"]\n'],
  ])
    rendered('touched', 'design', 'planner', name, { applies });
}

test('`nemia stats` over a store: the numbers it answers and the words it prints, each read off the runs and the engine', async (t) => {
  const s = story(t);
  plantedFor(t);
  aLanding();
  aCheckedRun();
  aLandingCheck('s-old', 1033, 1200);
  aLandingCheck('s-new', 1033, 2700);
  aTouchedRun();

  await s.test(
    '--json answers a landing on its first try, its cost and rounds, and each check by its verdict; a run whose check did not finish has not finished',
    async () => {
      const all = await answered(['--from', DAY, '--to', DAY]);
      assert.deepEqual(
        [
          all.all.total.runs,
          all.all.total.landed,
          all.all.total.firstTry,
          all.all.total.rounds,
          all.all.total.costPerLanded,
          all.all.total.timePerLanded,
        ],
        [1, 1, 1, 1, 3.5, 4 * 3_600_000],
      );
      assert.equal(all.all.total.tries, 5);
      const build = all.all.steps.find((row) => row.step === 'build');
      assert.deepEqual(build?.checks, { passed: 0, refused: 1, unfinished: 1 }, 'no exit code is unfinished; exit 1 refused');
      assert.equal(build?.costUsd, null, 'no session of build was measured');
      assert.equal(all.all.steps.find((row) => row.step === 'implement')?.agent, 'implementer');
      assert.deepEqual(all.unreadable, []);
    },
  );

  await s.test('--by factory answers a group per factory, and --factory keeps one', async () => {
    assert.deepEqual(
      (await answered(['--by', 'factory'])).groups.map((g) => [g.key, g.total.tries]),
      [
        ['default', 3],
        ['landings', 2],
        ['other', 2],
        ['touched', 2],
      ],
    );
    assert.equal((await answered(['--factory', 'other'])).all.total.tries, 2);
  });

  await s.test("the tiles span the last 14 days and the 14 before; the day's row is what it landed, and no change is marked", async () => {
    const { all } = await answered(['--from', DAY, '--to', DAY]);
    assert.ok(all.tiles.before.to < all.tiles.last.from, 'the 14 days before end before the last 14 begin');
    const day = all.days.find((d) => d.day === DAY);
    assert.deepEqual(
      [day?.runs, day?.landed, day?.rounds, day?.firstTry, day?.costPerLanded, day?.timePerLanded],
      [1, 1, 1, 1, 3.5, 4 * 3_600_000],
    );
    assert.deepEqual(all.marks, [], 'no run changed what it froze');
  });

  await s.test('REFUSED: a key to go by it does not know, and a day that is not one, as Invalid with exit 2', async () => {
    for (const argv of [
      ['--by', 'colour'],
      ['--from', '2026-13-40'],
    ])
      await assert.rejects(stage.main(['stats', ...argv]), (err: unknown) => err instanceof Invalid && err.exitCode === 2, argv.join(' '));
  });

  await s.test('a landing check is judged against the deadline its task was filed with, read off the engine', async () => {
    assert.deepEqual(
      (await answered(['--factory', 'landings'])).all.slowLandings.map((x) => [
        x.run,
        x.step,
        x.checkMs,
        x.deadlineMs,
        Math.round(x.share * 100),
      ]),
      [['s-old', 'land', 1_033_000, 1_200_000, 86]],
      'the same 1033 s is over half of 1200 and under half of 2700',
    );
  });

  await s.test(
    "the tries that touched a frozen skill's paths, and how many of them loaded it, are read off the sessions' ends",
    async () => {
      const range = ['--factory', 'touched', '--from', TOUCHED_DAY, '--to', TOUCHED_DAY];
      assert.deepEqual(
        (await answered(range)).all.steps.find((r) => r.step === 'design')?.skills,
        [
          { skill: 'app:y', count: 1, tries: 1, touched: 2, loadedWhenTouched: 1 },
          { skill: 'change-the-board', count: 1, tries: 1, touched: 2, loadedWhenTouched: 1 },
          { skill: 'shadcn', count: 1, tries: 1, touched: null, loadedWhenTouched: null },
        ],
        'both tries touched apps/web and one loaded change-the-board; shadcn declares no path; a skill named with its folder, frozen and loaded as `y`, is counted as its line writes it',
      );
    },
  );
});

const DENIED_DAY = '2026-09-26';
const UNMEASURED_DAY = '2026-09-25';
const QUIET_DAY = '2026-09-24';
const BG_DAY = '2026-09-23';
const writeX = { tool: 'Write', what: '/x' };
const rm = { tool: 'Bash', what: 'rm' };
const RULED = 'write-a-spec';
const RULES = [
  { id: 'no-write', says: 'Write nothing at the root', breaks: ['Edit(//x)'] },
  { id: 'no-curl', says: 'Never fetch', breaks: ['Bash(curl:*)'] },
  { id: 'no-rm', says: 'Never remove', breaks: ['Bash(rm:*)'] },
];

/**
 * A run of five steps whose sessions were denied calls: write, on claude, twice, its second try rechecked; codex, background and a
 * session filed before steps ran as jobs, whose ends say no denials, as the runtime writes them where its harness could not say; and
 * quiet, whose end says it was denied nothing.
 */
function aDeniedRun() {
  ran('denied-write', {
    from: 1,
    to: 1,
    day: DENIED_DAY,
    attempts: [{ denials: [writeX] }, { denials: [writeX, { tool: 'Bash', what: 'git push' }] }],
  });
  ran('denied-write-2', { from: 2, to: 2, day: DENIED_DAY, attempts: [{ denials: [rm] }] });
  ran('denied-write-2-check', { from: 2, to: 3, exitCode: null, day: DENIED_DAY });
  ran('denied-write-2-check-2', { from: 3, to: 4, exitCode: 0, day: DENIED_DAY });
  ran('denied-codex', { from: 1, to: 1, day: UNMEASURED_DAY });
  ran('denied-bg', { from: 2, to: 2, day: UNMEASURED_DAY });
  ran('denied-quiet', { from: 1, to: 1, day: QUIET_DAY, attempts: [{ denials: [] }] });
  ran('denied-before-jobs', { from: 18, to: 18, day: BG_DAY });
  rendered('denied', 'write', 'implementer', RULED, { rules: JSON.stringify({ rules: RULES }) });
  rendered('denied', 'write', 'implementer', 'look');
  rendered('denied', 'write', 'implementer', 'unread', { rules: '{ "rules": [{ "id": "x" }] }' });
  rendered('denied', 'write', 'implementer', 'y', {
    rules: JSON.stringify({ rules: [{ id: 'no-wget', says: 'Never download', breaks: ['Bash(wget:*)'] }] }),
  });
  writeRun(
    'denied',
    [
      { name: 'write', after: [], body: 'Write it.', agent: { ...agent('implementer'), skills: [RULED, 'look', 'unread', 'app:y'] } },
      { name: 'codex', after: [], body: 'Do it.', harness: 'codex' },
      { name: 'bg', after: [], body: 'Do it.', background: true },
      { name: 'quiet', after: [], body: 'Do it.' },
      { name: 'before-jobs', after: [], body: 'Do it.' },
    ],
    {
      write: {
        taskId: 'denied-write-2',
        check: { taskId: 'denied-write-2-check-2' },
        tries: [
          { taskId: 'denied-write', cause: 'retries' },
          { taskId: 'denied-write-2', cause: 'retries', check: { taskId: 'denied-write-2-check' } },
        ],
      },
      codex: { taskId: 'denied-codex' },
      bg: { taskId: 'denied-bg' },
      quiet: { taskId: 'denied-quiet' },
      'before-jobs': { taskId: 'denied-before-jobs' },
    },
    { factory: 'denials', createdAt: `${BG_DAY}T00:00:00.000Z` },
  );
}

const SKILLS_DAY = '2026-09-20';
const NO_SKILL_DAY = '2026-09-21';
const UNSAID_DAY = '2026-09-22';

/**
 * A run whose spec loaded skills on its first try, had an end that does not say on its second, and a recheck; quiet loaded none; old's
 * end does not say.
 */
function aSkillsRun() {
  ran('skills-spec', { from: 1, to: 1, day: SKILLS_DAY, attempts: [{ skills: ['write-a-spec'] }, { skills: ['write-a-spec', 'look'] }] });
  ran('skills-spec-2', { from: 2, to: 2, day: SKILLS_DAY, attempts: [{ skills: ['look'] }, {}] });
  ran('skills-spec-2-check', { from: 2, to: 3, exitCode: null, day: SKILLS_DAY });
  ran('skills-spec-2-check-2', { from: 3, to: 4, exitCode: 0, day: SKILLS_DAY });
  ran('skills-quiet', { from: 1, to: 1, day: NO_SKILL_DAY, attempts: [{ skills: [] }] });
  ran('skills-old', { from: 1, to: 1, day: UNSAID_DAY });
  writeRun(
    'skills',
    [
      { name: 'spec', after: [], body: 'Write it.', check: 'true', agent: agent('planner') },
      { name: 'quiet', after: [], body: 'Do it.' },
      { name: 'old', after: [], body: 'Do it.' },
    ],
    {
      spec: {
        taskId: 'skills-spec-2',
        check: { taskId: 'skills-spec-2-check-2' },
        tries: [
          { taskId: 'skills-spec', cause: 'retries' },
          { taskId: 'skills-spec-2', cause: 'retries', check: { taskId: 'skills-spec-2-check' } },
        ],
      },
      quiet: { taskId: 'skills-quiet' },
      old: { taskId: 'skills-old' },
    },
    { factory: 'skills', createdAt: `${SKILLS_DAY}T00:00:00.000Z` },
  );
}

const TALLY_DAY = '2026-09-18';
const UNTALLIED_DAY = '2026-09-19';

/** Two runs of a step that tallies its issues: the first signed two, the second signed none. */
function tallyRuns() {
  ran('tallied-triage', { from: 1, to: 2, day: TALLY_DAY, closeout: { ...SIGNED, issues: [{ open: true }, { open: false }] } });
  ran('untallied-triage', { from: 1, to: 2, day: UNTALLIED_DAY });
  for (const [id, day] of [
    ['tallied', TALLY_DAY],
    ['untallied', UNTALLIED_DAY],
  ])
    writeRun(
      id,
      [{ name: 'triage', after: [], body: 'Sort them.', tally: ['issues', 'issues.open'], agent: agent('sorter') }],
      { triage: { taskId: `${id}-triage` } },
      { factory: 'tallies', createdAt: `${day}T00:00:00.000Z` },
    );
}

test('Unmeasured is null, never 0: a codex, background, recheck or pre-jobs try reads — and is left out of every mean', async (t) => {
  const s = story(t);
  plantedFor(t);
  aDeniedRun();
  aSkillsRun();
  tallyRuns();
  const denials = ['--factory', 'denials', '--from', BG_DAY, '--to', DENIED_DAY];

  await s.test(
    'each call a session was refused counts per measured try; a codex, background, recheck or pre-jobs try is unmeasured',
    async () => {
      const all = (await answered(denials)).all;
      assert.deepEqual(
        Object.fromEntries(all.days.map((d) => [d.day, d.deniedPerTry])),
        { [BG_DAY]: null, [QUIET_DAY]: 0, [UNMEASURED_DAY]: null, [DENIED_DAY]: 2 },
        'four calls over the two sessions of write, its recheck not counted again; codex, background and a pre-job session are unmeasured',
      );
      const write = all.steps.find((row) => row.step === 'write');
      assert.deepEqual([write?.tries, write?.deniedCalls, write?.deniedTries], [3, 4, 2]);
      assert.deepEqual(write?.denials, [
        { call: 'Write(/x)', count: 2 },
        { call: 'Bash(git push)', count: 1 },
        { call: 'Bash(rm)', count: 1 },
      ]);
      for (const name of ['codex', 'bg', 'before-jobs']) {
        const row = all.steps.find((r) => r.step === name);
        assert.deepEqual([row?.deniedCalls, row?.deniedTries, row?.denials], [null, 0, []], `${name} records no denial`);
      }
    },
  );

  await s.test('null where nothing was measured, 0 a try where nothing was refused', async () => {
    const { all } = await answered(denials);
    const day = (d: string) => all.days.find((x) => x.day === d);
    assert.deepEqual(
      [BG_DAY, DENIED_DAY, UNMEASURED_DAY, QUIET_DAY].map((d) => [day(d)?.deniedPerTry, day(d)?.skillsPerTry]),
      [
        [null, null],
        [2, null],
        [null, null],
        [0, null],
      ],
      'the skills loaded unmeasured here',
    );
    const write = all.steps.find((row) => row.step === 'write');
    assert.deepEqual([write?.skillLoads, write?.skillTries], [null, 0]);
  });

  await s.test(
    "each rule a step's frozen skills declare is kept or broken per measured try; rules that do not read count none",
    async () => {
      const all = (await answered(denials)).all;
      assert.deepEqual(
        all.steps.find((row) => row.step === 'write')?.rules,
        [
          { skill: RULED, rule: 'no-rm', says: 'Never remove', kept: 1, broken: 1 },
          { skill: RULED, rule: 'no-write', says: 'Write nothing at the root', kept: 1, broken: 1 },
          { skill: 'app:y', rule: 'no-wget', says: 'Never download', kept: 2, broken: 0 },
          { skill: RULED, rule: 'no-curl', says: 'Never fetch', kept: 2, broken: 0 },
        ],
        "write's two sessions, its recheck not counted again; look declares none, and unread's rules.json does not read; a skill named with its folder, frozen as `y`, has its rules said as its line writes it",
      );
      assert.deepEqual(all.steps.find((row) => row.step === 'quiet')?.rules, [], 'a step given no skill');
    },
  );

  await s.test('each skill a session loaded counts per try whose ends all say; a recheck, or one end unsaid, is unmeasured', async () => {
    const range = ['--factory', 'skills', '--from', SKILLS_DAY, '--to', UNSAID_DAY];
    const all = (await answered(range)).all;
    assert.deepEqual(
      Object.fromEntries(all.days.map((d) => [d.day, d.skillsPerTry])),
      { [SKILLS_DAY]: 3, [NO_SKILL_DAY]: 0, [UNSAID_DAY]: null },
      "three loads over spec's first try: its second has an end that does not say, and its recheck has no session of its own",
    );
    const row = (name: string) => all.steps.find((r) => r.step === name);
    const spec = row('spec');
    assert.deepEqual([spec?.tries, spec?.skillLoads, spec?.skillTries], [3, 3, 1]);
    assert.deepEqual(spec?.skills, [
      { skill: 'write-a-spec', count: 2, tries: 1, touched: null, loadedWhenTouched: null },
      { skill: 'look', count: 1, tries: 1, touched: null, loadedWhenTouched: null },
    ]);
    assert.deepEqual([row('quiet')?.skillLoads, row('quiet')?.skillTries, row('quiet')?.skills], [0, 1, []], 'a measured empty list');
    assert.deepEqual([row('old')?.skillLoads, row('old')?.skillTries, row('old')?.skills], [null, 0, []], 'an end that does not say');
  });

  await s.test(
    "each tally a step froze totals over its closeouts, per day and over the range; a day with no closeout's value is —",
    async () => {
      const range = ['--factory', 'tallies', '--from', TALLY_DAY, '--to', UNTALLIED_DAY];
      assert.deepEqual(
        (await answered(range)).all.tallies.map((row) => [row.step, row.tally, row.total, row.days]),
        [
          [
            'triage',
            'issues',
            { sum: 2, tries: 1 },
            [
              { day: TALLY_DAY, sum: 2, tries: 1 },
              { day: UNTALLIED_DAY, sum: null, tries: 0 },
            ],
          ],
          [
            'triage',
            'issues.open',
            { sum: 1, tries: 1 },
            [
              { day: TALLY_DAY, sum: 1, tries: 1 },
              { day: UNTALLIED_DAY, sum: null, tries: 0 },
            ],
          ],
        ],
        'the session that signed no issues measured none',
      );
    },
  );
});

const REVIEWED = '/repos/one/workflows/review';
const SKILL = 'review-a-change';

/** The review step, filled by `hire` with its `instructions`. */
const reviewBy = (hire = 'reviewer', instructions = 'You are Reviewer.') => ({
  name: 'review',
  after: [],
  body: `${instructions}\n\nReview it.`,
  agent: { ...agent(hire), body: 'Review it.', instructions, skills: [SKILL] },
});

/**
 * A run of the review workflow created on `day`, its step `step`, its skill rendered as `text` where given, its review's task `taskId`
 * if given, in `factory` where given.
 */
function reviewRun(id: string, day: string, step: object, text?: string, more: { taskId?: string; factory?: string } = {}) {
  writeRun(id, [step], more.taskId ? { review: { taskId: more.taskId } } : {}, {
    createdAt: `${day}T08:00:00.000Z`,
    workflowDir: REVIEWED,
    ...(more.factory ? { factory: more.factory } : {}),
  });
  if (text !== undefined) rendered(id, 'review', (step as { agent: { name: string } }).agent.name, SKILL, { text });
}

test("A change is marked once: a skill copy, a hire and an agent's instructions, each on the later run of its workflow and factory", async (t) => {
  const s = story(t);
  plantedFor(t);
  const before = 'Read the diff.';
  const after = 'Read the diff, then run the suite.';

  await s.test(
    'a skill whose rendered copy changed is marked once, on the later run, since the run before; the same copy again is not',
    async () => {
      ran('marks-2-review', { from: 9, to: 10, day: '2026-09-21' });
      reviewRun('marks-1', '2026-09-20', reviewBy(), before);
      reviewRun('marks-2', '2026-09-21', reviewBy(), after, { taskId: 'marks-2-review' });
      reviewRun('marks-3', '2026-09-22', reviewBy(), after);
      reviewRun('marks-4', '2026-09-22', reviewBy());
      assert.deepEqual((await answered(['--workflow', 'review'])).all.marks, [
        {
          run: 'marks-2',
          factory: 'default',
          workflow: 'review',
          repo: '/repos/one',
          day: '2026-09-21',
          kind: 'skill',
          name: SKILL,
          steps: ['review'],
          agents: ['reviewer'],
          since: 'marks-1',
        },
      ]);
    },
  );

  await s.test("an agent's instructions changed are marked once, on the agent; a hire changed once, on the step", async () => {
    reviewRun('marks-5', '2026-09-23', reviewBy('reviewer', 'You are Reviewer, who reads twice.'), after);
    reviewRun('marks-6', '2026-09-24', reviewBy('reviewer', 'You are Reviewer, who reads twice.'), after);
    reviewRun('marks-7', '2026-09-25', reviewBy('intaker', 'You are Intaker.'), after);
    reviewRun('marks-8', '2026-09-26', reviewBy('intaker', 'You are Intaker.'), after);
    assert.deepEqual(
      (await answered(['--workflow', 'review'])).all.marks.map((m) => [m.day, m.run, m.kind, m.name, m.since]),
      [
        ['2026-09-21', 'marks-2', 'skill', SKILL, 'marks-1'],
        ['2026-09-23', 'marks-5', 'agent', 'reviewer', 'marks-4'],
        ['2026-09-25', 'marks-7', 'step', 'review', 'marks-6'],
      ],
      'intaker appears in marks-7: her first instructions have nothing to compare with',
    );
  });

  await s.test('a run of another factory, between them in the same folder, is compared within its own factory alone', async () => {
    reviewRun('pipao-1', '2026-09-22', reviewBy('implementer', 'You are Implementer.'), 'Something else.', { factory: 'pipao' });
    reviewRun('pipao-2', '2026-09-24', reviewBy('implementer', 'You are Implementer.'), 'Something else.', { factory: 'pipao' });
    const marks = (await answered(['--workflow', 'review'])).all.marks;
    assert.deepEqual(
      marks.map((m) => m.run),
      ['marks-2', 'marks-5', 'marks-7'],
    );
    assert.deepEqual((await answered(['--workflow', 'review', '--factory', 'pipao'])).all.marks, []);
  });

  await s.test('each mark says its day, what changed, its run and the run it is compared with', async () => {
    assert.deepEqual(
      (await answered(['--workflow', 'review'])).all.marks.map((m) => [m.day, `${m.kind} ${m.name}`, m.run, m.since]),
      [
        ['2026-09-21', `skill ${SKILL}`, 'marks-2', 'marks-1'],
        ['2026-09-23', 'agent reviewer', 'marks-5', 'marks-4'],
        ['2026-09-25', 'step review', 'marks-7', 'marks-6'],
      ],
    );
  });
});

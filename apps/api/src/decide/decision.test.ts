/**
 * GET /api/runs/:runId/decision, the runs group's `decision` endpoint: the orchestrator's read model of a run's decision (`runDecision`,
 * whose judgement is told in `packages/agent-orchestrator/src/decide/decision.boundary.test.ts`) served as objects' `RunDecision` — a
 * decidable run's whole reading, `running`, `nothing`, and `Missing` for no run — beside the run object (`GET /api/runs/:id`), which says
 * the same of each step: what it consumed, that it was denied, an acceptance of a loop's try, a prune.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import { story } from 'test-kit/checkpoints';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { prunedKept, prunedWords } from 'agent-orchestrator';
import type { Decidable, DecideCommand, RunDecision } from 'objects';
import { app } from '../app.ts';
import { objectOf } from '../../test/run-reads.ts';

const git = (repo: string, ...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args],
    { cwd: repo, encoding: 'utf8' },
  );
const write = (repo: string, file: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), text);
};

/** A repository whose base has a workspace package with a source file and its test, and a CLAUDE.md; returns it with its base's sha. */
function aRepo(): { repo: string; base: string } {
  const repo = fs.mkdtempSync(path.join(root, 'repo-'));
  git(repo, 'init', '-q', '-b', 'main');
  write(repo, 'package.json', `${JSON.stringify({ name: 'app', workspaces: ['packages/*'], scripts: { test: 'node --test' } })}\n`);
  write(repo, 'packages/x/src/add.ts', 'export const add = (a, b) => a + b;\n');
  write(repo, 'packages/x/test/add.test.ts', "import assert from 'node:assert';\nassert.equal(add(1, 1), 2);\n");
  write(repo, 'CLAUDE.md', '# app\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  return { repo, base: git(repo, 'rev-parse', 'HEAD').trim() };
}

/** A branch off main with `change` committed on it; the checkout is left on main. */
function branchOff(repo: string, branch: string, change: () => void) {
  git(repo, 'checkout', '-q', '-b', branch);
  change();
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'the work');
  git(repo, 'checkout', '-q', 'main');
}

const at = '2026-09-13T00:10:00.000Z';

/** A task's journal, as the engine writes it. */
const journal = (taskId: string, events: object[]) => {
  fs.mkdirSync(path.join(root, 'engine', 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(root, 'engine', 'tasks', `${taskId}.jsonl`), events.map((e) => `${JSON.stringify(e)}\n`).join(''));
};
const filed = (taskId: string) => ({
  kind: 'filed',
  at,
  brief: `The brief ${taskId} was filed with.`,
  cwd: '/code/app',
  maxAttempts: 1,
  harness: 'codex',
});

/** A task that ran once and signed off with `closeout`, its attempt recording the `usage` the engine read, if any. */
const settledTask = (taskId: string, closeout: object, usage?: object) =>
  journal(taskId, [
    filed(taskId),
    { kind: 'starting', at, attempt: 1 },
    { kind: 'spawned', at, attempt: 1 },
    {
      kind: 'ended',
      at,
      attempt: 1,
      sessionId: `ae/${taskId}/1`,
      observed: 'done',
      reason: 'harness',
      closeout,
      ...(usage ? { usage } : {}),
    },
    { kind: 'settled', at, outcome: 'succeeded' },
  ]);

const done = { outcome: 'done', summary: 'It is done.', needs: null, artifacts: [] };
const blocked = { outcome: 'blocked', summary: 'Half of it is done.', needs: 'Which database?', artifacts: [] };

/** Implement, then a review of it in the same workspace and on the same branch: review's branch is the run's result. */
const workflow = [
  { name: 'implement', after: [], body: 'Implement it.', harness: 'codex' },
  { name: 'review', after: ['implement'], body: 'Review it.', harness: 'codex' },
];

function writeRun(run: { id: string; repo: string; baseRef: string } & Record<string, unknown>) {
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'runs', `${run.id}.json`),
    JSON.stringify({
      workspace: run.repo,
      branch: 'main',
      isolate: true,
      brief: 'Decide it',
      createdAt: at,
      workflowDir: path.join(root, 'no-such-workflow'),
      workflow,
      ...run,
    }),
  );
}

/** The decision of `id` as the route answers it: its status and its body. */
const decisionOf = async (id: string) => {
  const res = await app.request(`/api/runs/${id}/decision`);
  return { status: res.status, body: (await res.json()) as RunDecision };
};

/** A decision there is to make: a 200 whose body is `nemia decide`'s whole reading (`Decidable`), not `running` nor `nothing`. */
const decidable = async (id: string): Promise<Decidable> => {
  const { status, body } = await decisionOf(id);
  assert.equal(status, 200, JSON.stringify(body));
  assert.ok('commands' in body, JSON.stringify(body));
  return body;
};

/** The run object of `id` (`GET /api/runs/:id`), what `nemia show` prints. */
const detailOf = (id: string) => objectOf(app, id);

const { repo, base } = aRepo();
const branch = 'wf/r-d1/implement';
branchOff(repo, branch, () => {
  write(repo, 'packages/x/src/add.ts', '/** Adds. */\nexport const add = (a: number, b: number): number =>\n  a + b;\n');
  const added = Array.from({ length: 450 }, (_, i) => `assert.equal(add(${i}, 1), ${i + 1});`).join('\n');
  write(repo, 'packages/x/test/add.test.ts', `import assert from 'node:assert';\nassert.equal(add(1, 1), 2);\n${added}\n`);
  write(repo, 'CLAUDE.md', '# app\n\n- A lesson for the next agent.\n');
  write(
    repo,
    'package.json',
    `${JSON.stringify({ name: 'app', workspaces: ['packages/*'], scripts: { test: 'node --test packages/x/test/' } })}\n`,
  );
});

settledTask('t-d1-implement', done, { responses: 12, toolCalls: 30, inputTokens: 112_000, outputTokens: 6_350 });
settledTask('t-d1-review', done, { toolCalls: 4, inputTokens: 8_000, outputTokens: 650, costUsd: 0.004 });
writeRun({
  id: 'r-d1',
  repo,
  baseRef: base,
  steps: { implement: { taskId: 't-d1-implement', branch }, review: { taskId: 't-d1-review', branch } },
});

test("a run's decision on the api, and the run object beside it: one reading of each step, a loop's acceptance, a denial, a prune, and no run", async (t) => {
  const s = story(t);
  await s.test(
    "a finished run's decision is objects' `Decidable`, and the run object carries the same words of what each step consumed",
    async () => {
      const body = await decidable('r-d1');
      assert.deepEqual(Object.keys(body), [
        'standings',
        'touched',
        'lesson',
        'sensitive',
        'used',
        'total',
        'cost',
        'overBudget',
        'commands',
        'awaiting',
        'collisions',
      ]);
      assert.deepEqual(body.lesson, { said: 'CLAUDE.md +2 −0', state: 'written' });
      assert.deepEqual(
        body.commands.map((c: DecideCommand) => c.label),
        ['land it', 'drop it'],
      );
      const detail = await detailOf('r-d1');
      assert.deepEqual(
        Object.fromEntries(detail.status.steps.map((s) => [s.name, s.used])),
        body.used,
        "the run's object carries the same words on each step, off the views it already reads",
      );
      assert.equal(detail.status.pruned, null, 'a run never pruned says so with a null, not a missing field');
    },
  );
  await s.test('a run still running is `running`, and a step of it not filed has consumed nothing on its object', async () => {
    journal('t-d2-implement', [filed('t-d2-implement'), { kind: 'starting', at, attempt: 1 }, { kind: 'spawned', at, attempt: 1 }]);
    writeRun({ id: 'r-d2', repo, baseRef: base, steps: { implement: { taskId: 't-d2-implement', branch }, review: { taskId: null } } });
    const detail = await detailOf('r-d2');
    assert.deepEqual([detail.status.status, detail.status.waitingOnYou], ['running', []]);
    assert.deepEqual(
      detail.status.steps.map((s) => s.used),
      [
        {
          usage: null,
          used: 'not measured',
          cost: 'not measured',
          costUsd: null,
          apiMs: null,
          toolMs: null,
          read: null,
          peak: null,
          rebuilt: 0,
        },
        null,
      ],
      'a step not filed has consumed nothing, which is not `not measured`',
    );
    assert.deepEqual(await decisionOf('r-d2'), { status: 200, body: { running: true } });
  });
  await s.test(
    "a loop out of rounds is offered its acceptance, and the run object says an acceptance of the looping step's current try alone",
    async () => {
      const looping = [
        { name: 'implement', after: [], body: 'Implement it.', harness: 'codex' },
        {
          name: 'review',
          after: ['implement'],
          body: 'Review it.',
          harness: 'codex',
          loop: 'implement',
          rounds: 2,
          output: {
            file: 'review.json',
            schema: { type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false },
          },
        },
      ];
      settledTask('t-d9-implement-2', done);
      settledTask('t-d9-review-2', { ...done, again: true });
      const tries = (name: string) => [{ taskId: `t-d9-${name}-1`, cause: 'round' }];
      writeRun({
        id: 'r-d9',
        repo,
        baseRef: base,
        workflow: looping,
        steps: {
          implement: { taskId: 't-d9-implement-2', branch, tries: tries('implement') },
          review: { taskId: 't-d9-review-2', branch, tries: tries('review') },
        },
      });
      assert.ok(
        (await decidable('r-d9')).commands.some((c) => c.command === 'nemia approve r-d9 review --message "<why>"'),
        'the acceptance of a loop out of rounds is offered',
      );
      const stepsOf = async () => (await detailOf('r-d9')).status.steps;
      assert.deepEqual(
        (await stepsOf()).map((s) => [s.name, s.gate?.approval ?? null]),
        [
          ['implement', null],
          ['review', null],
        ],
        'before a person accepts, no step of the run says an approval',
      );
      const asks = path.join(root, 'runs', 'r-d9.asks');
      fs.mkdirSync(asks, { recursive: true });
      fs.writeFileSync(
        path.join(asks, 'accept-review-1'),
        JSON.stringify({ at: '2026-09-20T01:00:00.000Z', message: 'spent: of the try before' }),
      );
      assert.deepEqual(
        (await stepsOf()).map((s) => [s.name, s.gate?.approval ?? null]),
        [
          ['implement', null],
          ['review', null],
        ],
        'the looping step is on its second try, one round behind it: an acceptance of try 1 is spent, and said of nothing',
      );
      fs.writeFileSync(
        path.join(asks, 'accept-review-2'),
        JSON.stringify({ at: '2026-09-20T02:00:00.000Z', message: 'the findings are follow-up work' }),
      );
      assert.deepEqual(
        (await stepsOf()).map((s) => [s.name, s.gate?.approval ?? null]),
        [
          ['implement', null],
          ['review', { try: 2, at: '2026-09-20T02:00:00.000Z', message: 'the findings are follow-up work' }],
        ],
        "the looping step says the try, when and their words, and no other step: the board's gate reads it, the closeout still saying `again: true`",
      );
    },
  );
  await s.test(
    'a step `denials: fail` stopped reads `denied` on the object, waited on by a person, and the decision offers it afresh',
    async () => {
      const denying = [
        { ...workflow[0], harness: 'claude', denials: 'fail' },
        { ...workflow[1], harness: 'claude' },
      ];
      journal('t-d11-implement', [
        { ...filed('t-d11-implement'), harness: 'claude' },
        { kind: 'starting', at, attempt: 1 },
        { kind: 'spawned', at, attempt: 1 },
        {
          kind: 'ended',
          at,
          attempt: 1,
          sessionId: 'ae/t-d11-implement/1',
          observed: 'done',
          reason: 'harness',
          closeout: done,
          denials: [{ tool: 'Write', what: '/tmp/w/notes.md' }],
        },
        { kind: 'settled', at, outcome: 'succeeded' },
      ]);
      writeRun({
        id: 'r-d11',
        repo,
        baseRef: base,
        workflow: denying,
        steps: { implement: { taskId: 't-d11-implement', branch }, review: { taskId: null } },
      });
      const detail = await detailOf('r-d11');
      assert.deepEqual(
        [detail.status.steps[0]?.message, detail.status.steps[1]?.message, detail.status.waitingOnYou],
        ['denied', 'pending', ['implement']],
      );
      assert.deepEqual(
        (await decidable('r-d11')).commands.filter((c) => c.label === 'once more').map((c) => c.command),
        ['nemia retry r-d11 implement --fresh'],
      );
    },
  );
  await s.test(
    'REFUSED once pruned: the decision offers no try, and the run object says the prune, waits on nobody and has no try coming',
    async () => {
      settledTask('t-d10-implement', blocked);
      writeRun({ id: 'r-d10', repo, baseRef: base, steps: { implement: { taskId: 't-d10-implement', branch }, review: { taskId: null } } });
      assert.deepEqual((await detailOf('r-d10')).status.waitingOnYou, ['implement']);
      const pruned = { at: '2026-09-13T02:00:00.000Z', worktrees: [{ path: '/wt/r-d10/implement', bytes: 4096 }] };
      fs.writeFileSync(path.join(root, 'runs', 'r-d10.pruned'), JSON.stringify(pruned));
      assert.deepEqual((await decidable('r-d10')).commands, []);
      const page = await detailOf('r-d10');
      assert.deepEqual(
        page.status.pruned,
        { ...pruned, artifacts: null, said: `${prunedWords(pruned)}; ${prunedKept(pruned)}` },
        'its files are kept: a plain prune removes the worktrees alone',
      );
      assert.deepEqual(page.status.waitingOnYou, [], 'it waits on nobody: nothing a person does files anything for it');
      const asks = path.join(root, 'runs', 'r-d10.asks');
      fs.mkdirSync(asks, { recursive: true });
      fs.writeFileSync(path.join(asks, 'retry-implement-2'), JSON.stringify({ mode: 'continue' }));
      const asked = await detailOf('r-d10');
      assert.equal(
        asked.status.steps.find((s) => s.name === 'implement')?.asked,
        null,
        'a try asked by hand, beside the verb that refuses it, is no try coming',
      );
      assert.equal(asked.status.moving, false, 'the board says nothing is on its way');
    },
  );
  await s.test('a run called off is a 200 carrying `nothing` alone; an unknown run is a 404 that says where to look', async () => {
    writeRun({ id: 'r-d4', repo, baseRef: base, steps: { implement: { taskId: 't-d1-implement', branch }, review: { taskId: null } } });
    fs.writeFileSync(path.join(root, 'runs', 'r-d4.cancelled'), '2026-09-13T01:00:00.000Z');
    const { status, body } = await decisionOf('r-d4');
    assert.deepEqual([status, Object.keys(body)], [200, ['nothing']]);
    const res = await app.request('/api/runs/no-such-run/decision');
    assert.equal(res.status, 404);
    assert.match(((await res.json()) as { error: string }).error, /no-such-run/);
    assert.equal((await app.request('/api/runs/..%2Fescape/decision')).status, 404);
  });
});

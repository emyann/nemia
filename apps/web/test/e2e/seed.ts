/**
 * The store `npm run e2e` serves: two fake runs, written the way `wf` and the engine write theirs.
 *
 * FAKE has five steps in two lanes, frozen on the record as `wf start` freezes them, with the folder beside
 * it. `implement` signed off blocked, `review` was filed and the engine has no record of its task
 * (`unknown`), and `respond` is not filed. Beside them `tokens` signed off with no `check:` (`unverified`),
 * and `theme`, which waits on it, signed off and its check refused with exit 1: the engine's record of the
 * check's attempt, and its output and stderr as the check harness leaves them. So `assess` has the run
 * failed — finished, not in flight, and off the Factory's floor until finished runs are shown. Nothing
 * runs. The pages must render a run as the api reads it, whatever the engine says of its tasks.
 *
 * Written by hand rather than through agent-workflows: the web app imports no package, and a record
 * format that moves under the pages should fail here, where a person would see it.
 */
import fs from 'node:fs';
import path from 'node:path';

export const FAKE = {
  id: 'give-the-board-a-look-e2e0',
  title: 'Give the board a look',
  steps: ['implement', 'review', 'respond', 'tokens', 'theme'],
  blocked: 'implement',
  /** Signed off with no `check:`: done on its own word. */
  unverified: 'tokens',
  /** Signed off, and its check refused. */
  refused: 'theme',
  /** The command `theme`'s check ran, from the workflow the run froze. */
  check: 'npm run e2e',
  /** A line near the end of that check's output. */
  said: 'not ok 7 - the Factory hides a finished run',
  /** Who a person has to act for: the step that signed off blocked, and the one whose check refused. */
  waitingOnYou: ['implement', 'theme'],
  /** The steps that wait on no other, which the run's card leads into on the Factory. */
  first: ['implement', 'tokens'],
  /** One per `after` between its steps: implement → review, review → respond, implement → respond, tokens → theme. */
  edges: 4,
} as const;

/**
 * A second run, started after FAKE: `sketch` failed and `ship`, which waits on it, will never be filed, so
 * `assess` has the run failed — while `plan`'s session still runs. It still moves, so it is in flight: the
 * only card on the floor until finished runs are shown. Laid out oldest first, its card takes the cell beside
 * FAKE's — the cell FAKE's graph unfolds over, which the Factory must move this card out of.
 */
export const NEIGHBOUR = {
  id: 'a-run-beside-it-e2e1',
  title: 'A run beside it',
} as const;

const STEPS = [
  {
    file: 'implement.md',
    text: '---\nharness: claude\ncheck: npm test\n---\nImplement what was asked.\n',
    frozen: { name: 'implement', after: [], body: 'Implement what was asked.', harness: 'claude', check: 'npm test' },
  },
  {
    file: 'review.md',
    text: '---\nharness: codex\nafter: implement\npermissionMode: read-only\n---\nReview the change.\n',
    frozen: { name: 'review', after: ['implement'], body: 'Review the change.', harness: 'codex', permissionMode: 'read-only' },
  },
  {
    file: 'respond.md',
    text: '---\nharness: claude\nafter: review\nresume: implement\ncheck: npm test\n---\nAnswer the review.\n',
    frozen: { name: 'respond', after: ['review', 'implement'], resume: 'implement', body: 'Answer the review.', harness: 'claude', check: 'npm test' },
  },
  {
    file: 'tokens.md',
    text: '---\nharness: codex\n---\nPick the colour tokens.\n',
    frozen: { name: 'tokens', after: [], body: 'Pick the colour tokens.', harness: 'codex' },
  },
  {
    file: 'theme.md',
    text: `---\nharness: claude\nafter: tokens\ncheck: ${FAKE.check}\n---\nApply them to every page.\n`,
    frozen: { name: 'theme', after: ['tokens'], body: 'Apply them to every page.', harness: 'claude', check: FAKE.check },
  },
];

const write = (file: string, text: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** Events as the engine journals them: a line of JSON each. */
const lines = (events: object[]): string => events.map((event) => `${JSON.stringify(event)}\n`).join('');

/** Write the fake run into `root`, which becomes the api's WF_ROOT. Times are minutes before `now`. */
export function seed(root: string, now = Date.now()): void {
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const { id } = FAKE;
  const workflowDir = path.join(root, 'workflow');
  for (const step of STEPS) write(path.join(workflowDir, step.file), step.text);

  const workspace = path.join(root, 'worktrees', id, 'implement');
  const branch = `wf/${id}/implement`;
  // tokens runs beside implement, so it has a worktree of its own; theme is its only follower, and works in it.
  const lane = path.join(root, 'worktrees', id, 'tokens');
  const laneBranch = `wf/${id}/tokens`;
  const check = `${id}-theme-check`;
  write(path.join(root, 'runs', `${id}.json`), JSON.stringify({
    id, repo: '/code/hkb-v2', workspace: '/code/hkb-v2', baseRef: '19c9365', branch: 'main', isolate: true,
    brief: `${FAKE.title}\n\nA run seeded by npm run e2e: implement signed off blocked, the engine has no record of review's task, and respond is not filed; tokens signed off with no check, and theme's check refused.`,
    workflowDir,
    workflow: STEPS.map((step) => step.frozen),
    createdAt: ago(42),
    steps: {
      implement: { taskId: `${id}-implement`, workspace, branch },
      // review is implement's only follower, so it works in implement's workspace, on its branch.
      review: { taskId: `${id}-review`, workspace, branch },
      respond: { taskId: null },
      tokens: { taskId: `${id}-tokens`, workspace: lane, branch: laneBranch },
      theme: { taskId: `${id}-theme`, workspace: lane, branch: laneBranch, check: { taskId: check } },
    },
  }, null, 2));

  /** A step's task as the engine journals one that ran once, from `began` to `ended` minutes ago, and signed off with `closeout`. */
  const signedOff = (task: string, cwd: string, brief: string, began: number, ended: number, closeout: object): void =>
    write(path.join(root, 'engine', 'tasks', `${task}.jsonl`), lines([
      { kind: 'filed', at: ago(began), brief, cwd, maxAttempts: 1 },
      { kind: 'starting', at: ago(began - 1), attempt: 1 },
      { kind: 'spawned', at: ago(began - 1), attempt: 1 },
      { kind: 'ended', at: ago(ended), attempt: 1, sessionId: `ae/${task}/1`, observed: 'done', reason: 'harness', closeout },
      { kind: 'settled', at: ago(ended), outcome: 'succeeded' },
    ]));

  // implement signed off blocked. review's task has no journal at all, which is what makes it `unknown`.
  signedOff(`${id}-implement`, workspace, 'Implement what was asked.', 42, 12, {
    outcome: 'blocked',
    summary: 'The Factory renders every run in flight; the run page is unchanged.',
    needs: 'Should a finished run keep its card on the Factory?',
    artifacts: [],
  });
  signedOff(`${id}-tokens`, lane, 'Pick the colour tokens.', 40, 30, { outcome: 'done', summary: 'Picked the colour tokens.', needs: null, artifacts: [] });
  signedOff(`${id}-theme`, lane, 'Apply them to every page.', 30, 10, { outcome: 'done', summary: 'Applied them to every page.', needs: null, artifacts: [] });

  // theme's check, as the run files one on the check harness: its process exited 1, and the engine wrote the
  // code down with the end of the attempt.
  write(path.join(root, 'engine', 'tasks', `${check}.jsonl`), lines([
    { kind: 'filed', at: ago(10), brief: JSON.stringify({ check: FAKE.check, env: {} }), cwd: lane, maxAttempts: 1, harness: 'check' },
    { kind: 'starting', at: ago(10), attempt: 1 },
    { kind: 'spawned', at: ago(10), attempt: 1 },
    { kind: 'ended', at: ago(7), attempt: 1, sessionId: `ae/${check}/1`, observed: 'failed', reason: 'harness', exitCode: 1 },
    { kind: 'settled', at: ago(7), outcome: 'failed' },
  ]));
  // Its session as the check harness's worker leaves it: a run file, and the output with the exit code the run
  // printed last. Its stderr goes to a file of its own, beside the run records.
  const session = `ae/${check}/1`;
  const base = path.join(root, 'engine', 'runs', 'check', session.replace(/[^a-zA-Z0-9]+/g, '_'));
  write(`${base}.json`, JSON.stringify({ name: session, state: 'done', pid: 0, heartbeatAt: ago(7), logFile: `${base}.log`, exitCode: 1 }));
  write(`${base}.log`, `ok 6 - the Factory shows a run in flight\n${FAKE.said}\n# tests 7\n# fail 1\n\n[wf check] exit 1\n`);
  write(path.join(root, 'checks', `${check}.stderr`), 'npm error Lifecycle script `e2e` failed with error:\nnpm error code 1\n');

  const besideDir = path.join(root, 'workflow-beside');
  write(path.join(besideDir, 'plan.md'), '---\nharness: claude\n---\nPlan it.\n');
  write(path.join(besideDir, 'sketch.md'), '---\nharness: codex\n---\nSketch it.\n');
  write(path.join(besideDir, 'ship.md'), '---\nharness: claude\nafter: sketch\n---\nShip it.\n');
  write(path.join(root, 'runs', `${NEIGHBOUR.id}.json`), JSON.stringify({
    id: NEIGHBOUR.id, repo: '/code/hkb-v2', workspace: '/code/hkb-v2', baseRef: '19c9365', branch: 'main', isolate: true,
    brief: `${NEIGHBOUR.title}\n\nA second run seeded by npm run e2e: sketch failed while plan's session still runs, the card beside the first.`,
    workflowDir: besideDir,
    workflow: [
      { name: 'plan', after: [], body: 'Plan it.', harness: 'claude' },
      { name: 'sketch', after: [], body: 'Sketch it.', harness: 'codex' },
      { name: 'ship', after: ['sketch'], body: 'Ship it.', harness: 'claude' },
    ],
    createdAt: ago(5),
    steps: { plan: { taskId: `${NEIGHBOUR.id}-plan` }, sketch: { taskId: `${NEIGHBOUR.id}-sketch` }, ship: { taskId: null } },
  }, null, 2));
  // plan's session started and has not ended; sketch's failed.
  write(path.join(root, 'engine', 'tasks', `${NEIGHBOUR.id}-plan.jsonl`), lines([
    { kind: 'filed', at: ago(5), brief: 'Plan it.', cwd: '/code/hkb-v2', maxAttempts: 1 },
    { kind: 'starting', at: ago(4), attempt: 1 },
    { kind: 'spawned', at: ago(4), attempt: 1 },
  ]));
  write(path.join(root, 'engine', 'tasks', `${NEIGHBOUR.id}-sketch.jsonl`), lines([
    { kind: 'filed', at: ago(5), brief: 'Sketch it.', cwd: '/code/hkb-v2', maxAttempts: 1 },
    { kind: 'starting', at: ago(4), attempt: 1 },
    { kind: 'spawned', at: ago(4), attempt: 1 },
    { kind: 'ended', at: ago(2), attempt: 1, sessionId: `ae/${NEIGHBOUR.id}-sketch/1`, observed: 'failed', reason: 'harness' },
    { kind: 'settled', at: ago(2), outcome: 'failed' },
  ]));
}

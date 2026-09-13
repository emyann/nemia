/**
 * The store `npm run e2e` serves: two fake runs, written the way `wf` and the engine write theirs.
 *
 * Three steps, frozen on the record as `wf start` freezes them, with the folder beside it: `implement`
 * signed off blocked, `review` was filed and the engine has no record of its task (`unknown`), and
 * `respond` is not filed. Nothing runs. The pages must render a run as the api reads it, whatever the
 * engine says of its tasks.
 *
 * Written by hand rather than through agent-workflows: the web app imports no package, and a record
 * format that moves under the pages should fail here, where a person would see it.
 */
import fs from 'node:fs';
import path from 'node:path';

export const FAKE = {
  id: 'give-the-board-a-look-e2e0',
  title: 'Give the board a look',
  steps: ['implement', 'review', 'respond'],
  blocked: 'implement',
  /** The step that waits on no other, which the run's card leads into on the Factory. */
  first: 'implement',
  /** One per `after` between its steps: implement → review, review → respond, implement → respond. */
  edges: 3,
} as const;

/**
 * A second run, started after FAKE and with nothing filed: in flight, so its card takes the cell beside
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
];

const write = (file: string, text: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** Write the fake run into `root`, which becomes the api's WF_ROOT. Times are minutes before `now`. */
export function seed(root: string, now = Date.now()): void {
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const { id } = FAKE;
  const workflowDir = path.join(root, 'workflow');
  for (const step of STEPS) write(path.join(workflowDir, step.file), step.text);

  const workspace = path.join(root, 'worktrees', id, 'implement');
  const branch = `wf/${id}/implement`;
  write(path.join(root, 'runs', `${id}.json`), JSON.stringify({
    id, repo: '/code/hkb-v2', workspace: '/code/hkb-v2', baseRef: '19c9365', branch: 'main', isolate: true,
    brief: `${FAKE.title}\n\nA run seeded by npm run e2e: implement signed off blocked, the engine has no record of review's task, and respond is not filed.`,
    workflowDir,
    workflow: STEPS.map((step) => step.frozen),
    createdAt: ago(42),
    steps: {
      implement: { taskId: `${id}-implement`, workspace, branch },
      // review is implement's only follower, so it works in implement's workspace, on its branch.
      review: { taskId: `${id}-review`, workspace, branch },
      respond: { taskId: null },
    },
  }, null, 2));

  // implement's task as the engine journals one that ran once and signed off blocked. review's task has
  // no journal at all, which is what makes it `unknown`.
  const task = `${id}-implement`;
  write(path.join(root, 'engine', 'tasks', `${task}.jsonl`), [
    { kind: 'filed', at: ago(42), brief: 'Implement what was asked.', cwd: workspace, maxAttempts: 1 },
    { kind: 'starting', at: ago(41), attempt: 1 },
    { kind: 'spawned', at: ago(41), attempt: 1 },
    {
      kind: 'ended', at: ago(12), attempt: 1, sessionId: `ae/${task}/1`, observed: 'done', reason: 'harness',
      closeout: {
        outcome: 'blocked',
        summary: 'The Factory renders every run in flight; the run page is unchanged.',
        needs: 'Should a finished run keep its card on the Factory?',
        artifacts: [],
      },
    },
    { kind: 'settled', at: ago(12), outcome: 'succeeded' },
  ].map((event) => `${JSON.stringify(event)}\n`).join(''));

  const besideDir = path.join(root, 'workflow-beside');
  write(path.join(besideDir, 'plan.md'), '---\nharness: claude\n---\nPlan it.\n');
  write(path.join(root, 'runs', `${NEIGHBOUR.id}.json`), JSON.stringify({
    id: NEIGHBOUR.id, repo: '/code/hkb-v2', workspace: '/code/hkb-v2', baseRef: '19c9365', branch: 'main', isolate: true,
    brief: `${NEIGHBOUR.title}\n\nA second run seeded by npm run e2e, nothing filed yet: the card beside the first.`,
    workflowDir: besideDir,
    workflow: [{ name: 'plan', after: [], body: 'Plan it.', harness: 'claude' }],
    createdAt: ago(5),
    steps: { plan: { taskId: null } },
  }, null, 2));
}

/**
 * The store `npm run e2e` serves: three fake runs, written the way `wf` and the engine write theirs.
 *
 * FAKE has five steps in two lanes, frozen on the record as `wf start` freezes them, with the folder beside
 * it. `implement` signed off blocked, `review` was filed and the engine has no record of its task
 * (`unknown`), and `respond` is not filed. Beside them `tokens` signed off with no `check:` (`unverified`),
 * and `theme`, which waits on it, signed off and its check refused with exit 1: the engine's record of the
 * check's attempt, and its output and stderr as the check harness leaves them. So `assess` has the run
 * failed — finished, not in flight, and off the Factory's floor until finished runs are shown. Nothing
 * runs. The pages must render a run as the api reads it, whatever the engine says of its tasks.
 *
 * Beside the store, a checkout for the api to serve on the Capabilities page (`HKB_REPO`): CHECKOUT. And the workflows
 * the Workflows page lists, in the checkout's `workflows/` and in the store's: WORKFLOWS.
 *
 * Written by hand rather than through agent-workflows: the web app imports no package, and a record
 * format that moves under the pages should fail here, where a person would see it.
 */
import fs from 'node:fs';
import path from 'node:path';

export const FAKE = {
  id: 'give-the-board-a-look-e2e0',
  title: 'Give the board a look',
  /** The folder in the store it was started from, which names its workflow on the Runs page and the run's page. */
  workflow: 'workflow',
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

/**
 * A third run, started last: `review` loops back to `implement`, the loop is on round 3 of the 3 a loop runs when it
 * does not say, and review asked for another. So review reads `rounds exhausted` and waits on you, nothing of the run
 * moves, and `assess` has it failed — finished, off the Factory's floor until finished runs are shown. Newest, so its
 * card takes the cell after NEIGHBOUR's and moves neither of the others.
 */
export const LOOPING = {
  id: 'go-round-again-e2e2',
  title: 'Go round again',
  steps: ['implement', 'review'],
  /** The looping step, out of rounds. */
  exhausted: 'review',
  /** The step its loop runs again: where the edge back from `exhausted` arrives. */
  target: 'implement',
  /** What the edge back is labelled, from review's note: the round the loop is on. */
  round: 'round 3 of 3',
  /** What `wf ls` prints beside each step: the round it is on, and for the loop out of rounds, the command that takes it once more. */
  notes: {
    implement: 'round 3 of 3',
    review: 'round 3 of 3, and it asked again — once more: wf round go-round-again-e2e2 review',
  },
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

/**
 * The checkout the api serves on the Capabilities page: a skill with frontmatter and one without, an agent, and two MCP
 * servers its settings enable — one that lists its tools when asked, one whose command does not exist — and the rules
 * its settings deny, one of them a tool of the first server.
 */
export const CHECKOUT = {
  skill: { dir: 'review', name: 'code-review', description: 'Review a diff for bugs before a person reads it.' },
  /** A SKILL.md with no frontmatter, listed by its directory. */
  bareSkill: 'scratch',
  agent: { file: 'tester.md', name: 'tester', description: 'Writes the tests a change is missing.' },
  /** apps/api's fixture server: what it lists, the first line of `echo`'s description, and the line after it. */
  server: { name: 'fixture', tools: ['echo', 'wipe'], said: 'Say it back.', secondLine: 'A second line', denied: 'mcp__fixture__wipe' },
  missing: { name: 'missing', command: 'hkb-e2e-no-such-mcp-server' },
  denied: ['Bash(git push:*)', 'mcp__fixture__wipe'],
} as const;

/** Write CHECKOUT into `repo`. `mcpServer` is the file of the stdio MCP server it declares, which node runs. */
export function seedCheckout(repo: string, mcpServer: string): void {
  const { skill, bareSkill, agent, server, missing, denied } = CHECKOUT;
  write(path.join(repo, '.claude', 'skills', skill.dir, 'SKILL.md'), `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n# Review\n`);
  write(path.join(repo, '.claude', 'skills', bareSkill, 'SKILL.md'), '# Scratch\n\nNo frontmatter, so it is listed by its directory.\n');
  write(path.join(repo, '.claude', 'agents', agent.file), `---\nname: ${agent.name}\ndescription: ${agent.description}\n---\nYou write tests.\n`);
  write(path.join(repo, '.mcp.json'), JSON.stringify({
    mcpServers: {
      [server.name]: { command: process.execPath, args: [mcpServer] },
      [missing.name]: { command: missing.command, args: ['--stdio'] },
    },
  }, null, 2));
  write(path.join(repo, '.claude', 'settings.json'), JSON.stringify({
    enabledMcpjsonServers: [server.name, missing.name],
    permissions: { deny: denied },
  }, null, 2));
}

/**
 * The workflows the Workflows page lists. In the checkout's `workflows/`, `dev`: implement ⇄ review, described by its README,
 * each step with what the page draws on its node; and `broken`, whose reviewer misspells `after`, which the loader refuses.
 * In the store's `workflows/`, yours: `mine`, one step and no README.
 */
export const WORKFLOWS = {
  good: {
    name: 'dev',
    description: 'Implement what was asked, then a second engineer reviews it, three rounds at most.',
    steps: ['implement', 'review'],
    runsOn: 'claude · opus',
    check: 'npm test && npm run typecheck',
    tools: 'Read, Grep, Glob, Bash',
    loop: 'implement · 3 rounds',
  },
  broken: { name: 'broken', error: 'review: `afer` is not a key a step has.' },
  yours: { name: 'mine', steps: ['plan'] },
} as const;

/** Write WORKFLOWS: the checkout's into `repo`, and yours into the store at `root`. */
export function seedWorkflows(repo: string, root: string): void {
  const { good, broken, yours } = WORKFLOWS;
  const dev = path.join(repo, 'workflows', good.name);
  write(path.join(dev, 'README.md'), `# ${good.name}\n\n${good.description}\n\nA second paragraph, which the page does not show.\n`);
  write(path.join(dev, 'implement.md'), `---\nharness: claude\nmodel: opus\ncheck: ${good.check}\n---\nImplement what was asked.\n`);
  write(path.join(dev, 'review.md'), `---\nharness: claude\nmodel: opus\nafter: implement\ntools: ${good.tools}\npermissionMode: dontAsk\noutput: review.schema.json\nloop: implement\nrounds: 3\n---\nReview the change.\n`);
  write(path.join(dev, 'review.schema.json'), JSON.stringify({ type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false }, null, 2));
  const bad = path.join(repo, 'workflows', broken.name);
  write(path.join(bad, 'README.md'), `# ${broken.name}\n\nA reviewer whose after is misspelt.\n`);
  write(path.join(bad, 'implement.md'), 'Implement what was asked.\n');
  write(path.join(bad, 'review.md'), '---\nafer: implement\n---\nReview the change.\n');
  write(path.join(root, 'workflows', yours.name, 'plan.md'), '---\nharness: codex\n---\nWrite PLAN.md.\n');
}

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
  const workflowDir = path.join(root, FAKE.workflow);
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

  // LOOPING: review loops back to implement, on round 3. Each step's place holds its round-3 task, and a try behind it for
  // each round before, moved there with `then: 'round'` as the run moves it when it files a round.
  const loopDir = path.join(root, 'workflow-loop');
  const again = { type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false };
  write(path.join(loopDir, 'implement.md'), '---\nharness: claude\n---\nImplement it.\n');
  write(path.join(loopDir, 'review.md'), '---\nharness: codex\nafter: implement\nloop: implement\noutput: review.json\n---\nReview it, and say whether it needs another round.\n');
  write(path.join(loopDir, 'review.json'), `${JSON.stringify(again, null, 2)}\n`);
  const loopWorkspace = path.join(root, 'worktrees', LOOPING.id, 'implement');
  const loopBranch = `wf/${LOOPING.id}/implement`;
  const roundTask = (name: string, round: number) => `${LOOPING.id}-${name}-${round}`;
  write(path.join(root, 'runs', `${LOOPING.id}.json`), JSON.stringify({
    id: LOOPING.id, repo: '/code/hkb-v2', workspace: '/code/hkb-v2', baseRef: '19c9365', branch: 'main', isolate: true,
    brief: `${LOOPING.title}\n\nA third run seeded by npm run e2e: review loops back to implement, and asked for another round on the last of the three a loop runs.`,
    workflowDir: loopDir,
    workflow: [
      { name: 'implement', after: [], body: 'Implement it.', harness: 'claude' },
      // `rounds` as the parser sets it for a loop that does not say.
      {
        name: 'review', after: ['implement'], body: 'Review it, and say whether it needs another round.', harness: 'codex',
        loop: 'implement', rounds: 3, output: { file: 'review.json', schema: again },
      },
    ],
    createdAt: ago(4),
    steps: Object.fromEntries(LOOPING.steps.map((name) => [name, {
      taskId: roundTask(name, 3), workspace: loopWorkspace, branch: loopBranch,
      tries: [1, 2].map((round) => ({ taskId: roundTask(name, round), then: 'round' })),
    }])),
  }, null, 2));
  // A declared field is a field of the closeout, beside the four every closeout has: implement answers the findings it
  // was handed, as a loop's target owes from round 2, and review asks for another round.
  signedOff(roundTask('implement', 3), loopWorkspace, 'Implement it.', 3.9, 2.5, {
    outcome: 'done', summary: 'Answered the second review.', needs: null, artifacts: [],
    replies: [{ finding: 'apps/web/src/lib/status.ts — a word it does not know reads as working', answer: "won't fix", why: 'On purpose, and a test says so.' }],
  });
  signedOff(roundTask('review', 3), loopWorkspace, 'Review it, and say whether it needs another round.', 2.4, 0.5, {
    outcome: 'done', summary: 'One finding is still open.', needs: null, artifacts: [], again: true,
  });
}

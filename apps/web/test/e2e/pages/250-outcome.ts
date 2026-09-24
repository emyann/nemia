import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { fed, sidebar, themeOf } from '../board.ts';
import { expectCount, expectDrawn, expectVisible, idle, Refused, settled } from '../checks.ts';
import { png } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, REPO, store } from '../world.ts';

/**
 * A run of seven steps, each ending another way, written for this page's visit and taken back before it ends: every page shares the
 * store, and a run seeded for all of them would move their counts. Its schemas are the shipped agents' (`workflows/agents`), read as
 * they are, so the tab is shown what a real run of them would give it.
 */
const OUTCOME = {
  id: 'draw-each-outcome-e2e',
  title: 'Draw each outcome',
  garbled: '{"outcome": "done", "summary": "Drew every kind, and',
  plan: { approach: 'Draw the statement by its shape.\n\nOne pure function chooses the drawing from the value and its schema, and **JSON** is what it answers when nothing fits.' },
  findings: [
    { file: 'apps/web/src/components/conversation/ToolContent.tsx', line: 142, what: 'A tool result longer than the fold is cut **without an ellipsis**, so a person reads a truncated path as the whole of it.' },
    { file: 'apps/web/test/e2e/pages/250-outcome.ts', line: null, what: 'No page draws a closeout whose `line` is null.' },
    { file: 'apps/web/src/lib/outcome.ts', line: 48, what: 'An empty array with no schema reads as a list.\n\n- It is drawn as `none`.\n- Nothing says what it would have held.' },
  ],
  needs: 'Which of the two should the tab open on?\n\n1. **The outcome**, then the summary.\n2. The summary, then the outcome.',
  reason: 'The session ended without the closing statement it was asked for. It may have finished; it did not say so.',
} as const;

/** The repository the seeded runs say they are of: none on disk, as theirs is not. */
const REPO_SAID = '/code/hkb-v2';

const schemaOf = (name: string): Record<string, unknown> => JSON.parse(fs.readFileSync(path.join(REPO, 'workflows', 'agents', `${name}.schema.json`), 'utf8'));
const lines = (events: readonly object[]) => `${events.map((e) => JSON.stringify(e)).join('\n')}\n`;
const write = (file: string, text: string | Buffer) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** Writes the run, its folder, its engine tasks and its one image; answers every path written, to take back. */
function writeRun(root: string): string[] {
  const { id } = OUTCOME;
  const now = Date.now();
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const dir = path.join(root, 'workflow-outcome');
  const files = path.join(root, 'runs', id);
  const shot = path.join(files, 'artifacts', 'implement', 'runs-light.png');
  write(shot, png(480, 200, (x, y) => (y < 24 ? [30, 30, 30] : x < 96 ? [228, 228, 231] : [250, 250, 250])));

  const plan = schemaOf('plan');
  const review = schemaOf('review');
  const implement = schemaOf('implement');
  const odd = { type: 'object', properties: { matrix: { type: 'array', items: { type: 'array', items: { type: 'integer' } } }, weights: { type: 'object' } } };
  const steps = [
    { name: 'plan', output: { file: 'plan.schema.json', schema: plan } },
    { name: 'implement', output: { file: 'implement.schema.json', schema: implement } },
    { name: 'review', output: { file: 'review.schema.json', schema: review }, loop: 'implement', rounds: 3 },
    { name: 'ask' },
    { name: 'quiet' },
    { name: 'odd', output: { file: 'odd.schema.json', schema: odd } },
    { name: 'garbled' },
  ];
  const tasks: string[] = [];
  const taskOf = (step: string) => {
    const task = path.join(root, 'engine', 'tasks', `${id}-${step}.jsonl`);
    tasks.push(task);
    return task;
  };
  /** A task that ran once: ended as `end` says, with the statement it gave, or none — asked for one when `end` says whether it came. */
  const ran = (step: string, end: { observed: string; reason: string; settled: string; stated?: boolean }, closeout?: object | string) =>
    write(taskOf(step), lines([
      { kind: 'filed', at: ago(9), brief: `Do ${step}.`, cwd: REPO_SAID, maxAttempts: 1, harness: 'claude', ...(end.stated !== undefined ? { closeoutSchema: { type: 'object' } } : {}) },
      { kind: 'starting', at: ago(8.9), attempt: 1 },
      { kind: 'spawned', at: ago(8.9), attempt: 1 },
      { kind: 'ended', at: ago(4), attempt: 1, sessionId: `ae/${id}-${step}/1`, observed: end.observed, reason: end.reason, ...(end.stated !== undefined ? { stated: end.stated } : {}), ...(closeout !== undefined ? { closeout } : {}) },
      { kind: 'settled', at: ago(4), outcome: end.settled },
    ]));
  const signed = { observed: 'done', reason: 'harness', settled: 'succeeded' };
  const said = (summary: string, more: object = {}, outcome = 'done') => ({ outcome, summary, needs: null, artifacts: [], ...more });

  ran('plan', signed, said('A plan in five files.', {
    ...OUTCOME.plan,
    files: [
      { path: 'apps/web/src/lib/outcome.ts', change: 'New: the chooser, pure.' },
      { path: 'apps/web/src/components/Outcome.tsx', change: 'New: a component for each kind the chooser answers.' },
    ],
    steps: ['Write the chooser, and a test per kind.', 'Draw each kind.', 'Photograph it in both themes.'],
    risks: ['The inspector is **320px** wide.'],
  }));
  ran('implement', signed, said('Drew the tab, and answered the review.', {
    artifacts: [shot],
    screenshots: [shot],
    pages: ['/runs', '/runs/$runId'],
    replies: [
      { finding: '`apps/web/src/lib/outcome.ts:48` — an empty array reads as a list', answer: 'fixed', why: 'Its schema decides it now.' },
      { finding: 'The badge colours are the **Factory**’s', answer: "won't fix", why: 'On purpose: one colour for one meaning.' },
    ],
  }));
  ran('review', signed, said('Three findings, none worth another round.', { findings: OUTCOME.findings, again: false }));
  ran('ask', signed, said('Half of it is drawn.', { needs: OUTCOME.needs }, 'blocked'));
  // As the runtime records it since stage 4a: done, no statement, succeeded. `unsigned` is the orchestrator's word for it (`endWords`).
  ran('quiet', { observed: 'done', reason: 'harness', settled: 'succeeded', stated: false });
  ran('odd', signed, said('Gave what its schema asked, in shapes nothing draws.', { matrix: [[1, 2, 3], [4, 5, 6]], weights: { plan: 0.2, review: { findings: 0.7 } } }));
  // A statement cut off mid-string: no closeout, and still what the agent said.
  ran('garbled', signed, OUTCOME.garbled);

  for (const step of steps) {
    const output = 'output' in step && step.output ? `output: ${step.output.file}\n` : '';
    const loop = 'loop' in step ? `loop: ${step.loop}\n` : '';
    write(path.join(dir, `${step.name}.md`), `---\nharness: claude\n${output}${loop}---\nDo ${step.name}.\n`);
    if ('output' in step && step.output) write(path.join(dir, step.output.file), `${JSON.stringify(step.output.schema, null, 2)}\n`);
  }
  const record = path.join(root, 'runs', `${id}.json`);
  write(record, JSON.stringify({
    id, repo: REPO_SAID, workspace: REPO_SAID, baseRef: '19c9365', branch: 'main', isolate: true,
    brief: `${OUTCOME.title}\n\nA run written by the outcome page of npm run e2e, and taken back when it leaves: each step ends another way.`,
    workflowDir: dir,
    workflow: steps.map((step) => ({ after: [], body: `Do ${step.name}.`, harness: 'claude', ...step })),
    createdAt: ago(10),
    steps: Object.fromEntries(steps.map((step) => [step.name, { taskId: `${id}-${step.name}` }])),
  }, null, 2));
  return [record, dir, files, ...tasks];
}

/** The step's inspector, on its Output tab: what a click on its node opens. */
async function outputOf(page: Page, step: string) {
  // Seven steps side by side put one under the graph's legend, which takes the pointer: a click the node is sent, where it is.
  await page.locator(`section[aria-label="The run's steps as a graph"] .react-flow__node[data-id="${step}"]`).dispatchEvent('click');
  const inspector = page.locator(`aside[aria-label="Step ${step}"]`);
  await inspector.getByRole('tab', { name: 'Output' }).click();
  return inspector;
}

/** The inspector as a person sees it, and then its whole length: what is below its fold is read by scrolling it, and read here too. */
async function photograph(page: Page, inspector: ReturnType<Page['locator']>, name: string) {
  await settled(page);
  const theme = await themeOf(page);
  await inspector.screenshot({ path: path.join(OUT, `outcome-${name}-${theme}.png`) });
  await inspector.evaluate((aside) => {
    aside.style.height = 'auto';
    for (const child of Array.from(aside.querySelectorAll<HTMLElement>('*'))) if (getComputedStyle(child).overflowY === 'auto') child.style.overflow = 'visible';
  });
  await inspector.screenshot({ path: path.join(OUT, `outcome-${name}-whole-${theme}.png`) });
  await inspector.evaluate((aside) => {
    aside.style.height = '';
    for (const child of Array.from(aside.querySelectorAll<HTMLElement>('*'))) child.style.overflow = '';
  });
}

export default {
  // A run whose steps each ended another way, and the Output tab of each: the outcome and who said it first, then each field drawn by
  // its shape — findings, a plan, replies, a blocked step's needs, the machine's reason there is no statement, and JSON for the rest.
  name: 'outcome',
  route: '/runs',
  expect: async (page) => {
    await sidebar(page);
    const written = writeRun(store!);
    try {
      await page.goto(new URL(`/runs/${OUTCOME.id}`, page.url()).href, { waitUntil: 'load' });
      await idle(page);

      const review = await outputOf(page, 'review');
      await expectVisible(review.locator('[data-outcome="done"][data-by="agent"]'), 'review opens on its outcome, done, said by the agent');
      const places = review.locator('table[data-kind="findings"] th[data-place]');
      await expectCount(places, 3, 'its findings are a table, a row each');
      for (const [i, place] of ['apps/web/src/components/conversation/ToolContent.tsx:142', 'apps/web/test/e2e/pages/250-outcome.ts', 'apps/web/src/lib/outcome.ts:48'].entries()) {
        const text = await places.nth(i).textContent();
        if (text !== place) throw new Refused(`finding ${i + 1}'s place reads ${place}, a null line the file alone — it reads ${JSON.stringify(text)}`);
      }
      await expectVisible(review.locator('table[data-kind="findings"] strong', { hasText: 'without an ellipsis' }), "a finding's text is the markdown it is");
      await expectVisible(review.locator('section[data-field="again"] [data-yesno="no"]'), '`again` is a no');
      await expectVisible(review.locator('section[data-field="again"]', { hasText: 'true when a finding is worth another round' }), "beside what it means, from review's schema");
      await photograph(page, review, 'review');

      // Raw: the statement as the engine recorded it, whole, in place of the drawing — and back.
      const raw = review.getByRole('switch');
      await review.locator('label', { hasText: /^Raw$/ }).click();
      if (!(await raw.isChecked())) throw new Refused('the Raw switch is on once its label is pressed');
      await expectVisible(review.locator('pre[data-raw]', { hasText: '"findings": [' }), 'Raw shows the statement as it came, its findings as JSON');
      await expectCount(review.locator('table[data-kind="findings"]'), 0, 'in place of the drawing');
      await photograph(page, review, 'review-raw');
      await review.locator('label', { hasText: /^Raw$/ }).click();
      await expectCount(review.locator('pre[data-raw]'), 0, 'and pressed again, the drawing is back');

      const plan = await outputOf(page, 'plan');
      await expectVisible(plan.locator('section[data-field="approach"][data-kind="markdown"] strong', { hasText: 'JSON' }), "plan's approach is markdown");
      await expectVisible(plan.locator('table[data-kind="table"] th[data-place]', { hasText: 'apps/web/src/lib/outcome.ts' }), 'its files a table, the path over the change');
      await expectCount(plan.locator('section[data-field="steps"][data-kind="list"] li'), 3, 'its steps a list');
      await expectCount(plan.locator('section[data-field="risks"][data-kind="list"] li'), 1, 'and its risks');
      await photograph(page, plan, 'plan');

      const implement = await outputOf(page, 'implement');
      await expectDrawn(implement.locator('section[data-field="screenshots"] img[alt="runs-light.png"]'), "a screenshot implement names among its artifacts is drawn where the field names it");
      await expectVisible(implement.locator('section[data-field="replies"] li[data-answer="fixed"] [data-slot="badge"]', { hasText: 'fixed' }), 'its replies answer with a badge: fixed');
      await expectVisible(implement.locator(`section[data-field="replies"] li[data-answer="won't fix"] [data-slot="badge"]`, { hasText: "won't fix" }), "and won't fix");
      await photograph(page, implement, 'implement');

      const ask = await outputOf(page, 'ask');
      await expectVisible(ask.locator('[data-outcome="blocked"][data-by="agent"]'), 'ask opens on blocked, said by the agent');
      await expectVisible(ask.locator('[data-needs] strong', { hasText: 'The outcome' }), 'and what it needs, as the markdown it wrote');
      await photograph(page, ask, 'ask');

      const quiet = await outputOf(page, 'quiet');
      await expectVisible(quiet.locator('[data-outcome="unsigned"][data-by="machine"]'), "quiet has no statement: the machine's reason, unsigned");
      await expectVisible(quiet.locator('[data-reason]', { hasText: OUTCOME.reason }), 'said in a sentence');
      await photograph(page, quiet, 'quiet');

      const odd = await outputOf(page, 'odd');
      await expectVisible(odd.locator('section[data-field="matrix"][data-kind="json"] pre'), 'an array of arrays is shown as the JSON it came as, under its name');
      await expectVisible(odd.locator('section[data-field="weights"][data-kind="json"] pre', { hasText: '"findings": 0.7' }), 'and so is an object');
      await photograph(page, odd, 'odd');

      const garbled = await outputOf(page, 'garbled');
      await expectVisible(garbled.locator('[data-outcome="unreadable"][data-by="unreadable"]'), 'garbled opens on unreadable, said by the agent');
      await expectVisible(garbled.locator('[data-reason]', { hasText: 'could not be read' }), 'and why, in a sentence');
      await expectVisible(garbled.locator('section[aria-label="As it came"] pre[data-raw]', { hasText: OUTCOME.garbled }), 'then the statement whole, as it came');
      await photograph(page, garbled, 'garbled');
    } finally {
      // Off the run first, so no poll of it asks for a run that is gone.
      await page.goto(new URL('/runs', page.url()).href, { waitUntil: 'load' });
      await idle(page);
      for (const file of written) fs.rmSync(file, { recursive: true, force: true });
      // Said on the feed, as the tick says a run gone from the store: the list follows the feed, and polls once a minute beside it.
      fed(OUTCOME.id, 'removed');
    }
    await expectCount(page.locator(`a[href="/runs/${OUTCOME.id}"]`), 0, 'taken back: the run is gone from the list');
  },
} satisfies PageSpec;

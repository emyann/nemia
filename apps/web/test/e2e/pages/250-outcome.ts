import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { fed, photograph, sidebar, themeOf, stepBar } from '../board.ts';
import { expectCount, expectDrawn, expectVisible, idle, Refused, settled } from '../checks.ts';
import { png } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/**
 * A run of seven steps, each ending another way, written for this page's visit and taken back before it ends: every page shares the
 * store, and a run seeded for all of them would move their counts. Its schemas are the shapes a planner, an implementer and a reviewer
 * sign off with (`SCHEMAS`), written here, so the tab is shown what a real run of such steps would give it.
 */
const OUTCOME = {
  id: 'draw-each-outcome-e2e',
  title: 'Draw each outcome',
  garbled: '{"outcome": "done", "summary": "Drew every kind, and',
  plan: {
    approach:
      'Draw the statement by its shape.\n\nOne pure function chooses the drawing from the value and its schema, and **JSON** is what it answers when nothing fits.',
  },
  findings: [
    {
      file: 'apps/web/src/components/conversation/ToolContent.tsx',
      line: 142,
      what: 'A tool result longer than the fold is cut **without an ellipsis**, so a person reads a truncated path as the whole of it.',
    },
    { file: 'apps/web/test/e2e/pages/250-outcome.ts', line: null, what: 'No page draws a closeout whose `line` is null.' },
    {
      file: 'apps/web/src/lib/outcome.ts',
      line: 48,
      what: 'An empty array with no schema reads as a list.\n\n- It is drawn as `none`.\n- Nothing says what it would have held.',
    },
  ],
  needs: 'Which of the two should the tab open on?\n\n1. **The outcome**, then the summary.\n2. The summary, then the outcome.',
  reason: 'The session ended without the closing statement it was asked for. It may have finished; it did not say so.',
} as const;

/** The repository the seeded runs say they are of: none on disk, as theirs is not. */
const REPO_SAID = '/code/hkb-v2';

/** A schema of fields: each property required, and nothing else. */
const strict = (properties: Record<string, object>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

/** What a plan, an implementation and a review sign off with, each field saying what it means, as the tab shows it beside the value. */
const SCHEMAS = {
  plan: strict({
    approach: { type: 'string', description: 'The change in a paragraph: what it does, and why this way rather than another.' },
    files: {
      type: 'array',
      description: 'Every path the change would touch, each with one line on what changes in it.',
      items: strict({ path: { type: 'string' }, change: { type: 'string' } }),
    },
    steps: { type: 'array', description: 'The work, in order.', items: { type: 'string' } },
    risks: { type: 'array', description: 'What could go wrong, and what the tests would not catch.', items: { type: 'string' } },
  }),
  implement: strict({
    screenshots: { type: 'array', description: 'The absolute paths of the PNGs you looked at.', items: { type: 'string' } },
    pages: { type: 'array', description: 'The routes the screenshots show.', items: { type: 'string' } },
  }),
  review: strict({
    findings: {
      type: 'array',
      description: 'What is worth changing, one finding each.',
      items: strict({ file: { type: 'string' }, line: { type: ['integer', 'null'] }, what: { type: 'string' } }),
    },
    again: {
      type: 'boolean',
      description: 'true when a finding is worth another round of implement; false when the change is done as far as this review goes.',
    },
  }),
};
const lines = (events: readonly object[]) => `${events.map((e) => JSON.stringify(e)).join('\n')}\n`;
const write = (file: string, text: string | Buffer) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/**
 * Writes the run, its folder, its engine tasks and its one image into the store at `root`; answers every path written, to take back. Each
 * task ran once and ended with the statement it gave, or none; one asked for a statement says whether it came. `quiet` ends as the runtime
 * records a session that gave none — done, `closedOut: false`, succeeded — which the orchestrator calls `unsigned` (`endWords`), on its
 * second try, the run's one nudge behind it, so it waits on a person; `garbled`
 * ends on a statement cut off mid-string: no closeout, and still what the agent said.
 */
function writeRun(root: string): string[] {
  const { id } = OUTCOME;
  const now = Date.now();
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const dir = path.join(root, 'workflow-outcome');
  const files = path.join(root, 'runs', id);
  const shot = path.join(files, 'artifacts', 'implement', 'runs-light.png');
  write(
    shot,
    png(480, 200, (x, y) => (y < 24 ? [30, 30, 30] : x < 96 ? [228, 228, 231] : [250, 250, 250])),
  );

  const { plan, review, implement } = SCHEMAS;
  const odd = strict({
    matrix: { type: 'array', items: { type: 'array', items: { type: 'integer' } } },
    weights: strict({ plan: { type: 'number' }, review: strict({ findings: { type: 'number' } }) }),
  });
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
  const ran = (step: string, end: { observed: string; reason: string; settled: string; closedOut?: boolean }, closeout?: object | string) =>
    write(
      taskOf(step),
      lines([
        {
          kind: 'filed',
          at: ago(9),
          brief: `Do ${step}.`,
          cwd: REPO_SAID,
          maxAttempts: 1,
          harness: 'claude',
          ...(end.closedOut !== undefined ? { closeoutSchema: { type: 'object' } } : {}),
        },
        { kind: 'starting', at: ago(8.9), attempt: 1 },
        { kind: 'spawned', at: ago(8.9), attempt: 1 },
        {
          kind: 'ended',
          at: ago(4),
          attempt: 1,
          sessionId: `ae/${id}-${step}/1`,
          observed: end.observed,
          reason: end.reason,
          ...(end.closedOut !== undefined ? { closedOut: end.closedOut } : {}),
          ...(closeout !== undefined ? { closeout } : {}),
        },
        { kind: 'settled', at: ago(4), outcome: end.settled },
      ]),
    );
  const signed = { observed: 'done', reason: 'harness', settled: 'succeeded' };
  const said = (summary: string, more: object = {}, outcome = 'done') => ({ outcome, summary, needs: null, artifacts: [], ...more });

  ran(
    'plan',
    signed,
    said('A plan in five files.', {
      ...OUTCOME.plan,
      files: [
        { path: 'apps/web/src/lib/outcome.ts', change: 'New: the chooser, pure.' },
        { path: 'apps/web/src/components/Outcome.tsx', change: 'New: a component for each kind the chooser answers.' },
      ],
      steps: ['Write the chooser, and a test per kind.', 'Draw each kind.', 'Photograph it in both themes.'],
      risks: ['The inspector is **320px** wide.'],
    }),
  );
  ran(
    'implement',
    signed,
    said('Drew the tab, and answered the review.', {
      artifacts: [shot],
      screenshots: [shot],
      pages: ['/runs', '/runs/$runId'],
      replies: [
        {
          finding: '`apps/web/src/lib/outcome.ts:48` — an empty array reads as a list',
          answer: 'fixed',
          why: 'Its schema decides it now.',
        },
        { finding: 'The badge colours are the **Factory**’s', answer: "won't fix", why: 'On purpose: one colour for one meaning.' },
      ],
    }),
  );
  ran('review', signed, said('Three findings, none worth another round.', { findings: OUTCOME.findings, again: false }));
  ran('ask', signed, said('Half of it is drawn.', { needs: OUTCOME.needs }, 'blocked'));
  ran('quiet', { observed: 'done', reason: 'harness', settled: 'succeeded', closedOut: false });
  ran('quiet-first', { observed: 'done', reason: 'harness', settled: 'succeeded', closedOut: false });
  ran(
    'odd',
    signed,
    said('Gave what its schema asked, in shapes nothing draws.', {
      matrix: [
        [1, 2, 3],
        [4, 5, 6],
      ],
      weights: { plan: 0.2, review: { findings: 0.7 } },
    }),
  );
  ran('garbled', signed, OUTCOME.garbled);

  for (const step of steps) {
    const output = 'output' in step && step.output ? `output: ${step.output.file}\n` : '';
    const loop = 'loop' in step ? `loop: ${step.loop}\n` : '';
    write(path.join(dir, `${step.name}.md`), `---\nplace: git\nharness: claude\n${output}${loop}---\nDo ${step.name}.\n`);
    if ('output' in step && step.output) write(path.join(dir, step.output.file), `${JSON.stringify(step.output.schema, null, 2)}\n`);
  }
  const record = path.join(root, 'runs', `${id}.json`);
  write(
    record,
    JSON.stringify(
      {
        id,
        repo: REPO_SAID,
        workspace: REPO_SAID,
        baseRef: '19c9365',
        branch: 'main',
        isolate: true,
        brief: `${OUTCOME.title}\n\nA run written by the outcome page of npm run e2e, and taken back when it leaves: each step ends another way.`,
        workflowDir: dir,
        workflow: steps.map((step) => ({ after: [], body: `Do ${step.name}.`, harness: 'claude', ...step })),
        createdAt: ago(10),
        steps: {
          ...Object.fromEntries(steps.map((step) => [step.name, { taskId: `${id}-${step.name}` }])),
          quiet: { taskId: `${id}-quiet`, tries: [{ taskId: `${id}-quiet-first`, then: 'signoff' }] },
        },
      },
      null,
      2,
    ),
  );
  return [record, dir, files, ...tasks];
}

/**
 * The step's inspector, on its Output tab: what a click on its node opens, the click sent to the node where it is, whatever lies over it.
 */
async function outputOf(page: Page, step: string) {
  await page.locator(`section[aria-label="The run's steps as a graph"] .react-flow__node[data-id="${step}"]`).dispatchEvent('click');
  const inspector = stepBar(page, OUTCOME.id, step);
  await inspector.getByRole('tab', { name: 'Output' }).click();
  return inspector;
}

/** The inspector as a person sees it, and then its whole length: what is below its fold is read by scrolling it, and read here too. */
async function photographInspector(page: Page, inspector: ReturnType<Page['locator']>, name: string) {
  await settled(page);
  const theme = await themeOf(page);
  await photograph(inspector, path.join(OUT, `outcome-${name}-${theme}.png`));
  await inspector.evaluate((aside) => {
    aside.style.position = 'absolute';
    aside.style.bottom = 'auto';
    for (const child of Array.from(aside.querySelectorAll<HTMLElement>('*')))
      if (getComputedStyle(child).overflowY === 'auto') child.style.overflow = 'visible';
  });
  await photograph(inspector, path.join(OUT, `outcome-${name}-whole-${theme}.png`));
  await inspector.evaluate((aside) => {
    aside.style.position = '';
    aside.style.bottom = '';
    for (const child of Array.from(aside.querySelectorAll<HTMLElement>('*'))) child.style.overflow = '';
  });
}

export default {
  /**
   * A run whose steps each ended another way, and the Output tab of each: the outcome and who said it first, then each field drawn by its
   * shape — findings, a plan, replies, a blocked step's needs, the machine's reason there is no statement, and JSON for the rest — and Raw,
   * the statement as the engine recorded it, whole, in place of the drawing. The page leaves the run before it takes it back, so no poll
   * asks for a run that is gone.
   */
  name: 'outcome',
  route: '/runs',
  expect: async (page) => {
    await sidebar(page);
    const written = writeRun(store!);
    try {
      await page.goto(new URL(`/runs/${OUTCOME.id}`, page.url()).href, { waitUntil: 'load' });
      await idle(page);

      const again = page.locator('section[aria-label="Answer"] [data-offer="try-again"][data-step="quiet"]');
      await expectVisible(
        again.filter({ hasText: 'quiet gave no closeout the run accepts — none, one short of a field it declares, or one naming a file' }),
        'the row that offers a try of an unsigned step says the three ways a closeout is not accepted, and where to read which',
      );
      await photograph(again, path.join(OUT, `outcome-unsigned-offer-${await themeOf(page)}.png`));

      const review = await outputOf(page, 'review');
      await expectVisible(review.locator('[data-outcome="done"][data-by="agent"]'), 'review opens on its outcome, done, said by the agent');
      const places = review.locator('table[data-kind="findings"] th[data-place]');
      await expectCount(places, 3, 'its findings are a table, a row each');
      for (const [i, place] of [
        'apps/web/src/components/conversation/ToolContent.tsx:142',
        'apps/web/test/e2e/pages/250-outcome.ts',
        'apps/web/src/lib/outcome.ts:48',
      ].entries()) {
        const text = await places.nth(i).textContent();
        if (text !== place)
          throw new Refused(`finding ${i + 1}'s place reads ${place}, a null line the file alone — it reads ${JSON.stringify(text)}`);
      }
      await expectVisible(
        review.locator('table[data-kind="findings"] strong', { hasText: 'without an ellipsis' }),
        "a finding's text is the markdown it is",
      );
      await expectVisible(review.locator('section[data-field="again"] [data-yesno="no"]'), '`again` is a no');
      await expectVisible(
        review.locator('section[data-field="again"]', { hasText: 'true when a finding is worth another round' }),
        "beside what it means, from review's schema",
      );
      await photographInspector(page, review, 'review');

      const raw = review.getByRole('switch');
      await review.locator('label', { hasText: /^Raw$/ }).click();
      if (!(await raw.isChecked())) throw new Refused('the Raw switch is on once its label is pressed');
      await expectVisible(
        review.locator('pre[data-raw]', { hasText: '"findings": [' }),
        'Raw shows the statement as it came, its findings as JSON',
      );
      await expectCount(review.locator('table[data-kind="findings"]'), 0, 'in place of the drawing');
      await photographInspector(page, review, 'review-raw');
      await review.locator('label', { hasText: /^Raw$/ }).click();
      await expectCount(review.locator('pre[data-raw]'), 0, 'and pressed again, the drawing is back');

      const plan = await outputOf(page, 'plan');
      await expectVisible(
        plan.locator('section[data-field="approach"][data-kind="markdown"] strong', { hasText: 'JSON' }),
        "plan's approach is markdown",
      );
      await expectVisible(
        plan.locator('table[data-kind="table"] th[data-place]', { hasText: 'apps/web/src/lib/outcome.ts' }),
        'its files a table, the path over the change',
      );
      await expectCount(plan.locator('section[data-field="steps"][data-kind="list"] li'), 3, 'its steps a list');
      await expectCount(plan.locator('section[data-field="risks"][data-kind="list"] li'), 1, 'and its risks');
      await photographInspector(page, plan, 'plan');

      const implement = await outputOf(page, 'implement');
      await expectDrawn(
        implement.locator('section[data-field="screenshots"] img[alt="runs-light.png"]'),
        'a screenshot implement names among its artifacts is drawn where the field names it',
      );
      await expectVisible(
        implement.locator('section[data-field="replies"] li[data-answer="fixed"] [data-slot="badge"]', { hasText: 'fixed' }),
        'its replies answer with a badge: fixed',
      );
      await expectVisible(
        implement.locator(`section[data-field="replies"] li[data-answer="won't fix"] [data-slot="badge"]`, { hasText: "won't fix" }),
        "and won't fix",
      );
      await photographInspector(page, implement, 'implement');

      const ask = await outputOf(page, 'ask');
      await expectVisible(ask.locator('[data-outcome="blocked"][data-by="agent"]'), 'ask opens on blocked, said by the agent');
      await expectVisible(ask.locator('[data-needs] strong', { hasText: 'The outcome' }), 'and what it needs, as the markdown it wrote');
      await photographInspector(page, ask, 'ask');

      const quiet = await outputOf(page, 'quiet');
      await expectVisible(
        quiet.locator('[data-outcome="unsigned"][data-by="machine"]'),
        "quiet has no statement: the machine's reason, unsigned",
      );
      await expectVisible(quiet.locator('[data-reason]', { hasText: OUTCOME.reason }), 'said in a sentence');
      await photographInspector(page, quiet, 'quiet');

      const odd = await outputOf(page, 'odd');
      await expectVisible(
        odd.locator('section[data-field="matrix"][data-kind="json"] pre'),
        'an array of arrays is shown as the JSON it came as, under its name',
      );
      await expectVisible(
        odd.locator('section[data-field="weights"][data-kind="json"] pre', { hasText: '"findings": 0.7' }),
        'and so is an object',
      );
      await photographInspector(page, odd, 'odd');

      const garbled = await outputOf(page, 'garbled');
      await expectVisible(
        garbled.locator('[data-outcome="unreadable"][data-by="unreadable"]'),
        'garbled opens on unreadable, said by the agent',
      );
      await expectVisible(garbled.locator('[data-reason]', { hasText: 'could not be read' }), 'and why, in a sentence');
      await expectVisible(
        garbled.locator('section[aria-label="As it came"] pre[data-raw]', { hasText: OUTCOME.garbled }),
        'then the statement whole, as it came',
      );
      await photographInspector(page, garbled, 'garbled');
    } finally {
      await page.goto(new URL('/runs', page.url()).href, { waitUntil: 'load' });
      await idle(page);
      for (const file of written) fs.rmSync(file, { recursive: true, force: true });
      fed(OUTCOME.id, 'removed');
    }
    await expectCount(
      page.locator(`a[href="/runs/${OUTCOME.id}"]`),
      0,
      'taken back and said on the feed, as the tick says a run gone from the store: the run is gone from the list',
    );
  },
} satisfies PageSpec;

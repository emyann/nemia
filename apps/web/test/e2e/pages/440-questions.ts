import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { fed, photograph, sidebar, themeOf, stepBar } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { ASKED } from '../seed.ts';
import { OUT, store } from '../world.ts';

/**
 * A run of two steps that ask a person questions as data, written for this page's visit and taken back before it ends: `design` signed off
 * done asking one, `spec` signed off blocked asking two — one that takes a single answer and recommends one, one that takes several and
 * recommends none.
 */
const QUESTIONS = {
  id: 'answer-by-choosing-e2e',
  title: 'Answer by choosing',
  needs: 'Two questions before the spec is cut.',
  own: 'The retry first; the gate once a gate can carry them.',
  cut: {
    title: 'How is the card cut?',
    body: 'It is **big**: the shape, the board and the terminal.',
    options: [
      { label: 'Shape first', meaning: 'The shape and the board now, the terminal later.' },
      { label: 'All at once', meaning: 'One card, three times the review.' },
    ],
    recommended: 'Shape first',
    multiple: false,
  },
  where: {
    title: 'Where do the answers go?',
    body: 'Either, or both.',
    options: [
      { label: 'Into the retry', meaning: 'The next try is told them.' },
      { label: 'With the approval', meaning: 'A gate carries them.' },
    ],
    recommended: null,
    multiple: true,
  },
  done: {
    title: 'Which store keeps them?',
    body: 'The run’s asks, or a file of their own.',
    options: [
      { label: 'The asks', meaning: 'Beside every other ask.' },
      { label: 'Their own', meaning: 'A new file to compose on read.' },
    ],
    recommended: 'The asks',
    multiple: false,
  },
} as const;

/** The repository the run says it is of: none on disk. */
const REPO_SAID = '/code/hkb-v2';

const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/**
 * Writes the run, its folder and its two tasks into the store at `root`, each task ended once with the closeout it gave, flat as a
 * harness writes it; answers every path written, to take back.
 */
function writeRun(root: string): string[] {
  const { id } = QUESTIONS;
  const now = Date.now();
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const dir = path.join(root, 'workflow-questions');
  const schema = { type: 'object', properties: { open: ASKED }, required: ['open'], additionalProperties: false };
  const task = (step: string) => path.join(root, 'engine', 'tasks', `${id}-${step}.jsonl`);
  const ran = (step: string, began: number, closeout: object) =>
    write(
      task(step),
      [
        { kind: 'filed', at: ago(began), brief: `Do ${step}.`, cwd: REPO_SAID, maxAttempts: 1, harness: 'claude' },
        { kind: 'starting', at: ago(began - 0.1), attempt: 1 },
        { kind: 'spawned', at: ago(began - 0.1), attempt: 1 },
        { kind: 'ended', at: ago(began - 2), attempt: 1, sessionId: `ae/${id}-${step}/1`, observed: 'done', reason: 'harness', closeout },
        { kind: 'settled', at: ago(began - 2), outcome: 'succeeded' },
      ]
        .map((line) => `${JSON.stringify(line)}\n`)
        .join(''),
    );
  ran('design', 9, { outcome: 'done', summary: 'The design, one question left open.', needs: null, artifacts: [], open: [QUESTIONS.done] });
  ran('spec', 6, {
    outcome: 'blocked',
    summary: 'Half the spec.',
    needs: QUESTIONS.needs,
    artifacts: [],
    open: [QUESTIONS.cut, QUESTIONS.where],
  });

  const steps = [
    { name: 'design', after: [] },
    { name: 'spec', after: ['design'] },
  ];
  for (const step of steps) {
    const after = step.after.length ? `after: ${step.after.join(', ')}\n` : '';
    write(path.join(dir, `${step.name}.md`), `---\nplace: git\nharness: claude\n${after}output: open.schema.json\n---\nDo ${step.name}.\n`);
  }
  write(
    path.join(dir, 'open.schema.json'),
    `${JSON.stringify({ ...schema, properties: { open: { 'x-shape': 'questions', description: ASKED.description } } }, null, 2)}\n`,
  );
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
        brief: `${QUESTIONS.title}\n\nA run written by the questions page of npm run e2e, and taken back when it leaves.`,
        workflowDir: dir,
        workflow: steps.map((step) => ({
          ...step,
          body: `Do ${step.name}.`,
          harness: 'claude',
          output: { file: 'open.schema.json', schema },
        })),
        createdAt: ago(10),
        steps: Object.fromEntries(steps.map((step) => [step.name, { taskId: `${id}-${step.name}` }])),
      },
      null,
      2,
    ),
  );
  return [record, dir, path.join(root, 'runs', id), path.join(root, 'runs', `${id}.asks`), task('design'), task('spec')];
}

/** Every option of the form's questions that is chosen: none until the person chooses. */
const chosen = (form: ReturnType<Page['locator']>) => form.locator('fieldset[data-question] input:checked');

/** The labels chosen on the question titled `title`. */
const chosenOn = (form: ReturnType<Page['locator']>, title: string): Promise<string[]> =>
  form
    .locator(`fieldset[data-question="${title}"] input:checked`)
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));

export default {
  /**
   * A run whose steps ask questions as data. A done step's are drawn read-only on its Output tab, the recommended option marked. A blocked
   * step's are a form under Decide: an option for each answer, radios where it takes one and checkboxes where several, nothing chosen, and
   * `Answer and continue` held until each question has an answer. `Choose the recommended answers` chooses the one recommended and leaves
   * the question without one as it was; a box ticked there and words of the person's own beside it, the answers go to the api, which writes
   * them as the next try's message, in the package's words. The page leaves the run before it takes it back, so no poll asks for a run that
   * is gone.
   */
  name: 'questions',
  route: '/runs',
  expect: async (page) => {
    await sidebar(page);
    const written = writeRun(store!);
    const { id, cut, where, done } = QUESTIONS;
    try {
      await page.goto(new URL(`/runs/${id}`, page.url()).href, { waitUntil: 'load' });
      await idle(page);
      const theme = await themeOf(page);

      await page.locator(`section[aria-label="The run's steps as a graph"] .react-flow__node[data-id="design"]`).dispatchEvent('click');
      const inspector = stepBar(page, id, 'design');
      await inspector.getByRole('tab', { name: 'Output' }).click();
      const asked = inspector.locator('section[data-questions="open"]');
      await expectVisible(asked.locator(`li[data-question="${done.title}"]`), "design's question is drawn under its field, read-only");
      await expectVisible(
        asked.locator(`li[data-option="${done.recommended}"] [data-recommended]`),
        'its recommended option marked recommended',
      );
      await expectCount(asked.locator('input, textarea, button'), 0, 'with nothing to answer it with: design is done');
      await settled(page);
      await photograph(inspector, path.join(OUT, `questions-asked-${theme}.png`));
      await inspector.getByRole('button', { name: 'Close', exact: true }).click();
      await expectCount(inspector, 0, "the inspector's Close closes it, and uncovers the Decide it floated over");

      const row = page.locator(`section[aria-label="Decide"] li[data-offer="answer"][data-questions][data-step="spec"]`);
      const form = row.getByRole('form', { name: 'Answer spec' });
      await expectVisible(form, 'spec, blocked, asks its questions as a form under Decide');
      await expectVisible(row.locator('[data-said]', { hasText: QUESTIONS.needs }), 'beside what it needs');
      await expectCount(
        form.locator(`fieldset[data-question="${cut.title}"] input[type="radio"]`),
        2,
        'a radio for each answer to one that takes one',
      );
      await expectCount(
        form.locator(`fieldset[data-question="${where.title}"] input[type="checkbox"]`),
        2,
        'a checkbox for each answer to one that takes several',
      );
      await expectCount(chosen(form), 0, 'nothing is chosen until the person chooses');
      const send = form.getByRole('button', { name: 'Answer and continue' });
      if (await send.isEnabled())
        throw new Refused('Answer and continue is held while a question has no answer — it was enabled with none');

      await form.getByRole('button', { name: 'Choose the recommended answers' }).click();
      const cutChosen = await chosenOn(form, cut.title);
      const whereChosen = await chosenOn(form, where.title);
      if (cutChosen.join() !== cut.recommended || whereChosen.length !== 0)
        throw new Refused(
          `Choose the recommended answers chooses ${JSON.stringify(cut.recommended)} and leaves the question with no recommendation as it was — it chose ${JSON.stringify(cutChosen)} and ${JSON.stringify(whereChosen)}`,
        );
      if (await send.isEnabled()) throw new Refused(`Answer and continue is still held: "${where.title}" has no answer yet`);

      const whereField = form.locator(`fieldset[data-question="${where.title}"]`);
      await whereField.locator(`label[data-option="${where.options[0].label}"]`).click();
      await whereField.locator('textarea[data-own]').fill(QUESTIONS.own);
      await expectVisible(form.locator('button[type="submit"]:enabled'), 'every question answered, Answer and continue is offered');
      await settled(page);
      await photograph(row, path.join(OUT, `questions-form-${theme}.png`));

      const [response] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/runs/${id}/steps/spec/retry`, {
          timeout: WAIT_MS,
        }),
        send.click(),
      ]);
      if (response.status() !== 202)
        throw new Refused(
          `the api takes the answers, through the board's proxy — it answered ${response.status()}: ${await response.text()}`,
        );
      const file = path.join(store!, 'runs', `${id}.asks`, 'retry-spec-2');
      const ask = (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}) as { mode?: string; message?: string };
      const lines = [
        'Answers to your questions:',
        `1. ${cut.title}\n   Chose: ${cut.recommended} — ${cut.options[0].meaning}`,
        `2. ${where.title}\n   Chose: ${where.options[0].label} — ${where.options[0].meaning}\n   In my own words: ${QUESTIONS.own}`,
        'Answered by: person, on the board',
      ];
      if (ask.mode !== 'continue' || ask.message !== lines.join('\n\n'))
        throw new Refused(`the answers are the next try's message, in the package's words — ${file} holds ${JSON.stringify(ask)}`);
      await expectVisible(
        page.locator(`section[aria-label="Decide"] [data-asked][data-step="spec"]`),
        "spec's row says its try was asked for",
      );
    } finally {
      await page.goto(new URL('/runs', page.url()).href, { waitUntil: 'load' });
      await idle(page);
      for (const file of written) fs.rmSync(file, { recursive: true, force: true });
      fed(QUESTIONS.id, 'removed');
    }
    await expectCount(page.locator(`a[href="/runs/${QUESTIONS.id}"]`), 0, 'taken back and said on the feed: the run is gone from the list');
  },
} satisfies PageSpec;

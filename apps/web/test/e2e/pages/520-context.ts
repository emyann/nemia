import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { cardOf, showFinished } from '../canvas.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { CARDS, DIAMOND, FAKE, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The runner's viewport, put back before the page ends. */
const WIDE = { width: 1280, height: 800 };

/** A phone held upright. */
const PHONE = { width: 390, height: 844 };

/**
 * The run the page writes on the diamond's repository: it waits on DIAMOND's `running`, which has not landed, and reads FAKE, in flight,
 * and DIAMOND's `landed` as context. Its one step is hired from an agent, so its run page draws what it was told by layer.
 */
const READER = {
  id: 'reads-what-others-concluded-e2e52',
  title: 'Read what others concluded',
  context: [FAKE.id, DIAMOND.landed.id],
  instructions: 'You are the implementer: you change the code a brief asks for.',
  /** What its card's chip says on hover, a line a run: its id and its title. */
  reads: [`${FAKE.id} — ${FAKE.title}`, `${DIAMOND.landed.id} — ${DIAMOND.landed.title}`],
} as const;

const goto = async (page: Page, to: string): Promise<void> => {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
};

/** A picture of `target` as `what`, in the page's theme. */
const shoot = async (page: Page, target: Locator, what: string): Promise<void> => {
  await settled(page);
  await photograph(target, path.join(OUT, `context-${what}-${await themeOf(page)}.png`));
};

const answered = (page: Page, method: 'PUT' | 'DELETE', pathname: string) =>
  page.waitForResponse((r) => r.request().method() === method && new URL(r.url()).pathname === pathname, { timeout: WAIT_MS });

/** The task READER's step was filed with: its own words, then the run it waited on and each run it read, as the tick hands them. */
const TASK = [
  READER.title,
  '',
  'A run written by the context page: it waited on one run and was handed two as context.',
  '',
  `## From run ${DIAMOND.top.id}`,
  '',
  `This run waited on ${DIAMOND.top.id} (\`--after\`) and started once it landed, so its work is in this workspace.`,
  '',
  'What it was asked, the first line:',
  '',
  '```text',
  DIAMOND.top.title,
  '```',
  '',
  `## From run ${FAKE.id}`,
  '',
  `This run was handed ${FAKE.id} as context (\`--from\`); it did not wait on it.`,
  `Not landed, not judged: ${FAKE.id} was still in flight (or did not land) when this run's steps were filed.`,
  '',
  'What it was asked, the first line:',
  '',
  '```text',
  FAKE.title,
  '```',
  '',
  `## From run ${DIAMOND.landed.id}`,
  '',
  `This run was handed ${DIAMOND.landed.id} as context (\`--from\`); it did not wait on it.`,
  'It landed: a person read this account beside its change before it went onto the base.',
  '',
  'What it was asked, the first line:',
  '',
  '```text',
  DIAMOND.landed.title,
  '```',
].join('\n');

/**
 * READER's record, as `wf start --after --from` freezes it, from DIAMOND's `bottom`'s: waiting on `running` with nothing filed; or,
 * `filed`, after the diamond's top, which landed, its step filed with TASK, its journal and its line on the engine's feed written as the
 * runtime writes them. Each file it writes is returned, to be taken back.
 */
function written(filed: boolean): string[] {
  const runs = path.join(store!, 'runs');
  const bottom = JSON.parse(fs.readFileSync(path.join(runs, `${DIAMOND.bottom.id}.json`), 'utf8')) as {
    repo: string;
    workflow: Array<Record<string, unknown>>;
  };
  const task = `${READER.id}-implement`;
  const implement = {
    ...bottom.workflow[0],
    agent: { name: 'implementer', keys: [], body: 'Implement it.', given: {}, instructions: READER.instructions },
  };
  const record = path.join(runs, `${READER.id}.json`);
  const run = {
    ...bottom,
    id: READER.id,
    brief: `${READER.title}\n\nA run written by the context page: it waits on one run and reads two.`,
    workflow: [implement],
    after: [filed ? DIAMOND.top.id : DIAMOND.running.id],
    context: READER.context,
    createdAt: new Date().toISOString(),
    steps: { implement: filed ? { taskId: task, workspace: bottom.repo } : { taskId: null } },
  };
  fs.writeFileSync(record, JSON.stringify(run, null, 2));
  if (!filed) return [record];
  const event = { kind: 'filed', at: new Date().toISOString(), brief: TASK, cwd: bottom.repo, maxAttempts: 1 };
  const journal = path.join(store!, 'engine', 'tasks', `${task}.jsonl`);
  fs.writeFileSync(journal, `${JSON.stringify(event)}\n`);
  fs.appendFileSync(path.join(store!, 'engine', 'feed.jsonl'), `${JSON.stringify({ taskId: task, event })}\n`);
  return [record, journal];
}

/**
 * The Factory: READER's card says it reads two runs in a chip, each by its id and title on hover, and draws no line of them at rest; its
 * wait on `running` is drawn. Hovered, a faint line comes from FAKE, the one on the floor; with the finished shown, from `landed` too.
 */
async function onTheFactory(page: Page): Promise<void> {
  await goto(page, '/factories/default');
  const card = cardOf(page, READER.id);
  const chip = card.locator('[data-context]');
  await expectVisible(chip.filter({ hasText: 'reads 2 runs' }), "READER's card says in a chip how many runs it reads");
  const title = await chip.getAttribute('title');
  if (title !== READER.reads.join('\n'))
    throw new Refused(`the chip says each run on hover, by id and title — it says ${JSON.stringify(title)}`);
  const reads = page.locator('.react-flow__edge.context-edge');
  const wait = page.locator(`.react-flow__edge[data-id="after:${DIAMOND.running.id}->${READER.id}"]`);
  await expectCount(wait, 1, `the wait on ${DIAMOND.running.id}, which has not landed, is drawn`);
  await page.mouse.move(1, 1);
  await expectCount(reads, 0, 'no line of what a card reads while no card is hovered');
  const floor = page.locator('.react-flow').first();
  await shoot(page, floor, 'floor');
  await card.hover();
  await expectCount(reads, 1, 'hovered, one line of what it reads: from FAKE, the one on the floor');
  await expectCount(page.locator(`.react-flow__edge[data-id="read:${FAKE.id}->${READER.id}"]`), 1, 'from FAKE to READER');
  await expectCount(reads.locator('[marker-end]'), 0, 'with no arrow: it waits on nothing');
  await shoot(page, floor, 'hovered');
  await page.mouse.move(1, 1);
  await expectCount(reads, 0, 'its lines gone once the pointer leaves');
  await showFinished(page);
  await card.hover();
  await expectCount(reads, 2, `with the finished shown, a line from ${DIAMOND.landed.id} too`);
  await shoot(page, floor, 'hovered-finished');
  await page.mouse.move(1, 1);
}

/**
 * The lines the api's `concluded` section for `id` quotes in its fences — what the run was asked, what its steps said — which the preview
 * must say each of: it draws the section the api answers, not an account of it.
 */
async function quotedOf(page: Page, id: string): Promise<string[]> {
  const answer = await page.request.get(new URL(`/api/runs/${id}/concluded`, page.url()).href);
  const { section } = (await answer.json()) as { section: string };
  const quoted: string[] = [];
  let fence: string | null = null;
  for (const line of section.split('\n')) {
    if (fence !== null && line.trim() === fence) fence = null;
    else if (fence !== null) quoted.push(line.trim());
    else if (/^`{3,}/.test(line)) fence = /^`+/.exec(line)![0];
  }
  if (!quoted.filter(Boolean).length)
    throw new Refused(`the concluded section of ${id} quotes what it was asked — it is ${JSON.stringify(section)}`);
  return quoted.filter(Boolean);
}

/** The start form's Reads list: a run picked shows what it would hand, badged where it has not landed. */
async function onTheStartForm(page: Page, what: string): Promise<void> {
  const form = page.locator(`article[aria-label="Workflow ${WORKFLOWS.good.name}"] [data-context-picker]`);
  for (const id of [DIAMOND.running.id, DIAMOND.landed.id]) {
    const box = form.locator(`li[data-run="${id}"] input[type="checkbox"]`);
    if (!(await box.isChecked())) await form.locator(`li[data-run="${id}"] label`).click();
  }
  const running = form.locator(`section[data-concluded="${DIAMOND.running.id}"]`);
  const landed = form.locator(`section[data-concluded="${DIAMOND.landed.id}"]`);
  await expectVisible(running.locator('[data-markdown]'), `what ${DIAMOND.running.id} would hand, drawn`);
  await expectVisible(running.locator('[data-not-landed]', { hasText: 'not landed, not judged' }), 'badged: it has not landed');
  await expectVisible(landed.locator('[data-markdown]'), `what ${DIAMOND.landed.id} would hand, drawn`);
  await expectCount(landed.locator('[data-not-landed]'), 0, 'unbadged: it landed');
  for (const [id, preview] of [
    [DIAMOND.running.id, running],
    [DIAMOND.landed.id, landed],
  ] as const) {
    for (const line of await quotedOf(page, id))
      await expectVisible(preview.locator('[data-markdown]', { hasText: line }), `${id}'s preview says what its section quotes: ${line}`);
  }
  await form.scrollIntoViewIfNeeded();
  await shoot(page, form, `picker-${what}`);
}

/** The inbox's bare card: no run read, then `landed` picked through Change and written, photographed as `what`, and taken back off. */
async function onTheCard(page: Page, what: string): Promise<void> {
  const name = CARDS.bare.name;
  const item = page.locator(`li[data-card="${name}"]`);
  const from = item.locator('[data-card-from]');
  await expectVisible(from.getByText('reads no run as context'), 'the card reads no run');
  await from.getByRole('button', { name: 'Change' }).click();
  const row = from.locator(`li[data-run="${DIAMOND.landed.id}"] label`);
  const pathname = `/api/inbox/${name}/from`;
  await Promise.all([answered(page, 'PUT', pathname), row.click()]);
  await expectVisible(from.locator(`[data-from="${DIAMOND.landed.id}"]`), `the card reads ${DIAMOND.landed.id}, as its file says`);
  await expectVisible(from.locator(`section[data-concluded="${DIAMOND.landed.id}"] [data-markdown]`), 'and what it would hand');
  await from.scrollIntoViewIfNeeded();
  await shoot(page, item, `card-${what}`);
  await Promise.all([answered(page, 'DELETE', pathname), row.click()]);
  await expectVisible(from.getByText('reads no run as context'), 'taken back off, the card reads no run again');
  await from.getByRole('button', { name: 'Done' }).click();
}

/** READER's run page: its task in its parts, the run it waited on and each it read a block headed by how, linked to its run. */
async function onTheRunPage(page: Page, what: string): Promise<void> {
  const section = page.locator('article > section', { has: page.getByRole('heading', { level: 2, name: 'implement', exact: true }) });
  const fold = section.locator('details[data-told]');
  if (!(await fold.evaluate((el) => (el as HTMLDetailsElement).open))) await fold.locator('summary').click();
  const blocks = fold.locator('[data-layer="task"] section[data-from-run]');
  await expectCount(blocks, 3, 'a block for each run it was handed');
  const hows = await blocks.evaluateAll((all) => all.map((el) => el.getAttribute('data-how')));
  if (hows.join() !== 'waited,read,read') throw new Refused(`the blocks are headed waited, read, read — they are ${hows.join(', ')}`);
  await expectVisible(blocks.nth(0).locator('h5', { hasText: `Waited on, landed · ${DIAMOND.top.title}` }), 'the wait, headed by how');
  await expectVisible(blocks.nth(1).locator('h5', { hasText: `Read as context · ${FAKE.title}` }), 'what it read, headed by how');
  await expectVisible(blocks.nth(1).locator(`a[href="/runs/${FAKE.id}"]`), 'linked to its run');
  await expectVisible(blocks.nth(1).getByText('Not landed, not judged', { exact: false }), 'and labelled not landed');
  await fold.locator('[data-layer="task"]').scrollIntoViewIfNeeded();
  await shoot(page, fold.locator('[data-layer="task"]'), `blocks-${what}`);
}

/** Each of `look` on a wide screen, then on a phone's. */
async function wideThenPhone(page: Page, look: (what: string) => Promise<void>): Promise<void> {
  await look('wide');
  await page.setViewportSize(PHONE);
  try {
    await settled(page);
    await look('phone');
  } finally {
    await page.setViewportSize(WIDE);
  }
}

export default {
  /**
   * Context is no wait, on the board. A run that waits on a run still in flight and reads two others: its card says so in a chip, each run
   * by id and title on hover, and draws the faint line of what it reads only while hovered, from a run on the floor; the start form's
   * Reads list shows what each pick would hand, badged where it has not landed; an inbox card's `from:` is changed through the same list
   * and taken back; and once its step is filed, its run page draws its task in parts, each run handed a block headed by how. The page
   * writes READER and takes it back, its journal and its feed line with it, so each visit reads the store as seeded.
   */
  name: 'context',
  route: '/workflows',
  expect: async (page) => {
    const feed = path.join(store!, 'engine', 'feed.jsonl');
    const fed = fs.readFileSync(feed, 'utf8');
    let files = written(false);
    try {
      await onTheFactory(page);
      await goto(page, `/workflows/repo/${WORKFLOWS.good.name}`);
      await wideThenPhone(page, (what) => onTheStartForm(page, what));
      await goto(page, '/inbox');
      await wideThenPhone(page, (what) => onTheCard(page, what));
      files = written(true);
      await goto(page, `/runs/${READER.id}`);
      await wideThenPhone(page, (what) => onTheRunPage(page, what));
    } finally {
      for (const file of files) fs.rmSync(file, { force: true });
      fs.writeFileSync(feed, fed);
      await page.setViewportSize(WIDE);
    }
    await goto(page, '/workflows');
  },
} satisfies PageSpec;

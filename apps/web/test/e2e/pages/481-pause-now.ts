import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import type { Interrupt, Paused } from '../../../src/lib/api/pause.ts';
import { finishingSentence, interruptSentence } from '../../../src/lib/pause.ts';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled } from '../checks.ts';
import { ENDING, lines } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The top bar's pause: its one button. */
const pauseOf = (page: Page) => page.locator('header[data-frame-header] button[data-pause]');

/** The pause's popover. */
const popoverOf = (page: Page) => page.locator('[data-pause-popover]');

/** The run the page writes whose ending is at work: a landing, which a pause at once leaves to finish. */
const LANDING = 'lands-under-a-pause-e2e';

/** The landing's session at work. */
const LANDING_TASK = `${LANDING}-ship`;

/** Why the page pauses at once, given in the confirm. */
const NOW_WHY = 'the quota runs low';

/** Why the page pauses plainly first, which a pause at once keeps. */
const PLAIN_WHY = 'merging by hand on main';

/** What the package says an interrupted step costs. */
const COST = 'An interrupted step redoes its unfinished work and reads its context again.';

/** What `GET /api/pause/now` answers, each interrupt with the task it stops, which the board does not read. */
type NowRead = { interrupts: Array<Interrupt & { taskId: string }>; cost: string };

/** Every file under `dir`, by its path from the store, with its bytes; none where `dir` is not there. */
function filesUnder(dir: string): Array<[string, Buffer]> {
  if (!fs.existsSync(dir)) return [];
  if (fs.statSync(dir).isFile()) return [[path.relative(store!, dir), fs.readFileSync(dir)]];
  return fs.readdirSync(dir).flatMap((name) => filesUnder(path.join(dir, name)));
}

/** What a pause at once writes to: the runs, their asks beside them, the engine's journals and feed, the workflow feed and the pause. */
const written = (): string[] =>
  ['runs', path.join('engine', 'tasks'), path.join('engine', 'feed.jsonl'), 'feed.jsonl', 'cordon'].map((p) => path.join(store!, p));

/** The folders of asks beside the runs, by name. */
const asksDirs = (): string[] => fs.readdirSync(path.join(store!, 'runs')).filter((name) => name.endsWith('.asks'));

/** The store's files a pause at once writes to, as they stand, and the folders of asks there are. */
const snapshot = () => ({ files: new Map(written().flatMap(filesUnder)), asks: new Set(asksDirs()) });

/** Puts back every file of `before`, and removes every file and folder of asks written since. */
function restore(before: ReturnType<typeof snapshot>): void {
  for (const [file] of written().flatMap(filesUnder)) if (!before.files.has(file)) fs.rmSync(path.join(store!, file));
  for (const [file, bytes] of before.files) fs.writeFileSync(path.join(store!, file), bytes);
  for (const dir of asksDirs().filter((name) => !before.asks.has(name))) fs.rmSync(path.join(store!, 'runs', dir), { recursive: true });
}

/** Writes LANDING: ENDING's run with its ending filed, and ship's session at work in the repository's checkout, on the engine's feed. */
function writeLanding(): void {
  const record = JSON.parse(fs.readFileSync(path.join(store!, 'runs', `${ENDING.id}.json`), 'utf8')) as {
    steps: Record<string, object>;
  };
  const steps = { ...record.steps, ship: { taskId: LANDING_TASK } };
  fs.writeFileSync(path.join(store!, 'runs', `${LANDING}.json`), JSON.stringify({ ...record, id: LANDING, steps }));
  const at = new Date(Date.now() - 60_000).toISOString();
  const events = [
    { kind: 'filed', at, brief: 'Merge this run onto the base branch.', cwd: '/code/app', maxAttempts: 1 },
    { kind: 'starting', at, attempt: 1 },
    { kind: 'spawned', at, attempt: 1 },
  ];
  fs.writeFileSync(path.join(store!, 'engine', 'tasks', `${LANDING_TASK}.jsonl`), lines(events));
  fs.appendFileSync(path.join(store!, 'engine', 'feed.jsonl'), lines(events.map((event) => ({ taskId: LANDING_TASK, event }))));
}

/** What the api answers on `route`, read beside the board. */
async function apiRead<T>(page: Page, route: string): Promise<T> {
  return (await (await page.request.get(new URL(route, page.url()).href)).json()) as T;
}

/** The pause's file, as the api wrote it. */
const pauseFile = (): { at: string; by: string; why?: string } => JSON.parse(fs.readFileSync(path.join(store!, 'cordon'), 'utf8'));

/** The journal of `taskId`, as the engine keeps it. */
const journalOf = (taskId: string): string => fs.readFileSync(path.join(store!, 'engine', 'tasks', `${taskId}.jsonl`), 'utf8');

/** Opens the popover, then its Pause now…, and waits for what it would stop to be read: the api's own answer, which it returns. */
async function confirmOpened(page: Page): Promise<NowRead> {
  await pauseOf(page).click();
  await expectVisible(popoverOf(page), 'the button opens its popover');
  await popoverOf(page).getByRole('button', { name: 'Pause now…' }).click();
  await expectTexts(popoverOf(page).getByRole('heading'), ['Pause all factories now'], 'Pause now… asks before it acts');
  await expectVisible(popoverOf(page).locator('[data-pause-cost]'), 'once read, the confirm says what it costs');
  return apiRead<NowRead>(page, '/api/pause/now');
}

export default {
  /**
   * All factories paused at once from the top bar, as `wf pause --now --yes` does (`POST /api/pause` with `now`). With a session at
   * work and a landing at work (LANDING, which the page writes), Pause now…, offered beside Pause… while all factories run, names each
   * run's step it stops — the api's read (`GET /api/pause/now`), which leaves the landing out — and says what that costs. Confirmed, the
   * pause's file holds its why, each step it named is asked to stop on its journal and has the try that continues it beside its run, the
   * landing is left at work, and the popover reads Pausing, each named step stopping and tried again on the resume. From Pausing, after
   * a plain Pause…, Pause now… is offered beside Resume, asks no why, and keeps the pause as it was put; on a phone's screen its confirm
   * fits. Resume takes the pause away. Which tasks a pause at once stops, and how the resume continues each, is the package's judgement,
   * proven in its own tests (`packages/agent-orchestrator/src/tick/pause.test.ts`). The page puts back every file it wrote, and the
   * window's size.
   */
  name: 'pause-now',
  route: '/factories/default',
  expect: async (page) => {
    const theme = await themeOf(page);
    const button = pauseOf(page);
    const popover = popoverOf(page);
    const size = page.viewportSize();
    const before = snapshot();
    try {
      if (before.files.has('cordon')) throw new Refused('no pause before the page puts one — the store has its file');
      writeLanding();
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      await expectVisible(button.and(page.locator('[data-pause="running"]')), 'all factories running');
      await button.click();
      await expectTexts(popover.locator('[data-pause-actions] li'), ['Pause…', 'Pause now…'], 'running, Pause now… beside Pause…');
      await page.keyboard.press('Escape');
      await expectCount(popover, 0, 'Escape closes the popover');

      const read = await confirmOpened(page);
      if (!read.interrupts.some((i) => i.kind === 'session'))
        throw new Refused(`the seeded store has a session at work — the api's read names none: ${JSON.stringify(read.interrupts)}`);
      if (read.interrupts.some((i) => i.run === LANDING))
        throw new Refused(`a landing is left to finish — the api's read names it: ${JSON.stringify(read.interrupts)}`);
      if (read.cost !== COST) throw new Refused(`the api says what an interrupted step costs, "${COST}" — it says "${read.cost}"`);
      await expectTexts(popover.locator('[data-pause-interrupt] li'), read.interrupts.map(interruptSentence), 'the confirm names each');
      await expectTexts(popover.locator('[data-pause-cost]'), [COST], 'and says what an interrupted step costs');
      if (fs.existsSync(path.join(store!, 'cordon'))) throw new Refused('nothing is put while the confirm asks');
      await popover.locator('[data-pause-why]').fill(NOW_WHY);
      await settled(page);
      await photograph(page, path.join(OUT, `pause-now-confirm-${theme}.png`));
      await popover.getByRole('button', { name: 'Pause now', exact: true }).click();
      await expectCount(popover, 0, 'confirmed, the popover closes once the api answered');

      if (pauseFile().why !== NOW_WHY) throw new Refused(`the pause's file holds the why given — it holds ${JSON.stringify(pauseFile())}`);
      for (const { run, step, taskId } of read.interrupts) {
        if (!journalOf(taskId).includes('"stop-requested"')) throw new Refused(`${run}'s ${step}: its task ${taskId} is asked to stop`);
        const asks = path.join(store!, 'runs', `${run}.asks`);
        const ask = fs.existsSync(asks) && fs.readdirSync(asks).some((f) => fs.readFileSync(path.join(asks, f), 'utf8').includes(taskId));
        if (!ask) throw new Refused(`${run}'s ${step}: the try that continues it is asked beside its run`);
      }
      if (journalOf(LANDING_TASK).includes('"stop-requested"')) throw new Refused('the landing is left at work, never asked to stop');
      const paused = await apiRead<Paused>(page, '/api/pause');
      const stopping = paused.finishing.filter((f) => f.stopping && f.resumed);
      if (stopping.length !== read.interrupts.length)
        throw new Refused(`each step it named is stopping, tried again on the resume — the api reads ${JSON.stringify(paused.finishing)}`);
      await expectVisible(button.and(page.locator('[data-pause="pausing"]')), 'the button says Pausing while they stop');
      await button.click();
      await expectTexts(popover.locator('[data-pause-finishing] li'), paused.finishing.map(finishingSentence), 'each, stopping or not');
      await expectVisible(
        popover.locator('[data-pause-finishing] li', { hasText: 'tried again on the resume' }).first(),
        'a step is stopping, and tried again on the resume',
      );
      await settled(page);
      await photograph(page, path.join(OUT, `pause-now-stopping-${theme}.png`));
      await page.keyboard.press('Escape');

      restore(before);
      writeLanding();
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      await expectVisible(button.and(page.locator('[data-pause="running"]')), 'put back, all factories run again');
      await button.click();
      await popover.getByRole('button', { name: 'Pause…' }).click();
      await popover.locator('[data-pause-why]').fill(PLAIN_WHY);
      await popover.getByRole('button', { name: 'Pause', exact: true }).click();
      await expectCount(popover, 0, 'the plain pause put');
      const plain = pauseFile();
      await expectVisible(button.and(page.locator('[data-pause="pausing"]')), 'Pausing while what runs finishes');
      await button.click();
      await expectTexts(popover.locator('[data-pause-actions] li'), ['Pause now…', 'Resume'], 'pausing, Pause now… beside Resume');
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width: 390, height: 844 });
      await confirmOpened(page);
      await expectCount(popover.locator('[data-pause-why]'), 0, 'a pause that stands keeps its why: the confirm asks none');
      await settled(page);
      await photograph(page, path.join(OUT, `pause-now-phone-${theme}.png`));
      await popover.getByRole('button', { name: 'Pause now', exact: true }).click();
      await expectCount(popover, 0, 'confirmed from Pausing, the popover closes once the api answered');
      if (JSON.stringify(pauseFile()) !== JSON.stringify(plain))
        throw new Refused(`the pause stands as it was put, ${JSON.stringify(plain)} — its file holds ${JSON.stringify(pauseFile())}`);
      if (size) await page.setViewportSize(size);

      await button.click();
      await popover.getByRole('button', { name: 'Resume' }).click();
      await expectVisible(button.and(page.locator('[data-pause="running"]')), 'Resume resumes all factories');
      if (fs.existsSync(path.join(store!, 'cordon'))) throw new Refused('Resume took the pause away once the api answered');
    } finally {
      restore(before);
      if (size) await page.setViewportSize(size);
      await page.reload({ waitUntil: 'load' });
      await idle(page);
    }
  },
} satisfies PageSpec;

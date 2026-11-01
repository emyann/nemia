import fs from 'node:fs';
import path from 'node:path';
import { photograph, themeOf } from '../board.ts';
import { cardOf, cardsDrawn, expectClearOfEachOther, placeOf, said } from '../canvas.ts';
import { expectCount, expectInside, expectVisible, idle, Refused, settled } from '../checks.ts';
import { lines, write } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/**
 * A run no seed keeps: an ending whose gated step, the step a send-back goes to and the base branch all have long names, four steps and
 * one of them asking — the card the seeded names never draw, whose gate line would wrap to three rows and reach over the card beneath. The
 * `factory-gate-long-names` page writes it (`seedLongNames`), lays the floor out, measures, and takes it back (the paths returned).
 */
const LONG_NAMES = {
  id: 'the-long-names-reach-e2e15',
  title: 'The long names reach',
  ending: 'ship-onto-the-release-branch-once-approved',
  back: 'review-the-whole-change-once-more',
  onto: 'release/2026-09-the-long-autumn-train-of-fixes',
  steps: [
    'implement-the-change',
    'write-the-migration-notes',
    'review-the-whole-change-once-more',
    'ship-onto-the-release-branch-once-approved',
  ],
  asks: 'Should the migration notes go in the README, or a page of their own?',
} as const;

/**
 * Writes LONG_NAMES into the store at `root`, dated `createdAt`: its folder, its record and its three tasks. Returns every path written, to
 * take back.
 */
function seedLongNames(root: string, createdAt: string, now = Date.now()): string[] {
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const { id, ending, back, onto, asks } = LONG_NAMES;
  const [implement, notes] = LONG_NAMES.steps;
  const dir = path.join(root, 'workflow-long-names');
  const says = 'Merge this run onto the release branch, or abort on any failure.';
  const workflow = [
    { name: implement, after: [], body: 'Implement what was asked.', harness: 'claude' },
    { name: notes, after: [implement], body: 'Write the migration notes.', harness: 'claude' },
    { name: back, after: [implement], body: 'Review the change.', harness: 'claude' },
    { name: ending, after: [back], body: says, harness: 'claude', workspace: 'base', gate: true },
  ];
  for (const step of workflow) {
    const keys = [
      `harness: ${step.harness}`,
      'place: git',
      ...(step.after.length ? [`after: ${step.after.join(', ')}`] : []),
      ...(step.workspace ? ['workspace: base', 'gate: true'] : []),
    ];
    write(path.join(dir, `${step.name}.md`), `---\n${keys.join('\n')}\n---\n${step.body}\n`);
  }
  const lane = path.join(root, 'worktrees', id, implement);
  const branch = `wf/${id}/${implement}`;
  const task = (step: string) => path.join(root, 'engine', 'tasks', `${id}-${step}.jsonl`);
  const signedOff = (step: string, began: number, ended: number, closeout: object) =>
    write(
      task(step),
      lines([
        { kind: 'filed', at: ago(began), brief: step, cwd: lane, maxAttempts: 1, harness: 'claude' },
        { kind: 'starting', at: ago(began - 0.01), attempt: 1 },
        { kind: 'spawned', at: ago(began - 0.01), attempt: 1 },
        { kind: 'ended', at: ago(ended), attempt: 1, sessionId: `ae/${id}-${step}/1`, observed: 'done', reason: 'harness', closeout },
        { kind: 'settled', at: ago(ended), outcome: 'succeeded' },
      ]),
    );
  signedOff(implement, 3, 2.5, { outcome: 'done', summary: 'Implemented it.', needs: null, artifacts: [] });
  signedOff(notes, 2.4, 2, { outcome: 'blocked', summary: 'Wrote half the notes.', needs: asks, artifacts: [] });
  signedOff(back, 2.4, 1.5, { outcome: 'done', summary: 'Reviewed it: nothing to change.', needs: null, artifacts: [] });
  const record = path.join(root, 'runs', `${id}.json`);
  write(
    record,
    JSON.stringify(
      {
        id,
        repo: '/code/hkb-v2',
        workspace: '/code/hkb-v2',
        baseRef: '19c9365',
        branch: onto,
        isolate: true,
        brief: `${LONG_NAMES.title}\n\nA run the factory-gate-long-names page writes and takes back: its names are long, one step asks, and the ending waits at its gate.`,
        workflowDir: dir,
        workflow,
        createdAt,
        steps: {
          [implement]: { taskId: `${id}-${implement}`, workspace: lane, branch },
          [notes]: { taskId: `${id}-${notes}`, workspace: path.join(root, 'worktrees', id, notes), branch: `wf/${id}/${notes}` },
          [back]: { taskId: `${id}-${back}`, workspace: lane, branch },
          [ending]: { taskId: null },
        },
      },
      null,
      2,
    ),
  );
  return [record, dir, ...[implement, notes, back].map(task)];
}

export default {
  /**
   * The gate's card with the names the seed never has: a gated step, a send-back step and a base branch that do not fit a line, four
   * steps, one asking. The run is dated before every run in the store, so the grid, oldest first, puts it at the top of its column with
   * the default floor's cards beneath it, whatever runs join or leave that floor. Its gate line holds one row, the rest on hover; its rail
   * has a pill a step, each cut to its pill and whole on hover; opened, it has a tile a step, each named whole; and the card stays clear of
   * the card beneath it after a Reset layout. The run is written for this page and taken back before it ends, the floor laid out again as
   * seeded.
   */
  name: 'factory-gate-long-names',
  route: '/factories/default',
  expect: async (page) => {
    const { id, ending, back, onto } = LONG_NAMES;
    const notes = LONG_NAMES.steps[1];
    const runs = path.join(store!, 'runs');
    const oldest = Math.min(
      ...fs
        .readdirSync(runs)
        .filter((file) => file.endsWith('.json'))
        .map((file) => Date.parse(JSON.parse(fs.readFileSync(path.join(runs, file), 'utf8')).createdAt))
        .filter((at) => !Number.isNaN(at)),
    );
    const written = seedLongNames(store!, new Date(oldest - 60_000).toISOString());
    const card = cardOf(page, id);
    try {
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      await expectVisible(card, `the run with the long names is on the floor (${id})`);
      await page.getByRole('button', { name: 'Reset layout' }).click();
      await settled(page);
      await expectVisible(
        card.locator(`[data-need="asks"][data-step="${LONG_NAMES.steps[1]}"]`),
        'and the step that asks says so on the card',
      );
      const cards = await cardsDrawn(page);
      const mine = cards.find((c) => c.id === id)!;
      if (!cards.some((c) => Math.abs(c.x - mine.x) < 1 && c.y > mine.y))
        throw new Refused(`a card lies beneath ${id} in its column, to measure it against, or the measure proves nothing`);
      await expectClearOfEachOther(page);
      const line = card.locator(`[data-gate-line="${ending}"]`);
      const whole = `approve to run ${ending} on ${onto}, or send ${back} back`;
      await expectVisible(line, `the card has ${ending}'s gate line`);
      const title = await line.getAttribute('title');
      if (!title?.includes(whole)) throw new Refused(`the gate line is whole on hover — its title is ${JSON.stringify(title)}`);
      const rows = await line.evaluate((el) => Math.round((el as HTMLElement).offsetHeight / parseFloat(getComputedStyle(el).lineHeight)));
      if (rows !== 1)
        throw new Refused(
          `the gate line holds one row whatever the names, read in the card's own pixels as the floor is drawn zoomed out — it is ${rows} rows`,
        );
      const pills = card.locator('ul[aria-label="Steps"] [data-step]');
      await expectCount(pills, LONG_NAMES.steps.length, 'a pill per step on the rail');
      for (const name of LONG_NAMES.steps) {
        const title = await card.locator(`ul[aria-label="Steps"] [data-step="${name}"]`).getAttribute('title');
        if (!title?.startsWith(`${name}: `)) throw new Refused(`${name}'s pill is whole on hover — its title is ${JSON.stringify(title)}`);
      }
      const cut = await pills.locator('span').evaluateAll((spans) => spans.filter((span) => span.scrollWidth > span.clientWidth).length);
      if (cut === 0) throw new Refused('a name longer than its pill is cut to it, not drawn over the next pill — no pill is cut');
      await expectInside(pills, card, 'and every pill stays inside the card');
      const [notesAt, backAt] = await Promise.all(
        [notes, back].map((name) => placeOf(card.locator(`ul[aria-label="Steps"] [data-step="${name}"]`))),
      );
      if (Math.abs(notesAt.x - backAt.x) > 1 || Math.abs(notesAt.y - backAt.y) < 1) {
        throw new Refused(
          `${notes} and ${back}, both after ${LONG_NAMES.steps[0]}, are one column in two lanes — at ${said(notesAt)} and ${said(backAt)}`,
        );
      }
      await photograph(page, path.join(OUT, `factory-gate-long-names-card-${await themeOf(page)}.png`), { fullPage: true });
      await card.getByRole('button', { name: 'Show steps' }).click();
      await expectCount(card.locator('[data-tile]'), LONG_NAMES.steps.length, 'the card opens into a tile per step');
      for (const name of LONG_NAMES.steps) {
        await expectCount(
          card.locator(`[data-tile="${name}"][aria-label="Inspect step ${name}"]`).getByTitle(name, { exact: true }),
          1,
          `${name}'s tile is named whole for a screen reader, and on hover`,
        );
      }
      await expectVisible(
        card.locator(`[data-tile="${ending}"] [data-need="approve"]`, { hasText: `approve ${ending} to run it` }),
        "the ending's tile says approving runs it",
      );
      await expectClearOfEachOther(page);
      await page.getByRole('button', { name: 'Reset layout' }).click();
      await expectCount(card.locator('[data-tile]'), 0, 'Reset layout closes it again');
    } finally {
      for (const file of written) fs.rmSync(file, { recursive: true, force: true });
    }
    await page.reload({ waitUntil: 'load' });
    await idle(page);
    await expectCount(card, 0, 'with the run taken back, its card is gone');
    await page.getByRole('button', { name: 'Reset layout' }).click();
    await settled(page);
  },
} satisfies PageSpec;

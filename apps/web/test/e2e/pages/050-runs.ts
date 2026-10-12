import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { cancelledAt, photograph, SECTIONS, sectionsOf, sidebar, themeOf } from '../board.ts';
import { expectBeneath, expectCount, expectUncut, expectVisible, Refused, WAIT_MS } from '../checks.ts';
import { COSTLY, DIAMOND, ENDING, FAKE, GATED, LOOPING, SHIPPED, UNMERGED } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/**
 * A place in the menu pressed with Enter, as from the keyboard: the page is not loaded again, and the history has one entry more, as after
 * a click. The browser clicks a link on Enter's keydown, and React Aria lets that click through: only the root's `RouterProvider` keeps it
 * from loading the whole page. Nothing else in the e2e presses a link from the keyboard.
 */
async function enterOnPlace(page: Page, place: (typeof SECTIONS)[number], route: string): Promise<void> {
  const before = await page.evaluate(() => {
    (window as unknown as { e2eNotReloaded?: true }).e2eNotReloaded = true;
    return history.length;
  });
  await sectionsOf(page).filter({ hasText: place }).focus();
  await page.keyboard.press('Enter');
  await page.waitForURL((url) => url.pathname === route, { timeout: WAIT_MS });
  const [kept, after] = await page.evaluate(
    () => [(window as unknown as { e2eNotReloaded?: true }).e2eNotReloaded === true, history.length] as const,
  );
  if (!kept) throw new Refused(`Enter on ${place} in the menu goes to ${route} in the page — the whole page was loaded again`);
  if (after !== before + 1)
    throw new Refused(`Enter on ${place} in the menu adds one entry to the history, as a click does — it went from ${before} to ${after}`);
}

/**
 * COSTLY's row says what the run took beside what it cost: its clock — at work, since it waits on you — with its start and the wall time on
 * hover, and its tokens, their split on hover; each read whole, the phone's width too, and photographed at both.
 */
async function tookOnTheRow(page: Page, costly: Locator): Promise<void> {
  await expectVisible(
    costly.locator('[data-clock][title^="At work "][title*="from start to now"]', { hasText: new RegExp(`^${COSTLY.took}$`) }),
    'the row says how long the run has been at work, not what it took: it waits on you; its start and the wall time on hover',
  );
  await expectVisible(
    costly.locator(`[data-tokens][title="${COSTLY.tokens.split}"]`, { hasText: COSTLY.tokens.said }),
    `and the tokens its sessions used (${COSTLY.tokens.said}), their split on hover`,
  );
  const size = page.viewportSize();
  for (const width of [size?.width ?? 1280, 390]) {
    await page.setViewportSize({ width, height: size?.height ?? 844 });
    await costly.scrollIntoViewIfNeeded();
    await expectUncut(
      costly.locator('[data-clock], [data-cost], [data-tokens]'),
      `the clock, the cost and the tokens read whole, ${width} wide`,
    );
    await photograph(costly, path.join(OUT, `runs-row-took${width === 390 ? '-phone' : ''}-${await themeOf(page)}.png`));
  }
  if (size) await page.setViewportSize(size);
}

/**
 * A row ticks each second while its run's clock counts, and only then: DIAMOND's `running`, whose session works, says its seconds move
 * three times, while COSTLY's, finished and waiting on you, whose clock's title still says how long from start to now, changes once at
 * most over the same stretch, shorter than its minute: counted, never timed, so a slow machine holds it too.
 */
async function ticksOnTheRows(page: Page): Promise<void> {
  const running = `li:has(a[href="/runs/${DIAMOND.running.id}"]) [data-clock]`;
  const costly = `li:has(a[href="/runs/${COSTLY.id}"]) [data-clock]`;
  await expectVisible(
    page.locator(running, { hasText: /^\d+m \d{2}s at work$/ }),
    `the row of ${DIAMOND.running.id}, whose session works, says its time at work to the second`,
  );
  await page.evaluate(
    ([runningAt, costlyAt]) => {
      const read = () => ({
        running: document.querySelector(runningAt)?.textContent ?? '',
        costly: document.querySelector(costlyAt)?.getAttribute('title') ?? '',
      });
      const ticks = { running: 0, costly: 0, last: read(), stop: () => {} };
      const watch = new MutationObserver(() => {
        const now = read();
        if (now.running !== ticks.last.running) ticks.running += 1;
        if (now.costly !== ticks.last.costly) ticks.costly += 1;
        ticks.last = now;
      });
      watch.observe(document.body, { subtree: true, childList: true, characterData: true, attributeFilter: ['title'] });
      ticks.stop = () => watch.disconnect();
      (window as unknown as { e2eTicks?: typeof ticks }).e2eTicks = ticks;
    },
    [running, costly] as const,
  );
  const counted = () =>
    page.evaluate(() => {
      const ticks = (window as unknown as { e2eTicks: { running: number; costly: number; stop: () => void } }).e2eTicks;
      ticks.stop();
      return { running: ticks.running, costly: ticks.costly };
    });
  try {
    await page.waitForFunction(() => (window as unknown as { e2eTicks: { running: number } }).e2eTicks.running >= 3, undefined, {
      timeout: WAIT_MS,
    });
  } catch {
    const { running: moved, costly: drawn } = await counted();
    throw new Refused(
      `the row of ${DIAMOND.running.id}, whose session works, ticks each second — its seconds stand still: it changed ${moved} times in ${WAIT_MS} ms, and COSTLY's ${drawn}`,
    );
  }
  const { running: moved, costly: drawn } = await counted();
  if (drawn > 1)
    throw new Refused(
      `a finished row is not drawn again each second — COSTLY's clock changed ${drawn} times while ${DIAMOND.running.id}'s changed ${moved}`,
    );
}

export default {
  /**
   * The runs list: the runs in flight, as the Factory counts them, then those nobody has decided, then the finished, each group under a
   * heading with its count and each newest first — an order the api's id order is not, and where the first finished row is newer than the
   * last in flight. Each row says, in `wf ls`'s words, what there is to decide and what waits on you, and shows its chips, its cost, its
   * workflow beside its link and whether it was pruned. The menu's places are reached with Enter in the page, to the Inbox and back.
   */
  name: 'runs',
  route: '/runs',
  expect: async (page) => {
    await sidebar(page);
    const rows = page.locator('li[data-in-flight]');
    await expectCount(rows, 16, 'the runs list has a row for each of the sixteen runs the Factory counts');
    const flying = page.locator('section[data-group="in-flight"]');
    const deciding = page.locator('section[data-group="to-decide"]');
    const finished = page.locator('section[data-group="finished"]');
    await expectCount(
      flying.locator('li[data-in-flight="true"]'),
      4,
      'the four runs in flight, as the Factory counts them, are under In flight',
    );
    await expectCount(flying.locator('li[data-in-flight="false"]'), 0, 'and no finished run is');
    await expectCount(finished.locator('li[data-in-flight="false"]'), 10, 'the ten finished runs nobody has to decide are under Finished');
    await expectCount(finished.locator('li[data-in-flight="true"]'), 0, 'and no run in flight is');
    await expectVisible(
      flying.getByRole('heading', { name: /^In flight 4 something of each still moves, newest first$/ }),
      'In flight is headed with its count and its order',
    );
    await expectVisible(
      finished.getByRole('heading', { name: /^Finished 10 nothing of these moves any more, newest first · 5 waiting on you$/ }),
      'Finished is headed with its count, its order, and how many of them wait on you, as the Factory counts them',
    );
    await expectBeneath(finished, flying, 'the finished runs are listed beneath the runs in flight');

    await expectCount(deciding.locator('li[data-in-flight="false"]'), 2, 'the two runs nobody has decided are under To decide');
    await expectVisible(
      deciding.getByRole('heading', {
        name: /^To decide 2 each is at its result, and nobody has decided it, newest first · 1 waiting on you$/,
      }),
      'To decide is headed with its count, its order, and the one of them a step waits on you for',
    );
    await expectBeneath(deciding, flying, 'the runs to decide are listed beneath the runs in flight');
    await expectBeneath(finished, deciding, 'and the finished beneath those');
    await expectVisible(
      deciding.locator(`li a[href="/runs/${ENDING.id}"] [data-to-decide="approve"]`, {
        hasText: `to decide: ${ENDING.says} — nemia approve ${ENDING.id} ${ENDING.ending}`,
      }),
      `the row of a run at its ending's gate says, in wf ls's words, what it would do and the command that approves it`,
    );
    await expectCount(
      deciding.locator(`li a[href="/runs/${ENDING.id}"] [data-waiting-on-you]`),
      0,
      'and does not name the same step above it: the decision is the whole of what it waits on you for',
    );
    await expectVisible(
      deciding.locator(`li a[href="/runs/${UNMERGED.id}"] [data-to-decide="result"]`, { hasText: `to decide: ${UNMERGED.said}` }),
      'the row of a finished run whose branch nobody merged says so, and names wf decide',
    );
    await expectCount(page.locator('[data-to-decide="git"]'), 0, 'and no row says its kind in the old word, git');
    await expectCount(
      finished.locator(`li a[href="/runs/${SHIPPED.id}"]`),
      1,
      `the run whose ending merged it is among the finished (${SHIPPED.id})`,
    );
    await expectCount(finished.locator('[data-to-decide]'), 0, 'and no finished row has anything to decide');
    await expectVisible(
      finished.locator(`li a[href="/runs/${SHIPPED.id}"] [data-pruned]`, { hasText: /^pruned$/ }),
      `the row of the run pruned with its files says pruned (${SHIPPED.id})`,
    );
    await expectCount(page.locator('[data-pruned]'), 1, 'on that row alone: no other run was pruned');
    const listed = await rows.evaluateAll((lis) =>
      lis.map((li) => ({
        id: li.querySelector('a[href^="/runs/"]')?.getAttribute('href')?.slice('/runs/'.length) ?? '',
        inFlight: li.getAttribute('data-in-flight') === 'true',
        group: li.closest('section[data-group]')?.getAttribute('data-group') ?? '',
        at: li.querySelector('time')?.getAttribute('datetime') ?? '',
      })),
    );
    const GROUPS = ['in-flight', 'to-decide', 'finished'];
    const ordered = [...listed].sort(
      (a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || b.at.localeCompare(a.at) || a.id.localeCompare(b.id),
    );
    if (listed.some((r, i) => r.id !== ordered[i].id) || listed.some((r) => r.inFlight !== (r.group === 'in-flight'))) {
      const said = (rs: typeof listed) =>
        rs.map((r) => `${r.id} (${r.group}, ${r.inFlight ? 'in flight' : 'not'}, ${r.at})`).join('\n    ');
      throw new Refused(
        `the runs list has the runs in flight first, then those to decide, then the rest, each newest first — it lists:\n    ${said(listed)}\n  and not:\n    ${said(ordered)}`,
      );
    }
    const row = page.locator(`li a[href="/runs/${FAKE.id}"]`);
    await expectVisible(row, `the runs list has a row for ${FAKE.id}`);
    await expectVisible(
      row.getByText(`waiting on you: ${FAKE.waitingOnYou.join(', ')}`),
      `the row says ${FAKE.waitingOnYou.join(' and ')} are waiting on you`,
    );
    await expectVisible(
      row.locator('[data-state="failed-check"]', { hasText: 'failed ✗ check (exit 1)' }),
      `the row shows ${FAKE.refused}'s refused check as a red chip`,
    );
    await expectVisible(
      page
        .locator('li', { has: page.locator(`a[href="/runs/${FAKE.id}"]`) })
        .locator(`a[href="/workflows"][data-workflow="${FAKE.workflow}"]`),
      `the row names the workflow the run was started from (${FAKE.workflow}), a folder given by path, linked to the Workflows page`,
    );
    await expectCount(row.locator('a'), 0, "the run's link has no link inside it: a link inside a link is not HTML");
    await expectVisible(
      page.locator(`li a[href="/runs/${DIAMOND.bottom.id}"] [data-state="waiting"]`, { hasText: DIAMOND.words.bottom }),
      `the row of a run waiting on a run says so on its root, as wf ls does (${DIAMOND.words.bottom}), a waiting chip`,
    );
    const orphanRow = page.locator(`li a[href="/runs/${DIAMOND.orphan.id}"]`);
    await expectVisible(
      orphanRow.locator('[data-waiting-on-you]', {
        hasText: `waiting on you: ${DIAMOND.cancelled.id} was cancelled at ${cancelledAt()}, and a cancelled run never ships — yours to resolve: nemia cancel ${DIAMOND.orphan.id}`,
      }),
      `the row of ${DIAMOND.orphan.id}, waiting on a run called off, says it waits on you, as the Factory counts it, and what is yours to resolve, in wf ls's words`,
    );
    await expectCount(
      page.locator(`li a[href="/runs/${DIAMOND.bottom.id}"] [data-waiting-on-you]`),
      0,
      `${DIAMOND.bottom.id}, waiting on a run that may still ship, does not wait on you`,
    );
    const costly = page.locator('li', { has: page.locator(`a[href="/runs/${COSTLY.id}"]`) });
    await expectVisible(
      costly.locator('[data-cost]', { hasText: COSTLY.cost }),
      `the row of a run whose sessions were priced says what it cost (${COSTLY.cost})`,
    );
    await expectVisible(
      costly.locator('[data-state="over-budget"]', { hasText: COSTLY.over.status }),
      `the row shows ${COSTLY.over.step} over its budget as a chip that waits on a person, with the amounts (${COSTLY.over.status})`,
    );
    await expectVisible(costly.getByText(`waiting on you: ${COSTLY.steps.join(', ')}`), 'and says every step past its budget waits on you');
    await tookOnTheRow(page, costly);
    await expectCount(
      page.locator('li', { has: page.locator(`a[href="/runs/${FAKE.id}"]`) }).locator('[data-cost]'),
      0,
      "the fake run's row says no cost: none of its sessions was priced",
    );
    const gatedRow = page.locator(`li a[href="/runs/${GATED.id}"]`);
    await expectVisible(
      gatedRow.locator('[data-waiting-on-you]', { hasText: new RegExp(`^waiting on you: approve ${GATED.gated}$`) }),
      `the row of a run at its gate says, as wf ls does, waiting on you: approve ${GATED.gated}`,
    );
    await expectVisible(
      gatedRow.locator('[data-state="awaiting-approval"]', { hasText: 'awaiting approval' }),
      'and shows its step as awaiting approval, a chip that waits on a person',
    );
    const loop = page.locator(`li a[href="/runs/${LOOPING.id}"]`);
    await expectVisible(
      loop.getByText(`waiting on you: ${LOOPING.exhausted}`),
      `the runs list says ${LOOPING.exhausted}, out of rounds, is waiting on you`,
    );
    await expectVisible(
      loop.locator(`[data-state="exhausted"][title$="${LOOPING.notes.review}"]`, { hasText: 'rounds exhausted' }),
      `the row shows ${LOOPING.exhausted} as a chip that waits on a person, its note after what that means on hover`,
    );

    await ticksOnTheRows(page);

    await enterOnPlace(page, 'Inbox', '/inbox');
    await expectVisible(
      page.locator('[data-sidebar="sidebar"] a[data-active="true"]', { hasText: 'Inbox' }),
      'reached with Enter, the Inbox is lit in the menu',
    );
    await enterOnPlace(page, 'Runs', '/runs');
    await expectCount(rows, 16, 'back on Runs with Enter, the list has its sixteen rows again, drawn for its photograph');
  },
} satisfies PageSpec;

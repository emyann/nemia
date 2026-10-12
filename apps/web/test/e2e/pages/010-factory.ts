import path from 'node:path';
import type { Page } from 'playwright';
import { nextVisit, photograph, PLACES_SAID, sidebar, stepBar, themeOf } from '../board.ts';
import {
  cardOf,
  cardsOf,
  dragBy,
  edgeOf,
  expectClearOfEachOther,
  expectClearOfPanels,
  onTheFloor,
  photographCard,
  placeOf,
  said,
  samePlace,
  showFinished,
} from '../canvas.ts';
import {
  expectApart,
  expectBetween,
  expectCount,
  expectInside,
  expectLeftOf,
  expectMovedAlone,
  expectTexts,
  expectUncut,
  expectVisible,
  Refused,
  settled,
} from '../checks.ts';
import {
  COSTLY,
  DIAMOND,
  DIAMOND_RUNS,
  ENDING,
  FAKE,
  FOLDER,
  GATED,
  HELD,
  LOOPING,
  NEIGHBOUR,
  PASS,
  QUEUE,
  QUEUED,
  QUEUED_IN,
  unfactoredWhy,
  SESSION,
  SHIPPED,
  UNMERGED,
} from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/**
 * COSTLY's card says what the run took, in its footer and whole: its time at work, what it cost and its tokens, the split on hover. A
 * run that waits on you, so at work and not over; photographed.
 */
async function tookOnTheCard(page: Page): Promise<void> {
  const costly = cardOf(page, COSTLY.id);
  await expectVisible(
    costly.locator('[data-cost]', { hasText: `· ${COSTLY.cost}` }),
    `the card of a run whose sessions were priced says what it cost beside its clock (${COSTLY.cost})`,
  );
  await expectVisible(
    costly.locator(`[data-tokens][title="${COSTLY.tokens.split}"]`, { hasText: `· ${COSTLY.tokens.said}` }),
    `and the tokens its sessions used (${COSTLY.tokens.said}), their split on hover`,
  );
  await expectVisible(
    costly.locator('time', { hasText: new RegExp(`^${COSTLY.took}$`) }),
    `and its time at work, its sessions and checks side by side counted once (${COSTLY.took}): it waits on you`,
  );
  await expectUncut(costly.locator('time, [data-cost], [data-tokens]'), 'the clock, the cost and the tokens are read whole');
  await expectUncut(costly.locator('ul[aria-label="Steps"] [data-step] span'), "each step's name on the rail is read whole");
  await photographCard(page, costly, path.join(OUT, `factory-card-took-${await themeOf(page)}.png`));
}

/**
 * The diamond's cards laid out as a diamond: every run left of each run that waits on it, and its top and bottom level with the middle of
 * its sides.
 */
async function expectDiamond(page: Page, when: string): Promise<void> {
  const { top, shipped, running, bottom } = DIAMOND;
  await settled(page);
  await expectLeftOf(
    cardOf(page, top.id),
    cardsOf(page, shipped.id, running.id),
    `${when}: the top is left of both sides, which wait on it`,
  );
  await expectLeftOf(
    cardsOf(page, shipped.id, running.id),
    cardOf(page, bottom.id),
    `${when}: both sides are left of the bottom, which waits on them`,
  );
  await expectApart(cardOf(page, shipped.id), cardOf(page, running.id), `${when}: the two sides are laid out apart`);
  await expectBetween(
    cardsOf(page, top.id, bottom.id),
    cardOf(page, shipped.id),
    cardOf(page, running.id),
    `${when}: the top and the bottom are level with the middle of the two sides`,
  );
}

/**
 * The runs in flight against the cap, as the package counts them in the seeded store: NEIGHBOUR's session at work, HELD's the harness
 * blocked, and the diamond's running side — not its bottom, which waits on runs and has filed nothing, though the Factory has it on the
 * floor.
 */
const IN_FLIGHT_BY_CAP = 3;

/** The default floor's lane: the queued cards of no factory, in the queue's order. */
const LANE = QUEUED_IN.default;

export default {
  /**
   * The Factory: the queue's ghosts at the floor's left edge and the run slots over it; the runs in flight, to decide and waiting on you
   * as cards on the floor, the finished ones once asked for; the diamond drawn as a graph of cards, whose picture is the floor as a person
   * first finds it; each card dragged alone and kept where it was put down; a card opened on its steps, a press on a tile opening the
   * step's inspector; and the loop's arrow back.
   */
  name: 'factory',
  route: '/factories/default',
  expect: async (page) => {
    await sidebar(page);
    const floor = page.locator('.react-flow');
    await expectVisible(floor, 'the Factory canvas');

    const lane = page.locator('aside[aria-label="Queued cards"]');
    const ghosts = lane.locator('a[data-ghost]');
    await expectCount(ghosts, LANE.length, `a ghost per queued card of no factory (${LANE.map((c) => c.name).join(', ')})`);
    const drawn = await ghosts.evaluateAll((links) => links.map((link) => link.getAttribute('data-ghost')));
    if (JSON.stringify(drawn) !== JSON.stringify(LANE.map((c) => c.name))) {
      throw new Refused(
        `the ghosts are this floor's cards in the queue's order — ${LANE.map((c) => c.name).join(', ')} — and they were drawn ${drawn.join(', ')}`,
      );
    }
    for (const card of LANE) {
      const i = QUEUED.findIndex((queued) => queued.name === card.name);
      const ghost = lane.locator(`a[data-ghost="${card.name}"]`);
      await expectTexts(ghost.locator('[data-ghost-place]'), [PLACES_SAID[i]], `${card.name}'s ghost says its place (${PLACES_SAID[i]})`);
      await expectTexts(ghost.locator('[data-ghost-title]'), [card.title], `and its first line (${card.title})`);
      await expectTexts(ghost.locator('[data-ghost-workflow]'), [card.workflow], `and its workflow (${card.workflow})`);
      const repo = "the daemon's repository";
      await expectTexts(ghost.locator('[data-ghost-repo]'), [repo], `and its repository (${repo})`);
      const href = await ghost.getAttribute('href');
      if (href !== `/inbox/${card.name}`)
        throw new Refused(`${card.name}'s ghost opens the card's page (/inbox/${card.name}) — it links to ${href}`);
    }
    await expectTexts(
      lane.locator(`a[data-ghost="${QUEUE.third.name}"] [data-ghost-tried="refused"]`),
      [`not started, refused: ${unfactoredWhy(store!)}`],
      "the card of no factory, queued before a queue asked for one, says the tick refused its start for that, in the package's words",
    );
    await expectCount(
      page.locator(QUEUED.map((c) => `.react-flow__node[data-id="${c.name}"]`).join(', ')),
      0,
      'no ghost is a node on the floor: nothing waits on a queued card',
    );
    await expectLeftOf(ghosts, floor, "the ghosts wait at the floor's left edge");
    await expectTexts(
      page.locator('[data-cap]'),
      [`${IN_FLIGHT_BY_CAP} of ${QUEUE.cap} run slots taken on this machine · ${LANE.length} queued · ${PASS.line}`],
      `the header says the run slots taken of the cap the daemon last ran with (WF_MAX_RUNS=${QUEUE.cap}), and how many are queued — in slots, not beside the floor's 4 in flight as a second count of runs in flight — and what the daemon's last pass took`,
    );
    const pass = page.locator('[data-cap] [data-pass]');
    await expectTexts(pass, [`· ${PASS.line}`], 'the pass is said beside the cap');
    await expectCount(pass.locator('a'), 0, "the pass's line is text, and leads nowhere");
    const passTitle = (await pass.getAttribute('title')) ?? '';
    const passLines = passTitle.split('\n');
    if (!passLines[0]?.startsWith("The daemon's last pass, at ") || !passLines[0].endsWith(`: ${PASS.totals}`)) {
      throw new Refused(`the pass's title opens on its totals, ${JSON.stringify(PASS.totals)} — it says ${JSON.stringify(passLines[0])}`);
    }
    const phasesSaid = passLines
      .slice(1, 9)
      .map((l) => l.split(':')[0])
      .join(' ');
    if (
      phasesSaid !== 'records asks journals observe runtime place assess act' ||
      passLines[4] !== 'observe: 120 ms, 1 call, 0 B read, 1 process started'
    ) {
      throw new Refused(
        `the pass's title says each phase in the package's order, observe's 120 ms among them — it says ${JSON.stringify(passLines.slice(1, 9))}`,
      );
    }
    if (
      !passLines.includes('claude: 1 observe, 118 ms, 3 sessions or run files listed, 1 process started') ||
      passLines.at(-2) !== PASS.seen ||
      passLines.at(-1) !== 'Measuring it took 0.40 ms.'
    ) {
      throw new Refused(
        `the pass's title names the harness observed, what the pass saw and what measuring took — it says ${JSON.stringify(passTitle)}`,
      );
    }
    const { card, pills, tiles, pill, tile } = onTheFloor(page);
    const beside = page.locator(`.react-flow__node[data-id="${NEIGHBOUR.id}"]`);
    await expectVisible(
      beside,
      `a failed run whose session still runs is in flight: its card is on the Factory by default (${NEIGHBOUR.id})`,
    );
    await expectVisible(beside.getByText(/ at work$/), 'its card counts its time at work, as a card in flight does');
    await expectVisible(
      page.locator(`.react-flow__node[data-id="${HELD.id}"] [data-need="harness"][data-step="${HELD.blocked}"]`, {
        hasText: new RegExp(`^${HELD.blocked} is blocked by the harness: ${HELD.wait}$`),
      }),
      `the card of a run whose session the harness blocked says so, and what the harness waits for — not needs-human alone, and not what the session said last, which only the run's page reads (${HELD.id})`,
    );
    await settled(page);
    await expectClearOfPanels(page, 'on first load');

    const { top, shipped, running, bottom, cancelled, orphan } = DIAMOND;
    for (const run of [running, bottom])
      await expectVisible(cardOf(page, run.id), `the diamond's card ${run.id} is on the floor by default`);
    for (const run of [top, shipped])
      await expectCount(
        cardOf(page, run.id),
        0,
        `${run.id}, shipped, is not on the floor by default: nothing still waits on it — ${running.id} has started, and ${bottom.id} waits on ${running.id} alone`,
      );
    await expectCount(cardOf(page, cancelled.id), 0, `${cancelled.id} is not on the floor by default: called off, it waits on nobody`);
    await expectVisible(cardOf(page, orphan.id), `${orphan.id} is on the floor by default: it waits on a run called off, so on a person`);
    await expectCount(
      edgeOf(page, running.id, bottom.id).locator('.react-flow__edge-path[data-state="to-come"]'),
      1,
      `an edge from ${running.id} into ${bottom.id}, dashed: ${bottom.id} still waits on it`,
    );
    await expectCount(
      page.locator('.react-flow__edge[data-id^="after:"]'),
      1,
      "the diamond's one live wait, and no other edge between cards: a wait that is over draws nothing",
    );
    await expectCount(page.locator('.react-flow__edge-path[data-state="done"]'), 0, 'and no edge between cards is drawn solid');
    await expectLeftOf(cardOf(page, running.id), cardOf(page, bottom.id), `${running.id} is left of ${bottom.id}, which waits on it`);
    await expectVisible(
      cardOf(page, bottom.id).locator('[data-waiting="on-runs"]', { hasText: DIAMOND.words.bottom }),
      `the bottom's card says ${DIAMOND.words.bottom}, in wf ls's words: the side that shipped is waited on no more`,
    );
    await expectCount(
      cardOf(page, bottom.id).getByText('waiting on you', { exact: true }),
      0,
      'and does not wait on you: the side it waits on may still ship',
    );
    await expectVisible(
      cardOf(page, bottom.id).locator('ul[aria-label="Steps"] [data-step][data-state="waiting"]'),
      "the bottom card's rail draws its step waiting",
    );
    await expectInside(
      cardOf(page, bottom.id).locator('ul[aria-label="Steps"] [data-step]'),
      cardOf(page, bottom.id),
      'and the rail stays inside the card',
    );
    await expectCount(cardOf(page, running.id).locator('[data-waiting]'), 0, `${running.id} waits on no run`);
    await expectVisible(
      cardOf(page, bottom.id).locator(
        `[data-ghost-run] [data-waiting="on-runs"] a[data-waits-on="${running.id}"][href="/runs/${running.id}"]`,
      ),
      `the bottom's card is a ghost until it starts, and names ${running.id}, which it waits on, as a link to that run`,
    );
    for (const run of [running, orphan])
      await expectCount(cardOf(page, run.id).locator('[data-ghost-run]'), 0, `${run.id}'s card is no ghost: it started, or waits on you`);
    await expectVisible(
      cardOf(page, running.id).locator(`time[title*="${DIAMOND.words.running}"]`, { hasText: /^\d+m \d{2}s at work$/ }),
      `${running.id}'s card counts its time at work from its first filing, and says on hover that it ${DIAMOND.words.running}`,
    );
    const times = (await (await page.request.get(new URL(`/api/runs/${running.id}`, page.url()).href)).json()) as {
      createdAt: string;
      startedAt: string | null;
    };
    if (!times.startedAt || Date.parse(times.startedAt) - Date.parse(times.createdAt) !== 60_000) {
      throw new Refused(
        `${running.id} was seeded filed a minute after it was created; the api says created ${times.createdAt}, started ${times.startedAt}`,
      );
    }
    await expectCount(
      cardOf(page, running.id).locator(`time[datetime="${times.startedAt}"]`),
      1,
      `${running.id}'s card counts from ${times.startedAt}, when it started, not ${times.createdAt}`,
    );
    for (const run of [bottom, orphan]) {
      await expectVisible(
        cardOf(page, run.id).locator('time[title*="Nothing of it is filed yet"]', { hasText: /^waiting for / }),
        `${run.id}'s card says it is waiting, and for how long, not a time at work`,
      );
    }
    await expectCount(
      page.locator('.react-flow__panel[aria-label="Legend"] [data-sample="cards"]'),
      1,
      "the Factory's legend draws the edge between two cards",
    );
    await settled(page);
    await photograph(page, path.join(OUT, `factory-diamond-${await themeOf(page)}.png`), { fullPage: true });

    const everyOther = (...ids: string[]) =>
      page.locator(`.react-flow__node[data-id]${ids.map((id) => `:not([data-id="${id}"])`).join('')}`);
    await expectMovedAlone(
      cardOf(page, running.id),
      () => dragBy(page, cardOf(page, running.id).locator('time'), { x: 60, y: 30 }, `the card of ${running.id}`),
      `${running.id} dragged moves alone — ${bottom.id}, which waits on it, stays, and so does every other card`,
      everyOther(running.id),
    );
    await expectCount(
      page.locator('.react-flow__edge[data-id^="after:"]'),
      1,
      "the diamond's live wait is still drawn: it stretches to the card where it now is",
    );
    await expectCount(page.locator('[data-tile]'), 0, 'a drop is not a click: no card opened');
    await page.getByRole('button', { name: 'Fit view' }).click();
    await settled(page);
    await photograph(page, path.join(OUT, `factory-cards-dragged-${await themeOf(page)}.png`), { fullPage: true });
    const [putDown, leftBe] = [await placeOf(cardOf(page, running.id)), await placeOf(cardOf(page, bottom.id))];
    await nextVisit(page, async (again) => {
      await expectVisible(cardOf(again, running.id), `${running.id} is on the floor on the next visit`);
      await settled(again);
      const [kept, stayed] = [await placeOf(cardOf(again, running.id)), await placeOf(cardOf(again, bottom.id))];
      if (!samePlace(kept, putDown))
        throw new Refused(`the next visit finds ${running.id} where its drag put it down, ${said(putDown)} — it is at ${said(kept)}`);
      if (!samePlace(stayed, leftBe))
        throw new Refused(`the next visit finds ${bottom.id} where no drag moved it, ${said(leftBe)} — it is at ${said(stayed)}`);
    });

    await expectVisible(card, `a run with a step signed off blocked waits on a person: its card is on the floor by default (${FAKE.id})`);
    await expectVisible(
      cardOf(page, LOOPING.id),
      `a loop out of rounds waits on a person: its card is on the floor by default (${LOOPING.id})`,
    );
    await expectVisible(
      page.getByText('4 in flight · 11 finished · 2 to decide · 6 waiting on you'),
      "the Factory counts the runs in flight (NEIGHBOUR, HELD, the diamond's running side and its bottom), the finished, those nobody has decided (ENDING and UNMERGED), and those waiting on you (FAKE, LOOPING, COSTLY, GATED, ENDING and the run waiting on one called off)",
    );
    await expectVisible(
      cardOf(page, GATED.id),
      `a run held at its plan's gate waits on a person, though the api reads it failed with nothing to decide: its card is on the floor by default (${GATED.id})`,
    );

    const ending = cardOf(page, ENDING.id);
    await expectVisible(ending, `a run at its ending's gate keeps its card on the floor with no Show finished (${ENDING.id})`);
    await expectVisible(
      ending.locator(
        `[data-to-decide="approve"][data-gate-line="${ENDING.ending}"][title^="approve to run ${ENDING.ending} on main"][title$="${ENDING.says} — nemia approve ${ENDING.id} ${ENDING.ending}"]`,
        { hasText: `approve to run ${ENDING.ending} on main, or send ${ENDING.back} back` },
      ),
      `its card says what approving its ending does and where a send-back goes, the folder's words on hover`,
    );
    await expectVisible(ending.getByRole('button', { name: 'Approve', exact: true }), 'and answers it on the card: Approve');
    await expectVisible(ending.getByRole('button', { name: 'Send back…', exact: true }), 'and Send back…');
    await expectVisible(ending.getByText('to decide', { exact: true }), 'and is marked to decide');
    await expectVisible(
      ending.locator(`[data-step="${ENDING.ending}"][data-state="awaiting-approval"][title^="${ENDING.ending}: awaiting approval"]`),
      `and its rail shows ${ENDING.ending} as awaiting approval`,
    );
    await expectCount(
      ending.locator(`[data-need="approve"][data-step="${ENDING.ending}"]`),
      0,
      'and does not ask for the same step twice: the gate line names it',
    );
    const unmerged = cardOf(page, UNMERGED.id);
    await expectVisible(unmerged, `a finished run whose branch nobody merged keeps its card on the floor too (${UNMERGED.id})`);
    await expectVisible(
      unmerged.locator('[data-to-decide="result"]', { hasText: 'decide its result: a branch ahead of the base that nothing merges' }),
      'its card says the branch is ahead, a link to where it is decided',
    );
    await expectCount(page.locator('[data-to-decide="git"]'), 0, 'and no card on the floor says its kind in the old word, git');
    await expectVisible(unmerged.locator(`p[title="${UNMERGED.said}"]`), "and wf ls's words, the branch and the command, on hover");
    await expectCount(unmerged.getByText('waiting on you', { exact: true }), 0, 'and it waits on nobody: every step of it finished');
    await expectCount(
      cardOf(page, SHIPPED.id),
      0,
      `a run whose ending merged it is decided: no card on the floor by default (${SHIPPED.id})`,
    );
    await settled(page);
    await photograph(page, path.join(OUT, `factory-to-decide-${await themeOf(page)}.png`), { fullPage: true });

    await showFinished(page);
    for (const run of [top, shipped]) {
      await expectVisible(cardOf(page, run.id).getByText(/^took .+$/), `${run.id}, shipped, is drawn finished, and says what it took`);
    }
    await expectDiamond(page, 'with the finished shown');
    await expectCount(
      page.locator('.react-flow__edge[data-id^="after:"]'),
      2,
      `with the finished shown, the live waits alone: into ${bottom.id} from ${running.id}, and into ${orphan.id} from ${cancelled.id}`,
    );
    await expectVisible(cardOf(page, SHIPPED.id), `the shipped run's card, once finished runs are shown (${SHIPPED.id})`);
    await expectCount(cardOf(page, SHIPPED.id).locator('[data-to-decide]'), 0, 'and it says nothing to decide');
    await expectVisible(cardOf(page, SHIPPED.id).locator('[data-pruned]', { hasText: /^pruned$/ }), 'and it says it was pruned');
    const prunedSaid = await cardOf(page, SHIPPED.id).locator('[data-pruned]').getAttribute('title');
    if (
      !/^pruned at \S+ — its worktrees were removed \(nemia prune\), and its files were removed at .* \(nemia prune --artifacts\); its branches and record are kept$/.test(
        prunedSaid ?? '',
      )
    ) {
      throw new Refused(
        `the pruned mark says what went and what was kept on hover, as wf ls says it — its title is ${JSON.stringify(prunedSaid)}`,
      );
    }
    await expectCount(page.locator('[data-pruned]'), 1, 'and no other card says pruned: SHIPPED is the one run pruned');
    await expectCount(
      cardOf(page, FOLDER.id),
      0,
      `a run started in the factory ${FOLDER.factory} is on its floor, not the default factory's, finished runs shown (${FOLDER.id})`,
    );
    await expectVisible(
      cardOf(page, orphan.id).locator('[data-waiting="on-you"]', { hasText: DIAMOND.words.orphan }),
      `${orphan.id}'s card says ${DIAMOND.words.orphan}, as a wait on a person`,
    );
    await expectVisible(cardOf(page, orphan.id).getByText('waiting on you', { exact: true }), `${orphan.id} waits on you`);
    await expectCount(
      edgeOf(page, cancelled.id, orphan.id).locator('.react-flow__edge-path[data-state="to-come"]'),
      1,
      `a dashed edge from ${cancelled.id} into ${orphan.id}`,
    );
    await settled(page);
    await expectLeftOf(cardOf(page, cancelled.id), cardOf(page, orphan.id), `${cancelled.id} is left of ${orphan.id}, which waits on it`);
    await expectVisible(
      page.locator(
        `.react-flow__node[data-id="${LOOPING.id}"] [data-step="${LOOPING.exhausted}"][data-state="exhausted"][title*="rounds exhausted"][title$="${LOOPING.notes.review}"]`,
      ),
      `the loop's rail shows ${LOOPING.exhausted} out of rounds as a pill that waits on a person, its note after what that means on hover (${LOOPING.id})`,
    );
    await expectVisible(card, `the fake run's card, once finished runs are shown (${FAKE.id})`);
    await expectVisible(
      card.locator('time[title^="At work "][title*="still going"]', { hasText: / at work$/ }),
      'the card reads waiting on you: its time at work, not what it took, since a person is to answer — and nothing of it ticks',
    );
    await tookOnTheCard(page);
    await expectCount(card.locator('[data-cost]'), 0, "the fake run's card says no cost, not $0: none of its sessions was priced");
    await expectVisible(
      card.locator('[data-tokens]', { hasText: /^· ≥\S+ tokens$/ }),
      "the fake run's card marks its tokens the least they were: its codex session measured them, and its claude ones did not",
    );
    const gated = cardOf(page, GATED.id);
    await expectVisible(
      gated.locator(`[data-gate-line="${GATED.gated}"]`, { hasText: `approve what ${GATED.gated} handed on, or send it back` }),
      `the card of a run at its gate says what approving ${GATED.gated} does, in wf ls's words (${GATED.id})`,
    );
    await expectVisible(gated.getByRole('button', { name: 'Approve', exact: true }), 'and answers it on the card');
    await expectVisible(
      gated.locator(`[data-step="${GATED.gated}"][data-state="awaiting-approval"][data-live]`),
      'and its rail shows the step as awaiting approval, a pill that waits on a person, ringed as the step the run is at',
    );
    await expectVisible(gated.getByText('waiting on you', { exact: true }), 'and waits on you');
    await expectVisible(card.getByText(FAKE.title), `the card says what was asked (${FAKE.title})`);
    await expectVisible(
      card.locator(`[data-need="asks"][data-step="${FAKE.blocked}"]`, { hasText: `${FAKE.blocked} asks: ${SESSION.closeout.needs}` }),
      `the card says what ${FAKE.blocked}, signed off blocked, asks (${SESSION.closeout.needs})`,
    );
    await expectVisible(card.locator(`a[href="/runs/${FAKE.id}"]`), "the card's title links to the run's page");
    await expectVisible(
      pill(FAKE.refused).and(page.locator('[data-state="failed-check"][title*="failed ✗ check (exit 1)"]')),
      `the card's rail shows ${FAKE.refused}'s refused check as a red pill, the check's exit on hover`,
    );
    await expectCount(pills, FAKE.steps.length, `a pill per step on the card at rest (${FAKE.steps.join(', ')})`);
    await expectCount(
      card.locator('ul[aria-label="Steps"]').locator('..').locator('[data-arrow]'),
      FAKE.edges,
      "an arrow between the pills for each `after` between the run's steps",
    );
    await expectCount(tiles, 0, 'and no tile: the card is closed');
    const railArrow = (edge: string) =>
      beside
        .locator('ul[aria-label="Steps"]')
        .locator('..')
        .locator(`[data-arrow="step:${edge.replace('->', '->step:')}"]`);
    const railMoving = railArrow(NEIGHBOUR.running);
    await expectCount(
      railMoving.and(page.locator('[data-state="running"]')),
      1,
      `the arrow ${NEIGHBOUR.running} on ${NEIGHBOUR.id}'s rail runs: draft's session is at work`,
    );
    await expectCount(railMoving.locator('animateMotion'), 1, `a dot travels ${NEIGHBOUR.running} on the card at rest`);
    await expectCount(railArrow(NEIGHBOUR.still).locator('animateMotion'), 0, `and none travels ${NEIGHBOUR.still}, which waits`);

    await page.getByRole('button', { name: 'Reset layout' }).click();
    await settled(page);
    await expectInside(card, floor, 'the card is on the floor');
    await expectCount(tiles, 0, 'a closed card draws no tile');
    await expectClearOfEachOther(page);
    await photographCard(page, card, path.join(OUT, `factory-card-at-rest-${await themeOf(page)}.png`));
    await page.getByRole('button', { name: 'Fit view' }).click();
    await settled(page);
    await photograph(page, path.join(OUT, `factory-laid-out-${await themeOf(page)}.png`), { fullPage: true });

    const nodes = await page.locator('.react-flow__node').count();
    await card.getByRole('button', { name: 'Show steps' }).click();
    await expectCount(tiles, FAKE.steps.length, `the chevron opens the card into a tile per step (${FAKE.steps.join(', ')})`);
    await expectCount(page.locator('.react-flow__node'), nodes, 'on the card itself: no node is added to the floor for a step');
    await expectVisible(
      card.getByText(FAKE.touched, { exact: true }),
      `the open card of a run waiting on you says what its branch touched (${FAKE.touched})`,
    );
    for (const name of FAKE.steps) await expectVisible(tile(name), `the open card draws ${name}`);
    await expectCount(
      tile(FAKE.blocked).and(page.locator('[data-state="blocked"]')),
      1,
      `${FAKE.blocked} is drawn as a human gate on the Factory`,
    );
    await expectVisible(
      tile(FAKE.blocked).locator(`[data-need="asks"][title="asks: ${SESSION.closeout.needs}"]`),
      `${FAKE.blocked}'s tile says what it asks, whole on hover`,
    );
    await expectVisible(
      tile(FAKE.refused).locator('[data-state="failed-check"]', { hasText: 'failed ✗ check (exit 1)' }),
      `${FAKE.refused}, whose check refused, has a red chip`,
    );
    await expectVisible(
      tile(FAKE.unverified).locator('[data-state="unverified"]', { hasText: 'unverified · done' }),
      `${FAKE.unverified}, signed off with no check, is marked unverified, not done`,
    );
    await expectVisible(
      tile('respond').getByText('not filed yet', { exact: true }),
      'respond, never filed, says so on its tile once the run is read',
    );
    const opened = card.locator(`section[aria-label="The run's steps"]`);
    await expectCount(opened.locator('[data-arrow]'), FAKE.edges, "an arrow between the tiles for each `after` between the run's steps");
    await expectCount(
      page.locator('.react-flow__edge'),
      2,
      'and on the floor only the two live waits between cards: none from a card into a step',
    );
    await expectCount(
      opened.locator('animateMotion'),
      0,
      `no dot travels the fake run's arrows: nothing moves into ${FAKE.blocked}, a human gate, nor into ${FAKE.refused}, whose check refused`,
    );
    await expectVisible(card.getByRole('button', { name: 'Hide steps' }), "the open card's chevron hides the steps");
    await expectApart(beside, card, 'the card beside it moves out from under the open card');
    await expectDiamond(page, 'with the fake run open over the diamond');
    for (const one of DIAMOND_RUNS) await expectApart(cardOf(page, one.id), card, `${one.id} moves out from under the open card`);
    await expectClearOfEachOther(page);
    await settled(page);
    await expectInside(card, floor, 'the open card, its tiles and all, is brought onto the screen');
    await photographCard(page, card, path.join(OUT, `factory-card-open-${await themeOf(page)}.png`));

    await nextVisit(page, async (again) => {
      await showFinished(again);
      await expectCount(onTheFloor(again).tiles, FAKE.steps.length, 'the run is still open on the next visit: this browser kept it open');
      await settled(again);
      await expectClearOfEachOther(again);
    });

    await page.getByRole('button', { name: 'Collapse all' }).click();
    await expectCount(tiles, 0, 'Collapse all folds the tiles away');
    await expectCount(pills, FAKE.steps.length, 'and leaves the rail');
    await card.getByRole('button', { name: 'Show steps' }).click();
    await expectCount(tiles, FAKE.steps.length, "the card's chevron opens it again");

    await settled(page);
    const [from, onto, grip] = [await card.boundingBox(), await beside.boundingBox(), await card.locator('time').boundingBox()];
    if (!from || !onto || !grip) throw new Refused('the cards to drag and drop onto — one of them is not on the page');
    await expectMovedAlone(
      card,
      async () => {
        const [x, y] = [grip.x + grip.width / 2, grip.y + grip.height / 2];
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + onto.x - from.x, y + onto.y - from.y, { steps: 12 });
        await page.mouse.up();
      },
      'the open card moves with its tiles when it is dragged, and no other card moves',
      page.locator(`.react-flow__node[data-id]:not([data-id="${FAKE.id}"])`),
    );
    await expectCount(tiles, FAKE.steps.length, 'a drop is not a click: the run is still open');
    await settled(page);
    await expectVisible(beside, 'the card the open run was dropped on is still on the floor, under it: a drop moves nothing aside');
    const put = await placeOf(card);
    await dragBy(page, tile(FAKE.unverified), { x: 120, y: 80 }, `the tile of ${FAKE.unverified}`);
    await settled(page);
    const still = await placeOf(card);
    if (!samePlace(still, put))
      throw new Refused(`a drag started on a tile leaves its card where it is, ${said(put)} — it is at ${said(still)}`);
    await expectCount(tiles, FAKE.steps.length, 'and does not close the card');
    await page.getByRole('button', { name: 'Fit view' }).click();
    await settled(page);
    await photograph(page, path.join(OUT, `factory-dragged-${await themeOf(page)}.png`), { fullPage: true });

    await page.getByRole('button', { name: 'Reset layout' }).click();
    await expectCount(tiles, 0, 'Reset layout closes the card');
    await expectVisible(card.getByRole('button', { name: 'Show steps' }), "after a reset the card's chevron shows the steps");
    await nextVisit(page, async (again) => {
      const next = onTheFloor(again);
      await showFinished(again);
      await expectVisible(
        next.card.getByRole('button', { name: 'Show steps' }),
        'the next visit after a reset finds the run closed: the chevron reads what this browser kept as the page mounts',
      );
      await expectCount(next.tiles, 0, 'the next visit after a reset draws no tile');
    });

    await card.getByRole('button', { name: 'Show steps' }).click();
    await expectCount(tiles, FAKE.steps.length, 'the chevron opens the run again after a reset');
    await expectApart(beside, card, 'the card beside it moves aside again');
    await settled(page);
    await tile('review').click();
    const inspector = stepBar(page, FAKE.id, 'review');
    await expectVisible(inspector, "review's bar opens on a press on review");
    await expectCount(tiles, FAKE.steps.length, 'a press on a tile does not close its card');
    await expectCount(card.locator('[data-tile][aria-pressed="true"]'), 1, 'and one tile reads pressed');
    await expectCount(tile('review').and(page.locator('[aria-pressed="true"]')), 1, "review's, the step inspected");
    await expectCount(
      page.locator('aside[aria-label="Queued cards"]'),
      0,
      "the queue's lane gives its room to the floor while the bar shows a step",
    );
    await expectTexts(
      page.locator('[data-cap]'),
      [`${IN_FLIGHT_BY_CAP} of ${QUEUE.cap} run slots taken on this machine · ${LANE.length} queued · ${PASS.line}`],
      'and the header still counts the queue',
    );
    await expectVisible(inspector.getByText(FAKE.title), 'the bar names the run the step is in');
    await settled(page);
    await expectInside(card, floor, 'the floor narrowed by the bar over it brings the open card back onto it');
    await expectLeftOf(card, inspector, 'left of the bar');

    await tile(FAKE.refused).click();
    const refused = stepBar(page, FAKE.id, FAKE.refused);
    await refused.getByRole('tab', { name: 'Details' }).click();
    const check = refused.locator('section[aria-label="Check"]');
    await expectVisible(
      check.getByText(FAKE.check, { exact: true }),
      `the inspector of ${FAKE.refused} shows its check's command (${FAKE.check})`,
    );
    await expectVisible(check.getByText('exit 1', { exact: true }), `the inspector of ${FAKE.refused} shows what its check exited with`);
    await expectVisible(check.getByText(FAKE.said), `the inspector of ${FAKE.refused} shows the last lines of its check's output`);
    await settled(page);
    await expectInside(card, floor, `the open card is on the floor beside ${FAKE.refused}'s bar`);
    await refused.getByRole('button', { name: 'Close', exact: true }).click();
    await expectCount(refused, 0, "the step's bar closes");
    await expectCount(ghosts, LANE.length, "and the queue's lane is back beside the floor");

    await beside.getByRole('button', { name: 'Show steps' }).click();
    const besideOpen = beside.locator(`section[aria-label="The run's steps"]`);
    const moving = besideOpen.locator(`[data-arrow="step:${NEIGHBOUR.running.replace('->', '->step:')}"]`);
    await expectCount(
      moving.and(page.locator('[data-state="running"]')),
      1,
      `the arrow ${NEIGHBOUR.running} between the tiles runs: draft's session is at work`,
    );
    await expectCount(moving.locator('animateMotion'), 1, `a dot travels ${NEIGHBOUR.running} between the tiles`);
    await expectCount(besideOpen.locator('animateMotion'), 1, 'and no other arrow between its tiles moves');
    await expectCount(page.locator('.react-flow__edge animateMotion'), 0, 'nor any edge between cards');
    await expectCount(
      page.locator('[data-arrow] animateMotion'),
      await page.locator('[data-arrow][data-state="running"]').count(),
      'on the whole floor, a dot travels each running arrow and no other',
    );
    await expectCount(
      page.locator('.react-flow__panel[aria-label="Legend"] animateMotion'),
      1,
      "the Factory's legend shows the running edge moving as it moves",
    );
    await expectDiamond(page, 'with the run beside it open too');
    await expectLeftOf(
      cardOf(page, DIAMOND.cancelled.id),
      cardOf(page, DIAMOND.orphan.id),
      `${DIAMOND.cancelled.id} is still left of ${DIAMOND.orphan.id}`,
    );

    const looping = cardOf(page, LOOPING.id);
    const back = `[data-arrow="loop:step:${LOOPING.exhausted}->step:${LOOPING.target}"]`;
    await expectCount(
      looping.locator('ul[aria-label="Steps"]').locator('..').locator(back),
      1,
      `${LOOPING.id}'s rail draws the arrow back from ${LOOPING.exhausted} into ${LOOPING.target}`,
    );
    await expectCount(looping.locator('[data-round]'), 0, "and says no round on the card at rest: the pill's hover does");
    await page.getByRole('button', { name: 'Fit view' }).click();
    await settled(page);
    await looping.getByRole('button', { name: 'Show steps' }).click();
    const loopOpen = looping.locator(`section[aria-label="The run's steps"]`);
    await expectCount(loopOpen.locator('[data-tile]'), LOOPING.steps.length, `${LOOPING.id} opens on its steps`);
    await expectTexts(
      loopOpen.locator(`${back} [data-round]`),
      [LOOPING.round],
      `the arrow back between its tiles says the loop is on ${LOOPING.round}, as the run's page labels its edge`,
    );
    await settled(page);
    await photographCard(page, looping, path.join(OUT, `factory-loop-open-${await themeOf(page)}.png`));
  },
} satisfies PageSpec;

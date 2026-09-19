import path from 'node:path';
import type { Page } from 'playwright';
import { nextVisit, PLACES_SAID, sidebar, themeOf } from '../board.ts';
import { besideCard, cardOf, cardsOf, dragBy, edgeOf, expectClearOfEachOther, onTheFloor, placeOf, said, samePlace, showFinished } from '../canvas.ts';
import { expectApart, expectBetween, expectCount, expectInside, expectLeftOf, expectMovedWith, expectTexts, expectUncut, expectVisible, Refused, settled } from '../checks.ts';
import { COSTLY, DIAMOND, DIAMOND_RUNS, ENDING, FAKE, GATED, HELD, LOOPING, NEIGHBOUR, QUEUE, QUEUED, refusedWhy, SESSION, SHIPPED, UNMERGED } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The diamond's cards laid out as a diamond: every run left of each run that waits on it, and its top and bottom level with the middle of its sides. */
async function expectDiamond(page: Page, when: string): Promise<void> {
  const { top, shipped, running, bottom } = DIAMOND;
  await settled(page);
  await expectLeftOf(cardOf(page, top.id), cardsOf(page, shipped.id, running.id), `${when}: the top is left of both sides, which wait on it`);
  await expectLeftOf(cardsOf(page, shipped.id, running.id), cardOf(page, bottom.id), `${when}: both sides are left of the bottom, which waits on them`);
  await expectApart(cardOf(page, shipped.id), cardOf(page, running.id), `${when}: the two sides are laid out apart`);
  await expectBetween(cardsOf(page, top.id, bottom.id), cardOf(page, shipped.id), cardOf(page, running.id), `${when}: the top and the bottom are level with the middle of the two sides`);
}

/**
 * The runs in flight against the cap, as the package counts them in the seeded store: NEIGHBOUR's session at work, HELD's the harness blocked,
 * and the diamond's running side — not its bottom, which waits on runs and has filed nothing, though the Factory has it on the floor.
 */
const IN_FLIGHT_BY_CAP = 3;

export default {
  name: 'factory',
  route: '/',
  expect: async (page) => {
    await sidebar(page);
    const floor = page.locator('.react-flow');
    await expectVisible(floor, 'the Factory canvas');

    // The queue, at the floor's left edge: a ghost per queued card, in the order the tick starts them, each saying its place, first line,
    // workflow and repository, and linked to its card's page — the refused one marked with why — and none of them a node on the floor. Over
    // the floor, the run slots taken of the cap the daemon's last pass ran with, and how many are queued.
    const lane = page.locator('aside[aria-label="Queued cards"]');
    const ghosts = lane.locator('a[data-ghost]');
    await expectCount(ghosts, QUEUED.length, `a ghost per queued card (${QUEUED.map((c) => c.name).join(', ')})`);
    const drawn = await ghosts.evaluateAll((links) => links.map((link) => link.getAttribute('data-ghost')));
    if (JSON.stringify(drawn) !== JSON.stringify(QUEUED.map((c) => c.name))) {
      throw new Refused(`the ghosts are in the queue's order — ${QUEUED.map((c) => c.name).join(', ')} — and they were drawn ${drawn.join(', ')}`);
    }
    const checkout = path.join(store!, 'checkout');
    for (const [i, card] of QUEUED.entries()) {
      const ghost = lane.locator(`a[data-ghost="${card.name}"]`);
      await expectTexts(ghost.locator('[data-ghost-place]'), [PLACES_SAID[i]!], `${card.name}'s ghost says its place (${PLACES_SAID[i]})`);
      await expectTexts(ghost.locator('[data-ghost-title]'), [card.title], `and its first line (${card.title})`);
      await expectTexts(ghost.locator('[data-ghost-workflow]'), [card.workflow], `and its workflow (${card.workflow})`);
      const repo = card === QUEUE.third ? "wf up's repository" : path.basename(checkout);
      await expectTexts(ghost.locator('[data-ghost-repo]'), [repo], `and its repository (${repo})`);
      const href = await ghost.getAttribute('href');
      if (href !== `/inbox/${card.name}`) throw new Refused(`${card.name}'s ghost opens the card's page (/inbox/${card.name}) — it links to ${href}`);
      await expectCount(ghost.locator('[data-ghost-tried]'), card === QUEUE.refused ? 1 : 0, card === QUEUE.refused ? 'the refused card is marked' : 'no try is marked on a card the tick has not tried');
    }
    await expectTexts(
      lane.locator(`a[data-ghost="${QUEUE.refused.name}"] [data-ghost-tried="refused"]`),
      [`not started, refused: ${refusedWhy(store!, checkout)}`],
      "the refused card's ghost says why, in the package's words",
    );
    await expectCount(page.locator(QUEUED.map((c) => `.react-flow__node[data-id="${c.name}"]`).join(', ')), 0, 'no ghost is a node on the floor: nothing waits on a queued card');
    await expectLeftOf(ghosts, floor, "the ghosts wait at the floor's left edge");
    await expectTexts(
      page.locator('[data-cap]'),
      [`${IN_FLIGHT_BY_CAP} of ${QUEUE.cap} run slots taken · ${QUEUED.length} queued`],
      `the header says the run slots taken of the cap the daemon last ran with (WF_MAX_RUNS=${QUEUE.cap}), and how many are queued — in slots, not beside the floor's 4 in flight as a second count of runs in flight`,
    );
    const { card, steps, run, step } = onTheFloor(page);
    const beside = page.locator(`.react-flow__node[data-id="${NEIGHBOUR.id}"]`);
    // The review's case: a run `assess` calls failed, with a session of it still running, is in flight.
    await expectVisible(beside, `a failed run whose session still runs is in flight: its card is on the Factory by default (${NEIGHBOUR.id})`);
    await expectVisible(beside.getByText(/since it started$/), 'its card counts the time since it started, as a card in flight does');
    // A run whose session the harness blocked is in flight too: its card names the harness. What the session said last is on the
    // run's page, which reads it: the list reads no conversation.
    await expectVisible(
      page.locator(`.react-flow__node[data-id="${HELD.id}"] [data-need="harness"][data-step="${HELD.blocked}"]`, { hasText: new RegExp(`^${HELD.blocked} is blocked by the harness$`) }),
      `the card of a run whose session the harness blocked says so — not needs-human alone (${HELD.id})`,
    );
    await settled(page);

    // The diamond, drawn as a graph of cards: an edge from each run a card waits on into it, parents left of children, and the two
    // sides level about the middle. Its top and its shipped side are finished, and on the floor all the same: a run in flight waits on each.
    const { top, shipped, running, bottom, cancelled, orphan } = DIAMOND;
    for (const run of [top, shipped, running, bottom]) await expectVisible(cardOf(page, run.id), `the diamond's card ${run.id} is on the floor by default`);
    for (const run of [top, shipped]) {
      await expectVisible(cardOf(page, run.id).getByText(/^started .+ ago$/), `${run.id}, shipped, is drawn finished — on the floor because a run in flight waits on it`);
    }
    for (const run of [cancelled, orphan]) {
      await expectCount(cardOf(page, run.id), 0, `${run.id} is not on the floor by default: ${orphan.id} waits on a run called off, and nothing of either moves`);
    }
    // Counted, not seen: an edge whose ends are level is a path with no height, which Playwright takes for hidden.
    for (const [from, to, state] of [[top, shipped, 'done'], [top, running, 'done'], [shipped, bottom, 'to-come'], [running, bottom, 'to-come']] as const) {
      await expectCount(
        edgeOf(page, from.id, to.id).locator(`.react-flow__edge-path[data-state="${state}"]`),
        1,
        `an edge from ${from.id} into ${to.id}, ${state === 'done' ? 'solid: that run has started' : 'dashed: that run waits'}`,
      );
    }
    await expectCount(page.locator('.react-flow__edge[data-id^="after:"]'), 4, 'the four edges of the diamond, and no other edge between cards');
    await expectDiamond(page, 'on the default floor');
    // What each card waits on, in `wf ls`'s word: the bottom on the side still running alone, and not on you.
    await expectVisible(
      cardOf(page, bottom.id).locator('[data-waiting="on-runs"]', { hasText: DIAMOND.words.bottom }),
      `the bottom's card says ${DIAMOND.words.bottom}: the side that shipped is waited on no more`,
    );
    await expectCount(cardOf(page, bottom.id).getByText('waiting on you', { exact: true }), 0, 'and does not wait on you: the side it waits on may still ship');
    // Its root's chip, beside the step's name, is cut short in the card; the name is not, and neither leaves the card.
    await expectUncut(cardOf(page, bottom.id).locator('ul[aria-label="Steps"] li > span:first-child'), "the bottom card's step name is whole beside its root's waiting on chip");
    await expectInside(cardOf(page, bottom.id).locator('ul[aria-label="Steps"] [data-state="waiting"]'), cardOf(page, bottom.id), "and the chip stays inside the card");
    for (const run of [top, shipped, running]) await expectCount(cardOf(page, run.id).locator('[data-waiting]'), 0, `${run.id} waits on no run`);
    await expectCount(page.locator('.react-flow__panel[aria-label="Legend"] [data-sample="cards"]'), 1, "the Factory's legend draws the edge between two cards");
    // Photographed as a person first finds it: the page's own photograph is taken at the end, after a graph unfolded over the diamond.
    await settled(page);
    await page.screenshot({ path: path.join(OUT, `factory-diamond-${await themeOf(page)}.png`), fullPage: true });

    // A card dragged takes along the cards that wait on it, directly or through others — what the edges put to its right — and
    // leaves what it waits on, and the rest of the floor. The diamond's top takes both sides and the bottom, up and to the right.
    await expectMovedWith(cardsOf(page, shipped.id, running.id, bottom.id), cardOf(page, top.id),
      () => dragBy(page, cardOf(page, top.id).locator('time'), { x: 40, y: -40 }, `the card of ${top.id}`),
      `${top.id} dragged takes ${shipped.id}, ${running.id} and ${bottom.id}, which wait on it, along — and the cards beside the diamond stay`,
      cardsOf(page, NEIGHBOUR.id, HELD.id));
    await expectDiamond(page, 'dragged by its top');
    // A side takes the bottom, which waits on it, and leaves the top, which it waits on, and the other side.
    await expectMovedWith(cardOf(page, bottom.id), cardOf(page, running.id),
      () => dragBy(page, cardOf(page, running.id).locator('time'), { x: 60, y: 30 }, `the card of ${running.id}`),
      `${running.id} dragged takes ${bottom.id}, which waits on it, along — and ${top.id}, which it waits on, and ${shipped.id} stay`,
      cardsOf(page, top.id, shipped.id, NEIGHBOUR.id, HELD.id));
    await expectDiamond(page, 'with one side dragged');
    await expectCount(page.locator('.react-flow__node[data-id*="/"]'), 0, 'a drop is not a click: no card opened');
    // Photographed with the whole floor in view: the two drags carry the bottom past the screen's edge.
    await page.getByRole('button', { name: 'Fit view' }).click();
    await settled(page);
    await page.screenshot({ path: path.join(OUT, `factory-cards-dragged-${await themeOf(page)}.png`), fullPage: true });
    // Kept in this browser, the cards taken along as the card dragged: the next visit finds the bottom where it was put down.
    const putDown = await placeOf(cardOf(page, bottom.id));
    await nextVisit(page, async (again) => {
      await expectVisible(cardOf(again, bottom.id), `${bottom.id} is on the floor on the next visit`);
      await settled(again);
      const kept = await placeOf(cardOf(again, bottom.id));
      if (!samePlace(kept, putDown)) throw new Refused(`the next visit finds ${bottom.id} where its side's drag put it down, ${said(putDown)} — it is at ${said(kept)}`);
    });

    // The fake run stopped at a refused check, and at a step signed off blocked: finished, not in flight.
    // Its followers read `waiting`, and will for ever; they do not keep it on the floor.
    await expectCount(card, 0, `a run whose check refused is finished, not in flight: no card on the floor by default (${FAKE.id})`);
    // So is the loop out of rounds: it waits on a person, and nothing of it moves.
    // In flight: NEIGHBOUR, HELD, the diamond's running side and its bottom. To decide: ENDING and UNMERGED. Waiting on you: FAKE,
    // LOOPING, COSTLY, GATED, ENDING and the run waiting on one called off.
    await expectVisible(
      page.getByText('4 in flight · 11 finished · 2 to decide · 6 waiting on you'),
      'the Factory counts the runs in flight, the finished, those nobody has decided, and those waiting on you',
    );
    // A run at its gate is finished too: nothing of it moves until a person approves its step.
    await expectCount(cardOf(page, GATED.id), 0, `a run waiting at its gate is not in flight: no card on the floor by default (${GATED.id})`);

    // A run nobody has decided is finished too — and its card is on the floor all the same, until it is decided: at its ending's gate,
    // in the folder's own words with the command that approves it; or with a branch nobody merged, which git ends.
    const ending = cardOf(page, ENDING.id);
    await expectVisible(ending, `a run at its ending's gate keeps its card on the floor with no Show finished (${ENDING.id})`);
    // What approving does and where a send-back goes, in a row; the line whole, and the folder's own words for the ending, on hover.
    await expectVisible(
      ending.locator(`[data-to-decide="approve"][data-gate-line="${ENDING.ending}"][title^="approve to run ${ENDING.ending} on main"][title$="${ENDING.says} — wf approve ${ENDING.id} ${ENDING.ending}"]`, { hasText: `approve to run ${ENDING.ending} on main, or send ${ENDING.back} back` }),
      `its card says what approving its ending does and where a send-back goes, the folder's words on hover`,
    );
    await expectVisible(ending.getByRole('button', { name: 'Approve', exact: true }), 'and answers it on the card: Approve');
    await expectVisible(ending.getByRole('button', { name: 'Send back…', exact: true }), 'and Send back…');
    await expectVisible(ending.getByText('to decide', { exact: true }), 'and is marked to decide');
    await expectVisible(ending.locator(`[data-state="awaiting-approval"]`, { hasText: 'awaiting approval' }), `and shows ${ENDING.ending} as awaiting approval`);
    await expectCount(
      ending.locator(`[data-need="approve"][data-step="${ENDING.ending}"]`),
      0,
      'and does not ask for the same step twice: the gate line names it',
    );
    const unmerged = cardOf(page, UNMERGED.id);
    await expectVisible(unmerged, `a finished run whose branch nobody merged keeps its card on the floor too (${UNMERGED.id})`);
    await expectVisible(unmerged.locator('[data-to-decide="git"]', { hasText: 'decide its result: a branch ahead of the base that nothing merges' }), 'its card says the branch is ahead, a link to where it is decided');
    await expectVisible(unmerged.locator(`p[title="${UNMERGED.said}"]`), "and wf ls's words, the branch and the command, on hover");
    await expectCount(unmerged.getByText('waiting on you', { exact: true }), 0, 'and it waits on nobody: every step of it finished');
    // Decided: its ending merged the branch, so there is nothing to decide and its card is off the floor with the finished.
    await expectCount(cardOf(page, SHIPPED.id), 0, `a run whose ending merged it is decided: no card on the floor by default (${SHIPPED.id})`);
    await settled(page);
    await page.screenshot({ path: path.join(OUT, `factory-to-decide-${await themeOf(page)}.png`), fullPage: true });

    await showFinished(page);
    await expectVisible(cardOf(page, SHIPPED.id), `the shipped run's card, once finished runs are shown (${SHIPPED.id})`);
    await expectCount(cardOf(page, SHIPPED.id).locator('[data-to-decide]'), 0, 'and it says nothing to decide');
    // The run called off, and the one that waits on it: for ever, so on you, and its card names the run it waits on and why.
    await expectVisible(
      cardOf(page, orphan.id).locator('[data-waiting="on-you"]', { hasText: DIAMOND.words.orphan }),
      `${orphan.id}'s card says ${DIAMOND.words.orphan}, amber`,
    );
    await expectVisible(cardOf(page, orphan.id).getByText('waiting on you', { exact: true }), `${orphan.id} waits on you`);
    await expectCount(edgeOf(page, cancelled.id, orphan.id).locator('.react-flow__edge-path[data-state="to-come"]'), 1, `a dashed edge from ${cancelled.id} into ${orphan.id}`);
    await settled(page);
    await expectLeftOf(cardOf(page, cancelled.id), cardOf(page, orphan.id), `${cancelled.id} is left of ${orphan.id}, which waits on it`);
    await expectVisible(
      page.locator(`.react-flow__node[data-id="${LOOPING.id}"] [data-state="exhausted"][title$="${LOOPING.notes.review}"]`, { hasText: 'rounds exhausted' }),
      `the loop's card shows ${LOOPING.exhausted} out of rounds as an amber chip, its note after what that means on hover (${LOOPING.id})`,
    );
    await expectVisible(card, `the fake run's card, once finished runs are shown (${FAKE.id})`);
    await expectVisible(card.getByText(/^started .+ ago$/), 'the card reads finished: when it started, not a clock still counting');
    // What a run cost, beside its age, once its harness priced a session of it — and nothing for a run nobody priced, which is not $0.
    await expectVisible(
      cardOf(page, COSTLY.id).locator('[data-cost]', { hasText: `· ${COSTLY.cost}` }),
      `the card of a run whose sessions were priced says what it cost beside its age (${COSTLY.cost})`,
    );
    await expectCount(card.locator('[data-cost]'), 0, "the fake run's card says no cost: none of its sessions was priced");
    // A run at its gate: its card says what is asked of you, in wf ls's words, and its step's chip is amber.
    const gated = cardOf(page, GATED.id);
    await expectVisible(
      gated.locator(`[data-gate-line="${GATED.gated}"]`, { hasText: `approve what ${GATED.gated} handed on, or send it back` }),
      `the card of a run at its gate says what approving ${GATED.gated} does (${GATED.id})`,
    );
    await expectVisible(gated.getByRole('button', { name: 'Approve', exact: true }), 'and answers it on the card');
    await expectVisible(gated.locator('[data-state="awaiting-approval"]', { hasText: 'awaiting approval' }), 'and shows the step as awaiting approval, an amber chip');
    await expectVisible(gated.getByText('waiting on you', { exact: true }), 'and waits on you');
    await expectVisible(card.getByText(FAKE.title), `the card says what was asked (${FAKE.title})`);
    await expectVisible(
      card.locator(`[data-need="asks"][data-step="${FAKE.blocked}"]`, { hasText: `${FAKE.blocked} asks: ${SESSION.closeout.needs}` }),
      `the card says what ${FAKE.blocked}, signed off blocked, asks (${SESSION.closeout.needs})`,
    );
    await expectVisible(card.locator(`a[href="/runs/${FAKE.id}"]`), "the card's title links to the run's page");
    await expectVisible(card.locator('[data-state="failed-check"]', { hasText: 'failed ✗ check (exit 1)' }), `the card shows ${FAKE.refused}'s refused check as a red chip`);

    // Laid out again, oldest first: the fake run's card in the first cell, and the other run's in the cell beside it.
    await page.getByRole('button', { name: 'Reset layout' }).click();
    await settled(page);
    await expectInside(card, floor, 'the card is on the floor');
    await expectCount(steps, 0, 'a closed card draws no step');
    // And no card reaches over the card beneath it: the grid puts that one a cell's height below, so a card drawn taller than its cell —
    // four steps and a line of what one of them asks is the tall card here — would be over it on every layout.
    await expectClearOfEachOther(page);
    // Photographed with the whole floor in view: every run there is, cards only, as the grid lays them out. No other picture has this one,
    // and the tall cards are finished runs, off the floor until they are asked for.
    await page.getByRole('button', { name: 'Fit view' }).click();
    await settled(page);
    await page.screenshot({ path: path.join(OUT, `factory-laid-out-${await themeOf(page)}.png`), fullPage: true });

    // A click on the card, away from its title's link, unfolds the run's graph beside it — over the cell
    // the other run's card is in, which moves aside.
    await card.locator('time').click();
    await expectCount(steps, FAKE.steps.length, `the card opens into a node per step (${FAKE.steps.join(', ')})`);
    await expectVisible(card.getByText(FAKE.touched, { exact: true }), `the open card of a run waiting on you says what its branch touched (${FAKE.touched})`);
    for (const name of FAKE.steps) await expectVisible(step(name), `the open run draws ${name}`);
    await expectVisible(step(FAKE.blocked).getByText('waiting on you'), `${FAKE.blocked} is drawn as a human gate on the Factory`);
    await expectVisible(step(FAKE.blocked).locator('[data-need="asks"]', { hasText: `asks: ${SESSION.closeout.needs}` }), `${FAKE.blocked}'s node on the Factory says what it asks`);
    await expectVisible(
      step(FAKE.refused).locator('[data-state="failed-check"]', { hasText: 'failed ✗ check (exit 1)' }),
      `${FAKE.refused}, whose check refused, has a red chip`,
    );
    await expectVisible(
      step(FAKE.unverified).locator('[data-state="unverified"]', { hasText: 'unverified · done' }),
      `${FAKE.unverified}, signed off with no check, is marked unverified, not done`,
    );
    for (const first of FAKE.first) {
      await expectCount(page.locator(`.react-flow__edge[data-id="${FAKE.id}/->${first}"]`), 1, `one dashed edge from the card into ${first}`);
    }
    await expectCount(page.locator(`.react-flow__edge[data-id^="${FAKE.id}/"]`), FAKE.edges + FAKE.first.length, "the run's edges, and the card's into each first step");
    await expectCount(page.locator('.react-flow__edge'), FAKE.edges + FAKE.first.length + 5, 'and beside them only the five edges between cards');
    await expectCount(
      page.locator(`.react-flow__edge[data-id^="${FAKE.id}/"] animateMotion`),
      0,
      `no dot travels the fake run's edges: nothing moves into ${FAKE.blocked}, a human gate, nor into ${FAKE.refused}, whose check refused`,
    );
    await expectVisible(card.getByRole('button', { name: 'Hide steps' }), "the open card's chevron hides the steps");
    await expectApart(beside, run, 'the card beside it moves out from under the unfolded graph');
    // The graph unfolds over some of the diamond's cards and not others: they move aside together, and still read as a diamond.
    await expectDiamond(page, "with the fake run's graph unfolded over the diamond");
    for (const card of DIAMOND_RUNS) await expectApart(cardOf(page, card.id), run, `${card.id} moves out from under the unfolded graph`);
    await settled(page);
    await expectInside(run, floor, 'the open run, card and steps, is brought onto the screen');

    // Remembered in this browser: the next visit finds the run open.
    await nextVisit(page, async (again) => {
      // Finished runs are shown by asking, on every visit; which runs are open is what this browser kept.
      await showFinished(again);
      await expectCount(onTheFloor(again).steps, FAKE.steps.length, 'the run is still open on the next visit');
    });

    // Collapse all folds it away, and the chevron opens it again.
    await page.getByRole('button', { name: 'Collapse all' }).click();
    await expectCount(steps, 0, 'Collapse all folds the graph away');
    await card.getByRole('button', { name: 'Show steps' }).click();
    await expectCount(steps, FAKE.steps.length, "the card's chevron unfolds it again");

    // Dragged, the card takes its steps with it. Dropped on the other run's card, it stays where it landed,
    // and the card under it moves aside on the drop — not on whatever changes the floor next.
    await settled(page);
    const [from, onto, grip] = [await card.boundingBox(), await beside.boundingBox(), await card.locator('time').boundingBox()];
    if (!from || !onto || !grip) throw new Refused("the cards to drag and drop onto — one of them is not on the page");
    await expectMovedWith(steps, card, async () => {
      const [x, y] = [grip.x + grip.width / 2, grip.y + grip.height / 2];
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + onto.x - from.x, y + onto.y - from.y, { steps: 12 });
      await page.mouse.up();
    }, "the open run's steps move with its card when it is dragged");
    await expectCount(steps, FAKE.steps.length, 'a drop is not a click: the run is still open');
    await expectApart(beside, run, 'the card the open run was dropped on moves out from under it');

    // A step is draggable too. Dragged, it takes along the steps that wait on it — the graph to its right — and leaves the
    // steps it waits on, the other lane and the card where they are: implement's drag moves review and respond, and not
    // tokens, theme or the card.
    await settled(page);
    const laidOut = await besideCard(step(FAKE.drag.along[0]), card);
    const along = page.locator(FAKE.drag.along.map((name) => `.react-flow__node[data-id="${FAKE.id}/${name}"]`).join(', '));
    const staying = page.locator([`.react-flow__node[data-id="${FAKE.id}"]`, ...FAKE.drag.stays.map((name) => `.react-flow__node[data-id="${FAKE.id}/${name}"]`)].join(', '));
    // Half a column right and two rows down, in the layering's units (150 each): its lane lands clear under the other, and the
    // run's cells grow by a row, over whatever card is beneath.
    await expectMovedWith(along, step(FAKE.blocked), () => dragBy(page, step(FAKE.blocked).getByTitle(FAKE.blocked), { x: 75, y: 300 }, `the step ${FAKE.blocked}`),
      `${FAKE.blocked} dragged takes ${FAKE.drag.along.join(' and ')}, which wait on it, along — and ${FAKE.drag.stays.join(', ')} and the card stay`, staying);
    await expectCount(page.locator('aside[aria-label^="Step "]'), 0, 'a drop is not a click: no inspector opens');
    const droppedAt = await besideCard(step(FAKE.drag.along[0]), card);
    if (samePlace(droppedAt, laidOut)) throw new Refused(`${FAKE.drag.along[0]} is dragged from where the layering put it — still at ${said(laidOut)} beside its card`);
    // Dropped, the run claims the cells its steps now reach, and a card under them moves aside — on the drop, as for a card dragged.
    await expectApart(page.locator(`.react-flow__node[data-id]:not([data-id^="${FAKE.id}"])`), run, 'no card is left under the steps where they were dropped: the run claims the cells they reach');
    // Photographed with the whole floor in view: what a person sees once they have arranged a run's steps.
    await page.getByRole('button', { name: 'Fit view' }).click();
    await settled(page);
    await page.screenshot({ path: path.join(OUT, `factory-dragged-${await themeOf(page)}.png`), fullPage: true });
    // Kept in this browser, with the arrangement: the next visit finds the steps where they were dropped.
    await nextVisit(page, async (again) => {
      const next = onTheFloor(again);
      await showFinished(again);
      await expectCount(next.steps, FAKE.steps.length, 'the run is open on the next visit');
      await settled(again);
      const kept = await besideCard(next.step(FAKE.drag.along[0]), next.card);
      if (!samePlace(kept, droppedAt)) throw new Refused(`the next visit finds ${FAKE.drag.along[0]} where it was dropped, ${said(droppedAt)} beside its card — it is at ${said(kept)}`);
    });

    // Reset layout closes every run as it lays the floor out again, here and on the next visit.
    await page.getByRole('button', { name: 'Reset layout' }).click();
    await expectCount(steps, 0, 'Reset layout folds the graph away');
    await expectVisible(card.getByRole('button', { name: 'Show steps' }), "after a reset the card's chevron shows the steps");
    await nextVisit(page, async (again) => {
      const next = onTheFloor(again);
      await showFinished(again);
      // The chevron reads the open runs this browser kept as the page mounts, before any step is read.
      await expectVisible(next.card.getByRole('button', { name: 'Show steps' }), 'the next visit after a reset finds the run closed');
      await expectCount(next.steps, 0, 'the next visit after a reset draws no step');
    });

    // Open again; a click on a step opens its inspector beside the floor, the run's title above the step's name.
    await card.getByRole('button', { name: 'Show steps' }).click();
    await expectCount(steps, FAKE.steps.length, 'the chevron unfolds the run again after a reset');
    await expectApart(beside, run, 'the card beside it moves aside again');
    // Reset layout put the steps back where the layering does, and forgot the drag with the arrangement.
    await settled(page);
    const afterReset = await besideCard(step(FAKE.drag.along[0]), card);
    if (!samePlace(afterReset, laidOut)) throw new Refused(`after Reset layout ${FAKE.drag.along[0]} is back where the layering put it, ${said(laidOut)} beside its card — it is at ${said(afterReset)}`);
    await step('review').click();
    const inspector = page.locator('aside[aria-label="Step review"]');
    await expectVisible(inspector, 'the step inspector opens on a click on review');
    // Beside the inspector, the queue's lane gives the floor its width back; the header still counts the queue.
    await expectCount(page.locator('aside[aria-label="Queued cards"]'), 0, "the queue's lane is off while a step's inspector is open beside the floor");
    await expectTexts(page.locator('[data-cap]'), [`${IN_FLIGHT_BY_CAP} of ${QUEUE.cap} run slots taken · ${QUEUED.length} queued`], 'and the header still counts the queue');
    await expectVisible(inspector.getByText(FAKE.title), 'the inspector names the run the step is in');
    // The floor narrows for the inspector and brings the run back into view; judged once it has.
    await settled(page);
    await expectInside(run, floor, 'the run is on the floor beside the open inspector');

    // The step whose check refused: its Details say what the check ran, what it exited with, and how its output ended.
    await step(FAKE.refused).click();
    const check = page.locator(`aside[aria-label="Step ${FAKE.refused}"] section[aria-label="Check"]`);
    await expectVisible(check.getByText(FAKE.check, { exact: true }), `the inspector of ${FAKE.refused} shows its check's command (${FAKE.check})`);
    await expectVisible(check.getByText('exit 1', { exact: true }), `the inspector of ${FAKE.refused} shows what its check exited with`);
    await expectVisible(check.getByText(FAKE.said), `the inspector of ${FAKE.refused} shows the last lines of its check's output`);
    await settled(page);
    await expectInside(run, floor, `the run is on the floor beside ${FAKE.refused}'s inspector`);
    // Closed, the queue's lane is back beside the floor.
    await page.getByRole('button', { name: "Close the step's panel" }).click();
    await expectCount(page.locator(`aside[aria-label="Step ${FAKE.refused}"]`), 0, "the step's panel closes");
    await expectCount(ghosts, QUEUED.length, "and the queue's lane is back beside the floor");

    // The run beside it opened too: a dot travels the one edge into a step at work, and no other edge on the floor moves.
    await beside.locator('time').click();
    const moving = page.locator(`.react-flow__edge[data-id="${NEIGHBOUR.id}/${NEIGHBOUR.running}"]`);
    await expectCount(moving.locator('.react-flow__edge-path[data-state="running"]'), 1, `the edge ${NEIGHBOUR.running} on the Factory runs: draft's session is at work`);
    await expectCount(moving.locator('animateMotion'), 1, `a dot travels ${NEIGHBOUR.running} on the Factory`);
    await expectCount(page.locator('.react-flow__edge animateMotion'), 1, 'and no other edge on the floor moves');
    await expectCount(page.locator('.react-flow__panel[aria-label="Legend"] animateMotion'), 1, "the Factory's legend shows the running edge moving as it moves");
    // Another graph unfolded, over whichever of the diamond's cards it reaches: still a diamond, and the run called off still left of the run waiting on it.
    await expectDiamond(page, "with the run beside it unfolded too");
    await expectLeftOf(cardOf(page, DIAMOND.cancelled.id), cardOf(page, DIAMOND.orphan.id), `${DIAMOND.cancelled.id} is still left of ${DIAMOND.orphan.id}`);
    await settled(page);
  },
} satisfies PageSpec;

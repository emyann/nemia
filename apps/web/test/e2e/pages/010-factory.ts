import path from 'node:path';
import type { Page } from 'playwright';
import { nextVisit, PLACES_SAID, sidebar, themeOf } from '../board.ts';
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
  refusedWhy,
  SESSION,
  SHIPPED,
  UNMERGED,
} from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The diamond's cards laid out as a diamond: every run left of each run that waits on it, and its top and bottom level with the middle of its sides. */
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
      throw new Refused(
        `the ghosts are in the queue's order — ${QUEUED.map((c) => c.name).join(', ')} — and they were drawn ${drawn.join(', ')}`,
      );
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
      if (href !== `/inbox/${card.name}`)
        throw new Refused(`${card.name}'s ghost opens the card's page (/inbox/${card.name}) — it links to ${href}`);
      await expectCount(
        ghost.locator('[data-ghost-tried]'),
        card === QUEUE.refused ? 1 : 0,
        card === QUEUE.refused ? 'the refused card is marked' : 'no try is marked on a card the tick has not tried',
      );
    }
    await expectTexts(
      lane.locator(`a[data-ghost="${QUEUE.refused.name}"] [data-ghost-tried="refused"]`),
      [`not started, refused: ${refusedWhy(store!, checkout)}`],
      "the refused card's ghost says why, in the package's words",
    );
    await expectCount(
      page.locator(QUEUED.map((c) => `.react-flow__node[data-id="${c.name}"]`).join(', ')),
      0,
      'no ghost is a node on the floor: nothing waits on a queued card',
    );
    await expectLeftOf(ghosts, floor, "the ghosts wait at the floor's left edge");
    await expectTexts(
      page.locator('[data-cap]'),
      [`${IN_FLIGHT_BY_CAP} of ${QUEUE.cap} run slots taken · ${QUEUED.length} queued · ${PASS.line}`],
      `the header says the run slots taken of the cap the daemon last ran with (WF_MAX_RUNS=${QUEUE.cap}), and how many are queued — in slots, not beside the floor's 4 in flight as a second count of runs in flight — and what the daemon's last pass took`,
    );
    // What the last pass cost, whole, on hover: the pass's totals, each phase in the package's order, the harness observed, and what measuring took.
    const pass = page.locator('[data-cap] [data-pass]');
    await expectTexts(pass, [`· ${PASS.line}`], 'the pass is said beside the cap');
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
      phasesSaid !== 'records asks journals observe runtime git assess act' ||
      passLines[4] !== 'observe: 120 ms, 1 call, 0 B read, 1 process started'
    ) {
      throw new Refused(
        `the pass's title says each phase in the package's order, observe's 120 ms among them — it says ${JSON.stringify(passLines.slice(1, 9))}`,
      );
    }
    if (
      !passLines.includes('claude: 1 observe, 118 ms, 3 sessions or run files listed, 1 process started') ||
      passLines.at(-1) !== 'Measuring it took 0.40 ms. wf up --stats says the same.'
    ) {
      throw new Refused(`the pass's title names the harness observed and what measuring took — it says ${JSON.stringify(passTitle)}`);
    }
    const { card, pills, tiles, pill, tile } = onTheFloor(page);
    const beside = page.locator(`.react-flow__node[data-id="${NEIGHBOUR.id}"]`);
    // The review's case: a run `assess` calls failed, with a session of it still running, is in flight.
    await expectVisible(
      beside,
      `a failed run whose session still runs is in flight: its card is on the Factory by default (${NEIGHBOUR.id})`,
    );
    await expectVisible(beside.getByText(/since it started$/), 'its card counts the time since it started, as a card in flight does');
    // A run whose session the harness blocked is in flight too: its card names the harness and what it waits for, which the list carries.
    // What the session said last is on the run's page, which reads it: the list reads no conversation.
    await expectVisible(
      page.locator(`.react-flow__node[data-id="${HELD.id}"] [data-need="harness"][data-step="${HELD.blocked}"]`, {
        hasText: new RegExp(`^${HELD.blocked} is blocked by the harness: ${HELD.wait}$`),
      }),
      `the card of a run whose session the harness blocked says so, and what the harness waits for — not needs-human alone (${HELD.id})`,
    );
    await settled(page);
    // As a person first finds it: every card on the fitted floor can be read and pressed, none under the legend or the buttons.
    await expectClearOfPanels(page, 'on first load');

    // The diamond, drawn as a graph of cards: an edge from each run a card waits on into it, parents left of children, and the two
    // sides level about the middle. Its top and its shipped side are finished, and on the floor all the same: a run in flight waits on each.
    const { top, shipped, running, bottom, cancelled, orphan } = DIAMOND;
    for (const run of [top, shipped, running, bottom])
      await expectVisible(cardOf(page, run.id), `the diamond's card ${run.id} is on the floor by default`);
    for (const run of [top, shipped]) {
      await expectVisible(
        cardOf(page, run.id).getByText(/^started .+ ago$/),
        `${run.id}, shipped, is drawn finished — on the floor because a run in flight waits on it`,
      );
    }
    // The run called off moves no more and waits on nobody: off the floor. The run waiting on it will wait for ever without a person, so
    // it waits on you, and its card stays on the floor though nothing of it moves.
    await expectCount(cardOf(page, cancelled.id), 0, `${cancelled.id} is not on the floor by default: called off, it waits on nobody`);
    await expectVisible(cardOf(page, orphan.id), `${orphan.id} is on the floor by default: it waits on a run called off, so on a person`);
    // Counted, not seen: an edge whose ends are level is a path with no height, which Playwright takes for hidden.
    for (const [from, to, state] of [
      [top, shipped, 'done'],
      [top, running, 'done'],
      [shipped, bottom, 'to-come'],
      [running, bottom, 'to-come'],
    ] as const) {
      await expectCount(
        edgeOf(page, from.id, to.id).locator(`.react-flow__edge-path[data-state="${state}"]`),
        1,
        `an edge from ${from.id} into ${to.id}, ${state === 'done' ? 'solid: that run has started' : 'dashed: that run waits'}`,
      );
    }
    await expectCount(
      page.locator('.react-flow__edge[data-id^="after:"]'),
      4,
      'the four edges of the diamond, and no other edge between cards',
    );
    await expectDiamond(page, 'on the default floor');
    // What each card waits on, in `wf ls`'s word: the bottom on the side still running alone, and not on you.
    await expectVisible(
      cardOf(page, bottom.id).locator('[data-waiting="on-runs"]', { hasText: DIAMOND.words.bottom }),
      `the bottom's card says ${DIAMOND.words.bottom}: the side that shipped is waited on no more`,
    );
    await expectCount(
      cardOf(page, bottom.id).getByText('waiting on you', { exact: true }),
      0,
      'and does not wait on you: the side it waits on may still ship',
    );
    // Its steps, at rest, a rail of pills that waits: each pill inside the card, what it waits on whole on hover.
    await expectVisible(
      cardOf(page, bottom.id).locator('ul[aria-label="Steps"] [data-step][data-state="waiting"]'),
      "the bottom card's rail draws its step waiting",
    );
    await expectInside(
      cardOf(page, bottom.id).locator('ul[aria-label="Steps"] [data-step]'),
      cardOf(page, bottom.id),
      'and the rail stays inside the card',
    );
    for (const run of [top, shipped, running])
      await expectCount(cardOf(page, run.id).locator('[data-waiting]'), 0, `${run.id} waits on no run`);
    // How long each has been at work, counted from when it started: the running side waited a minute on the top, created and nothing of
    // it filed, and that minute is on hover, not in its time at work. The bottom and the orphan have not started: they say they wait.
    await expectVisible(
      cardOf(page, running.id).locator(`time[title*="${DIAMOND.words.running}"]`, { hasText: /^\d+m \d{2}s since it started$/ }),
      `${running.id}'s card counts its time at work from its first filing, and says on hover that it ${DIAMOND.words.running}`,
    );
    // Counted from the instant the api says it started, its first filing, and not from its creation a minute before.
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
    // Photographed as a person first finds it: the page's own photograph is taken at the end, after a graph unfolded over the diamond.
    await settled(page);
    await page.screenshot({ path: path.join(OUT, `factory-diamond-${await themeOf(page)}.png`), fullPage: true });

    // Each card moves alone, as in a modeller: a card dragged moves that card, and nothing else on the floor — not the cards that wait on
    // it, which the edges put to its right, nor the ones it waits on. The edges between them stretch, and pull nothing. The diamond's top,
    // dragged up and to the right, leaves both sides and the bottom where they are.
    const everyOther = (...ids: string[]) =>
      page.locator(`.react-flow__node[data-id]${ids.map((id) => `:not([data-id="${id}"])`).join('')}`);
    await expectMovedAlone(
      cardOf(page, top.id),
      () => dragBy(page, cardOf(page, top.id).locator('time'), { x: 40, y: -40 }, `the card of ${top.id}`),
      `${top.id} dragged moves alone — ${shipped.id}, ${running.id} and ${bottom.id}, which wait on it, stay, and so does every other card`,
      everyOther(top.id),
    );
    // A side leaves the bottom, which waits on it, the top, which it waits on, and the other side.
    await expectMovedAlone(
      cardOf(page, running.id),
      () => dragBy(page, cardOf(page, running.id).locator('time'), { x: 60, y: 30 }, `the card of ${running.id}`),
      `${running.id} dragged moves alone — ${bottom.id}, which waits on it, stays, and so do ${top.id}, which it waits on, and ${shipped.id}`,
      everyOther(running.id),
    );
    await expectCount(
      page.locator('.react-flow__edge[data-id^="after:"]'),
      4,
      "the diamond's four edges are still drawn: they stretch to the cards where they now are",
    );
    await expectCount(page.locator('[data-tile]'), 0, 'a drop is not a click: no card opened');
    await page.getByRole('button', { name: 'Fit view' }).click();
    await settled(page);
    await page.screenshot({ path: path.join(OUT, `factory-cards-dragged-${await themeOf(page)}.png`), fullPage: true });
    // Kept in this browser: the next visit finds the side where it was put down, and the bottom where it was before either drag.
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

    // The fake run stopped at a refused check, and at a step signed off blocked: finished, not in flight. Its followers read `waiting`, and
    // will for ever — but the blocked step asks a person something, so the run waits on you, and its card stays on the floor until answered.
    await expectVisible(card, `a run with a step signed off blocked waits on a person: its card is on the floor by default (${FAKE.id})`);
    // So does the loop out of rounds: it waits on a person, and nothing of it moves.
    await expectVisible(
      cardOf(page, LOOPING.id),
      `a loop out of rounds waits on a person: its card is on the floor by default (${LOOPING.id})`,
    );
    // In flight: NEIGHBOUR, HELD, the diamond's running side and its bottom. To decide: ENDING and UNMERGED. Waiting on you: FAKE,
    // LOOPING, COSTLY, GATED, ENDING and the run waiting on one called off.
    await expectVisible(
      page.getByText('4 in flight · 12 finished · 2 to decide · 6 waiting on you'),
      'the Factory counts the runs in flight, the finished, those nobody has decided, and those waiting on you',
    );
    // A run at a gate in its middle: nothing of it moves until a person approves its step, and the api reads it failed, with nothing to
    // decide about its result — its card stays on the floor all the same, since it waits on a person.
    await expectVisible(
      cardOf(page, GATED.id),
      `a run held at its plan's gate waits on a person: its card is on the floor by default (${GATED.id})`,
    );

    // A run nobody has decided is finished too — and its card is on the floor all the same, until it is decided: at its ending's gate,
    // in the folder's own words with the command that approves it; or with a branch nobody merged, which git ends.
    const ending = cardOf(page, ENDING.id);
    await expectVisible(ending, `a run at its ending's gate keeps its card on the floor with no Show finished (${ENDING.id})`);
    // What approving does and where a send-back goes, in a row; the line whole, and the folder's own words for the ending, on hover.
    await expectVisible(
      ending.locator(
        `[data-to-decide="approve"][data-gate-line="${ENDING.ending}"][title^="approve to run ${ENDING.ending} on main"][title$="${ENDING.says} — wf approve ${ENDING.id} ${ENDING.ending}"]`,
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
      unmerged.locator('[data-to-decide="git"]', { hasText: 'decide its result: a branch ahead of the base that nothing merges' }),
      'its card says the branch is ahead, a link to where it is decided',
    );
    await expectVisible(unmerged.locator(`p[title="${UNMERGED.said}"]`), "and wf ls's words, the branch and the command, on hover");
    await expectCount(unmerged.getByText('waiting on you', { exact: true }), 0, 'and it waits on nobody: every step of it finished');
    // Decided: its ending merged the branch, so there is nothing to decide and its card is off the floor with the finished.
    await expectCount(
      cardOf(page, SHIPPED.id),
      0,
      `a run whose ending merged it is decided: no card on the floor by default (${SHIPPED.id})`,
    );
    await settled(page);
    await page.screenshot({ path: path.join(OUT, `factory-to-decide-${await themeOf(page)}.png`), fullPage: true });

    await showFinished(page);
    await expectVisible(cardOf(page, SHIPPED.id), `the shipped run's card, once finished runs are shown (${SHIPPED.id})`);
    await expectCount(cardOf(page, SHIPPED.id).locator('[data-to-decide]'), 0, 'and it says nothing to decide');
    // Pruned with its files (`wf prune --artifacts`): the card says so in its footer, and what went and what stayed on hover.
    await expectVisible(cardOf(page, SHIPPED.id).locator('[data-pruned]', { hasText: /^pruned$/ }), 'and it says it was pruned');
    const prunedSaid = await cardOf(page, SHIPPED.id).locator('[data-pruned]').getAttribute('title');
    if (
      !/^pruned at \S+ — its worktrees were removed \(wf prune\), and its files were removed at .* \(wf prune --artifacts\); its branches and record are kept$/.test(
        prunedSaid ?? '',
      )
    ) {
      throw new Refused(
        `the pruned mark says what went and what was kept on hover, as wf ls says it — its title is ${JSON.stringify(prunedSaid)}`,
      );
    }
    await expectCount(page.locator('[data-pruned]'), 1, 'and no other card says pruned: SHIPPED is the one run pruned');
    // A run with no repository says `folders` where a git run's card says its repository's name, and where its steps worked on hover. Not a
    // row of its own: a card drawn taller than its cell reaches over the card beneath it on every layout (`expectClearOfEachOther`), and the
    // path is on the run's page, copyable, for a person who wants to open it.
    const inFolders = cardOf(page, FOLDER.id).getByText('folders', { exact: true });
    await expectVisible(inFolders, `a folder run's card says folders, and names no repository (${FOLDER.id})`);
    const where = await inFolders.getAttribute('title');
    if (!new RegExp(String.raw`^Its steps work in folders under .+[\\/]runs[\\/]${FOLDER.id}[\\/]work$`).test(where ?? '')) {
      throw new Refused(
        `the card says where its steps work, on hover, ending in runs/${FOLDER.id}/work — it says ${JSON.stringify(where)}`,
      );
    }
    // The run called off, and the one that waits on it: for ever, so on you, and its card names the run it waits on and why.
    await expectVisible(
      cardOf(page, orphan.id).locator('[data-waiting="on-you"]', { hasText: DIAMOND.words.orphan }),
      `${orphan.id}'s card says ${DIAMOND.words.orphan}, amber`,
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
      `the loop's rail shows ${LOOPING.exhausted} out of rounds as an amber pill, its note after what that means on hover (${LOOPING.id})`,
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
    await expectVisible(
      gated.locator(`[data-step="${GATED.gated}"][data-state="awaiting-approval"][data-live]`),
      'and its rail shows the step as awaiting approval, an amber pill ringed as the step the run is at',
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
    // At rest, the card draws its steps as a rail: a pill a step, an arrow for each `after` between them, and no tile.
    await expectCount(pills, FAKE.steps.length, `a pill per step on the card at rest (${FAKE.steps.join(', ')})`);
    await expectCount(
      card.locator('ul[aria-label="Steps"]').locator('..').locator('[data-arrow]'),
      FAKE.edges,
      "an arrow between the pills for each `after` between the run's steps",
    );
    await expectCount(tiles, 0, 'and no tile: the card is closed');
    // A run with a session at work: a dot travels the rail's arrow into it, on the card at rest.
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

    // Laid out again, oldest first: the fake run's card in the first cell, and the other run's in the cell beside it.
    await page.getByRole('button', { name: 'Reset layout' }).click();
    await settled(page);
    await expectInside(card, floor, 'the card is on the floor');
    await expectCount(tiles, 0, 'a closed card draws no tile');
    // And no card reaches over another: the grid puts the one beneath a cell's height below, so a card drawn taller than its cell —
    // a rail and a line of what one of its steps asks is the tall card here — would be over it on every layout.
    await expectClearOfEachOther(page);
    // The fake run's card at rest, alone: what the closeout shows of a card with its rail.
    await photographCard(page, card, path.join(OUT, `factory-card-at-rest-${await themeOf(page)}.png`));
    // Photographed with the whole floor in view: every run there is, cards only, as the grid lays them out. No other picture has this one,
    // and the tall cards are finished runs, off the floor until they are asked for.
    await page.getByRole('button', { name: 'Fit view' }).click();
    await settled(page);
    await page.screenshot({ path: path.join(OUT, `factory-laid-out-${await themeOf(page)}.png`), fullPage: true });

    // A click on the card, away from its title's link, opens it on its steps: the card grows to its right, a tile a step, over the cell the
    // other run's card is in, which moves aside. The rail stays, beside the tiles, and nothing else is drawn on the floor for the run.
    const nodes = await page.locator('.react-flow__node').count();
    await card.locator('time').click();
    await expectCount(tiles, FAKE.steps.length, `the card opens into a tile per step (${FAKE.steps.join(', ')})`);
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
    // Its latest attempt, once the run's detail is read: the steps filed say how their try ended, the ones never filed say so.
    await expectVisible(
      tile('respond').getByText('not filed yet', { exact: true }),
      'respond, never filed, says so on its tile once the run is read',
    );
    const opened = card.locator(`section[aria-label="The run's steps"]`);
    await expectCount(opened.locator('[data-arrow]'), FAKE.edges, "an arrow between the tiles for each `after` between the run's steps");
    await expectCount(
      page.locator('.react-flow__edge'),
      5,
      'and on the floor only the five edges between cards: none from a card into a step',
    );
    await expectCount(
      opened.locator('animateMotion'),
      0,
      `no dot travels the fake run's arrows: nothing moves into ${FAKE.blocked}, a human gate, nor into ${FAKE.refused}, whose check refused`,
    );
    await expectVisible(card.getByRole('button', { name: 'Hide steps' }), "the open card's chevron hides the steps");
    await expectApart(beside, card, 'the card beside it moves out from under the open card');
    // The card opens over some of the diamond's cards and not others: they move aside together, and still read as a diamond.
    await expectDiamond(page, 'with the fake run open over the diamond');
    for (const one of DIAMOND_RUNS) await expectApart(cardOf(page, one.id), card, `${one.id} moves out from under the open card`);
    await expectClearOfEachOther(page);
    await settled(page);
    await expectInside(card, floor, 'the open card, its tiles and all, is brought onto the screen');
    await photographCard(page, card, path.join(OUT, `factory-card-open-${await themeOf(page)}.png`));

    // Remembered in this browser: the next visit finds the run open.
    await nextVisit(page, async (again) => {
      // Finished runs are shown by asking, on every visit; which runs are open is what this browser kept.
      await showFinished(again);
      await expectCount(onTheFloor(again).tiles, FAKE.steps.length, 'the run is still open on the next visit');
      await settled(again);
      await expectClearOfEachOther(again);
    });

    // Collapse all folds it away, and the chevron opens it again.
    await page.getByRole('button', { name: 'Collapse all' }).click();
    await expectCount(tiles, 0, 'Collapse all folds the tiles away');
    await expectCount(pills, FAKE.steps.length, 'and leaves the rail');
    await card.getByRole('button', { name: 'Show steps' }).click();
    await expectCount(tiles, FAKE.steps.length, "the card's chevron opens it again");

    // Dragged, the open card moves with its tiles, and no other card. Dropped on the other run's card, it stays where it landed, and so does
    // the card under it: a drop moves nothing aside, and two cards a person stacked stay stacked.
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
    await expectVisible(beside, 'the card the open run was dropped on is still on the floor, under it');
    // A drag that starts on a tile moves no card: the tile is a button, to press.
    const put = await placeOf(card);
    await dragBy(page, tile(FAKE.unverified), { x: 120, y: 80 }, `the tile of ${FAKE.unverified}`);
    await settled(page);
    const still = await placeOf(card);
    if (!samePlace(still, put))
      throw new Refused(`a drag started on a tile leaves its card where it is, ${said(put)} — it is at ${said(still)}`);
    await expectCount(tiles, FAKE.steps.length, 'and does not close the card');
    // Photographed with the whole floor in view: an open card a person has dragged over another.
    await page.getByRole('button', { name: 'Fit view' }).click();
    await settled(page);
    await page.screenshot({ path: path.join(OUT, `factory-dragged-${await themeOf(page)}.png`), fullPage: true });

    // Reset layout closes every run as it lays the floor out again, here and on the next visit.
    await page.getByRole('button', { name: 'Reset layout' }).click();
    await expectCount(tiles, 0, 'Reset layout closes the card');
    await expectVisible(card.getByRole('button', { name: 'Show steps' }), "after a reset the card's chevron shows the steps");
    await nextVisit(page, async (again) => {
      const next = onTheFloor(again);
      await showFinished(again);
      // The chevron reads the open runs this browser kept as the page mounts, before any step is read.
      await expectVisible(next.card.getByRole('button', { name: 'Show steps' }), 'the next visit after a reset finds the run closed');
      await expectCount(next.tiles, 0, 'the next visit after a reset draws no tile');
    });

    // Open again; a press on a tile opens its step's inspector beside the floor, the run's title above the step's name, and leaves the card open.
    await card.getByRole('button', { name: 'Show steps' }).click();
    await expectCount(tiles, FAKE.steps.length, 'the chevron opens the run again after a reset');
    await expectApart(beside, card, 'the card beside it moves aside again');
    await settled(page);
    await tile('review').click();
    const inspector = page.locator('aside[aria-label="Step review"]');
    await expectVisible(inspector, 'the step inspector opens on a press on review');
    await expectCount(tiles, FAKE.steps.length, 'a press on a tile does not close its card');
    await expectCount(card.locator('[data-tile][aria-pressed="true"]'), 1, 'and one tile reads pressed');
    await expectCount(tile('review').and(page.locator('[aria-pressed="true"]')), 1, "review's, the step inspected");
    // Beside the inspector, the queue's lane gives the floor its width back; the header still counts the queue.
    await expectCount(
      page.locator('aside[aria-label="Queued cards"]'),
      0,
      "the queue's lane is off while a step's inspector is open beside the floor",
    );
    await expectTexts(
      page.locator('[data-cap]'),
      [`${IN_FLIGHT_BY_CAP} of ${QUEUE.cap} run slots taken · ${QUEUED.length} queued · ${PASS.line}`],
      'and the header still counts the queue',
    );
    await expectVisible(inspector.getByText(FAKE.title), 'the inspector names the run the step is in');
    // The floor narrows for the inspector and brings the run back into view; judged once it has.
    await settled(page);
    await expectInside(card, floor, 'the open card is on the floor beside the open inspector');

    // The step whose check refused: its Details say what the check ran, what it exited with, and how its output ended.
    await tile(FAKE.refused).click();
    // Signed off, it opens on its Output; its check is under Details.
    await page.locator(`aside[aria-label="Step ${FAKE.refused}"]`).getByRole('tab', { name: 'Details' }).click();
    const check = page.locator(`aside[aria-label="Step ${FAKE.refused}"] section[aria-label="Check"]`);
    await expectVisible(
      check.getByText(FAKE.check, { exact: true }),
      `the inspector of ${FAKE.refused} shows its check's command (${FAKE.check})`,
    );
    await expectVisible(check.getByText('exit 1', { exact: true }), `the inspector of ${FAKE.refused} shows what its check exited with`);
    await expectVisible(check.getByText(FAKE.said), `the inspector of ${FAKE.refused} shows the last lines of its check's output`);
    await settled(page);
    await expectInside(card, floor, `the open card is on the floor beside ${FAKE.refused}'s inspector`);
    // Closed, the queue's lane is back beside the floor.
    await page.getByRole('button', { name: "Close the step's panel" }).click();
    await expectCount(page.locator(`aside[aria-label="Step ${FAKE.refused}"]`), 0, "the step's panel closes");
    await expectCount(ghosts, QUEUED.length, "and the queue's lane is back beside the floor");

    // The run beside it opened too: a dot travels the one arrow into a step at work, and nothing between the cards moves.
    await beside.locator('time').click();
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
    // Another card opened, over whichever of the diamond's cards it reaches: still a diamond, and the run called off still left of the run waiting on it.
    await expectDiamond(page, 'with the run beside it open too');
    await expectLeftOf(
      cardOf(page, DIAMOND.cancelled.id),
      cardOf(page, DIAMOND.orphan.id),
      `${DIAMOND.cancelled.id} is still left of ${DIAMOND.orphan.id}`,
    );

    // The loop out of rounds: at rest, its rail's arrow back says no round, which the pill's hover does; opened, the arrow back between its
    // tiles says the round the loop is on, as the run's page labels its edge.
    const looping = cardOf(page, LOOPING.id);
    const back = `[data-arrow="loop:step:${LOOPING.exhausted}->step:${LOOPING.target}"]`;
    await expectCount(
      looping.locator('ul[aria-label="Steps"]').locator('..').locator(back),
      1,
      `${LOOPING.id}'s rail draws the arrow back from ${LOOPING.exhausted} into ${LOOPING.target}`,
    );
    await expectCount(looping.locator('[data-round]'), 0, 'and says no round on the card at rest');
    await page.getByRole('button', { name: 'Fit view' }).click();
    await settled(page);
    await looping.locator('time').click();
    const loopOpen = looping.locator(`section[aria-label="The run's steps"]`);
    await expectCount(loopOpen.locator('[data-tile]'), LOOPING.steps.length, `${LOOPING.id} opens on its steps`);
    await expectTexts(
      loopOpen.locator(`${back} [data-round]`),
      [LOOPING.round],
      `the arrow back between its tiles says the loop is on ${LOOPING.round}`,
    );
    await settled(page);
    await photographCard(page, looping, path.join(OUT, `factory-loop-open-${await themeOf(page)}.png`));
  },
} satisfies PageSpec;

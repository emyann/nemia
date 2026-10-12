import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page, Response } from 'playwright';
import { photograph, PLACES_SAID, sidebar, themeOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import {
  CARDS,
  DIAMOND_RUNS,
  FACTORIES,
  hiringStarts,
  QUEUE,
  QUEUED,
  queuedCardText,
  refusedWhy,
  unfactoredWhy,
  WORKFLOWS,
} from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** A card on the Inbox page, by its name. */
const cardIn = (page: Page, name: string): Locator => page.locator(`section[aria-label="Cards"] li[data-card="${name}"]`);

/** The idea the `inbox` page files from its box, and takes back with Remove. */
const FILED = 'Give the inbox a keyboard shortcut\n\nN files a card from any page.';
/** The brief the `inbox` page starts CARDS.planned with, in place of its body. */
const STARTED = 'Cache the views between passes\n\nRead each journal once a pass; the api reads the same views.';
/** The run a record says CARDS.bare was started as, on the page that shows a card started already. */
const STARTED_AS = 'show-what-a-step-cost-on-the-e2e0';

/** The factory every start of this page is made in, picked in the Factory list of a card that names none. */
const FACTORY = FACTORIES.hiring.name;

/**
 * Open the start of the card `name`, which names no factory, on `p`, and pick FACTORY in its Factory list: no start form is drawn before
 * the pick. Returns the card.
 */
async function startIn(p: Page, name: string): Promise<Locator> {
  const item = cardIn(p, name);
  await item.getByRole('button', { name: 'Start' }).click();
  const pick = item.getByRole('combobox', { name: 'Factory' });
  await expectVisible(pick, `Start asks ${name}, which names no factory, for the factory it runs in`);
  await expectCount(item.locator(`form[aria-label="Start ${name}"]`), 0, 'and draws no start form before one is picked');
  await pick.selectOption(FACTORY);
  return item;
}

/**
 * A seeded card's text with `factory: FACTORY` as its frontmatter's last line: the card a queue leg queues, which the seed leaves with no
 * factory for the legs that start it.
 */
const inFactory = (text: string): string => text.replace('\n---\n', `\nfactory: ${FACTORY}\n---\n`);

/** Refuses unless `answered`, a start's answer, was sent to FACTORY on `repo`, in its query: no start of this page names no factory. */
function expectInFactory(answered: Response, repo: string): void {
  const sent = new URL(answered.url()).searchParams;
  if (sent.get('factory') !== FACTORY || sent.get('repo') !== repo)
    throw new Refused(`the start names the factory picked and its repository in its query — it was sent to ${answered.url()}`);
}

export default {
  /**
   * The inbox: the seeded cards, newest first, and the queue; a card filed from the box into a factory, queued, unqueued, then removed
   * with its Remove; a card's start form, in the factory picked for it, preset from the card. Each in a page of its own: a card started,
   * which opens its run's page; a start whose card cannot be removed; a card started already; a card about a repository the factory
   * picked does not work on; stray files and a folder; an empty inbox; and a start, a remove and a queue each refused behind the page's
   * back. Every start picks its factory first, and is sent with it (`expectInFactory`); the factory is made able to start its workflow
   * for the page (`hiringStarts`). Every write is taken back, so every page after this one, in either theme, reads the store as seeded.
   */
  name: 'inbox',
  route: '/inbox',
  expect: async (page) => {
    const unhire = hiringStarts(store!);
    try {
      await visit(page);
    } finally {
      unhire();
    }
  },
} satisfies PageSpec;

/** What the `inbox` page asserts, the factory already able to start its workflow. */
async function visit(page: Page): Promise<void> {
  {
    await sidebar(page);
    await expectVisible(
      page.locator('[data-sidebar="sidebar"] a[data-active="true"]', { hasText: 'Inbox' }),
      'the sidebar lights Inbox on its page',
    );
    const { planned, bare, rich } = CARDS;
    const inbox = path.join(store!, 'inbox');
    const checkout = path.join(store!, 'checkout');
    const runsDir = path.join(store!, 'runs');
    const listed = (p: Page) => p.locator('section[aria-label="Cards"] li[data-card]');
    const order = (p: Page) => listed(p).evaluateAll((items) => items.map((item) => item.getAttribute('data-card')));

    const queuedByFiling = [QUEUE.third, QUEUE.refused, QUEUE.first].map((c) => c.name);
    await expectCount(listed(page), 3 + QUEUED.length, `a card per file in the inbox: the ${3 + QUEUED.length} the store has`);
    if (JSON.stringify(await order(page)) !== JSON.stringify([bare.name, rich.name, planned.name, ...queuedByFiling])) {
      throw new Refused(
        `the cards are listed newest first — ${bare.name}, filed ${bare.filedMinutesAgo} minutes ago, then ${rich.name}, then ${planned.name}, then the queued cards, filed before the rest, the last filed first, ${queuedByFiling.join(', ')} — and they were listed ${(await order(page)).join(', ')}`,
      );
    }
    for (const card of [planned, bare, rich]) {
      const item = cardIn(page, card.name);
      await expectVisible(
        item.locator('[data-title]', { hasText: card.title }),
        `${card.name} is listed by its first line (${card.title})`,
      );
      await expectVisible(
        item.locator(`[data-title] a[href="/inbox/${card.name}"]`, { hasText: card.title }),
        `and its first line opens its page (/inbox/${card.name})`,
      );
      await expectCount(
        item.getByText(card.body.split('\n\n')[1]),
        0,
        `and its first line alone: the rest of its body is the brief its start is prefilled with`,
      );
      await expectVisible(item.getByRole('button', { name: 'Start' }), `${card.name} offers Start`);
      await expectVisible(item.getByRole('button', { name: 'Remove' }), `${card.name} offers Remove`);
    }
    await expectVisible(
      cardIn(page, planned.name).locator(`[data-workflow="${planned.workflow}"]`, { hasText: planned.workflow }),
      `${planned.name} names its workflow (${planned.workflow})`,
    );
    await expectCount(cardIn(page, bare.name).locator('[data-workflow]'), 0, `${bare.name} names no workflow, and shows none`);

    await expectTexts(
      page.locator('section[aria-label="Cards"] h2 [data-queue-count]'),
      [`· ${QUEUED.length} queued`],
      'the cards are counted with how many are queued',
    );
    for (const [i, card] of QUEUED.entries()) {
      const item = cardIn(page, card.name);
      await expectTexts(
        item.locator('[data-queued]'),
        [`queued · ${PLACES_SAID[i]}`],
        `${card.name} says its place in the queue (queued · ${PLACES_SAID[i]})`,
      );
      await expectVisible(item.locator('time[data-queued-at]'), 'and when it was queued');
      await expectVisible(item.getByRole('button', { name: 'Unqueue' }), 'and offers Unqueue');
      await expectCount(item.getByRole('button', { name: 'Queue', exact: true }), 0, 'and not Queue: it is queued');
    }
    const refusedTry = cardIn(page, QUEUE.refused.name).locator('[data-tried="refused"]');
    await expectVisible(
      refusedTry.getByText(refusedWhy(store!, checkout), { exact: false }),
      `${QUEUE.refused.name}, whose start the tick refused, says why in the package's words`,
    );
    await expectVisible(refusedTry.getByText('It stays queued', { exact: false }), 'and that it stays queued');
    await expectVisible(
      cardIn(page, QUEUE.third.name).locator('[data-tried="refused"]').getByText(unfactoredWhy(store!), { exact: false }),
      `${QUEUE.third.name}, queued before a queue asked for a factory, says the tick refused its start for naming none`,
    );
    for (const card of [QUEUE.first, QUEUE.refused]) {
      await expectVisible(
        cardIn(page, card.name).locator(`[data-factory-tag="${FACTORY}"]`),
        `${card.name}, a queued card, names its factory (${FACTORY})`,
      );
    }
    await expectCount(cardIn(page, QUEUE.first.name).locator('[data-tried]'), 0, 'a card the tick has not tried says nothing of a try');
    for (const card of [planned, rich]) {
      const item = cardIn(page, card.name);
      await expectCount(
        item.getByRole('button', { name: 'Queue', exact: true }),
        0,
        `${card.name}, which names a workflow and no factory, offers no Queue`,
      );
      await expectTexts(
        item.locator('[data-no-queue]'),
        ['No Queue: a queued card starts on its own, in the factory it names, and this one names none. Start gives it one.'],
        'and says why, with the way to give it a factory',
      );
      await expectVisible(item.getByRole('button', { name: 'Start' }), 'beside its Start');
    }
    await expectCount(
      cardIn(page, bare.name).getByRole('button', { name: 'Queue', exact: true }),
      0,
      `${bare.name}, which names no workflow, offers no Queue`,
    );
    await expectCount(cardIn(page, bare.name).locator('[data-no-queue]'), 0, 'and no word of a queue: it has no workflow to be queued on');
    await expectCount(
      page.locator('section[aria-label="Cards"] li[data-card]:has([data-factory-tag]) [data-no-queue]'),
      0,
      'no card of a factory says it has no Queue',
    );
    await settled(page);
    await photograph(page, path.join(OUT, `inbox-no-queue-${await themeOf(page)}.png`), { fullPage: true });

    const box = page.locator('form[aria-label="File a card"]');
    const idea = box.getByRole('textbox', { name: 'An idea' });
    const fileIt = box.getByRole('button', { name: 'File' });
    await expectVisible(idea, 'the box has a field for the idea');
    if (await fileIt.isEnabled()) throw new Refused('File is disabled while there is no idea — it was enabled with none');
    await expectCount(box.locator('input'), 0, 'the box has no field to type a repository into');
    await box.getByRole('combobox', { name: 'Factory' }).selectOption(FACTORY);
    await expectTexts(box.locator('[data-factory-repo]'), [checkout], `the repository is the factory's own (${checkout}), said as text`);
    await idea.fill(FILED);
    await box.getByRole('combobox', { name: 'Workflow' }).selectOption({ label: WORKFLOWS.good.name });
    const [filed] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/inbox', { timeout: WAIT_MS }),
      fileIt.click(),
    ]);
    if (filed.status() !== 201)
      throw new Refused(`the api files the card, through the board's proxy — it answered ${filed.status()}: ${await filed.text()}`);
    const { name } = (await filed.json()) as { name: string };
    const written = path.join(inbox, `${name}.md`);
    try {
      const text = fs.existsSync(written) ? fs.readFileSync(written, 'utf8') : undefined;
      const card = `---\nworkflow: ${WORKFLOWS.good.name}\nfactory: ${FACTORY}\n---\n${FILED}\n`;
      if (text !== card)
        throw new Refused(
          `the card is written as wf inbox add writes it, with its workflow and its factory, and no repository nobody chose — ${written} holds ${JSON.stringify(text)}`,
        );
      await expectCount(listed(page), 4 + QUEUED.length, 'the card filed is listed');
      if ((await order(page))[0] !== name)
        throw new Refused(`the card filed is listed first, the newest — the list is ${(await order(page)).join(', ')}`);
      await expectVisible(cardIn(page, name).locator('[data-title]', { hasText: FILED.split('\n')[0] }), 'by its first line');
      if ((await idea.inputValue()) !== '') throw new Refused('the box is emptied once the card is filed');

      const fresh = cardIn(page, name);
      const [queued] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/inbox/${name}/queue`, {
          timeout: WAIT_MS,
        }),
        fresh.getByRole('button', { name: 'Queue', exact: true }).click(),
      ]);
      if (queued.status() !== 200)
        throw new Refused(`the api queues the card, through the board's proxy — it answered ${queued.status()}: ${await queued.text()}`);
      const { queued: at, place } = (await queued.json()) as { queued: string; place: number };
      if (place !== QUEUED.length + 1)
        throw new Refused(`the card queued is behind the ${QUEUED.length} queued already — the api placed it ${place}`);
      const queuedText = fs.readFileSync(written, 'utf8');
      if (queuedText !== queuedCardText({ workflow: WORKFLOWS.good.name, body: FILED }, at, undefined, FACTORY)) {
        throw new Refused(
          `the card is written as wf inbox queue writes it, queued: beside its factory — ${written} holds ${JSON.stringify(queuedText)}`,
        );
      }
      await expectTexts(
        fresh.locator('[data-queued]'),
        [`queued · ${PLACES_SAID[QUEUED.length]}`],
        `the card says its place once queued (queued · ${PLACES_SAID[QUEUED.length]})`,
      );
      await expectCount(fresh.getByRole('button', { name: 'Queue', exact: true }), 0, 'and offers Queue no more');
      const [unqueued] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'DELETE' && new URL(r.url()).pathname === `/api/inbox/${name}/queue`, {
          timeout: WAIT_MS,
        }),
        fresh.getByRole('button', { name: 'Unqueue' }).click(),
      ]);
      if (unqueued.status() !== 200)
        throw new Refused(
          `the api takes the card off the queue, through the board's proxy — it answered ${unqueued.status()}: ${await unqueued.text()}`,
        );
      await expectCount(fresh.locator('[data-queued]'), 0, 'Unqueue takes the card off the queue');
      await expectVisible(fresh.getByRole('button', { name: 'Queue', exact: true }), 'and it offers Queue again');
      if (fs.readFileSync(written, 'utf8') !== card)
        throw new Refused(`and the card is written as it was filed — ${written} holds ${JSON.stringify(fs.readFileSync(written, 'utf8'))}`);
      const [dropped] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'DELETE' && new URL(r.url()).pathname === `/api/inbox/${name}`, {
          timeout: WAIT_MS,
        }),
        cardIn(page, name).getByRole('button', { name: 'Remove' }).click(),
      ]);
      if (dropped.status() !== 200)
        throw new Refused(`the api drops the card, through the board's proxy — it answered ${dropped.status()}: ${await dropped.text()}`);
      await expectCount(cardIn(page, name), 0, 'Remove takes the card off the list');
      if (fs.existsSync(written)) throw new Refused(`and out of the inbox — ${written} is still there`);
    } finally {
      fs.rmSync(written, { force: true });
    }

    {
      const file = path.join(inbox, `${planned.name}.md`);
      const [text, mtime] = [fs.readFileSync(file, 'utf8'), fs.statSync(file).mtimeMs];
      fs.writeFileSync(file, inFactory(text));
      fs.utimesSync(file, new Date(mtime), new Date(mtime));
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      const item = cardIn(page, planned.name);
      await expectVisible(item.locator(`[data-factory-tag="${FACTORY}"]`), `${planned.name}, given the factory ${FACTORY}, names it`);
      await expectCount(item.locator('[data-no-queue]'), 0, 'and no longer says it has no Queue');
      const filedTime = item.locator('time[title="When its file was last written"]');
      const shownAs = async () => ({
        order: await order(page),
        filedAt: await filedTime.getAttribute('datetime'),
        shown: await filedTime.textContent(),
      });
      const before = await shownAs();
      if (before.order.indexOf(planned.name) === 0)
        throw new Refused(`${planned.name} is not the newest card, so a move would show — it is listed first`);
      const unmoved = async (when: string) => {
        const now = await shownAs();
        if (JSON.stringify(now) !== JSON.stringify(before)) {
          throw new Refused(
            `${when}, ${planned.name} keeps its place and its filing time — it was ${JSON.stringify(before)}, and is ${JSON.stringify(now)}`,
          );
        }
        if (fs.statSync(file).mtimeMs !== mtime)
          throw new Refused(
            `${when}, ${file} keeps its mtime, a queue being no edit of the idea — it was ${new Date(mtime).toISOString()}, and is ${fs.statSync(file).mtime.toISOString()}`,
          );
      };
      try {
        const [queued] = await Promise.all([
          page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/inbox/${planned.name}/queue`, {
            timeout: WAIT_MS,
          }),
          item.getByRole('button', { name: 'Queue', exact: true }).click(),
        ]);
        if (queued.status() !== 200)
          throw new Refused(`the api queues ${planned.name} — it answered ${queued.status()}: ${await queued.text()}`);
        await expectTexts(
          item.locator('[data-queued]'),
          [`queued · ${PLACES_SAID[QUEUED.length]}`],
          `${planned.name} says its place once queued (queued · ${PLACES_SAID[QUEUED.length]})`,
        );
        await idle(page);
        await unmoved('queued');
        const { queued: at } = (await queued.json()) as { queued: string };
        if (fs.readFileSync(file, 'utf8') !== queuedCardText(planned, at, checkout, FACTORY))
          throw new Refused(
            `${planned.name} is queued in its factory, ${FACTORY}, which the tick starts it in — ${file} holds ${JSON.stringify(fs.readFileSync(file, 'utf8'))}`,
          );
        await settled(page);
        await photograph(page, path.join(OUT, `inbox-queued-${await themeOf(page)}.png`), { fullPage: true });
        const [unqueued] = await Promise.all([
          page.waitForResponse(
            (r) => r.request().method() === 'DELETE' && new URL(r.url()).pathname === `/api/inbox/${planned.name}/queue`,
            { timeout: WAIT_MS },
          ),
          item.getByRole('button', { name: 'Unqueue' }).click(),
        ]);
        if (unqueued.status() !== 200)
          throw new Refused(`the api takes ${planned.name} off the queue — it answered ${unqueued.status()}: ${await unqueued.text()}`);
        await expectCount(item.locator('[data-queued]'), 0, `Unqueue takes ${planned.name} off the queue`);
        await idle(page);
        await unmoved('taken off the queue');
        if (fs.readFileSync(file, 'utf8') !== inFactory(text))
          throw new Refused(`${planned.name} is written back as it was — ${file} holds ${JSON.stringify(fs.readFileSync(file, 'utf8'))}`);
      } finally {
        fs.writeFileSync(file, text);
        fs.utimesSync(file, new Date(mtime), new Date(mtime));
      }
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      await expectVisible(item.locator('[data-no-queue]'), `${planned.name}, written back with no factory, has no Queue again`);
    }

    const plannedItem = await startIn(page, planned.name);
    const workflowPick = plannedItem.getByRole('combobox', { name: 'Workflow' });
    await expectVisible(workflowPick, `Start opens ${planned.name}'s start form`);
    const presetLabel = await workflowPick.locator('option:checked').textContent();
    if (presetLabel !== planned.workflow)
      throw new Refused(`the workflow is preset from the card (${planned.workflow}) — it was ${JSON.stringify(presetLabel)}`);
    const startForm = plannedItem.locator(`form[aria-label="Start ${planned.name}"]`);
    const brief = startForm.getByRole('textbox', { name: 'Brief' });
    if ((await brief.inputValue()) !== planned.body)
      throw new Refused(`the brief is prefilled from the card's body — it was ${JSON.stringify(await brief.inputValue())}`);
    await expectCount(
      startForm.locator('ul[aria-label="Runs to wait on"] li'),
      DIAMOND_RUNS.length,
      `the start form offers the ${DIAMOND_RUNS.length} runs on its repository to wait on`,
    );
    await expectVisible(startForm.getByRole('button', { name: 'Start' }), 'and a Start button');
    await settled(page);
    await photograph(page, path.join(OUT, `inbox-start-${await themeOf(page)}.png`), { fullPage: true });
    await plannedItem.getByRole('button', { name: 'Close' }).click();
    await expectCount(startForm, 0, 'Close folds the start form away');

    const cardFile = path.join(inbox, `${planned.name}.md`);
    const cardText = fs.readFileSync(cardFile, 'utf8');
    const cardTime = fs.statSync(cardFile).mtime;
    const runsBefore = fs.readdirSync(runsDir).sort();
    const starting = await page.context().newPage();
    try {
      const { problems } = watch(starting);
      await starting.goto(page.url(), { waitUntil: 'load' });
      await idle(starting);
      const item = await startIn(starting, planned.name);
      const form = item.locator(`form[aria-label="Start ${planned.name}"]`);
      await form.getByRole('textbox', { name: 'Brief' }).fill(STARTED);
      const [started] = await Promise.all([
        starting.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/runs', { timeout: WAIT_MS }),
        form.getByRole('button', { name: 'Start' }).click(),
      ]);
      expectInFactory(started, checkout);
      if (started.status() !== 201)
        throw new Refused(`the api starts the card, through the board's proxy — it answered ${started.status()}: ${await started.text()}`);
      const { id, removed } = (await started.json()) as { id: string; removed: boolean };
      if (removed !== true) throw new Refused(`the api says the card left the inbox — it answered removed: ${removed}`);
      await starting.waitForURL(`**/runs/${id}`, { timeout: WAIT_MS });
      await expectVisible(starting.locator('h1', { hasText: id }), `the start opens the run's page (${id})`);
      await expectVisible(
        starting.locator(`[data-from="${planned.name}"]`, { hasText: new RegExp(`^from inbox card ${planned.name}$`) }),
        `and the run's page says, under the brief, the card it came from, as wf decide does (from inbox card ${planned.name})`,
      );
      const record = JSON.parse(fs.readFileSync(path.join(runsDir, `${id}.json`), 'utf8')) as {
        from?: { inbox?: string };
        brief?: string;
        workflowDir?: string;
        repo?: string;
        factory?: string;
      };
      const expected = {
        from: { inbox: planned.name },
        brief: STARTED,
        workflowDir: path.join(checkout, 'workflows', WORKFLOWS.good.name),
        repo: checkout,
        factory: FACTORY,
      };
      const got = {
        from: record.from,
        brief: record.brief,
        workflowDir: record.workflowDir,
        repo: record.repo,
        factory: record.factory,
      };
      if (JSON.stringify(got) !== JSON.stringify(expected))
        throw new Refused(`the record is the card's start — it holds ${JSON.stringify(got)}, and should hold ${JSON.stringify(expected)}`);
      if (fs.existsSync(cardFile)) throw new Refused(`the card leaves the inbox once its run is written — ${cardFile} is still there`);
      await idle(starting);
      const seen = problems();
      if (seen.length)
        throw new Refused(
          `no console error and no failed request while starting a card — ${seen.length} seen:\n    ${seen.join('\n    ')}`,
        );
    } finally {
      await starting.close();
      for (const file of fs.readdirSync(runsDir))
        if (!runsBefore.includes(file)) fs.rmSync(path.join(runsDir, file), { recursive: true, force: true });
      if (!fs.existsSync(cardFile)) {
        fs.writeFileSync(cardFile, cardText);
        fs.utimesSync(cardFile, cardTime, cardTime);
      }
    }

    if (process.getuid?.() === 0) {
      console.log('e2e: inbox — a start whose card cannot be removed is not looked at as root, which removes it all the same');
    } else {
      const keptRuns = fs.readdirSync(runsDir).sort();
      const kept = await page.context().newPage();
      try {
        const { problems } = watch(kept);
        await kept.goto(page.url(), { waitUntil: 'load' });
        await idle(kept);
        const item = await startIn(kept, planned.name);
        const form = item.locator(`form[aria-label="Start ${planned.name}"]`);
        await expectVisible(form.getByRole('button', { name: 'Start' }), `Start opens ${planned.name}'s start form`);
        const reread = kept.waitForResponse((r) => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/inbox', {
          timeout: WAIT_MS,
        });
        fs.chmodSync(inbox, 0o555);
        const [started] = await Promise.all([
          kept.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/runs', { timeout: WAIT_MS }),
          form.getByRole('button', { name: 'Start' }).click(),
        ]);
        expectInFactory(started, checkout);
        const answer = (await started.json()) as { id?: string; removed?: boolean; why?: string };
        if (started.status() !== 201 || answer.removed !== false || !answer.why?.startsWith(`${cardFile} could not be removed — `)) {
          throw new Refused(
            `the api starts a card it cannot remove, the inbox read-only, and says so — it answered ${started.status()}: ${JSON.stringify(answer)}`,
          );
        }
        const listing = (await (await reread).json()) as Array<{ name: string; startedAs: string[] }>;
        if (JSON.stringify(listing.find((e) => e.name === planned.name)?.startedAs) !== JSON.stringify([answer.id])) {
          throw new Refused(`the inbox read again names the run the card was started as — it listed ${JSON.stringify(listing)}`);
        }
        await idle(kept);
        await expectVisible(
          item.locator(`[data-started-as] a[href="/runs/${answer.id}"]`),
          `the card says it was started as ${answer.id}, linked to the run`,
        );
        const why = await item.locator('[data-started-as] [data-kept]').textContent();
        if (why !== answer.why)
          throw new Refused(
            `the card says why it was not removed, in the api's words — it shows ${JSON.stringify(why)}, and the api said ${JSON.stringify(answer.why)}`,
          );
        await expectCount(item.getByRole('button', { name: 'Start' }), 0, 'and offers no Start: started again, the idea would run twice');
        await expectCount(item.locator('[data-start-card]'), 0, 'its start form is gone');
        if (new URL(kept.url()).pathname !== '/inbox') throw new Refused(`the page stays on the inbox — it went to ${kept.url()}`);
        if (!fs.existsSync(cardFile)) throw new Refused(`the card is still in the inbox — ${cardFile} is gone`);
        await settled(kept);
        await photograph(kept, path.join(OUT, `inbox-kept-${await themeOf(kept)}.png`), { fullPage: true });
        await idle(kept);
        const seen = problems();
        if (seen.length)
          throw new Refused(
            `no console error and no failed request on a start whose card stayed — ${seen.length} seen:\n    ${seen.join('\n    ')}`,
          );
      } finally {
        await kept.close();
        fs.chmodSync(inbox, 0o755);
        for (const file of fs.readdirSync(runsDir))
          if (!keptRuns.includes(file)) fs.rmSync(path.join(runsDir, file), { recursive: true, force: true });
      }
    }

    const startedRecord = path.join(runsDir, `${STARTED_AS}.json`);
    const already = await page.context().newPage();
    try {
      fs.writeFileSync(
        startedRecord,
        JSON.stringify(
          {
            id: STARTED_AS,
            repo: checkout,
            workspace: checkout,
            baseRef: 'HEAD',
            branch: 'main',
            isolate: true,
            brief: bare.body,
            workflowDir: path.join(checkout, 'workflows', WORKFLOWS.good.name),
            workflow: [],
            steps: {},
            createdAt: new Date().toISOString(),
            from: { inbox: bare.name },
          },
          null,
          2,
        ),
      );
      const { problems } = watch(already);
      await already.goto(page.url(), { waitUntil: 'load' });
      await idle(already);
      const item = cardIn(already, bare.name);
      await expectVisible(
        item.locator(`[data-started-as] a[href="/runs/${STARTED_AS}"]`),
        `a card a record names says it was started as ${STARTED_AS}, linked to the run`,
      );
      await expectCount(item.getByRole('button', { name: 'Start' }), 0, 'and offers no Start: started again, the idea would run twice');
      await expectVisible(item.getByRole('button', { name: 'Remove' }), 'and offers Remove');
      await settled(already);
      await photograph(already, path.join(OUT, `inbox-started-as-${await themeOf(already)}.png`), { fullPage: true });
      await idle(already);
      const seen = problems();
      if (seen.length)
        throw new Refused(
          `no console error and no failed request on a card started already — ${seen.length} seen:\n    ${seen.join('\n    ')}`,
        );
    } finally {
      await already.close();
      fs.rmSync(startedRecord, { force: true });
    }

    const elsewhere = path.join(store!, 'hkb-v2');
    const elsewhereName = 'a-card-about-another-repo-e2e0';
    const elsewhereFile = path.join(inbox, `${elsewhereName}.md`);
    const other = await page.context().newPage();
    try {
      fs.writeFileSync(elsewhereFile, `---\nworkflow: ${WORKFLOWS.good.name}\nrepo: ${elsewhere}\n---\nA card about another repository\n`);
      const { problems } = watch(other);
      await other.goto(page.url(), { waitUntil: 'load' });
      await idle(other);
      const item = await startIn(other, elsewhereName);
      await expectTexts(
        item.locator('[data-unplaced]'),
        [
          `The card is about ${elsewhere}, and the factory ${FACTORY} works on ${checkout}: pick a factory that works on it, or change the card's repo: line.`,
        ],
        `a card about ${elsewhere} has no place in ${FACTORY}, which works on ${checkout}: its start says so, naming both`,
      );
      await expectCount(item.getByRole('combobox', { name: 'Workflow' }), 0, 'with no Workflow list');
      await expectCount(item.locator(`form[aria-label="Start ${elsewhereName}"]`), 0, 'and no Start: the api would refuse it');
      await settled(other);
      await photograph(other, path.join(OUT, `inbox-elsewhere-${await themeOf(other)}.png`), { fullPage: true });
      await idle(other);
      const seen = problems();
      if (seen.length)
        throw new Refused(
          `no console error and no failed request on a card about another repository — ${seen.length} seen:\n    ${seen.join('\n    ')}`,
        );
    } finally {
      await other.close();
      fs.rmSync(elsewhereFile, { force: true });
    }

    const strayFile = path.join(inbox, 'notes.txt');
    const strayText = 'Not a card: notes kept beside the cards.\n';
    const folder = path.join(inbox, 'sub');
    const namedFile = path.join(inbox, 'notes');
    const namedCard = path.join(inbox, 'notes.md');
    const strays = await page.context().newPage();
    try {
      fs.writeFileSync(strayFile, strayText);
      fs.mkdirSync(folder);
      fs.writeFileSync(namedFile, 'Not a card: notes beside the card of that name.\n');
      fs.writeFileSync(namedCard, 'Notes, as a card\n');
      const { problems } = watch(strays);
      await strays.goto(page.url(), { waitUntil: 'load' });
      await idle(strays);
      const sub = cardIn(strays, 'sub/');
      await expectVisible(sub.getByText(/^sub\/: not a card/), 'a folder in the inbox is listed with why it is not a card');
      await expectCount(
        sub.getByRole('link'),
        0,
        'and has no page: the api refuses the name sub/, so a link would open a refusal of what is listed',
      );
      const named = cardIn(strays, 'notes');
      await expectCount(named, 2, 'a card and a stray file of one name are both listed, under that name');
      const namedStray = named.filter({ hasText: 'notes: not a card' });
      await expectVisible(namedStray, 'the stray is listed with why it is not a card');
      await expectCount(
        namedStray.getByRole('link'),
        0,
        "and has no page: /inbox/notes is notes.md, so a link would open the card's page under the stray's name",
      );
      await expectVisible(
        named.filter({ has: strays.locator('[data-title]') }).locator('a[href="/inbox/notes"]', { hasText: 'Notes, as a card' }),
        'and the card of that name keeps the page, which is the one the api reads',
      );

      const notes = cardIn(strays, 'notes.txt');
      await expectVisible(notes.getByText(/^notes\.txt: not a card/), 'a stray file is listed with why it is not a card');
      await notes.getByRole('link', { name: 'notes.txt' }).click();
      await strays.waitForURL('**/inbox/notes.txt', { timeout: WAIT_MS });
      await expectVisible(strays.getByText(/^notes\.txt: not a card/), "the stray file's page says why it is not a card");
      await expectCount(strays.locator('section[aria-label="Keys"]'), 0, 'and lays out no keys');
      await strays.getByRole('button', { name: 'Source' }).click();
      const shown = await strays.locator('pre[data-source]').textContent();
      if (shown !== strayText) throw new Refused(`the stray file's Source is the file as written — it shows ${JSON.stringify(shown)}`);
      await settled(strays);
      await photograph(strays, path.join(OUT, `inbox-strays-${await themeOf(strays)}.png`), { fullPage: true });
      await idle(strays);
      const seen = problems();
      if (seen.length)
        throw new Refused(
          `no console error and no failed request with a stray file and a folder in the inbox — ${seen.length} seen:\n    ${seen.join('\n    ')}`,
        );
    } finally {
      await strays.close();
      fs.rmSync(strayFile, { force: true });
      fs.rmSync(folder, { recursive: true, force: true });
      fs.rmSync(namedFile, { force: true });
      fs.rmSync(namedCard, { force: true });
    }

    const aside = path.join(store!, 'inbox-aside');
    const empty = await page.context().newPage();
    try {
      fs.renameSync(inbox, aside);
      const { problems } = watch(empty);
      await empty.goto(page.url(), { waitUntil: 'load' });
      await idle(empty);
      await expectVisible(
        empty.locator('[data-empty]', {
          hasText: 'The inbox is empty. File an idea in the box above, or from the command line.',
        }),
        'an empty inbox says where to file a card, here or from the command line',
      );
      await expectVisible(empty.locator('form[aria-label="File a card"]'), 'and still has the box');
      await settled(empty);
      await photograph(empty, path.join(OUT, `inbox-empty-${await themeOf(empty)}.png`), { fullPage: true });
      await idle(empty);
      const seen = problems();
      if (seen.length)
        throw new Refused(`no console error and no failed request on an empty inbox — ${seen.length} seen:\n    ${seen.join('\n    ')}`);
    } finally {
      await empty.close();
      if (fs.existsSync(aside)) {
        fs.rmSync(inbox, { recursive: true, force: true });
        fs.renameSync(aside, inbox);
      }
    }

    const rereadOf = (p: Page) =>
      p.waitForResponse((r) => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/inbox', { timeout: WAIT_MS });
    const onlyRefusal = (p: Page, seen: string[], answered: Response) => {
      const expected = `request answered ${answered.status()}: ${answered.request().method()} ${answered.url()}`;
      const chromium = new RegExp(`^console error: Failed to load resource: the server responded with a status of ${answered.status()}\\b`);
      const others = seen.filter((problem) => problem !== expected && !chromium.test(problem));
      if (!seen.includes(expected) || others.length)
        throw new Refused(
          `the refused page saw its one refusal, its answer and the line Chromium writes to the console for one, and nothing else — it saw:\n    ${seen.join('\n    ')}`,
        );
    };

    const bareFile = path.join(inbox, `${bare.name}.md`);
    const bareAside = path.join(store!, `${bare.name}.md.aside`);
    const refused = await page.context().newPage();
    try {
      const { problems } = watch(refused);
      await refused.goto(page.url(), { waitUntil: 'load' });
      await idle(refused);
      const item = await startIn(refused, bare.name);
      const pick = item.getByRole('combobox', { name: 'Workflow' });
      await expectVisible(pick, `Start opens ${bare.name}'s start form`);
      if ((await pick.inputValue()) !== '')
        throw new Refused(`a card that names no workflow is preset to none — it was ${JSON.stringify(await pick.inputValue())}`);
      await expectCount(item.locator(`form[aria-label="Start ${bare.name}"]`), 0, 'and has no Start until one is picked');
      await pick.selectOption({ label: WORKFLOWS.good.name });
      const form = item.locator(`form[aria-label="Start ${bare.name}"]`);
      const bareBrief = form.getByRole('textbox', { name: 'Brief' });
      await expectVisible(bareBrief, 'a workflow picked, the brief and Start');
      if ((await bareBrief.inputValue()) !== bare.body)
        throw new Refused(`the brief is prefilled from the card's body — it was ${JSON.stringify(await bareBrief.inputValue())}`);
      const before = fs.readdirSync(runsDir).sort();
      fs.renameSync(bareFile, bareAside);
      const reread = rereadOf(refused);
      const [answered] = await Promise.all([
        refused.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/runs', { timeout: WAIT_MS }),
        form.getByRole('button', { name: 'Start' }).click(),
      ]);
      expectInFactory(answered, checkout);
      const { error } = (await answered.json()) as { error?: string };
      const sentence = `no card ${bare.name} in the inbox. Its cards are: ${[planned.name, rich.name, ...queuedByFiling].sort().join(', ')}. Start one of those — nemia start ${path.join(inbox, '<name>.md')} — or park the idea first: nemia inbox add "<idea>".`;
      if (answered.status() !== 404 || error !== sentence) {
        throw new Refused(
          `the api refuses to start a card that is not there, in the package's words — it answered ${answered.status()}: ${JSON.stringify(error)}`,
        );
      }
      const listing = (await (await reread).json()) as Array<{ name: string }>;
      if (listing.some((e) => e.name === bare.name))
        throw new Refused(
          `the inbox read again after the refusal no longer lists ${bare.name} — it listed ${JSON.stringify(listing.map((e) => e.name))}`,
        );
      await idle(refused);
      await expectCount(item, 0, 'the card leaves the list once the inbox is read again after the refusal');
      await expectCount(listed(refused), 2 + QUEUED.length, `and only ${rich.name}, ${planned.name} and the queued cards are listed`);
      const gone = refused.locator(`section[aria-label="Cards"] li[data-gone="${bare.name}"]`);
      await expectVisible(
        gone.locator('[data-refused="start"]', { hasText: 'Not started. The api refused it:' }),
        'the refusal stays, where the card was listed, not swallowed with the form',
      );
      const shown = await gone.locator('[data-refused] p.font-mono').textContent();
      if (shown !== error)
        throw new Refused(
          `the refusal in the card's place is the package's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`,
        );
      if (JSON.stringify(await order(refused)) !== JSON.stringify([rich.name, planned.name, ...queuedByFiling]))
        throw new Refused(`the cards listed are the inbox's — ${(await order(refused)).join(', ')}`);
      const after = fs.readdirSync(runsDir).sort();
      if (JSON.stringify(after) !== JSON.stringify(before))
        throw new Refused(`nothing is written on a refusal — ${runsDir} went from ${before.length} files to ${after.length}`);
      await settled(refused);
      await photograph(refused, path.join(OUT, `inbox-refused-${await themeOf(refused)}.png`), { fullPage: true });
      await idle(refused);
      onlyRefusal(refused, problems(), answered);
    } finally {
      await refused.close();
      if (fs.existsSync(bareAside)) fs.renameSync(bareAside, bareFile);
    }

    const plannedAside = path.join(store!, `${planned.name}.md.aside`);
    const unremoved = await page.context().newPage();
    try {
      const { problems } = watch(unremoved);
      await unremoved.goto(page.url(), { waitUntil: 'load' });
      await idle(unremoved);
      const item = cardIn(unremoved, planned.name);
      await expectVisible(item.getByRole('button', { name: 'Remove' }), `${planned.name} offers Remove`);
      fs.renameSync(cardFile, plannedAside);
      const reread = rereadOf(unremoved);
      const [answered] = await Promise.all([
        unremoved.waitForResponse((r) => r.request().method() === 'DELETE' && new URL(r.url()).pathname === `/api/inbox/${planned.name}`, {
          timeout: WAIT_MS,
        }),
        item.getByRole('button', { name: 'Remove' }).click(),
      ]);
      const { error } = (await answered.json()) as { error?: string };
      if (answered.status() !== 404 || !error?.startsWith(`no card ${planned.name} in the inbox.`)) {
        throw new Refused(
          `the api refuses to drop a card that is not there, in the package's words — it answered ${answered.status()}: ${JSON.stringify(error)}`,
        );
      }
      await reread;
      await idle(unremoved);
      await expectCount(item, 0, 'the card leaves the list once the inbox is read again after the refusal');
      const gone = unremoved.locator(`section[aria-label="Cards"] li[data-gone="${planned.name}"]`);
      await expectVisible(
        gone.locator('[data-refused="remove"]', { hasText: 'Not removed. The api refused it:' }),
        'the refusal stays, where the card was listed',
      );
      const shown = await gone.locator('[data-refused] p.font-mono').textContent();
      if (shown !== error)
        throw new Refused(
          `the refusal in the card's place is the package's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`,
        );
      await expectVisible(gone.locator('[data-title]', { hasText: planned.title }), 'with the first line of the card it was about');
      await settled(unremoved);
      await photograph(unremoved, path.join(OUT, `inbox-remove-refused-${await themeOf(unremoved)}.png`), { fullPage: true });
      await gone.getByRole('button', { name: 'Dismiss' }).click();
      await expectCount(gone, 0, 'Dismiss takes the refusal of a card that is gone away');
      await idle(unremoved);
      onlyRefusal(unremoved, problems(), answered);
    } finally {
      await unremoved.close();
      if (fs.existsSync(plannedAside)) fs.renameSync(plannedAside, cardFile);
    }

    const conflicted = await page.context().newPage();
    try {
      const { problems } = watch(conflicted);
      await conflicted.goto(page.url(), { waitUntil: 'load' });
      await idle(conflicted);
      const item = await startIn(conflicted, planned.name);
      const form = item.locator(`form[aria-label="Start ${planned.name}"]`);
      await expectVisible(form.getByRole('button', { name: 'Start' }), `Start opens ${planned.name}'s start form`);
      fs.writeFileSync(
        startedRecord,
        JSON.stringify(
          {
            id: STARTED_AS,
            repo: checkout,
            workspace: checkout,
            baseRef: 'HEAD',
            branch: 'main',
            isolate: true,
            brief: planned.body,
            workflowDir: path.join(checkout, 'workflows', WORKFLOWS.good.name),
            workflow: [],
            steps: {},
            createdAt: new Date().toISOString(),
            from: { inbox: planned.name },
          },
          null,
          2,
        ),
      );
      const before = fs.readdirSync(runsDir).sort();
      const reread = rereadOf(conflicted);
      const [answered] = await Promise.all([
        conflicted.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/runs', {
          timeout: WAIT_MS,
        }),
        form.getByRole('button', { name: 'Start' }).click(),
      ]);
      expectInFactory(answered, checkout);
      const { error } = (await answered.json()) as { error?: string };
      if (answered.status() !== 409 || !error?.includes(STARTED_AS)) {
        throw new Refused(
          `the api refuses to start a card a run was started from, naming the run — it answered ${answered.status()}: ${JSON.stringify(error)}`,
        );
      }
      await reread;
      await idle(conflicted);
      await expectVisible(
        item.locator(`[data-started-as] a[href="/runs/${STARTED_AS}"]`),
        `the card, read again, says it was started as ${STARTED_AS}`,
      );
      await expectCount(item.locator('[data-start-card]'), 0, 'its start form is gone: it may not start again');
      await expectVisible(
        item.locator('[data-refused="start"]', { hasText: 'Not started. The api refused it:' }),
        'and the refusal stays, on the card',
      );
      const shown = await item.locator('[data-refused] p.font-mono').textContent();
      if (shown !== error)
        throw new Refused(
          `the refusal on the card is the package's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`,
        );
      const after = fs.readdirSync(runsDir).sort();
      if (JSON.stringify(after) !== JSON.stringify(before))
        throw new Refused(`nothing is written on a refusal — ${runsDir} went from ${before.length} files to ${after.length}`);
      await settled(conflicted);
      await photograph(conflicted, path.join(OUT, `inbox-conflict-${await themeOf(conflicted)}.png`), { fullPage: true });
      await idle(conflicted);
      onlyRefusal(conflicted, problems(), answered);
    } finally {
      await conflicted.close();
      fs.rmSync(startedRecord, { force: true });
    }

    const plannedText = fs.readFileSync(cardFile, 'utf8');
    const plannedTime = fs.statSync(cardFile).mtime;
    const requeued = await page.context().newPage();
    try {
      fs.writeFileSync(cardFile, inFactory(plannedText));
      fs.utimesSync(cardFile, plannedTime, plannedTime);
      const { problems } = watch(requeued);
      await requeued.goto(page.url(), { waitUntil: 'load' });
      await idle(requeued);
      const item = cardIn(requeued, planned.name);
      const queueIt = item.getByRole('button', { name: 'Queue', exact: true });
      await expectVisible(queueIt, `${planned.name} offers Queue`);
      const listedBefore = await order(requeued);
      const elsewhere = await fetch(new URL(`/api/inbox/${planned.name}/queue`, requeued.url()), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      const { queued: behind } = (await elsewhere.json()) as { queued?: string };
      if (elsewhere.status !== 200 || !behind)
        throw new Refused(`another tab queues ${planned.name} through the api — it answered ${elsewhere.status}`);
      if (fs.readFileSync(cardFile, 'utf8') !== queuedCardText(planned, behind, checkout, FACTORY))
        throw new Refused(
          `the card is queued behind the page's back — ${cardFile} holds ${JSON.stringify(fs.readFileSync(cardFile, 'utf8'))}`,
        );
      const reread = rereadOf(requeued);
      const [answered] = await Promise.all([
        requeued.waitForResponse(
          (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/inbox/${planned.name}/queue`,
          { timeout: WAIT_MS },
        ),
        queueIt.click(),
      ]);
      const { error } = (await answered.json()) as { error?: string };
      const place = QUEUED.length + 1;
      const sentence = `${planned.name}.md: already queued, at ${behind}, ${place} in the queue's order: the tick starts it when its turn comes and a run slot is free. To queue it again, take it back first: nemia inbox queue ${planned.name} --off.`;
      if (answered.status() !== 409 || error !== sentence) {
        throw new Refused(
          `the api refuses to queue a card queued already, in the package's words — it answered ${answered.status()}: ${JSON.stringify(error)}`,
        );
      }
      await reread;
      await idle(requeued);
      await expectTexts(
        item.locator('[data-queued]'),
        [`queued · ${PLACES_SAID[place - 1]}`],
        `the card, read again, says it is queued, in its place (queued · ${PLACES_SAID[place - 1]})`,
      );
      await expectVisible(item.getByRole('button', { name: 'Unqueue' }), 'and offers Unqueue in place of Queue');
      if (JSON.stringify(await order(requeued)) !== JSON.stringify(listedBefore)) {
        throw new Refused(
          `the card, queued elsewhere, is listed where it was — ${listedBefore.join(', ')} — and the list is ${(await order(requeued)).join(', ')}`,
        );
      }
      await expectVisible(
        item.locator('[data-refused="queue"]', { hasText: 'Not queued. The api refused it:' }),
        'and the refusal stays, on the card',
      );
      const shown = await item.locator('[data-refused] p.font-mono').textContent();
      if (shown !== error)
        throw new Refused(
          `the refusal on the card is the package's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`,
        );
      await settled(requeued);
      await photograph(requeued, path.join(OUT, `inbox-queue-refused-${await themeOf(requeued)}.png`), { fullPage: true });
      await idle(requeued);
      onlyRefusal(requeued, problems(), answered);
    } finally {
      await requeued.close();
      fs.writeFileSync(cardFile, plannedText);
      fs.utimesSync(cardFile, plannedTime, plannedTime);
    }
    await settled(page);
  }
}

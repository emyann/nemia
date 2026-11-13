import path from 'node:path';
import type { Page } from 'playwright';
import {
  chatFieldOf,
  chatPanelOf,
  expectCues,
  expectPanelHeld,
  herChat,
  herFaceOf,
  herSheetOf,
  litOf,
  openAnswered,
  openChat,
  photograph,
  railColumnOf,
  railPlace,
  themeOf,
} from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';
import { cuesOf, dockWords, faceOf, type Presence } from '../../../src/lib/presence.ts';

/** The four things the canvas offers a person to start with. */
const STARTERS = ['What is waiting on me?', 'What is at work?', 'What did today cost?', 'Start a run'];

/**
 * Her face first in the rail and her chat closed: her expression and every cue said at her face are the ones her presence picks
 * (`faceOf`, `cuesOf`) from what the api answers of her and from the run list's runs that wait on the person — the count the rail's Runs
 * badge says below it, never her presence's own `waitsOnYou` — her face says what pressing it does (`dockWords`) and that her chat is
 * closed (`aria-expanded`), the first Tab from the page's top reaches it before any of the rail's destinations, and no panel is drawn
 * until it is pressed. Read against the api rather than against a presence written here: the seed's own waiting runs are hers to show,
 * and their count moves with the seed. Her chat here holds no ask, so none is said.
 */
async function expectClosed(page: Page): Promise<void> {
  const face = herFaceOf(page);
  await expectVisible(face, 'her face is in the rail');
  const read = (await page.request.get(new URL('/api/nemia/chat', page.url()).href).then((r) => r.json())) as {
    presence: { up: boolean; answering: boolean; waitsOnYou: number; unread: number };
  };
  const api = read.presence;
  if (!api.up) throw new Refused(`her session reads up on the api — it answered ${JSON.stringify(api)}`);
  const waiting = (await openAnswered(page)).counts.waiting;
  if (waiting === 0) throw new Refused('the seed holds runs that wait on the person, for her cue to count');
  const presence: Presence = {
    runsWaiting: waiting,
    asksWaiting: 0,
    notSent: false,
    down: false,
    answering: api.answering,
    unread: api.unread,
  };
  await expectTexts(
    railPlace(page, 'Runs').locator('[data-slot="badge"]'),
    [String(waiting)],
    'the rail counts the runs that wait on you as her cue does',
  );
  const wearing = await face.locator('[data-nemia-face]').getAttribute('data-nemia-face');
  if (wearing !== faceOf(presence))
    throw new Refused(`her face wears the expression her presence picks, ${faceOf(presence)} — it wears ${wearing}`);
  const words = cuesOf(presence).map((cue) => cue.words);
  await expectCues(
    page,
    (said) => JSON.stringify(said) === JSON.stringify(words),
    `every cue that holds is said at her face, in the owner’s order: ${words.join(', ')}`,
  );
  await page.mouse.move(640, 400);
  const label = await face.getAttribute('aria-label');
  if (label !== dockWords(presence, 'closed')) throw new Refused(`her face says what pressing it does — it says ${label}`);
  if ((await face.getAttribute('aria-expanded')) !== 'false') throw new Refused('her face says her chat is closed');
  await expectCount(chatPanelOf(page), 0, 'no panel is drawn until it is opened');
  await expectVisible(railColumnOf(page).and(page.locator('[data-state="expanded"]')), 'the rail stands open, as the person keeps it');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => document.activeElement?.hasAttribute('data-nemia-face-button') ?? false);
  if (!first) throw new Refused("the first Tab from the page's top reaches her face, before the rail's destinations");
}

/** This browser's `sidebar_state` pair, as the person's fold of the rail is kept: none where it was never written. */
const railCookie = (page: Page): Promise<string | undefined> =>
  page.evaluate(() =>
    document.cookie
      .split(';')
      .map((pair) => pair.trim())
      .find((pair) => pair.startsWith('sidebar_state=')),
  );

/** What the rail shows of the page whatever its width: the destination lit, and the Runs badge's count. */
const railSays = async (page: Page): Promise<string> =>
  `${await litOf(page).getAttribute('href')} · ${(await railPlace(page, 'Runs').locator('[data-slot="badge"]').allTextContents()).join()}`;

/** The rail stands `state` (`expanded`, `collapsed`). */
const expectRail = (page: Page, state: string, assertion: string): Promise<void> =>
  expectVisible(railColumnOf(page).and(page.locator(`[data-state="${state}"]`)), assertion);

/**
 * Her sheet stands docked in the frame's row: 400 wide, holding her panel, its left at or past the page's right, nothing modal over the
 * page, and the page's own right edge its own.
 */
async function expectDocked(page: Page): Promise<void> {
  const sheet = herSheetOf(page);
  await expectVisible(sheet.locator('[data-chat-panel="sheet"]'), 'her sheet holds her panel');
  await expectCount(page.locator('[data-slot="side-sheet-overlay"]'), 0, 'and is docked, with no scrim over the page');
  const [box, main] = await Promise.all([sheet.boundingBox(), page.locator('[data-frame-page]').boundingBox()]);
  if (box === null || main === null) throw new Refused('the sheet and the page have sizes to measure');
  if (Math.abs(box.width - 400) > 1) throw new Refused(`her sheet is 400 wide — it is ${box.width}`);
  if (box.x < main.x + main.width - 1)
    throw new Refused(`her sheet stands beside the page, not over it — it starts at ${box.x}, the page ends at ${main.x + main.width}`);
  const edge = await page.evaluate(() => {
    const main = document.querySelector('[data-frame-page]')!.getBoundingClientRect();
    const at = document.elementFromPoint(main.right - 2, main.top + main.height / 2);
    return at?.closest('[data-slot="side-sheet"]') ? 'her sheet' : null;
  });
  if (edge !== null) throw new Refused("the page's own right edge is the page's, not the sheet's");
}

/** Her greeting, her level and what is at work, and the four chips. */
async function expectEmpty(panel: ReturnType<typeof chatPanelOf>): Promise<void> {
  const empty = panel.locator('[data-chat-empty]');
  await expectVisible(empty.getByText('I keep your factories running.'), 'her greeting');
  await expectVisible(empty.getByText('ask before what is yours to decide', { exact: false }), 'what she is for');
  await expectVisible(empty.locator('[data-chat-tag]', { hasText: 'Semi-auto' }), 'her level');
  const tags = await empty.locator('[data-chat-tag]').allTextContents();
  if (!tags.some((tag) => /^\d+ (?:factory|factories)$/.test(tag)))
    throw new Refused(`the tags say how many factories — ${tags.join(', ')}`);
  if (!tags.some((tag) => /^\d+ runs? at work$/.test(tag))) throw new Refused(`and how many runs are at work — ${tags.join(', ')}`);
  await expectVisible(empty.getByText('Start with', { exact: true }), 'the things to start with');
  for (const words of STARTERS) await expectVisible(empty.locator('[data-chat-chip]', { hasText: words }), `the chip ${words}`);
}

/** The composer's edge, its colour and the shape it is clipped to: the layer the look's cut field draws round the whole box. */
async function edgeOf(page: Page): Promise<{ colour: string; clip: string }> {
  const edge = page.locator('[data-chat-composer] [data-cut-edge]');
  await expectVisible(edge, "the composer's edge is a layer of its own");
  return await edge.evaluate((layer) => {
    const style = getComputedStyle(layer);
    return { colour: style.backgroundColor, clip: style.clipPath };
  });
}

export default {
  /**
   * Her face first in the rail, her chat closed, on a page of the board (state 1); pressed, her side sheet docked beside the page at 1280,
   * the rail folded for it without writing the person's fold, and the panel in it with nothing said yet (state 2) — her greeting, her
   * level, what is at work and the four chips — a draft written in it (state 3), where Shift+Enter makes a new line and Enter sends, the
   * words then drawn as the person's own bubble. Then the menu button bringing the rail back beside the sheet, its Close and her face
   * closing it; at 1600 the sheet beside an open rail; on a narrow screen the kit's modal sheet from her face in the top bar; and the
   * same panel opened as a page of its own at `/chat`, where her face says the page is hers. Her level, her task and her chat are
   * written by the page and taken back after.
   */
  name: 'chat',
  route: '/',
  expect: async (page) => {
    const back = herChat({ session: 'up', said: [] });
    const was = page.viewportSize();
    try {
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      await expectClosed(page);
      await settled(page);
      await photograph(page, path.join(OUT, `chat-closed-${await themeOf(page)}.png`), { fullPage: true });

      const cookie = await railCookie(page);
      const rail = await railSays(page);
      const panel = await openChat(page);
      const face = herFaceOf(page);
      if ((await face.getAttribute('aria-expanded')) !== 'true') throw new Refused('her face says her chat is open');
      if ((await face.evaluate((own) => getComputedStyle(own).boxShadow)) === 'none') throw new Refused('open, her face is ringed');
      await expectDocked(page);
      await expectRail(page, 'collapsed', 'at 1280 the open rail folds beside her sheet');
      if ((await railSays(page)) !== rail)
        throw new Refused(`the folded rail keeps the page lit and its badges — ${rail} became ${await railSays(page)}`);
      if ((await railCookie(page)) !== cookie)
        throw new Refused('the fold for her sheet writes no sidebar_state: the person did not fold the rail');
      await expectVisible(panel.getByRole('heading', { name: 'Nemia' }), 'her name in the header');
      await expectVisible(panel.locator('[data-chat-where]', { hasText: 'Up: her session runs' }), 'where she is');
      await expectCount(
        panel.getByRole('button', { name: 'Grow to the whole space' }),
        0,
        'a docked sheet does not grow: /chat is the chat grown',
      );
      await expectEmpty(panel);
      await expectPanelHeld(page);
      await settled(page);
      await photograph(page, path.join(OUT, `chat-empty-${await themeOf(page)}.png`), { fullPage: true });

      const quiet = await edgeOf(page);
      if (!quiet.clip.startsWith('polygon(')) throw new Refused(`the edge is drawn in the cut shape — it is clipped to ${quiet.clip}`);

      const field = chatFieldOf(page);
      await field.fill('Start the two kit cards as one batch');
      const lit = await edgeOf(page);
      if (lit.colour === quiet.colour)
        throw new Refused(`with the focus in the field the whole edge takes the focus ink — it stays ${quiet.colour}`);
      if (lit.clip !== quiet.clip)
        throw new Refused(`and keeps the cut shape it had, round both cut corners — it is clipped to ${lit.clip}`);

      await field.press('Tab');
      const ring = page.locator('[data-chat-composer] [data-cut-ring]');
      await expectVisible(ring, 'the keyboard on the send draws its focus ring');
      const band = await ring.evaluate((layer) => getComputedStyle(layer).clipPath);
      if (!band.startsWith('polygon(evenodd'))
        throw new Refused(`the send's ring is a band in its cut shape, as the look's cut button's is — it is clipped to ${band}`);
      await settled(page);
      await photograph(page, path.join(OUT, `chat-send-ring-${await themeOf(page)}.png`), { fullPage: true });
      await field.press('Shift+Enter');
      await field.type('and tell me when its check is green');
      const draft = await field.inputValue();
      if (!draft.includes('\n')) throw new Refused(`Shift+Enter makes a new line — the field holds ${JSON.stringify(draft)}`);
      await settled(page);
      await photograph(page, path.join(OUT, `chat-writing-${await themeOf(page)}.png`), { fullPage: true });

      const [sent] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/nemia/chat/send', {
          timeout: WAIT_MS,
        }),
        field.press('Enter'),
      ]);
      if (sent.status() !== 201)
        throw new Refused(`Enter sends what was written — the api answered ${sent.status()}: ${await sent.text()}`);
      await expectVisible(
        panel.locator('[data-chat-bubble="person"]', { hasText: draft.split('\n')[0] }),
        "the words are the person's bubble",
      );
      if ((await field.inputValue()) !== '') throw new Refused('the field is emptied once the words are sent');
      await settled(page);
      await photograph(page, path.join(OUT, `chat-open-${await themeOf(page)}.png`), { fullPage: true });

      await page.locator('[data-menu-button]').click();
      await expectRail(page, 'expanded', 'the menu button brings the rail back beside her sheet');
      await expectDocked(page);
      if ((await railCookie(page)) !== cookie) throw new Refused('asked back, the rail writes no sidebar_state: it was open already');
      await settled(page);
      await photograph(page, path.join(OUT, `chat-rail-back-${await themeOf(page)}.png`), { fullPage: true });

      await panel.getByRole('button', { name: 'Close' }).click();
      await expectCount(chatPanelOf(page), 0, 'its Close closes her sheet');
      await expectRail(page, 'expanded', 'and the rail stands as the person keeps it');
      if ((await railCookie(page)) !== cookie) throw new Refused('closing her sheet writes no sidebar_state');
      await face.click();
      await expectVisible(chatPanelOf(page), 'her face opens her sheet again');
      await expectRail(page, 'collapsed', 'and the rail folds for it again: the ask was forgotten when the sheet closed');
      await face.click();
      await expectCount(chatPanelOf(page), 0, 'pressed again, her face closes her sheet');
      await expectRail(page, 'expanded', 'and the rail comes back as it was');

      await page.setViewportSize({ width: 1600, height: 900 });
      await face.click();
      await expectDocked(page);
      await expectRail(page, 'expanded', 'at 1600 the open rail stays open beside her sheet');
      await settled(page);
      await photograph(page, path.join(OUT, `chat-wide-${await themeOf(page)}.png`), { fullPage: true });
      await chatPanelOf(page).getByRole('button', { name: 'Close' }).click();
      await expectCount(chatPanelOf(page), 0, 'its Close closes her sheet at 1600 too');

      await page.setViewportSize({ width: 390, height: 844 });
      const top = page.locator('[data-frame-header]').locator('[data-nemia-face-button]');
      await expectVisible(top, 'on a narrow screen her face is in the top bar, the rail being a drawer');
      await top.click();
      await expectVisible(page.locator('[data-slot="side-sheet-overlay"]'), 'and opens the kit’s modal sheet over the page');
      await expectVisible(page.getByRole('dialog', { name: "Nemia's chat" }), 'a dialog named for her chat');
      await expectPanelHeld(page);
      await settled(page);
      await photograph(page, path.join(OUT, `chat-narrow-${await themeOf(page)}.png`));
      await chatPanelOf(page).getByRole('button', { name: 'Close' }).click();
      await expectCount(page.locator('[data-slot="side-sheet-overlay"]'), 0, 'its Close shuts the modal sheet');
      if (was) await page.setViewportSize(was);

      const again = await openChat(page);
      await again.getByRole('link', { name: 'Open as a page' }).click();
      await page.waitForURL((url) => url.pathname === '/chat', { timeout: WAIT_MS });
      await idle(page);
      await expectVisible(page.locator('[data-chat-page] [data-chat-panel="page"]'), 'the same panel, as a page of its own');
      await expectVisible(face.and(page.locator('[aria-current="page"]')), 'her face in the rail says the page is hers');
      await expectCount(herSheetOf(page), 0, 'and opens no sheet over it: the page is the panel');
      await expectCount(page.locator('[data-chat-panel] button[aria-label="Close"]'), 0, 'a page closes on nothing, being a page');
      await settled(page);
      await photograph(page, path.join(OUT, `chat-page-${await themeOf(page)}.png`), { fullPage: true });
      await railPlace(page, 'Runs').click();
      await page.waitForURL((url) => url.pathname !== '/chat', { timeout: WAIT_MS });
      await idle(page);
      await expectCount(chatPanelOf(page), 0, 'left for another page, her sheet is closed: Open as a page closed it');
    } finally {
      if (was) await page.setViewportSize(was);
      back();
    }
    await page.goto(new URL('/', page.url()).href, { waitUntil: 'load' });
    await idle(page);
    await expectCues(page, (words) => words.includes('Down'), 'taken back, she has no session, and a Down cue is said at her face');
    await page.mouse.move(640, 400);
  },
} satisfies PageSpec;

import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { expectAlive, photograph, sidebar, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, WAIT_MS } from '../checks.ts';
import { AGENTS, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** How far a face's eyes go, in units of its hundred: what `AgentFace` gives Blobatar's gaze driver. */
const TRAVEL = 3;

/** The two sides of the page the pointer is held at, in the runner's 1280-wide viewport. */
const LEFT = 5;
const RIGHT = 1275;

/** How far off its rest a face's eyes must be before they are taken to look aside: a quarter of their travel, in pixels. */
const aside = (size: number) => 0.25 * TRAVEL * (size / 100);

/** How near its rest a face's eyes must be to be taken as still. */
const STILL = 0.05;

/**
 * Where a face's eyes are, across: the centre of its eyes' group less the centre of the face, in pixels on the page, and whether its gaze
 * driver has written where they look.
 */
const eyesOf = (face: Locator) =>
  face.evaluate((svg) => {
    const eyes = svg.querySelector<SVGGElement>('.mo-eyes');
    if (!eyes) return null;
    const box = svg.getBoundingClientRect();
    const seen = eyes.getBoundingClientRect();
    return { x: seen.x + seen.width / 2 - (box.x + box.width / 2), driven: eyes.style.getPropertyValue('--mo-track-x') !== '' };
  });

/** Waits until a face's eyes, measured as `eyesOf` does, answer `ok` given its rest; refuses with the last measure after `WAIT_MS`. */
async function waitForEyes(page: Page, face: string, rest: number, ok: 'left' | 'right' | 'rest', size: number, assertion: string) {
  try {
    await page.waitForFunction(
      ({ face, rest, ok, bound }) => {
        const svg = document.querySelector(face);
        const eyes = svg?.querySelector<SVGGElement>('.mo-eyes');
        if (!svg || !eyes) return false;
        const box = svg.getBoundingClientRect();
        const seen = eyes.getBoundingClientRect();
        const off = seen.x + seen.width / 2 - (box.x + box.width / 2) - rest;
        if (ok === 'left') return off < -bound;
        if (ok === 'right') return off > bound;
        return Math.abs(off) <= bound && eyes.style.getPropertyValue('--mo-track-x') === '';
      },
      { face, rest, ok, bound: ok === 'rest' ? STILL : aside(size) },
      { timeout: WAIT_MS },
    );
  } catch {
    const seen = await eyesOf(page.locator(face));
    throw new Refused(
      `${assertion} — its eyes sit ${seen ? (seen.x - rest).toFixed(3) : 'nowhere'}px across from their rest (${rest.toFixed(3)}px), ` +
        `${seen?.driven ? 'where its driver put them' : 'with no driver writing where they look'}; ` +
        (ok === 'rest' ? `still is within ${STILL}px` : `looking ${ok} is past ${aside(size).toFixed(3)}px`),
    );
  }
}

/** Holds the pointer at `x`, at the height of `face`: the gaze driver reads the pointer's moves on the window. */
async function pointAt(page: Page, face: Locator, x: number) {
  const box = await face.boundingBox();
  if (!box) throw new Refused('the face is laid out');
  await page.mouse.move(x, box.y + box.height / 2, { steps: 4 });
}

/** Two frames painted, so a driver that would move the eyes has had its turn. */
const twoFrames = (page: Page) =>
  page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));

/**
 * Each face follows the pointer to either side of the page, from its rest. Its rest is measured with reduced motion asked for, when its
 * driver stands down and writes nothing; once the person no longer asks, the eyes go left with the pointer and right with it. Asked again
 * with the page open, they go back to their rest and stay there wherever the pointer goes; no longer asked, they follow again, without a
 * reload.
 */
async function follows(page: Page, face: string, size: number, who: string) {
  const at = page.locator(face);
  await at.scrollIntoViewIfNeeded();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page
    .waitForFunction(
      (face) => document.querySelector<SVGGElement>(`${face} .mo-eyes`)?.style.getPropertyValue('--mo-track-x') === '',
      face,
      {
        timeout: WAIT_MS,
      },
    )
    .catch(() => {
      throw new Refused(`${who}'s face has eyes, and with reduced motion asked for no driver moves them`);
    });
  const still = await eyesOf(at);
  if (!still) throw new Refused(`${who}'s face has eyes`);
  const rest = still.x;
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await pointAt(page, at, LEFT);
  await waitForEyes(page, face, rest, 'left', size, `${who}'s eyes turn left with the pointer`);
  await pointAt(page, at, RIGHT);
  await waitForEyes(page, face, rest, 'right', size, `${who}'s eyes turn right with the pointer`);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await waitForEyes(page, face, rest, 'rest', size, `with reduced motion asked for, ${who}'s eyes go back to their rest`);
  await pointAt(page, at, LEFT);
  await twoFrames(page);
  const held = await eyesOf(at);
  if (!held || held.driven || Math.abs(held.x - rest) > STILL)
    throw new Refused(
      `with reduced motion asked for, ${who}'s eyes stay at rest wherever the pointer goes — they sit ${held ? (held.x - rest).toFixed(3) : 'nowhere'}px from it`,
    );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await pointAt(page, at, RIGHT);
  await waitForEyes(page, face, rest, 'right', size, `once the person no longer asks, ${who}'s eyes follow again, without a reload`);
}

export default {
  /**
   * The agents' faces are alive and follow the pointer: each face on the list, and the face at the head of an agent's own page, breathes
   * and blinks with nothing hovering it, and turns its eyes toward the pointer, measured, not pictured. Each is still named as a person is,
   * and a person who asks for reduced motion sees it still. Read-only.
   */
  name: 'faces',
  route: '/agents',
  expect: async (page) => {
    await sidebar(page);
    const { good } = WORKFLOWS;
    const people = [
      [AGENTS.seeded.name, 'Scribe'],
      [good.agent.name, good.agent.person],
    ] as const;
    await expectCount(page.locator('section[data-agent] svg[data-agent-face]'), people.length, 'every face on the list is a drawing');
    await expectCount(page.locator('section[data-agent] img[data-agent-face]'), 0, 'and none is a still image');
    for (const [name, person] of people) {
      const card = `section[data-agent="${name}"]`;
      await expectVisible(
        page
          .locator(card)
          .getByRole('img', { name: person, exact: true })
          .and(page.locator(`${card} svg[data-agent-face="${name}"]`)),
        `${name}'s face is named ${person}, so a screen reader says it`,
      );
      await expectAlive(page, `${card} svg[data-agent-face="${name}"]`, person);
      await follows(page, `${card} svg[data-agent-face="${name}"]`, 112, person);
    }
    const theme = await themeOf(page);
    await photograph(page, path.join(OUT, `faces-list-${theme}.png`), { fullPage: true });

    await page.goto(new URL(`/agents/repo/${good.agent.name}`, page.url()).href, { waitUntil: 'load' });
    await idle(page);
    const head = `header svg[data-agent-face="${good.agent.name}"]`;
    await expectVisible(
      page.locator('header').getByRole('img', { name: good.agent.person, exact: true }).and(page.locator(head)),
      `the face at the head of ${good.agent.name}'s page is a drawing, named ${good.agent.person}`,
    );
    await expectAlive(page, head, `${good.agent.person}, at the head of its page,`);
    await follows(page, head, 96, `${good.agent.person}, at the head of its page,`);
    await photograph(page, path.join(OUT, `faces-head-${theme}.png`), { fullPage: true });
  },
} satisfies PageSpec;

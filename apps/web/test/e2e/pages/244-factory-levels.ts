import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, pickLevel, themeOf } from '../board.ts';
import { expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { FACTORIES } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/**
 * Press `control`, or pick the level `word` in the Select it opens, wait for the api's answer to the level's write, and refuse any but a
 * 200: the levels it answered.
 */
async function wrote(
  page: Page,
  control: Locator,
  what: string,
  word?: 'Manual' | 'Semi-auto' | 'Auto',
): Promise<{ factories: { factory: string; level: string }[] }> {
  const [answer] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === '/api/level', { timeout: WAIT_MS }),
    word === undefined ? control.click() : pickLevel(page, control, word),
  ]);
  if (answer.status() !== 200) throw new Refused(`${what} — the api answered ${answer.status()}: ${await answer.text()}`);
  await idle(page);
  return (await answer.json()) as { factories: { factory: string; level: string }[] };
}

export default {
  /**
   * Each factory's level on the store's Settings, her folder trusted: every factory reads Manual, the default one's picked by the store's
   * level alone; a factory raised to Semi-auto for the stretch offered first reads raised, with its end, and keeps her session; its raise
   * ended, it reads Manual again and her session off; its default picked at Semi-auto offers a raise to Auto alone, which reads Auto until
   * ended; its default picked at Auto offers none, and picked back at Manual. The trust, her folder and the factory's level file are
   * written by the page and taken back after.
   */
  name: 'factory-levels',
  route: '/settings',
  expect: async (page) => {
    const config = path.join(store!, 'claude', '.claude.json');
    const before = fs.existsSync(config) ? fs.readFileSync(config, 'utf8') : null;
    const dir = path.join(store!, 'nemia');
    const factory = FACTORIES.bare;
    const own = path.join(store!, 'factories', factory);
    try {
      const parsed = (before === null ? {} : JSON.parse(before)) as { projects?: Record<string, unknown> };
      const trusted = { ...parsed, projects: { ...parsed.projects, [path.resolve(dir)]: { hasTrustDialogAccepted: true } } };
      fs.mkdirSync(path.dirname(config), { recursive: true });
      fs.writeFileSync(config, JSON.stringify(trusted, null, 2));
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      const section = page.locator('[data-nemia-section]');
      const row = section.locator(`[data-factory-level="${factory}"]`);
      await expectVisible(row.and(page.locator('[data-level="manual"]')), `${factory} reads Manual, no level ever set`);
      const byDefault = section.locator('[data-factory-level="default"]');
      await expectVisible(byDefault, 'the default factory has a row');
      if (await byDefault.locator('[data-factory-default], [data-factory-raise]').count())
        throw new Refused("the default factory's level is the store's: its row offers no pick and no raise");
      const up = await wrote(page, row.locator('[data-factory-raise]'), `${factory} is raised for a stretch`);
      if (up.factories.find((f) => f.factory === factory)?.level !== 'semi-auto')
        throw new Refused(`the raise puts ${factory} at Semi-auto — ${JSON.stringify(up.factories)}`);
      await expectVisible(row.and(page.locator('[data-level="semi-auto"]')), `${factory} reads Semi-auto`);
      await expectVisible(row.locator('[data-factory-raised]'), 'and raised');
      await expectVisible(row.locator('[data-factory-words]', { hasText: 'Raised until' }), 'naming when the raise ends');
      await expectVisible(section.locator('[data-nemia-session][data-state="not-filed"]'), 'a factory raised keeps her session');
      await settled(page);
      await photograph(page, path.join(OUT, `factory-levels-raised-${await themeOf(page)}.png`), { fullPage: true });
      await wrote(page, row.locator('[data-factory-end]'), 'the raise is ended');
      await expectVisible(row.and(page.locator('[data-level="manual"]')), `${factory} reads Manual again`);
      await expectVisible(section.locator('[data-nemia-session][data-state="off"]'), 'and her session off, no factory above Manual');
      await wrote(page, row.locator('[data-factory-default]'), `${factory}'s default is picked at Semi-auto`, 'Semi-auto');
      await expectVisible(row.and(page.locator('[data-level="semi-auto"]')), `${factory} reads Semi-auto by default`);
      if (await row.locator('[data-factory-raise]').count()) throw new Refused('a factory at Semi-auto by default offers no raise to it');
      await wrote(page, row.locator('[data-factory-raise-auto]'), `${factory} is raised to Auto for a stretch`);
      await expectVisible(row.and(page.locator('[data-level="auto"]')), `${factory} reads Auto`);
      await expectVisible(row.locator('[data-factory-raised]'), 'raised over its default');
      await settled(page);
      await photograph(row, path.join(OUT, `factory-levels-raised-auto-${await themeOf(page)}.png`));
      await wrote(page, row.locator('[data-factory-end]'), 'the raise to Auto is ended');
      await expectVisible(row.and(page.locator('[data-level="semi-auto"]')), `${factory} reads Semi-auto again`);
      await wrote(page, row.locator('[data-factory-default]'), `${factory}'s default is picked at Auto`, 'Auto');
      await expectVisible(row.and(page.locator('[data-level="auto"]')), `${factory} reads Auto by default`);
      if (await row.locator('[data-factory-raise], [data-factory-raise-auto]').count())
        throw new Refused('a factory at Auto by default offers no raise');
      await settled(page);
      await photograph(row, path.join(OUT, `factory-levels-auto-default-${await themeOf(page)}.png`));
      await wrote(page, row.locator('[data-factory-default]'), `${factory}'s default is picked back at Manual`, 'Manual');
      await expectVisible(row.and(page.locator('[data-level="manual"]')), `${factory} reads Manual once more`);
    } finally {
      if (before === null) fs.rmSync(config, { force: true });
      else fs.writeFileSync(config, before);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(own, { recursive: true, force: true });
    }
    await page.reload({ waitUntil: 'load' });
    await idle(page);
    await expectVisible(page.locator(`[data-factory-level="${factory}"][data-level="manual"]`), `taken back, ${factory} reads Manual`);
  },
} satisfies PageSpec;

import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, pickLevel, themeOf } from '../board.ts';
import { expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The facts the page seeds in her memory, by name, with their words. */
const FACTS = { 'owner.md': 'The owner reads in Montreal time.\n', 'style.md': 'Short sentences; evidence first.\n' } as const;

/** Pick `word` as her level, wait for the api's answer to the level's write, and refuse any but a 200: the level it wrote. */
async function switched(
  page: Page,
  section: Locator,
  word: 'Manual' | 'Semi-auto' | 'Auto',
): Promise<{ level: string; task: string | null }> {
  const [answer] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === '/api/level', { timeout: WAIT_MS }),
    pickLevel(page, section.locator('[data-nemia-pick]'), word),
  ]);
  if (answer.status() !== 200) throw new Refused(`a pick writes her level — the api answered ${answer.status()}: ${await answer.text()}`);
  await idle(page);
  return (await answer.json()) as { level: string; task: string | null };
}

/** Her memory lists the seeded facts, each folded; one opened shows its words, and the prune words say to ask her. */
async function expectMemory(section: Locator): Promise<void> {
  const memory = section.locator('[data-nemia-memory]');
  for (const name of Object.keys(FACTS)) await expectVisible(memory.locator(`[data-nemia-fact="${name}"]`), `her memory lists ${name}`);
  if (await memory.locator('[data-nemia-fact-text]').count()) throw new Refused("a fact's words are drawn only once it is opened");
  await memory.locator('[data-nemia-fact="style.md"]').getByRole('button').click();
  const text = memory.locator('[data-nemia-fact-text]');
  await expectVisible(text, 'the opened fact shows its words');
  if ((await text.textContent()) !== FACTS['style.md'])
    throw new Refused(`as she wrote them — it shows ${JSON.stringify(await text.textContent())}`);
  await expectVisible(
    memory.locator('[data-nemia-prune]', { hasText: 'ask her to in her session' }),
    'and says a fact is pruned by asking her',
  );
}

/** The page pictured as a phone shows it, its whole length, then put back to its size. */
async function photographPhone(page: Page): Promise<void> {
  const size = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  await settled(page);
  await photograph(page, path.join(OUT, `nemia-phone-${await themeOf(page)}.png`), { fullPage: true });
  if (size) await page.setViewportSize(size);
}

export default {
  /**
   * Nemia's section on the store's Settings, her folder trusted: a pick of Semi-auto writes it, which says it asks what waits on you, and
   * her session reads not filed yet, naming its task, since the e2e's api keeps no keeper; her memory lists the seeded facts and opens one;
   * a pick of Auto keeps her task and says a session kept from before asks every answer until filed again; a pick of Manual then writes
   * it and her session reads off. The trust, the facts and the level are written by the page and taken back after.
   */
  name: 'nemia',
  route: '/settings',
  expect: async (page) => {
    const config = path.join(store!, 'claude', '.claude.json');
    const before = fs.existsSync(config) ? fs.readFileSync(config, 'utf8') : null;
    const dir = path.join(store!, 'nemia');
    try {
      const parsed = (before === null ? {} : JSON.parse(before)) as { projects?: Record<string, unknown> };
      const trusted = { ...parsed, projects: { ...parsed.projects, [path.resolve(dir)]: { hasTrustDialogAccepted: true } } };
      fs.mkdirSync(path.dirname(config), { recursive: true });
      fs.writeFileSync(config, JSON.stringify(trusted, null, 2));
      fs.mkdirSync(path.join(dir, 'memory'), { recursive: true });
      for (const [name, text] of Object.entries(FACTS)) fs.writeFileSync(path.join(dir, 'memory', name), text);
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      const section = page.locator('[data-nemia-section]');
      await expectVisible(section.locator('[data-nemia-session][data-state="off"]'), 'her session is off, no level ever set');
      const on = await switched(page, section, 'Semi-auto');
      if (on.level !== 'semi-auto' || on.task === null) throw new Refused(`Semi-auto is written with a task — ${JSON.stringify(on)}`);
      await expectVisible(section.locator('[data-nemia-level="semi-auto"]'), 'her level reads Semi-auto');
      await expectVisible(section.locator('[data-nemia-session][data-state="not-filed"]'), 'her session reads not filed yet');
      await expectVisible(section.locator('[data-nemia-task]', { hasText: on.task }), 'naming its task');
      await expectVisible(
        section.getByText('what waits on you waits for your answer'),
        'Semi-auto asks what waits on you, not every write',
      );
      await expectMemory(section);
      await settled(page);
      await photograph(page, path.join(OUT, `nemia-on-${await themeOf(page)}.png`), { fullPage: true });
      await photographPhone(page);
      const auto = await switched(page, section, 'Auto');
      if (auto.level !== 'auto' || auto.task !== on.task) throw new Refused(`Auto is written, her task kept — ${JSON.stringify(auto)}`);
      await expectVisible(section.locator('[data-nemia-level="auto"]'), 'her level reads Auto');
      await expectVisible(
        section.getByText('one kept from before asks you every answer until it is filed again'),
        'Auto says it holds in a session filed since',
      );
      await settled(page);
      await photograph(page, path.join(OUT, `nemia-auto-${await themeOf(page)}.png`), { fullPage: true });
      const off = await switched(page, section, 'Manual');
      if (off.level !== 'manual') throw new Refused(`a pick of Manual then writes it — ${JSON.stringify(off)}`);
      await expectVisible(section.locator('[data-nemia-session][data-state="off"]'), 'and her session reads off');
    } finally {
      if (before === null) fs.rmSync(config, { force: true });
      else fs.writeFileSync(config, before);
      fs.rmSync(dir, { recursive: true, force: true });
    }
    await page.reload({ waitUntil: 'load' });
    await idle(page);
    await expectVisible(page.locator('[data-nemia-memory] [data-nemia-no-facts]'), 'taken back, she keeps no facts');
  },
} satisfies PageSpec;

import fs from 'node:fs';
import path from 'node:path';
import { photograph, pickLevel, railPlace, themeOf } from '../board.ts';
import { expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  /**
   * The rail's Settings leads to the store's settings, where no line is said of her folder's trust while the keeper refused none: it
   * trusts her folder itself. The e2e's api keeps no keeper, so the page writes the keeper's record of a refused trust, as the keeper
   * writes it where Claude Code's own file does not read: a pick of Semi-auto is written, a 200 that names no command and answers the
   * refusal, which stands under her level's switch, its words naming the file to mend and nothing to copy, and her session reads
   * untrusted. A pick of Manual takes it back, and the page removes the level file and the record it wrote.
   */
  name: 'nemia-untrusted',
  route: '/settings',
  expect: async (page) => {
    const nemia = path.join(store!, 'nemia');
    const levelFile = path.join(nemia, 'level.json');
    const record = path.join(nemia, 'untrusted.json');
    const config = path.join(store!, 'claude', '.claude.json');
    const refused = `Claude Code did not take the trust of her folder ${nemia}: ${config} was left as it is, since it is not JSON. Where that is a file that does not read, make it read as a JSON object again, or move it aside; the keeper gives the trust at its next beat, and files her session`;
    try {
      await page.goto(new URL('/', page.url()).href, { waitUntil: 'load' });
      await idle(page);
      await railPlace(page, 'Settings').click();
      await page.waitForURL((url) => url.pathname === '/settings', { timeout: WAIT_MS });
      await idle(page);
      await expectVisible(page.getByRole('heading', { level: 1, name: 'Settings' }), 'the rail leads to the Settings page');
      const section = page.locator('[data-nemia-section]');
      await expectVisible(
        section.locator('[data-nemia-session][data-state="resting"]'),
        'her session rests, no level ever set: a message wakes her',
      );
      const trustLine = section.locator('[data-nemia-level] [data-nemia-trust]');
      if ((await trustLine.count()) !== 0) throw new Refused('nothing is said of her trust while none was refused: the keeper gives it');
      fs.mkdirSync(nemia, { recursive: true });
      fs.writeFileSync(record, `${JSON.stringify({ refused })}\n`);
      const [answered] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === '/api/level', { timeout: WAIT_MS }),
        pickLevel(page, section.locator('[data-nemia-pick]'), 'Semi-auto'),
      ]);
      const now = (await answered.json()) as Record<string, unknown>;
      if (answered.status() !== 200 || now.level !== 'semi-auto' || 'trust' in now || now.untrusted !== refused)
        throw new Refused(
          `Semi-auto is written, naming no command and answering the refusal — ${answered.status()}: ${JSON.stringify(now)}`,
        );
      await idle(page);
      await expectVisible(section.locator('[data-nemia-level="semi-auto"]'), 'her level reads Semi-auto');
      await expectVisible(section.locator('[data-nemia-session][data-state="untrusted"]'), 'her session is not filed');
      await expectVisible(trustLine, "the keeper's refusal is said under her level's switch");
      const words = (await trustLine.textContent()) ?? '';
      if (!words.includes(config)) throw new Refused(`the refusal names the file to mend, ${config} — it says ${JSON.stringify(words)}`);
      if ((await trustLine.locator('code, [data-copy]').count()) !== 0) throw new Refused('no command is offered to copy');
      await settled(page);
      await photograph(page, path.join(OUT, `nemia-untrusted-refused-${await themeOf(page)}.png`), { fullPage: true });
      const [back] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === '/api/level', { timeout: WAIT_MS }),
        pickLevel(page, section.locator('[data-nemia-pick]'), 'Manual'),
      ]);
      if (back.status() !== 200) throw new Refused(`a pick of Manual takes it back — the api answered ${back.status()}`);
      await idle(page);
      await expectVisible(
        section.locator('[data-nemia-session][data-state="untrusted"]'),
        'and at Manual her session still reads untrusted: no message wakes her until the trust is given',
      );
    } finally {
      fs.rmSync(levelFile, { force: true });
      fs.rmSync(record, { force: true });
    }
  },
} satisfies PageSpec;

import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectClearOfEachOther, expectClearOfPanels } from '../canvas.ts';
import { expectCount, expectUncut, expectVisible, idle, Refused, settled } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

const MIN = 60_000;

/**
 * A `daemon.json` as a daemon writes it — a `wf up`'s, or the api's (`by`, `url`) — naming the e2e's own process: alive for the whole
 * e2e, and the api's parent, so the api's signal 0 reaches it, with no process start, which the api then cannot compare and reads as
 * holding (`unknown`). Heard from `quiet` ago.
 */
const daemonFile = (quiet: number, holder: Record<string, string> = {}) => {
  const heard = new Date(Date.now() - quiet).toISOString();
  return `${JSON.stringify({ pid: process.pid, ...holder, startedAt: new Date(Date.now() - quiet - 40 * MIN).toISOString(), cwd: path.join(store!, 'checkout'), every: 4_000, passedAt: heard, beatAt: heard }, null, 2)}\n`;
};

/** The api's own holder: what an api started without `--no-tick` writes. */
const API_HOLDER = { by: 'api', url: 'http://127.0.0.1:8787' };

/** How the line ends: the api's own start. */
const START = 'Start one with npm start in apps/api';

const reload = async (page: Page) => {
  await page.reload({ waitUntil: 'load' });
  await idle(page);
};

export default {
  /**
   * Whether a daemon ticks the store, over the Factory's floor. The seeded store has no daemon.json, which is true — the e2e's api runs
   * with `--no-tick` — so the Factory says so and how to start one: the api. Then a wf up alive and silent for 20 minutes, past the 15
   * that are stale at every 4 s: said as stalled, with its silence and the command, the header taller with the line and the floor fitted
   * clear of it, every card clear of the one beneath it and of the panels. Then an api holder silent as long: said by its kind. Then each
   * heard from just now: nothing is said, and the cap still is. The file is taken back, and the store reads as seeded again.
   */
  name: 'daemon',
  route: '/factories/default',
  expect: async (page) => {
    const file = path.join(store!, 'daemon.json');
    if (fs.existsSync(file)) throw new Refused(`the seeded store has no daemon.json — ${file} is there`);
    const line = page.locator('[data-daemon]');
    const shoot = async (what: string) => {
      await settled(page);
      await photograph(page, path.join(OUT, `daemon-${what}-${await themeOf(page)}.png`), { fullPage: true });
    };

    await expectVisible(
      page.locator('[data-daemon="none"]', {
        hasText: new RegExp(
          `^Nothing ticks this store, so no run moves: no daemon has held it\\. ${START}\\.$`,
        ),
      }),
      'with no daemon.json, the header says nothing ticks the store, and how to start what does',
    );
    try {
      fs.writeFileSync(file, daemonFile(20 * MIN + 30_000));
      await reload(page);
      const stalled = page.locator('[data-daemon="stalled"]', {
        hasText: new RegExp(
          `^Nothing ticks this store, so no run moves: the wf up of pid ${process.pid} is alive but silent, last heard from 20 min ago\\. ${START} — it takes the store over\\.$`,
        ),
      });
      await expectVisible(
        stalled,
        'a wf up alive and silent for 20 minutes is said as stalled, with its silence and the command that takes the store over',
      );
      await expectVisible(stalled.locator('code', { hasText: /^npm start in apps\/api$/ }), "the api's start set apart as code");
      await expectCount(line, 1, 'one line, and no other');
      if (!(await stalled.getAttribute('title'))?.startsWith(`wf up: stalled, pid ${process.pid}`)) {
        throw new Refused(
          `the line holds wf ls's own words on hover — its title is ${JSON.stringify(await stalled.getAttribute('title'))}`,
        );
      }
      await expectUncut(stalled, 'the line is read whole, wrapped rather than cut');
      await shoot('stale');
      await page.getByRole('button', { name: 'Reset layout' }).click();
      await settled(page);
      await expectClearOfEachOther(page);
      await expectClearOfPanels(page, 'with the stalled line over the floor');

      fs.writeFileSync(file, daemonFile(20 * MIN + 30_000, API_HOLDER));
      await reload(page);
      const api = page.locator('[data-daemon="stalled"]', {
        hasText: new RegExp(`^Nothing ticks this store, so no run moves: the api of pid ${process.pid} is alive but silent, last heard `),
      });
      await expectVisible(api, 'an api holder is said by its kind');
      if (!(await api.getAttribute('title'))?.startsWith(`api: stalled, pid ${process.pid} at http://127.0.0.1:8787,`)) {
        throw new Refused(`the api's line names it and its url on hover — ${JSON.stringify(await api.getAttribute('title'))}`);
      }
      await shoot('api-stale');

      for (const [holder, what] of [
        [{}, 'wf up'],
        [API_HOLDER, 'api'],
      ] as const) {
        fs.writeFileSync(file, daemonFile(1_000, holder));
        await reload(page);
        await expectVisible(page.locator('[data-cap]'), 'the cap is still said over the floor');
        await expectCount(
          line,
          0,
          `${what === 'api' ? 'an api' : 'a wf up'} heard from just now is ticking, and the Factory says nothing of it`,
        );
        await shoot(what === 'api' ? 'api-fresh' : 'fresh');
      }
    } finally {
      fs.rmSync(file, { force: true });
    }
    await reload(page);
    await expectCount(
      page.locator('[data-daemon="none"]'),
      1,
      'with the file taken back, the header says again that nothing ticks the store',
    );
  },
} satisfies PageSpec;

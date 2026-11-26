import path from 'node:path';
import { askRunAction, fed, photograph, themeOf, isRunAction } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { GATED, HELD } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { dropStoredMarker, OUT, plantStoredMarker, storedMarker } from '../world.ts';

export default {
  /**
   * A hold the package refuses, put from the board: HELD held until GATED by hand, as `nemia hold` holds it, then GATED's Hold… asked to
   * wait on HELD. The api answers 409 in `nemia hold`'s words — each would wait on the other for ever — the form says it through its
   * refusal, stays open, and nothing is written: no hold beside GATED, no Held section on its page. Its one refusal is the point, so its
   * page counts exactly it; HELD's hold is taken back after.
   */
  name: 'hold-put-refused',
  route: '/runs',
  expect: async (page) => {
    const { id } = GATED;
    const until = HELD.id;
    const refused = await page.context().newPage();
    try {
      if (storedMarker(id, 'hold') !== null || storedMarker(until, 'hold') !== null)
        throw new Refused(`no hold on ${id} or ${until} before the page writes one`);
      plantStoredMarker(until, 'hold', JSON.stringify({ at: new Date().toISOString(), until: [id] }, null, 2));
      fed(until, 'held');
      const { problems } = watch(refused);
      await refused.goto(new URL(`/runs/${id}`, page.url()).href, { waitUntil: 'load' });
      await idle(refused);
      const dialog = await askRunAction(refused, 'Hold…', `Hold ${id}`);
      await dialog.locator(`label[data-hold-run="${until}"]`).click();
      const [answered] = await Promise.all([
        refused.waitForResponse((r) => r.request().method() === 'POST' && isRunAction(new URL(r.url()).pathname, id, `/hold`), {
          timeout: WAIT_MS,
        }),
        dialog.getByRole('button', { name: 'Hold', exact: true }).click(),
      ]);
      const { error } = (await answered.json()) as { error?: string };
      const sentence = `--until ${until}: ${until} already waits on ${id} to land (${until} held until ${id}), so each would wait on the other for ever. Hold it without --until ${until}.`;
      if (answered.status() !== 409 || error !== sentence)
        throw new Refused(`the api refuses the hold in nemia hold's words — it answered ${answered.status()}: ${error}`);
      const said = dialog.locator('[role="alert"][data-hold-refused]');
      await expectVisible(said, 'the form says the refusal');
      if (!(await said.textContent())?.includes(`Not held. The api refused it:${sentence}`))
        throw new Refused(`in the package's words — it says ${JSON.stringify(await said.textContent())}`);
      await expectVisible(dialog.locator(`[data-hold-run="${until}"]`), 'and stays open, the run still offered');
      if (storedMarker(id, 'hold') !== null) throw new Refused(`nothing is written — the hold record is there`);
      await expectCount(refused.locator('section[aria-label="Held"]'), 0, `and ${id}'s page says no hold`);
      await settled(refused);
      await photograph(refused, path.join(OUT, `hold-put-refused-says-${await themeOf(refused)}.png`), { fullPage: true });
      await idle(refused);
      const expected = `request answered 409: POST ${answered.url()}`;
      const seen = problems();
      const others = seen.filter(
        (p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 409\b/.test(p),
      );
      if (!seen.includes(expected) || others.length)
        throw new Refused(
          `the refused page saw its one refusal as the browser reports it (its answer, and the line Chromium writes to the console for one) and nothing else — it saw:\n    ${seen.join('\n    ')}`,
        );
    } finally {
      await refused.close();
      const left = storedMarker(until, 'hold') !== null;
      dropStoredMarker(until, 'hold');
      dropStoredMarker(id, 'hold');
      fed(until, HELD.blocked, 'running');
      if (left) await idle(page);
    }
  },
} satisfies PageSpec;

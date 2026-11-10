import path from 'node:path';
import { photograph, stepBar, themeOf } from '../board.ts';
import { expectVisible, idle } from '../checks.ts';
import { DIAMOND } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

const { running, top } = DIAMOND;
const STEP = 'implement';

/**
 * What a step's session ran on, in its inspector's facts: the DIAMOND's running step, whose attempt recorded an image under the store's
 * `releases/<tag>/` and Claude Code's version, says the tag and the version, and the mode its harness ran it in, filed with another;
 * its top, whose attempt recorded neither, says `not recorded` on its Details tab, a finished step's inspector opening on its Output.
 */
export default {
  name: 'step-ran-on',
  route: `/runs/${running.id}?bar=step:${running.id}/${STEP}`,
  expect: async (page) => {
    const bar = stepBar(page, running.id, STEP);
    await expectVisible(bar, `the address opens ${STEP}'s inspector on ${running.id}`);
    await expectVisible(
      bar.locator('[data-fact="ran on"] dd', { hasText: `${DIAMOND.ranOn.tag} · claude ${DIAMOND.ranOn.harnessVersion}` }),
      'the step at work says the release and the Claude Code its session runs on',
    );
    await expectVisible(
      bar.locator('[data-fact="permission mode"] dd', { hasText: DIAMOND.ranIn.measured }).filter({ hasText: 'by harness' }),
      'and the mode its session says it runs in, marked as its harness\'s where it was filed with another',
    );
    await photograph(bar, path.join(OUT, `step-ran-on-inspector-${await themeOf(page)}.png`));

    await page.goto(new URL(`/runs/${top.id}?bar=step:${top.id}/${STEP}`, page.url()).href, { waitUntil: 'load' });
    await idle(page);
    const finished = stepBar(page, top.id, STEP);
    await finished.getByRole('tab', { name: 'Details', exact: true }).click();
    await expectVisible(
      finished.locator('[data-fact="ran on"] dd', { hasText: /^not recorded$/ }),
      'a step whose attempt recorded neither says so, never a guess',
    );
  },
} satisfies PageSpec;

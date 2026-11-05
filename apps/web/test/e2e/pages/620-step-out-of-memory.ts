import path from 'node:path';
import { photograph, stepBar, themeOf } from '../board.ts';
import { expectVisible } from '../checks.ts';
import { DIAMOND } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

const { landed } = DIAMOND;
const STEP = 'implement';

/**
 * A step whose session the kernel killed a process of at its memory limit, in its inspector's Details: the DIAMOND's landed run, whose
 * implement attempt recorded one kill at 4Gi and whose step names no `memory:`, says out of memory in its note, with the limit and
 * `WF_MEMORY_LIMIT`, the knob to raise — the orchestrator's words, shown as they come.
 */
export default {
  name: 'step-out-of-memory',
  route: `/runs/${landed.id}?bar=step:${landed.id}/${STEP}`,
  expect: async (page) => {
    const bar = stepBar(page, landed.id, STEP);
    await expectVisible(bar, `the address opens ${STEP}'s inspector on ${landed.id}`);
    await bar.getByRole('tab', { name: 'Details', exact: true }).click();
    const note = bar.locator('[data-note]', { hasText: 'out of memory' });
    await expectVisible(note, "the step's note says its session was killed at its memory limit");
    await expectVisible(bar.locator('[data-note]', { hasText: '4Gi' }), 'with the limit, as memory: takes it');
    await expectVisible(bar.locator('[data-note]', { hasText: 'WF_MEMORY_LIMIT' }), 'and the knob to raise, the step naming none');
    await photograph(bar, path.join(OUT, `step-out-of-memory-inspector-${await themeOf(page)}.png`));
  },
} satisfies PageSpec;

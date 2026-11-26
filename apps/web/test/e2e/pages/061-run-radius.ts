import path from 'node:path';
import { openFold, photograph, themeOf } from '../board.ts';
import { expectVisible, idle } from '../checks.ts';
import { FACTORIES, FAKE } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, storedFactory, storedRecordText, storeFactory, storeRecord } from '../world.ts';

export default {
  /**
   * The Decide section flags the files of the run's result branch by the radius of the run's factory: the seeded run is filed, for this
   * page, in the factory FACTORIES.hiring, which sets a radius, its agent-facing files and its check-affecting ones chips, and its lesson
   * a line. The run's record and the factory's file are written back as they were found.
   */
  name: 'run-radius',
  route: `/runs/${FAKE.id}`,
  expect: async (page) => {
    const hiring = FACTORIES.hiring.name;
    const foundFactory = storedFactory(hiring);
    const foundRun = storedRecordText(FAKE.id);
    try {
      const radius = { agentFacing: FAKE.agentFacing, checkAffecting: FAKE.checkAffecting, lessons: FAKE.agentFacing };
      storeFactory(hiring, JSON.stringify({ ...(JSON.parse(foundFactory) as object), radius }, null, 2));
      storeRecord(FAKE.id, JSON.stringify({ ...(JSON.parse(foundRun) as object), factory: hiring }, null, 2));
      await page.goto(new URL(`/runs/${FAKE.id}`, page.url()).href);
      await idle(page);
      const decide = (await openFold(page.locator('[data-asks]'), 'decide')).locator('section[aria-label="Decide"]');
      for (const file of FAKE.agentFacing) {
        await expectVisible(
          decide.locator('[data-chip="agent-facing"][title="the next agent reads this"]', { hasText: file }),
          `${file} is an agent-facing chip, by the radius of the run's factory`,
        );
      }
      for (const file of FAKE.checkAffecting) {
        await expectVisible(
          decide.locator('[data-chip="check-affecting"][title="could make its check pass"]', { hasText: file }),
          `${file} is a check-affecting chip`,
        );
      }
      await photograph(decide.locator(`[data-touched="${FAKE.branch}"]`), path.join(OUT, `run-decide-files-${await themeOf(page)}.png`));
      await expectVisible(
        decide.locator('[data-lesson="written"]', { hasText: FAKE.lesson }),
        `the lesson chip says what the run wrote (${FAKE.lesson})`,
      );
    } finally {
      storeRecord(FAKE.id, foundRun);
      storeFactory(hiring, foundFactory);
    }
  },
} satisfies PageSpec;

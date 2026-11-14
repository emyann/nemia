import fs from 'node:fs';
import path from 'node:path';
import { fed, openFold, partOf, photograph, themeOf } from '../board.ts';
import { expectTexts, idle, settled } from '../checks.ts';
import { HELD, REGATED, regatedFiles, writeRegated } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** Who approved REGATED's plan, as the approval's file says it: the person, under the token named `laptop`. */
const APPROVER = { kind: 'person', token: 'laptop' } as const;

/** Who held REGATED, as the hold's file says it: an agent, by the standing token the person minted for it. */
const HOLDER = { kind: 'agent', agent: 'operator', token: 'ops' } as const;

/** The hold the page writes on REGATED, until HELD lands. */
const holdFile = (): string => path.join(store!, 'runs', `${REGATED.id}.hold`);

export default {
  /**
   * Who made a write is drawn beside it, in objects' words of the actor: REGATED is written with plan's approval made by the person on
   * the token `laptop`, and held until HELD by the agent `operator` on its token `ops`, each as its file keeps the actor. The run's page
   * says each under the write — plan's approval, in its part's Detail, `the person, on laptop`, and the hold, `operator, by its token
   * ops` — then both files are taken back, from the runs page so no read finds the run gone, and the feed told: every page after reads
   * the store as seeded.
   */
  name: 'actor',
  route: '/runs',
  expect: async (page) => {
    try {
      writeRegated(store!, Date.now());
      const approval = path.join(store!, 'runs', `${REGATED.id}.asks`, 'approve-plan-1');
      const approved = JSON.parse(fs.readFileSync(approval, 'utf8')) as Record<string, unknown>;
      fs.writeFileSync(approval, `${JSON.stringify({ ...approved, actor: APPROVER })}\n`);
      fs.writeFileSync(
        holdFile(),
        JSON.stringify({ at: new Date().toISOString(), until: [HELD.id], by: 'operator', actor: HOLDER }, null, 2),
        { flag: 'wx' },
      );
      fed(REGATED.id, 'held');
      await page.goto(new URL(`/runs/${REGATED.id}`, page.url()).href, { waitUntil: 'load' });
      await idle(page);
      const detail = await openFold(partOf(page, 'plan'), 'detail');
      const byPerson = detail.locator('section[aria-label="The approval of plan"] [data-actor="person"]');
      await expectTexts(byPerson, ['the person, on laptop'], "plan's approval says the person made it, on the token laptop");
      const byAgent = page.locator('section[aria-label="Held"] [data-actor="agent"]');
      await expectTexts(byAgent, ['operator, by its token ops'], 'the hold says the agent operator put it, by its token ops');
      await byPerson.scrollIntoViewIfNeeded();
      await settled(page);
      await photograph(page, path.join(OUT, `actor-run-${await themeOf(page)}.png`));
      await page.goto(new URL('/runs', page.url()).href, { waitUntil: 'load' });
      await idle(page);
    } finally {
      fs.rmSync(holdFile(), { force: true });
      fs.rmSync(holdFile().replace(/\.hold$/, '.unheld'), { force: true });
      for (const file of regatedFiles(store!)) fs.rmSync(file, { recursive: true, force: true });
      fed(REGATED.id, 'gone');
    }
  },
} satisfies PageSpec;

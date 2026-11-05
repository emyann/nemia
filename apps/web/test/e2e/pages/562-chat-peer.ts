import path from 'node:path';
import { herChat, openChat, photograph, themeOf, type HerLine } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** Her own words, which stay hers: the agent's filled bubble. */
const HERS = 'The kit card is at its design gate, and nothing else of its run waits on you.';

/** Her session's transcript: her words alone. */
const SAID: readonly HerLine[] = [{ text: HERS }];

/** What the person wrote, drawn as their own bubble. */
const PERSON = 'Hold the second kit card until the first lands.';

/** What another agent said to her session, as itself: never drawn as the person's. */
const OPERATOR = 'The gate on the kit card holds: its review asked for one more round.';

/** Her outbox: the person's entry, which names no speaker, and the operator's, which names itself. */
const OUTBOX = [
  { id: 'o-1', at: new Date(Date.now() - 300_000).toISOString(), text: PERSON },
  {
    id: 'o-2',
    at: new Date(Date.now() - 120_000).toISOString(),
    text: OPERATOR,
    from: { kind: 'agent' as const, name: 'operator' },
  },
];

export default {
  /**
   * Another agent speaking to her session, beside the person: the operator's words drawn at the left in a ringed bubble under its own
   * name and the word `agent`, the person's alone drawn as the person's, and hers as hers. Her chat is the page's, taken back after.
   */
  name: 'chat-peer',
  route: '/',
  expect: async (page) => {
    const back = herChat({ session: 'up', said: SAID, outbox: OUTBOX });
    try {
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      const panel = await openChat(page);

      const peer = panel.locator('[data-chat-message="peer"]');
      await expectVisible(peer, "the operator's words stand as an agent's message of their own");
      await expectTexts(peer.locator('[data-chat-bubble="peer"]'), [OPERATOR], 'its bubble holds the operator’s words, as they stand');
      const who = ((await peer.textContent()) ?? '').trim();
      if (!who.startsWith('operator · agent · '))
        throw new Refused(`over its bubble, who said it: the operator, an agent — it reads ${JSON.stringify(who)}`);
      if (who.includes('You')) throw new Refused(`and never the person — it reads ${JSON.stringify(who)}`);

      await expectTexts(panel.locator('[data-chat-bubble="person"]'), [PERSON], 'the person’s bubble holds only what the person wrote');
      await expectCount(
        panel.locator('[data-chat-message="person"]', { hasText: OPERATOR }),
        0,
        'an agent’s words are never drawn as the person’s',
      );
      await expectTexts(panel.locator('[data-chat-bubble="agent"]'), [HERS], 'and her own bubble holds only her words');
      await settled(page);
      await photograph(page, path.join(OUT, `chat-peer-talk-${await themeOf(page)}.png`), { fullPage: true });
    } finally {
      back();
    }
  },
} satisfies PageSpec;

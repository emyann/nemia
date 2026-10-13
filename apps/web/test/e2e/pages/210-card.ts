import path from 'node:path';
import { expectInstant, expectKeys, expectRendered, expectSource, filesIn, sidebar } from '../board.ts';
import { expectCount, expectVisible, Refused } from '../checks.ts';
import { CARDS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { store } from '../world.ts';

export default {
  /**
   * A card's page: when it was filed, as the board writes an instant; its body rendered — a heading, a list, a table, a code block, a
   * line of raw HTML shown as text, a link that opens in a new tab and a `javascript:` one that is only its words — then its keys,
   * each with what it means as the api says it, and Source: the file as written, frontmatter included. It writes nothing: the inbox
   * is as it was.
   */
  name: 'card',
  route: `/inbox/${CARDS.rich.name}`,
  expect: async (page) => {
    await sidebar(page);
    await expectVisible(
      page.locator('[data-sidebar="sidebar"] a[data-active="true"]', { hasText: 'Inbox' }),
      "the sidebar lights Inbox on a card's page",
    );
    const { rich } = CARDS;
    const inbox = path.join(store!, 'inbox');
    const before = filesIn(inbox);
    await expectVisible(page.locator('h1', { hasText: rich.name }), `the page names the card (${rich.name})`);
    await expectVisible(page.getByRole('link', { name: '← Inbox' }), 'and leads back to the Inbox');
    const filed = page.locator('header time');
    await expectCount(filed, 1, 'the header says when the card was filed, once');
    await expectInstant(filed, 'When its file was last written: ', `when ${rich.name} was filed`);
    await expectVisible(page.locator('header', { hasText: /filed \d/ }), 'after the word filed, a space between them');

    const file = page.locator('section[aria-label="The file"]');
    const body = file.locator('[data-markdown]').first();
    await expectRendered(body, rich);
    await expectVisible(body.getByText(rich.html, { exact: true }), 'the line of raw HTML, shown as the text it is');
    await expectCount(body.locator('b, img, script'), 0, 'and no element made of it');
    await expectVisible(body.getByText(rich.unsafe, { exact: true }), 'a javascript: link, shown as its words');
    await expectCount(page.locator('a[href^="javascript:" i]'), 0, 'and no link on the page runs script');
    const link = body.getByRole('link', { name: rich.link.text });
    await expectVisible(link, `a link, as a link (${rich.link.text})`);
    const [href, target, rel] = await Promise.all([link.getAttribute('href'), link.getAttribute('target'), link.getAttribute('rel')]);
    if (href !== rich.link.href || target !== '_blank' || !rel?.split(' ').includes('noreferrer')) {
      throw new Refused(
        `a link opens in a new tab and gives the page it opens nothing of this one — href ${href}, target ${target}, rel ${rel}`,
      );
    }

    await expectKeys(page, file, `/api/inbox/${rich.name}`, { workflow: rich.workflow });
    await expectSource(file, body, path.join(inbox, `${rich.name}.md`));
    if (JSON.stringify(filesIn(inbox)) !== JSON.stringify(before))
      throw new Refused(`a card's page writes nothing — ${inbox} changed while it was open`);
  },
} satisfies PageSpec;

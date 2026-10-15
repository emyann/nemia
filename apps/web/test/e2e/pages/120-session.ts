import { sidebar } from '../board.ts';
import { expectCount, expectInside, expectNone, expectVisible, Refused } from '../checks.ts';
import { FAKE, SESSION } from '../seed.ts';
import type { PageSpec } from '../visit.ts';

export default {
  /**
   * A settled step's session, read once: its chip and a link back to the run at the top, then the conversation down to the prompt box,
   * which ends at the window's foot — the prompt, the calls with nothing said between them folded into one line, thoughts
   * folded, the session's words from their markdown, a system line and the closeout. The session has ended, so the prompt box is closed,
   * with why and where to go instead. The conversation is photographed from its start, scrolled up as a reader scrolls to it.
   */
  name: 'session',
  route: `/runs/${FAKE.id}/steps/${SESSION.step}`,
  expect: async (page) => {
    await sidebar(page);
    const top = page.locator('header[aria-label="The step"]');
    await expectVisible(top.getByRole('heading', { level: 1, name: SESSION.step, exact: true }), 'the page is headed by the step');
    await expectVisible(top.locator('[data-state="blocked"]', { hasText: 'succeeded · BLOCKED' }), "the step's chip, at the top");
    await expectVisible(top.locator(`a[href="/runs/${FAKE.id}"]`, { hasText: FAKE.title }), 'a link back to the run, by what it asked');
    await expectCount(top.locator('[data-following]'), 0, 'a settled task is read once, not followed');

    const talk = page.getByRole('region', { name: "The step's conversation" });
    await expectVisible(talk, 'the conversation');
    const prompt = page.locator(`section[aria-label="Say something to ${SESSION.step}"]`);
    await expectVisible(prompt, 'a prompt box below the conversation');
    const [box, below, foot] = [await talk.boundingBox(), await prompt.boundingBox(), { y: page.viewportSize()?.height ?? 0 }];
    if (!box || !below || !foot || Math.abs(box.y + box.height - below.y) > 2 || Math.abs(below.y + below.height - foot.y) > 2) {
      throw new Refused(
        `the conversation takes the page's height down to the prompt box, which ends at the window's foot — the conversation ends at ${box ? Math.round(box.y + box.height) : 'nothing'} px, ` +
          `the box spans ${below ? `${Math.round(below.y)}–${Math.round(below.y + below.height)}` : 'nothing'} px, the window ends at ${foot.y} px`,
      );
    }
    await expectVisible(
      talk.locator('[data-turn="said"][data-role="user"]', { hasText: 'Implement what was asked.' }),
      'the prompt, said by the user',
    );

    const fold = talk.locator('[data-turn="tools"]');
    await expectCount(fold, 1, 'one fold: the calls with nothing said between them');
    const line = fold.getByRole('button', { name: SESSION.folded });
    await expectVisible(line, `folded into one line in Claude Code web's words: ${SESSION.folded}`);
    await expectVisible(fold.getByText('1 failed', { exact: true }), 'the line says one of its calls failed');
    await expectCount(fold.locator('[data-turn="tool"]'), 0, 'folded: its calls are behind the line');
    await line.click();
    await expectCount(fold.locator('[data-turn="tool"]'), SESSION.calls, `opened: each of its ${SESSION.calls} calls`);
    await expectVisible(
      fold.locator('[data-turn="tool"][data-tool="Bash"] [data-tool-state="error"]'),
      'the call that failed says so on its line',
    );
    await expectVisible(
      fold.locator('[data-turn="thinking"]', { hasText: 'Thought, with no text kept' }),
      'a thought between two calls rides in the fold, and says no text was kept',
    );
    await expectCount(talk.locator('[data-turn="tool"][data-tool="Edit"]'), 1, 'a lone call after words is drawn as itself');

    await expectCount(talk.getByText(SESSION.thought), 0, 'a thought is folded: its text is not drawn');
    await talk.locator('[data-turn="thinking"]').first().getByRole('button', { name: 'Thought', exact: true }).click();
    await expectVisible(talk.getByText(SESSION.thought), 'opened, its text is');
    await expectVisible(
      talk.locator('[data-turn="said"][data-role="assistant"] li', { hasText: SESSION.listed }),
      "the session's words, drawn from their markdown",
    );
    await expectVisible(talk.locator('[data-turn="system"]', { hasText: SESSION.system }), 'a system line, quietly');

    const closeout = talk.locator('section[aria-label="Closeout"]');
    await expectVisible(closeout.locator('[data-outcome="blocked"]'), 'the closeout, named, with its outcome');
    await expectVisible(closeout.getByText(SESSION.closeout.needs), 'and what it needs');
    await expectCount(
      page.getByRole('link', { name: /Claude Code web/ }),
      0,
      'no link to Claude Code web: nothing the engine reads carries a URL for a session',
    );
    const field = prompt.getByRole('textbox', { name: `What to say to ${SESSION.step}'s session` });
    await expectVisible(field, 'the prompt box, closed');
    if (await field.isEnabled())
      throw new Refused(`the prompt box is disabled for a step whose session has ended (${SESSION.step} settled)`);
    if (await prompt.getByRole('button', { name: 'Send' }).isEnabled()) throw new Refused('and so is Send');
    await expectVisible(
      prompt.locator('[data-closed]', {
        hasText: `${SESSION.step}'s session has ended, so there is nobody to say anything to. To tell the step something, answer it or try it again from the run page`,
      }),
      'with why, and where to go instead',
    );
    await expectCount(talk.locator('[data-turn="told"]'), 0, 'nobody said anything to it: no turn of yours');
    await expectCount(page.locator('main input, main textarea:not([disabled])'), 0, 'nothing else to type into');

    await talk.hover();
    await page.mouse.wheel(0, -100_000);
    const scrolled = () => talk.evaluate((element) => element.scrollTop);
    await expectNone(async () => {
      const px = await scrolled();
      return px > 0 ? `it stopped ${px} px down` : null;
    }, 'the conversation scrolls up to its start for the photograph, from its end, where the scroller opens and only the closeout shows');
    await expectInside(talk.locator('[data-turn="said"][data-role="user"]'), talk, 'the prompt is in view for the photograph');
    await expectInside(line, talk, `the fold's line (${SESSION.folded}) is in view for the photograph`);
  },
} satisfies PageSpec;

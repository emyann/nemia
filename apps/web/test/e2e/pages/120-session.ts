import { sidebar } from '../board.ts';
import { expectCount, expectInside, expectNone, expectTexts, expectVisible, Refused } from '../checks.ts';
import { FAKE, SESSION } from '../seed.ts';
import type { PageSpec } from '../visit.ts';

export default {
  /**
   * A settled step's session, read once, drawn by the one conversation family: its chip and a link back to the run at the top, then the
   * band that says nothing more arrives here, and the talk down to the window's foot — the brief folded to a line that opens, the calls
   * and the thoughts among them folded into one turn, the session's words from their markdown in the agent's bubble, a line the harness
   * wrote on its own as a quiet marker, and the closeout. The session has ended, so no composer is drawn at all: the band carries why,
   * and where to go instead. Read back, the talk says so and a pill offers the way to the latest, with no count: nothing of a step's
   * session is counted unread. It is photographed from its start, scrolled up as a reader scrolls to it.
   */
  name: 'session',
  route: `/runs/${FAKE.id}/steps/${SESSION.step}`,
  expect: async (page) => {
    await sidebar(page);
    const top = page.locator('header[aria-label="The step"]');
    await expectVisible(top.getByRole('heading', { level: 1, name: SESSION.step, exact: true }), 'the page is headed by the step');
    await expectVisible(top.locator('[data-state="blocked"]', { hasText: 'waits on you' }), "the step's chip, at the top");
    await expectVisible(top.locator(`a[href="/runs/${FAKE.id}"]`, { hasText: FAKE.title }), 'a link back to the run, by what it asked');
    await expectCount(top.locator('[data-following]'), 0, 'a settled task is read once, not followed');

    const talk = page.getByRole('log', { name: "The step's conversation" });
    await expectVisible(talk, 'the talk, drawn by the family');
    await expectVisible(page.locator('[data-session-talk="latest"]'), 'opened at its latest');
    const stopped = page.locator('[data-band="stopped"]');
    await expectVisible(stopped, 'a band over the talk says nothing more arrives here');
    await expectVisible(
      stopped.getByText(
        `${SESSION.step}'s session has ended, so there is nobody to say anything to. To tell the step something, answer it or try it again from the run page`,
        { exact: false },
      ),
      'with why, and where to go instead',
    );
    await expectCount(page.locator('[data-session-composer]'), 0, 'and no composer at all: the fact is said once, in one voice');
    const [box, foot] = [await talk.boundingBox(), { y: page.viewportSize()?.height ?? 0 }];
    if (!box || Math.abs(box.y + box.height - foot.y) > 24) {
      throw new Refused(
        `the talk takes the page's height down to the window's foot — it ends at ${box ? Math.round(box.y + box.height) : 'nothing'} px, the window at ${foot.y} px`,
      );
    }

    const brief = talk.locator('[data-session-brief]');
    await expectVisible(brief.getByRole('button', { name: 'What it was told' }), 'the brief is a line, so the session’s words read first');
    await expectCount(talk.getByText('Give the board a look.'), 0, 'folded: the brief’s words are drawn nowhere');
    await brief.getByRole('button', { name: 'What it was told' }).click();
    await expectVisible(talk.getByText('Give the board a look.'), 'opened, they are');

    await expectCount(
      talk.locator('[data-session-turn="folded"]'),
      3,
      'three turns of work: the thought the session had before its first words, the calls with nothing said between them, and the lone edit after them',
    );
    const fold = talk.locator('[data-session-turn="folded"]').filter({ hasText: SESSION.folded });
    const line = fold.getByRole('button', { name: SESSION.folded });
    await expectVisible(line, `folded into one line in the family's words: ${SESSION.folded}`);
    await expectCount(fold.locator('[data-session-step]'), 0, 'folded: its lines are behind the line');
    await line.click();
    await expectCount(fold.locator('[data-session-step]'), SESSION.lines, `opened: each of its ${SESSION.lines} lines`);
    await expectCount(fold.locator('[data-session-step="error"]'), 1, 'the call that failed says so on its line');
    await expectVisible(
      fold.locator('[data-session-step]', { hasText: 'Thought, with no text kept' }),
      'a thought between two calls rides in the turn, and says no text was kept',
    );
    const read = fold.locator('[data-session-step]', { hasText: 'Read' }).first();
    await expectCount(talk.getByText(SESSION.readFirstLine, { exact: true }), 0, 'a line’s result is behind it');
    await read.click();
    await expectVisible(talk.locator('[data-session-came]', { hasText: SESSION.readFirstLine }), 'opened, what came back is drawn');
    await expectVisible(talk.locator('[data-session-asked]', { hasText: 'file_path' }), 'and what it asked, as JSON over more than a line');

    const alone = talk.locator('[data-session-turn="folded"]').first();
    await expectCount(talk.getByText(SESSION.thought), 0, 'the thought the session had on its own is behind its turn and its line');
    await alone.getByRole('button', { name: 'Worked for 0s · 1 step' }).click();
    await alone.getByRole('button', { name: 'Thought', exact: true }).click();
    await expectVisible(talk.getByText(SESSION.thought), 'opened, its words are drawn');

    await expectVisible(
      talk.locator('[data-session-bubble="agent"] li', { hasText: SESSION.listed }),
      "the session's words, drawn from their markdown",
    );
    await expectVisible(talk.locator('[data-session-marker="system"]', { hasText: SESSION.system }), 'a line the harness wrote, quietly');

    const closeout = talk.locator('[data-session-closeout]');
    await expectVisible(closeout.locator('[data-session-outcome="blocked"]'), 'the closeout, named, with its outcome');
    await expectVisible(closeout.getByText(SESSION.closeout.needs), 'and what it needs');
    await expectCount(
      page.getByRole('link', { name: /Claude Code web/ }),
      0,
      'no link to Claude Code web: nothing the engine reads carries a URL for a session',
    );
    await expectCount(talk.locator('[data-session-message="told"]'), 0, 'nobody said anything to it: no turn of yours');
    await expectCount(page.locator('main input, main textarea:not([disabled])'), 0, 'nothing else to type into');

    const scrolled = () => talk.evaluate((element) => element.scrollTop);
    const toStart = async (why: string) => {
      await talk.hover();
      await page.mouse.wheel(0, -100_000);
      await expectNone(async () => {
        const px = await scrolled();
        return px > 0 ? `it stopped ${px} px down` : null;
      }, why);
    };

    await toStart('the talk scrolls up to its start, from its end, where it opens and only the closeout shows');
    await expectVisible(page.locator('[data-session-talk="back"]'), 'read back, the talk says it is no longer at its latest');
    const jump = page.locator('[data-session-jump]');
    await expectVisible(jump, 'and a pill over it offers the way back');
    await expectTexts(jump, ['Jump to the latest'], 'with no count: a step’s session counts nothing unread, being read by opening it');
    await jump.click();
    await expectVisible(page.locator('[data-session-talk="latest"]'), 'pressed, the talk is at its latest again');
    await expectCount(page.locator('[data-session-jump]'), 0, 'and the pill goes with it');

    await toStart('the talk scrolls up to its start for the photograph');
    await expectInside(brief, talk, 'the brief is in view for the photograph');
    await expectInside(line, talk, `the turn's line (${SESSION.folded}) is in view for the photograph`);
  },
} satisfies PageSpec;

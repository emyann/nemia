import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { fed, photograph, sidebar, themeOf } from '../board.ts';
import { expectCount, expectVisible, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { DRAFT_TRANSCRIPT, SAYING } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { apiEnv, heard, OUT, REPO, store } from '../world.ts';

export default {
  /**
   * The steering channel: words said to draft's running session from its page go through the api to the session's inbox and onto its
   * record, where the step's detail and wf decide read them back. In a page of its own whose one refusal is the point, words sent after the
   * session ended while the page still shows it running are refused in the package's words under the box, and nothing is said or
   * journalled. The page follows a live session, whose stream never finishes (`follows`). It takes its writes back, draft's task journal
   * and its conversation as seeded, at work and told nothing, so each page after it, in either theme, reads the store as it was.
   */
  name: 'say',
  route: `/runs/${SAYING.run}/steps/${SAYING.step}`,
  follows: true,
  expect: async (page) => {
    await sidebar(page);
    const journal = path.join(store!, 'engine', 'tasks', `${SAYING.run}-${SAYING.step}.jsonl`);
    const seeded = fs.readFileSync(journal, 'utf8');
    const conversation = path.join(store!, DRAFT_TRANSCRIPT);
    const seededConversation = fs.readFileSync(conversation, 'utf8');
    const sayRoute = `/api/runs/${SAYING.run}/steps/${SAYING.step}/say`;
    const said = (r: { request: () => { method: () => string }; url: () => string }) =>
      r.request().method() === 'POST' && new URL(r.url()).pathname === sayRoute;
    const boxOf = (p: Page, state = '') =>
      p.locator(`section${state ? `[data-say="${state}"]` : ''}[aria-label="Say something to ${SAYING.step}"]`);
    const fieldOf = (p: Page) => boxOf(p).getByRole('textbox', { name: `What to say to ${SAYING.step}'s session` });
    const sendOf = (p: Page) => boxOf(p).getByRole('button', { name: 'Send' });
    try {
      const top = page.locator('header[aria-label="The step"]');
      await expectVisible(top.getByRole('heading', { level: 1, name: SAYING.step, exact: true }), 'the page is headed by the step');
      await expectVisible(top.locator('[data-following]'), 'a session in flight is followed live');
      const talk = page.getByRole('region', { name: "The step's conversation" });
      await expectVisible(
        talk.locator('[data-turn="said"][data-role="assistant"]', { hasText: SAYING.line }),
        "the session's words so far",
      );

      await expectVisible(boxOf(page, 'open'), 'the prompt box is open for a session in flight');
      if (await sendOf(page).isEnabled()) throw new Refused('Send is disabled while there is nothing to send');
      await fieldOf(page).fill(SAYING.words);
      const before = heard.length;
      const [response] = await Promise.all([page.waitForResponse(said, { timeout: WAIT_MS }), sendOf(page).click()]);
      if (response.status() !== 202)
        throw new Refused(
          `the api takes the words, through the board's proxy — it answered ${response.status()}: ${await response.text()}`,
        );
      const entry = (await response.json()) as { at?: unknown; attempt?: unknown; text?: unknown };
      if (typeof entry.at !== 'string' || entry.attempt !== 1 || entry.text !== SAYING.words || Object.keys(entry).length !== 3) {
        throw new Refused(`the api answers with the engine's entry, { at, attempt, text } — it answered ${JSON.stringify(entry)}`);
      }
      const inbox = JSON.stringify({ type: 'user', session_id: SAYING.sessionId, message: { role: 'user', content: SAYING.words } });
      for (const until = Date.now() + WAIT_MS; heard.length === before && Date.now() < until;)
        await new Promise((resolve) => setTimeout(resolve, 50));
      if (heard.length !== before + 1 || JSON.stringify(heard.at(-1)) !== inbox) {
        throw new Refused(`the words reached the session's inbox once, as given — it heard ${JSON.stringify(heard.slice(before))}`);
      }
      const detail = (await (await page.request.get(new URL(`/api/runs/${SAYING.run}`, page.url()).href)).json()) as {
        steps: Array<{ name: string; said?: unknown }>;
      };
      const onRecord = detail.steps.find((s) => s.name === SAYING.step)?.said;
      if (JSON.stringify(onRecord) !== JSON.stringify([entry])) {
        throw new Refused(`the step's detail carries what was said, off the engine's journal — it carries ${JSON.stringify(onRecord)}`);
      }
      const told = talk.locator('[data-turn="told"]', { hasText: SAYING.words });
      await expectVisible(told, 'the words, a turn of their own in the conversation');
      await expectVisible(told.getByText('You said, while it ran'), 'marked as yours, said while the session ran');
      await expectVisible(
        told.locator('[data-arrived]', { hasText: 'in its conversation' }),
        "the turn says the words are in the session's conversation, once its transcript, which the page follows, shows their arrival",
      );
      await expectCount(
        talk.locator('[data-turn="system"]', { hasText: SAYING.words }),
        0,
        "no system line with the words: the session's record of their arrival is the turn",
      );
      await expectCount(talk.getByText(SAYING.words, { exact: true }), 1, 'the words are drawn once');
      if ((await fieldOf(page).inputValue()) !== '') throw new Refused('the box is emptied once the words are said');
      await expectVisible(top.locator('[data-note]', { hasText: 'said to 1×' }), "the step's note says it was said to, in wf ls's words");

      let decided: string;
      try {
        decided = execFileSync(
          process.execPath,
          [path.join(REPO, 'packages', 'agent-orchestrator', 'bin', 'wf.ts'), 'decide', SAYING.run],
          { encoding: 'utf8', env: apiEnv, stdio: 'pipe' },
        );
      } catch (err) {
        const { stdout, stderr } = err as { stdout?: string; stderr?: string };
        throw new Refused(`wf decide ${SAYING.run} runs on the e2e's store — it failed:\n${stdout ?? ''}${stderr ?? ''}`);
      }
      const lines = [`    said to try 1, at ${entry.at}:`, '    ```text', `    ${SAYING.words}`, '    ```'].join('\n');
      if (!decided.includes(`\n  ${SAYING.step}\n`) || !decided.includes(lines))
        throw new Refused(
          `wf decide, on the same store, prints what was said under ${SAYING.step}, fenced, with when it was said — it printed:\n${decided}`,
        );
      await settled(page);
      await photograph(page, path.join(OUT, `say-said-${await themeOf(page)}.png`), { fullPage: true });

      const refused = await page.context().newPage();
      try {
        const { problems } = watch(refused);
        const detailPath = `/api/runs/${SAYING.run}`;
        const read = await (await refused.request.get(new URL(detailPath, page.url()).href)).text();
        await refused.route(
          (url) => url.pathname === detailPath,
          (route) => route.fulfill({ status: 200, contentType: 'application/json', body: read }),
        );
        await refused.goto(page.url(), { waitUntil: 'load' });
        await expectVisible(
          boxOf(refused, 'open'),
          'the prompt box, open, on a page of its own that holds the run as read before its session ends',
        );
        const end = new Date().toISOString();
        fs.appendFileSync(
          journal,
          [
            {
              kind: 'ended',
              at: end,
              attempt: 1,
              sessionId: `ae/${SAYING.run}-${SAYING.step}/1`,
              nativeId: SAYING.sessionId,
              observed: 'done',
              reason: 'harness',
            },
            { kind: 'settled', at: end, outcome: 'succeeded' },
          ]
            .map((event) => `${JSON.stringify(event)}\n`)
            .join(''),
        );
        const journalled = fs.readFileSync(journal, 'utf8');
        const heardBefore = heard.length;
        await fieldOf(refused).fill(SAYING.words);
        const [answered] = await Promise.all([refused.waitForResponse(said, { timeout: WAIT_MS }), sendOf(refused).click()]);
        const { error } = (await answered.json()) as { error?: string };
        const sentence = `${SAYING.step} is not running: try 1's task settled \`succeeded\`, so no session of it is there to hear anything.`;
        if (answered.status() !== 409 || !error?.startsWith(sentence)) {
          throw new Refused(
            `the package refuses words for a step whose session ended — the api answered ${answered.status()}: ${JSON.stringify(error)}`,
          );
        }
        await expectVisible(boxOf(refused).locator('[data-refused]'), 'the refusal is shown under the box, not swallowed');
        const shown = await boxOf(refused).locator('[data-refused] p.font-mono').textContent();
        if (shown !== error)
          throw new Refused(
            `the refusal under the box is the package's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`,
          );
        if ((await fieldOf(refused).inputValue()) !== SAYING.words)
          throw new Refused('the words stay in the box after a refusal, to send again');
        if (heard.length !== heardBefore)
          throw new Refused(`nothing reaches the inbox on a refusal — it heard ${JSON.stringify(heard.slice(heardBefore))}`);
        if (fs.readFileSync(journal, 'utf8') !== journalled) throw new Refused(`nothing is journalled on a refusal — ${journal} changed`);
        await settled(refused);
        await photograph(refused, path.join(OUT, `say-refused-${await themeOf(refused)}.png`), { fullPage: true });
        const expected = `request answered 409: POST ${answered.url()}`;
        const seen = problems();
        const others = seen.filter(
          (p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 409\b/.test(p),
        );
        if (!seen.includes(expected) || others.length)
          throw new Refused(
            `the refused page saw its one refusal, its answer and the line Chromium writes to the console for one, and nothing else — it saw:\n    ${seen.join('\n    ')}`,
          );
      } finally {
        await refused.close();
      }
      await expectCount(
        top.locator('[data-following]'),
        0,
        'the page following draft stops following once its session has ended, before its conversation is taken back from under the stream',
      );
    } finally {
      fs.writeFileSync(journal, seeded);
      fs.writeFileSync(conversation, seededConversation);
      fed(SAYING.run, SAYING.step, 'running');
    }
    await expectVisible(boxOf(page, 'open'), 'with the writes taken back, the box is open again once the run is read again');
  },
} satisfies PageSpec;

import fs from 'node:fs';
import path from 'node:path';
import { photograph, sidebar, themeOf } from '../board.ts';
import { expectCount, expectNone, expectVisible, Refused, settled } from '../checks.ts';
import { attachedFiles, DRAFT_TRANSCRIPT, SAYING } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { heard, OUT, store } from '../world.ts';

/** What the operator, an agent the person allowed, tells draft's running session. */
const WORDS = 'Keep the outline to five sections.';

/** The words as the session is handed them: in the frame that names the agent, never as the person's. */
const FRAMED = `The agent operator writes, not the person: ${WORDS}`;

export default {
  /**
   * Another agent's words to a step's running session: the person allows `operator` (`nemia chat allow`, planted as it writes the list),
   * the operator posts words with `from` naming itself, the session's say file hears them in the frame that names it, and the step's
   * conversation draws them at the left in a ringed bubble under `operator · agent`, unframed and once, never as the person's. It takes
   * its writes back — the list, draft's task journal, the engine's feed, its conversation and its say file, as `say` does — so each page
   * after it reads the store as seeded.
   */
  name: 'say-peer',
  route: `/runs/${SAYING.run}/steps/${SAYING.step}`,
  follows: true,
  expect: async (page) => {
    await sidebar(page);
    const taskId = `${SAYING.run}-${SAYING.step}`;
    const journal = path.join(store!, 'engine', 'tasks', `${taskId}.jsonl`);
    const engineFeed = path.join(store!, 'engine', 'feed.jsonl');
    const feedBefore = fs.readFileSync(engineFeed, 'utf8');
    const seeded = fs.readFileSync(journal, 'utf8');
    const conversation = path.join(store!, DRAFT_TRANSCRIPT);
    const seededConversation = fs.readFileSync(conversation, 'utf8');
    const speakers = path.join(store!, 'nemia', 'chat', 'speakers.json');
    const speakersBefore = fs.existsSync(speakers) ? fs.readFileSync(speakers, 'utf8') : null;
    const chatHome = path.join(store!, 'nemia');
    const chatHomeBefore = fs.existsSync(chatHome);
    try {
      fs.mkdirSync(path.dirname(speakers), { recursive: true });
      fs.writeFileSync(speakers, `${JSON.stringify({ allowed: ['operator'] })}\n`);
      const before = heard.length;
      const answered = await page.request.post(
        new URL(`/api/namespaces/default/runs/${SAYING.run}/steps/${SAYING.step}/say`, page.url()).href,
        { data: { text: WORDS, from: { kind: 'agent', name: 'operator' } } },
      );
      if (answered.status() !== 202)
        throw new Refused(`the api takes an allowed agent's words — it answered ${answered.status()}: ${await answered.text()}`);
      const entry = (await answered.json()) as { text?: unknown; from?: unknown; words?: unknown };
      if (
        entry.text !== FRAMED ||
        JSON.stringify(entry.from) !== JSON.stringify({ kind: 'agent', name: 'operator' }) ||
        entry.words !== WORDS
      )
        throw new Refused(
          `the api answers the framed words, who said them and the words themselves — it answered ${JSON.stringify(entry)}`,
        );
      await expectNone(async () => (heard.length === before ? 'it heard nothing yet' : null), "the words reached the session's say file");
      if (heard.length !== before + 1 || JSON.stringify(heard.at(-1)) !== JSON.stringify({ text: FRAMED }))
        throw new Refused(
          `the session hears the words once, in the frame that names the agent — it heard ${JSON.stringify(heard.slice(before))}`,
        );

      await page.reload({ waitUntil: 'load' });
      const talk = page.getByRole('log', { name: "The step's conversation" });
      const told = talk.locator('[data-session-message="told-peer"]', { hasText: WORDS });
      await expectVisible(told, "the operator's words, a turn of their own in the step's conversation");
      await expectVisible(told.getByText('operator · agent, while it ran', { exact: false }), 'under its own name, an agent');
      await expectVisible(told.locator('[data-session-bubble="told-peer"]'), 'in a ringed bubble of its own');
      await expectCount(talk.locator('[data-session-message="told"]', { hasText: WORDS }), 0, "never drawn as the person's");
      await expectCount(talk.getByText(WORDS, { exact: true }), 1, 'the words drawn once, unframed');
      await expectCount(talk.getByText(FRAMED, { exact: false }), 0, 'and the frame they were handed in is not drawn');
      await settled(page);
      await photograph(page, path.join(OUT, `say-peer-told-${await themeOf(page)}.png`), { fullPage: true });
    } finally {
      if (speakersBefore !== null) fs.writeFileSync(speakers, speakersBefore);
      else if (chatHomeBefore) fs.rmSync(speakers, { force: true });
      else fs.rmSync(chatHome, { recursive: true, force: true });
      fs.writeFileSync(journal, seeded);
      fs.writeFileSync(engineFeed, feedBefore);
      fs.writeFileSync(conversation, seededConversation);
      fs.rmSync(attachedFiles(store!, `ae/${taskId}/1`).say, { force: true });
    }
  },
} satisfies PageSpec;

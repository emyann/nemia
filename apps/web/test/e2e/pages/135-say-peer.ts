import fs from 'node:fs';
import path from 'node:path';
import { photograph, sidebar, themeOf } from '../board.ts';
import { expectCount, expectNone, expectVisible, Refused, settled } from '../checks.ts';
import { attachedFiles, DRAFT_TRANSCRIPT, SAYING } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { heard, OUT, store } from '../world.ts';

/** What the operator, an agent the person minted a token for, tells draft's running session. */
const WORDS = 'Keep the outline to five sections.';

/** The name of the operator's standing token, minted for the page and retired after it. */
const OPS_TOKEN = 'e2e-say-peer-ops';

/** The words as the session is handed them: in the frame that names the agent, never as the person's. */
const FRAMED = `The agent operator writes, not the person: ${WORDS}`;

export default {
  /**
   * Another agent's words to a step's running session: the person mints `operator` a standing token of its own (`POST /api/tokens`, as
   * `nemia token add <name> --agent operator` does), the operator posts words with it and names no one, the session's say file hears them
   * in the frame that names it, and the step's conversation draws them at the left in a ringed bubble under `operator · agent`, unframed
   * and once, never as the person's. An agent's token acts no lower than semi-auto (its floor), so the page puts the store's level there
   * first, as `nemia level semi-auto` writes it. It takes its writes back — the token, the level, draft's task journal, the engine's feed,
   * its conversation and its say file, as `say` does — so each page after it reads the store as seeded.
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
    const tokens = new URL('/api/tokens', page.url()).href;
    const levelFile = path.join(store!, 'nemia', 'level.json');
    const levelBefore = fs.existsSync(levelFile) ? fs.readFileSync(levelFile, 'utf8') : null;
    try {
      fs.mkdirSync(path.dirname(levelFile), { recursive: true });
      fs.writeFileSync(levelFile, `${JSON.stringify({ level: 'semi-auto', since: new Date().toISOString() })}\n`);
      const minted = await page.request.post(tokens, { data: { name: OPS_TOKEN, agent: 'operator' } });
      if (minted.status() !== 201)
        throw new Refused(`the person mints the operator a token of its own — it answered ${minted.status()}: ${await minted.text()}`);
      const { token } = (await minted.json()) as { token: string };
      const before = heard.length;
      const answered = await page.request.post(
        new URL(`/api/namespaces/default/runs/${SAYING.run}/steps/${SAYING.step}/say`, page.url()).href,
        { data: { text: WORDS }, headers: { authorization: `Bearer ${token}` } },
      );
      if (answered.status() !== 202)
        throw new Refused(`the api takes an agent's words by its own token — it answered ${answered.status()}: ${await answered.text()}`);
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
      await page.request.delete(`${tokens}/${OPS_TOKEN}`, { data: {} });
      if (levelBefore === null) fs.rmSync(levelFile, { force: true });
      else fs.writeFileSync(levelFile, levelBefore);
      fs.writeFileSync(journal, seeded);
      fs.writeFileSync(engineFeed, feedBefore);
      fs.writeFileSync(conversation, seededConversation);
      fs.rmSync(attachedFiles(store!, `ae/${taskId}/1`).say, { force: true });
    }
  },
} satisfies PageSpec;

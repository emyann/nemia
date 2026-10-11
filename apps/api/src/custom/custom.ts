/**
 * A person's custom instructions for an agent on the board: read, written and cleared through `nemia agents custom`'s entry of the
 * package's command table (`AGENTS_CUSTOM`), so the board and the command refuse the same things in the same words. They belong to an
 * agent's name, not to a place: one file per name in your store, told to whichever agent of that name a run finds. A run reads them once,
 * at its start, so a write or a clear reaches only the runs started after it; nemia's, the store's own agent's, are told to her open
 * session at her keeper's next beat.
 */
import { Hono } from 'hono';
import { AGENTS_CUSTOM, customInstructionsFile } from 'agent-orchestrator';
import { agentNameRefusal, WorkflowError } from 'agent-orchestrator/workflow';
import { type ApiEnv, served } from '../layer.ts';
import { runPlaced } from '../store.ts';

/**
 * An agent's custom instructions as the board reads them: the file they are kept in, the words (null for none), and `error`, the
 * package's refusal of a file there that does not read — a link, a frontmatter block, not a file — which stops every run naming the agent
 * until it is cleared or written again.
 */
export type CustomInstructionsAnswer = { name: string; file: string; words: string | null; error: string | null };

/** What a clear did: the file it looked at, and whether there were words to remove. */
export type CustomInstructionsCleared = { name: string; file: string; removed: boolean };

/**
 * The custom instructions' read. A name in a path is refused in the package's words (400) before a file is read, so none reaches outside
 * the folder; a name no place has is 404 (`Missing`, by `app.onError`).
 *
 * - `GET /api/custom-instructions/:name` — the custom instructions for the agent `name` (`CustomInstructionsAnswer`), read from your store
 *   on each request by the entry's handler; a file there the package refuses is answered in `error`.
 *
 * The write (`PUT`, `{ "words": "…" }`, answered as the read) and the clear (`DELETE`, `CustomInstructionsCleared`) on the same path are
 * routes the table generates from the entry (commands/routes.ts), guarded, and refused in the package's words: blank words and a
 * frontmatter block 422 (`Invalid`), each writing nothing. A save carries no version: the last write wins.
 */
export const customInstructions = new Hono<ApiEnv>().get('/api/custom-instructions/:name', (c) =>
  served(c, async ({ e, placeService, repo, home }) => {
    const { name } = c.req.param();
    const wrong = agentNameRefusal(name);
    if (wrong !== undefined) return c.json({ error: `GET /api/custom-instructions/${name}: ${wrong}` }, 400);
    try {
      return c.json((await runPlaced(placeService, e, AGENTS_CUSTOM.handler({ name, repo }, undefined, home))) as CustomInstructionsAnswer);
    } catch (err) {
      if (!(err instanceof WorkflowError)) throw err;
      return c.json({ name, file: customInstructionsFile(home, name), words: null, error: err.message } satisfies CustomInstructionsAnswer);
    }
  }),
);

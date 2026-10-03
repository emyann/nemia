/**
 * A person's custom instructions for an agent on the board: read, written and cleared through the package's own functions
 * (`readCustomInstructions`, `writeCustomInstructions`, `clearCustomInstructions`), the ones `wf agents custom` calls, so the board and the
 * command refuse the same things in the same words. They belong to an agent's name, not to a place: one file per name in your store, told
 * to whichever agent of that name a run finds. A run reads them once, at its start, so a write or a clear reaches only the runs started
 * after it.
 */
import { Schema } from 'effect';
import { Hono } from 'hono';
import { clearCustomInstructions, customInstructionsFile, readCustomInstructions, writeCustomInstructions } from 'agent-orchestrator';
import { agentNameRefusal, WorkflowError } from 'agent-orchestrator/workflow';
import { readBody, valueAt } from '../body.ts';
import { refusedBeforeReading, type Guarded } from '../guard.ts';
import { type ApiEnv, served } from '../layer.ts';

/**
 * An agent's custom instructions as the board reads them: the file they are kept in, the words (null for none), and `error`, the
 * package's refusal of a file there that does not read — a link, a frontmatter block, not a file — which stops every run naming the agent
 * until it is cleared or written again.
 */
export type CustomInstructionsAnswer = { name: string; file: string; words: string | null; error: string | null };

/** What a clear did: the file it looked at, and whether there were words to remove. */
export type CustomInstructionsCleared = { name: string; file: string; removed: boolean };

const PUT_SHAPE = '`{ "words": "<what the agent is told after its instructions>" }`';
const DELETE_SHAPE = '`{}`';

const PUT_BODY = Schema.Struct({ words: Schema.String });
const DELETE_BODY = Schema.Struct({});

/** The guard's words for a write of the custom instructions at `route`, whose body is `shape`. */
const customGuard = (route: string, shape: string): Guarded => ({
  route,
  does: "writes an agent's custom instructions",
  forAnother: 'write them',
  why: 'they are told to the agent in every run started after, in every step that names it',
  reach: "write them on the agent's page on the board",
  instead: "Write them on the agent's page on the board",
  shape,
});

/** The custom instructions for `name` in the store `home`, as the board reads them; a file the package refuses is answered in `error`. */
function customOf(home: string, name: string): CustomInstructionsAnswer {
  const file = customInstructionsFile(home, name);
  try {
    return { name, file, words: readCustomInstructions(home, name) ?? null, error: null };
  } catch (err) {
    if (!(err instanceof WorkflowError)) throw err;
    return { name, file, words: null, error: err.message };
  }
}

/**
 * The custom instructions' routes. A name in a path is refused in the package's words (400) before a file is read, so none reaches outside
 * the folder. Each write is guarded (guard.ts), and what the package refuses is answered by its kind (`app.onError`): a name no place has
 * is 404 (`Missing`), blank words and a frontmatter block 422 (`Invalid`), each writing nothing. A save carries no version: the last write
 * wins.
 *
 * - `GET /api/custom-instructions/:name` — the custom instructions for the agent `name` (`CustomInstructionsAnswer`), read from your store
 *   on each request.
 * - `PUT /api/custom-instructions/:name` — the words written (`writeCustomInstructions`), and answered as the GET reads them now.
 * - `DELETE /api/custom-instructions/:name` — the words removed (`clearCustomInstructions`): `CustomInstructionsCleared`.
 */
export const customInstructions = new Hono<ApiEnv>()
  .get('/api/custom-instructions/:name', (c) =>
    served(c, async ({ home }) => {
      const { name } = c.req.param();
      const wrong = agentNameRefusal(name);
      if (wrong !== undefined) return c.json({ error: `GET /api/custom-instructions/${name}: ${wrong}` }, 400);
      return c.json(customOf(home, name));
    }),
  )
  .put('/api/custom-instructions/:name', (c) =>
    served(c, async ({ repo, home }) => {
      const { name } = c.req.param();
      const route = `PUT /api/custom-instructions/${name}`;
      const refused = refusedBeforeReading(
        customGuard(route, PUT_SHAPE),
        c.req.header('host'),
        c.req.header('sec-fetch-site'),
        c.req.header('content-type'),
      );
      if (refused) return c.json({ error: refused.error }, refused.status);
      const wrong = agentNameRefusal(name);
      if (wrong !== undefined) return c.json({ error: `${route}: ${wrong}` }, 400);
      const read = await readBody(
        c.req,
        PUT_BODY,
        `${route} takes a JSON body: ${PUT_SHAPE}.`,
        (_, body) =>
          `${route}: \`words\` are what the agent is told after its instructions, a string: ${PUT_SHAPE}. This request's was ${JSON.stringify(valueAt(body, ['words']))}.`,
      );
      if ('status' in read) return c.json({ error: read.error }, read.status);
      writeCustomInstructions(home, name, read.body.words, repo);
      return c.json(customOf(home, name));
    }),
  )
  .delete('/api/custom-instructions/:name', (c) =>
    served(c, async ({ repo, home }) => {
      const { name } = c.req.param();
      const route = `DELETE /api/custom-instructions/${name}`;
      const refused = refusedBeforeReading(
        customGuard(route, DELETE_SHAPE),
        c.req.header('host'),
        c.req.header('sec-fetch-site'),
        c.req.header('content-type'),
      );
      if (refused) return c.json({ error: refused.error }, refused.status);
      const wrong = agentNameRefusal(name);
      if (wrong !== undefined) return c.json({ error: `${route}: ${wrong}` }, 400);
      const read = await readBody(
        c.req,
        DELETE_BODY,
        `${route} takes a JSON body: ${DELETE_SHAPE}.`,
        () => `${route} takes ${DELETE_SHAPE}.`,
      );
      if ('status' in read) return c.json({ error: read.error }, read.status);
      const removed = clearCustomInstructions(home, name, repo);
      return c.json({ name, file: customInstructionsFile(home, name), removed } satisfies CustomInstructionsCleared);
    }),
  );

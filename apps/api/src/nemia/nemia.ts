/**
 * Nemia, the store's own agent, on the api: the nemia group of `objects`' Api (`NemiaGroup`), each endpoint's handler calling the
 * orchestrator by type — her level read and set (`LEVEL`), the facts she keeps (`MEMORY`), an agent's rules for auto (`POLICY`,
 * `POLICY_CONFIRM`, `POLICY_DROP`), her custom instructions (`AGENTS_CUSTOM` for her name), and her chat (chat.ts). What each takes,
 * answers and refuses is the group's to say (packages/objects/src/nemia-api.ts); a refusal of the orchestrator's is answered by its kind
 * (`answered`, objects/refused.ts).
 */
import { HttpApiBuilder } from 'effect/http-api';
import {
  AGENTS_CUSTOM,
  customInstructionsFile,
  LEVEL,
  MEMORY,
  POLICY,
  POLICY_CONFIRM,
  POLICY_DROP,
  type Command,
  type POLICY_PROPOSE,
} from 'agent-orchestrator';
import { WorkflowError } from 'agent-orchestrator/workflow';
import { Api } from 'objects';
import type { Served } from '../layer.ts';
import { answered, answeredWrite } from '../objects/refused.ts';
import { chatAnswer, chatPage, chatRead, chatSend, chatStop, chatStream } from './chat.ts';

/**
 * What `GET /api/policy/:name` and its writes answer, as the package types it: read by the board's wire test until it reads `objects`'
 * `PolicyList`.
 */
export type PolicyAnswer = typeof POLICY_PROPOSE extends Command<infer T> ? T : never;

/** The store's own agent's name, whose custom instructions are hers (`STORE_AGENT` in the package's custom.store.ts). */
const NEMIA = 'nemia';

/**
 * Her custom instructions, through `nemia agents custom`'s entry for her name on the repository the request is served on: read bare,
 * written from `words`, cleared with `clear`. A read and a write answer the words; a clear what it removed.
 */
const custom = (s: Served, args: { words?: string; clear?: true }) =>
  s.inRequest(AGENTS_CUSTOM.handler({ name: NEMIA, repo: s.repo, ...args }));

/** Her custom instructions as a read or a write answers them; a clear's answer here is a fault of the entry's. */
const wordsOf = async (s: Served, args: { words?: string }) => {
  const read = await custom(s, args);
  if ('removed' in read) throw new Error('nemia agents custom answered a clear to a read: it clears with `clear` alone.');
  return read;
};

export const nemiaHandlers = HttpApiBuilder.group(Api, 'nemia', (handlers) =>
  handlers
    .handle('level', () => answered((s) => s.inRequest(LEVEL.handler({}))))
    .handle('setLevel', ({ payload }) => answeredWrite((s) => s.inRequest(LEVEL.handler(payload))))
    .handle('memory', () => answered((s) => s.inRequest(MEMORY.handler({}))))
    .handle('fact', ({ params: { fact } }) => answered((s) => s.inRequest(MEMORY.handler({ fact }))))
    .handle('policy', ({ params: { name } }) => answered((s) => s.inRequest(POLICY.handler({ name }))))
    .handle('confirmRule', ({ params: { name, id }, payload: { words } }) =>
      answeredWrite((s) => s.inRequest(POLICY_CONFIRM.handler({ name, id, words }))),
    )
    .handle('dropRule', ({ params: { name, id } }) => answeredWrite((s) => s.inRequest(POLICY_DROP.handler({ name, id }))))
    .handle('chat', ({ query }) => chatPage(query))
    .handle('chatStream', ({ query, headers }) => chatStream(headers['last-event-id'] || query.after || undefined))
    .handle('chatSend', ({ payload }) => chatSend(payload))
    .handle('chatStop', () => chatStop())
    .handle('chatAnswer', ({ payload }) => chatAnswer(payload))
    .handle('chatRead', ({ payload: { through } }) => chatRead(through))
    .handle('instructions', () =>
      answered(async (s) => {
        try {
          return await wordsOf(s, {});
        } catch (err) {
          if (!(err instanceof WorkflowError)) throw err;
          return { name: NEMIA, file: customInstructionsFile(s.home, NEMIA), words: null, error: err.message };
        }
      }),
    )
    .handle('writeInstructions', ({ payload: { words } }) => answeredWrite((s) => wordsOf(s, { words })))
    .handle('clearInstructions', () =>
      answeredWrite(async (s) => {
        const cleared = await custom(s, { clear: true });
        if (!('removed' in cleared)) throw new Error('nemia agents custom answered a read to a clear: it clears with `clear`.');
        return cleared;
      }),
    ),
);

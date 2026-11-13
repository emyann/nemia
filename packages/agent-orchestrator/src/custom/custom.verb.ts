/**
 * `nemia agents custom`, an entry of the command table: a person's custom instructions for one agent, read, written and cleared. The api
 * calls its handler by type (`CustomInput`) for an agent's `…/agents/<name>/instructions` and Nemia's own; each through the Agent door's
 * `custom` (`AgentDoor`, run at the store's root (`StoreRoot`) its handler is given).
 */
import { Effect, Schema } from 'effect';
import { AGENTS_CUSTOM_WORDS } from 'objects';
import type { Served } from '../command/entry.verb.ts';
import { customInstructionsFile } from '../agents/read.store.ts';
import { AgentDoor } from '../agents/agent-door.store.ts';
import { AgentName } from '../agents/agents.model.ts';
import { StoreRoot } from '../config/root.store.ts';

/** The words read: the file they are kept in, the words (null for none), and the package's refusal of the file, null where it reads. */
type Read = { name: string; file: string; words: string | null; error: string | null };

/** The words cleared: the file looked at, and whether there were words to remove. */
type Cleared = { name: string; file: string; removed: boolean };

/**
 * What `nemia agents custom`'s handler takes: the agent's `name`; the repository whose agents it is looked for in (`repo`; yours and the
 * builtins where none is named, the command line naming the folder it is typed in); `clear`, to remove the words; and the `words` to
 * write, which the command line reads off `--file` and the api is sent.
 */
export const CustomInput = Schema.Struct({
  name: Schema.String,
  repo: Schema.optionalKey(Schema.String),
  clear: Schema.optionalKey(Schema.Boolean),
  words: Schema.optionalKey(Schema.String),
});
export type CustomInput = typeof CustomInput.Type;

/**
 * `nemia agents custom`: the custom instructions for the agent `name` in the store `home` — read bare, written from `words`, removed with
 * `clear` — for a run on `repo`, `.` where none is named. Refused, writing nothing, as the package refuses: a name no place has, blank
 * words, a frontmatter block, and, on a read, a file there that does not read.
 */
export const AGENTS_CUSTOM: Served<Read | Cleared, CustomInput> = {
  ...AGENTS_CUSTOM_WORDS,
  input: CustomInput,
  handler: ({ name, repo, clear, words }) =>
    Effect.gen(function* () {
      const root = yield* StoreRoot;
      const file = customInstructionsFile(root, name);
      const door = (yield* AgentDoor).custom;
      const agent = AgentName.read(name);
      if (clear === true) return { name, file, removed: yield* door.clear(agent, repo) };
      if (words !== undefined) yield* door.write(agent, words, repo);
      return { name, file, words: (yield* door.read(agent, repo)) ?? null, error: null };
    }),
};

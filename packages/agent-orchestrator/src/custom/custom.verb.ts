/**
 * `nemia agents custom`, an entry of the command table: a person's custom instructions for one agent, read, written and cleared. The api
 * calls its handler by type (`CustomInput`) for an agent's `…/agents/<name>/instructions` and Nemia's own; each through the Agent door's
 * `custom` (`AgentDoor`, run at the store's root (`StoreRoot`) its handler is given).
 */
import { gives, givesNone, refusing, renamed } from '../command/requests.verb.ts';
import { Effect, Schema } from 'effect';
import { leftOut, type Flag, type Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { customInstructionsFile } from '../agents/read.store.ts';
import { isStoreAgent } from './custom.store.ts';
import { AgentDoor } from '../agents/agent-door.store.ts';
import { AgentName } from '../agents/agents.model.ts';
import { StoreRoot } from '../config/root.store.ts';

/** The refusal of a value flag of `nemia agents custom` given twice. */
const twice = (flag: string): string => `nemia agents custom takes ${flag} once: one agent's words are one file.`;

/** `--file <path>`, or `-` for stdin: the words to write, read by the command line's runner. */
const FILE = {
  flag: '--file',
  kind: 'text',
  key: 'file',
  takes: '--file takes the file whose words to write, or - to read them from stdin: nemia agents custom <name> --file <path>',
  twice: twice('--file'),
  only: { side: 'cli', why: 'the api is sent the words themselves, never a path to read' },
} satisfies Flag;

/** `--repo <r>`: the repository whose agents a name is looked for in. */
const REPO = {
  flag: '--repo',
  kind: 'text',
  key: 'repo',
  takes: '--repo takes the repository whose agents to look in: nemia agents custom <name> --repo <r>',
  twice: twice('--repo'),
  only: { side: 'cli', why: 'the api looks in the repository the request is served on (?repo=)' },
} satisfies Flag;

/** `nemia agents custom`'s spec: the agent's name, then `--file`, `--clear` or `--repo`. */
const SPEC: Spec = {
  positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
  flags: [FILE, REPO, { flag: '--clear', kind: 'switch', key: 'clear' }],
  unknown: (arg) =>
    `nemia agents custom takes one agent's name, then --file <path> (or --file - for stdin), --clear or --repo <r>, not ${arg}.`,
  apart: (_value, flag) => (flag === '--repo' ? REPO.takes : FILE.takes),
};

/** The words read: the file they are kept in, the words (null for none), and the package's refusal of the file, null where it reads. */
type Read = { name: string; file: string; words: string | null; error: string | null };

/** The words cleared: the file looked at, and whether there were words to remove. */
type Cleared = { name: string; file: string; removed: boolean };

/** What a write or a clear says of a run already started. */
const KEPT = 'a run already started keeps the words it was started with';

/** What a write or a clear says of the store's own agent's open session (`isStoreAgent`), which no run freezes. */
const TOLD = "her open session is told at the keeper's next beat";

/**
 * What `nemia agents custom`'s handler takes: the agent's `name`; the repository whose agents it is looked for in (`repo`, `.` where none
 * is named); `clear`, to remove the words; and the `words` to write, which the command line reads off `--file` and the api is sent.
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
/** Whether `input` names Nemia, the store's own agent, whose custom instructions the api serves at `/api/nemia/instructions`. */
const hers = (input: Readonly<Record<string, unknown>>): boolean => input.name === 'nemia';

export const AGENTS_CUSTOM: Command<Read | Cleared, CustomInput> = {
  name: 'agents custom',
  served: [
    {
      endpoint: 'agents.instructions',
      takes: (input) => !hers(input) && givesNone('words', 'clear')(input),
      request: refusing('agents custom', ['repo'], renamed({}, ['repo', 'words', 'clear'])),
    },
    {
      endpoint: 'agents.putInstructions',
      as: 'agents_custom_put',
      takes: (input) => !hers(input) && gives('words')(input),
      request: refusing('agents custom', ['repo'], renamed({}, ['repo', 'clear'])),
    },
    {
      endpoint: 'agents.deleteInstructions',
      as: 'agents_custom_delete',
      takes: (input) => !hers(input),
      request: refusing('agents custom', ['repo'], renamed({}, ['repo', 'words', 'clear'])),
    },
    {
      endpoint: 'nemia.instructions',
      as: 'nemia_instructions',
      takes: givesNone('words', 'clear'),
      request: renamed({}, ['name', 'repo', 'words', 'clear']),
    },
    {
      endpoint: 'nemia.writeInstructions',
      as: 'nemia_instructions_put',
      takes: gives('words'),
      request: renamed({}, ['name', 'repo', 'clear']),
    },
    { endpoint: 'nemia.clearInstructions', as: 'nemia_instructions_delete', request: renamed({}, ['name', 'repo', 'words', 'clear']) },
  ],
  usage: '<name> [--file <path>|-] [--clear] [--repo .]',
  help: [
    'your custom instructions for that agent: words you add to it without',
    'rewriting it, kept in <store>/custom-instructions/<name>.md and told',
    'after its instructions. Bare, prints them; --file writes them (- for',
    'stdin); --clear removes them. Words only: a frontmatter block is',
    'refused. A run keeps the words it was started with; nemia, the',
    "store's own agent, is told them in her open session",
  ],
  spec: SPEC,
  check: (args) =>
    args.clear === true && args.file !== undefined
      ? 'nemia agents custom takes --file or --clear, not both: --file writes the words, --clear removes them.'
      : leftOut(SPEC, args),
  writes: true,
  class: { bare: 'read', sets: 'ask', setsBy: ['--file', '--clear'], readsBy: ['--repo'] },
  only: {
    side: 'cli',
    why: "the api serves it as the Agent's `instructions`, `putInstructions` and `deleteInstructions` verbs of `objects`' Api (`/api/namespaces/:namespace/agents/:name/instructions`) and Nemia's at `/api/nemia/instructions`, each calling this entry's handler: no route of its own",
  },
  input: CustomInput,
  handler: ({ name, repo = '.', clear, words }) =>
    Effect.gen(function* () {
      const root = yield* StoreRoot;
      const file = customInstructionsFile(root, name);
      const door = (yield* AgentDoor).custom;
      const agent = AgentName.read(name);
      if (clear === true) return { name, file, removed: yield* door.clear(agent, repo) };
      if (words !== undefined) yield* door.write(agent, words, repo);
      return { name, file, words: (yield* door.read(agent, repo)) ?? null, error: null };
    }),
  print(data, args) {
    const name = data.name;
    const hers = isStoreAgent(name);
    if ('removed' in data)
      return [
        data.removed
          ? `${name}: custom instructions removed, ${data.file} — ${hers ? TOLD : KEPT}`
          : `${name} has no custom instructions to remove`,
      ];
    if (args.words !== undefined)
      return [
        hers
          ? `${name}: custom instructions written to ${data.file}, told after her instructions in every session she is filed with — ${TOLD}`
          : `${name}: custom instructions written to ${data.file}, told after its instructions in every run started from now — ${KEPT}`,
      ];
    if (data.words === null)
      return [`${name} has no custom instructions. Set them with nemia agents custom ${name} --file <path>, or --file - for stdin.`];
    return [data.file, '', data.words];
  },
};

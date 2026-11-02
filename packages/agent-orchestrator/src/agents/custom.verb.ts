/**
 * `nemia agents custom`, an entry of the command table: a person's custom instructions for one agent, read, written and cleared. The api
 * serves the write and the clear on the routes the table generates, and the read by a route of its own, which calls the same handler; each
 * through the Agent door's `custom` (`AgentDoor`, run `rooted` at the store's root its handler is given).
 */
import { Effect } from 'effect';
import { leftOut, type Args, type Flag, type Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { customInstructionsFile } from './read.store.ts';
import { isStoreAgent } from './custom.store.ts';
import { AgentDoor } from './agent-door.store.ts';
import { AgentName } from './agents.model.ts';
import { rooted } from '../wiring/wire.verb.ts';
import { StoreRoot } from '../config/root.store.ts';

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

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

/** `nemia agents custom`'s spec: the agent's name, then `--file`, `--clear` or `--repo`; and the words, which a body alone carries. */
const SPEC: Spec = {
  positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
  flags: [
    FILE,
    REPO,
    { flag: '--clear', kind: 'switch', key: 'clear' },
    {
      flag: '--words',
      kind: 'text',
      key: 'words',
      only: { side: 'api', why: 'the command line reads the words from --file', required: true },
    },
  ],
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
 * `nemia agents custom`: the custom instructions for the agent `name` in the store `home` — read bare, written from `words`, removed with
 * `clear` — for a run on `repo`, `.` where none is named. Refused, writing nothing, as the package refuses: a name no place has, blank
 * words, a frontmatter block, and, on a read, a file there that does not read.
 */
export const AGENTS_CUSTOM: Command<Read | Cleared> = {
  name: 'agents custom',
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
  route: [
    {
      method: 'GET',
      path: '/api/custom-instructions/:name',
      status: 200,
      hand: "a read of a command that writes: the api's route answers a file that does not read with why, beside the words",
    },
    { method: 'PUT', path: '/api/custom-instructions/:name', status: 200, sets: { clear: false } },
    { method: 'DELETE', path: '/api/custom-instructions/:name', status: 200, sets: { clear: true } },
  ],
  handler: (args, _env, home) =>
    rooted(
      home,
      'nemia agents custom',
      Effect.gen(function* () {
        const root = yield* StoreRoot;
        const name = textOf(args, 'name') ?? '';
        const repo = textOf(args, 'repo') ?? '.';
        const file = customInstructionsFile(root, name);
        const door = (yield* AgentDoor).custom;
        const agent = AgentName.read(name);
        if (args.clear === true) return { name, file, removed: yield* door.clear(agent, repo) };
        const words = textOf(args, 'words');
        if (words !== undefined) yield* door.write(agent, words, repo);
        return { name, file, words: (yield* door.read(agent, repo)) ?? null, error: null };
      }),
    ),
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

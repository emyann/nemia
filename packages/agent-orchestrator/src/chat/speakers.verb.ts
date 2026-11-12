/**
 * Who may speak in her chat as an agent, the person's to allow: `nemia chat speakers` lists the names they allowed, `nemia chat allow
 * <name>` allows one and `nemia chat disallow <name>` takes one back. Each write is the person's own setting, asked of them every time an
 * agent calls it (`class: 'ask'`, `asksAlways`). The api serves the three as the nemia group's `speakers`, `allowSpeaker` and
 * `disallowSpeaker` (`/api/nemia/chat/speakers`), calling these handlers by their `input`. The list is the chat's
 * own file (`speakers.json`, `chat.store.ts`), which `chatSay` reads to take an agent's words or refuse them, and `nemia say` reads for
 * an agent that speaks to a step's session with no token (`stepSpeaker`, say.ts).
 */
import { renamed } from '../command/requests.verb.ts';
import { StoreRoot } from '../config/root.store.ts';
import path from 'node:path';
import { Effect, Schema } from 'effect';
import { tried } from '../runtime-client.ts';
import type { Args, Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { Invalid } from '../refusal/refusal.ts';
import { speakerNameRefusal, withSpeaker, withoutSpeaker } from './chat.ts';
import { readSpeakers, writeSpeakers } from './chat.store.ts';

/** The names allowed, as each command answers them. */
export type Speakers = { readonly allowed: readonly string[] };

/** What `nemia chat speakers` takes: nothing. */
export const SpeakersInput = Schema.Struct({});
export type SpeakersInput = typeof SpeakersInput.Type;

/** What `nemia chat allow` and `nemia chat disallow` take: the name the agent speaks under, which the api reads off its path. */
export const SpeakerInput = Schema.Struct({ name: Schema.String });
export type SpeakerInput = typeof SpeakerInput.Type;

/** Her chat's folder in the store at `home`. */
const chatHome = (home: string): string => path.join(home, 'nemia');

/** The name under `name`, as the spec read it. */
const nameIn = (args: Args): string => (typeof args.name === 'string' ? args.name : '');

/** The spec of a command of one name: `nemia chat <verb> <name>`. */
const nameSpec = (verb: string): Spec => ({
  positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
  flags: [],
  unknown: (arg) => `nemia chat ${verb} takes one agent's name, and ${arg} is a second: nemia chat ${verb} <name>, once per name.`,
  missing: `nemia chat ${verb} takes the name the agent speaks under, such as operator: nemia chat ${verb} <name>.`,
});

/** The list after `change`, written where it changed: refused (`Invalid`) for a name no agent speaks under. */
const changed = (home: string, name: string, change: (allowed: readonly string[], name: string) => string[]) =>
  Effect.gen(function* () {
    const bad = speakerNameRefusal(name);
    if (bad !== undefined) return yield* Effect.fail(new Invalid({ message: bad }));
    const dir = yield* tried(() => chatHome(home));
    const allowed = change(yield* tried(() => readSpeakers(dir)), name);
    yield* tried(() => writeSpeakers(dir, allowed));
    return { allowed };
  });

/** The lines of the list. */
const listLines = ({ allowed }: Speakers): string[] =>
  allowed.length === 0 ? ['no agent may speak in her chat — nemia chat allow <name>'] : [...allowed];

/** `nemia chat speakers`: the names the person allowed an agent to speak under in her chat. */
export const CHAT_SPEAKERS: Command<Speakers, SpeakersInput> = {
  name: 'chat speakers',
  served: [{ endpoint: 'nemia.speakers' }],
  usage: '',
  help: ['the names an agent may speak under in her chat, each one you allowed'],
  spec: { positionals: [], flags: [], unknown: (arg) => `nemia chat speakers takes nothing, not ${arg}: nemia chat speakers.` },
  writes: false,
  class: 'read',
  input: SpeakersInput,
  handler: () =>
    Effect.flatMap(StoreRoot, (home) =>
      Effect.map(
        tried(() => readSpeakers(chatHome(home))),
        (allowed) => ({ allowed }),
      ),
    ),
  print: listLines,
};

/** `nemia chat allow <name>`: an agent may speak in her chat under `name`, its words drawn as its own. Asked of the person every time. */
export const CHAT_ALLOW: Command<Speakers, SpeakerInput> = {
  name: 'chat allow',
  served: [{ endpoint: 'nemia.allowSpeaker', request: renamed({ name: 'speaker' }) }],
  usage: '<name>',
  help: [
    "let an agent speak in her chat under a name, and to a step's session",
    '(nemia say --as <name>): its words reach her, the step and the board as',
    'its own, never as yours. Asked of you every time',
  ],
  spec: nameSpec('allow'),
  check: (args) => speakerNameRefusal(nameIn(args)) ?? null,
  writes: true,
  class: 'ask',
  asksAlways: true,
  input: SpeakerInput,
  handler: ({ name }) => Effect.flatMap(StoreRoot, (home) => changed(home, name, withSpeaker)),
  print: (list, { name }) => [`${name} may speak in her chat and to a step's session, as itself.`, ...listLines(list)],
};

/** `nemia chat disallow <name>`: no agent speaks in her chat under `name` any more. Asked of the person every time. */
export const CHAT_DISALLOW: Command<Speakers, SpeakerInput> = {
  name: 'chat disallow',
  served: [{ endpoint: 'nemia.disallowSpeaker', request: renamed({ name: 'speaker' }) }],
  usage: '<name>',
  help: ['take a name back: words under it are refused. Asked of you every time'],
  spec: nameSpec('disallow'),
  check: (args) => speakerNameRefusal(nameIn(args)) ?? null,
  writes: true,
  class: 'ask',
  asksAlways: true,
  input: SpeakerInput,
  handler: ({ name }) => Effect.flatMap(StoreRoot, (home) => changed(home, name, withoutSpeaker)),
  print: (list, { name }) => [`${name} may no longer speak in her chat nor to a step's session.`, ...listLines(list)],
};

/** The entries of `nemia chat`, in the order `nemia`'s help lists them. */
export const CHAT_SPEAKER_ENTRIES = [CHAT_SPEAKERS, CHAT_ALLOW, CHAT_DISALLOW] as const;

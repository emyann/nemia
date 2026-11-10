/**
 * Who may speak in her chat as an agent, the person's to allow: `nemia chat speakers` lists the names they allowed, `nemia chat allow
 * <name>` allows one and `nemia chat disallow <name>` takes one back. Each write is the person's own setting, asked of them every time an
 * agent calls it (`class: 'ask'`, `asksAlways`), and the CLI's alone while the board shows no list of speakers. The list is the chat's
 * own file (`speakers.json`, `chat.store.ts`), which `chatSay` reads to take an agent's words or refuse them.
 */
import { StoreRoot } from '../config/root.store.ts';
import path from 'node:path';
import { Effect } from 'effect';
import { tried } from '../runtime-client.ts';
import type { Args, Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { Invalid } from '../refusal/refusal.ts';
import { speakerNameRefusal, withSpeaker, withoutSpeaker } from './chat.ts';
import { readSpeakers, writeSpeakers } from './chat.store.ts';

/** The names allowed, as each command answers them. */
export type Speakers = { readonly allowed: readonly string[] };

/** Why the board serves none of them. */
const ONLY = { side: 'cli', why: 'the board shows no speaker list yet: nemia chat allow writes it' } as const;

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
const changed = (home: string, verb: string, name: string, change: (allowed: readonly string[], name: string) => string[]) =>
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
export const CHAT_SPEAKERS: Command<Speakers> = {
  name: 'chat speakers',
  usage: '',
  help: ['the names an agent may speak under in her chat, each one you allowed'],
  spec: { positionals: [], flags: [], unknown: (arg) => `nemia chat speakers takes nothing, not ${arg}: nemia chat speakers.` },
  writes: false,
  class: 'read',
  only: ONLY,
  handler: (_args) =>
    Effect.flatMap(StoreRoot, (home) =>
      Effect.map(
        tried(() => readSpeakers(chatHome(home))),
        (allowed) => ({ allowed }),
      ),
    ),
  print: listLines,
};

/** `nemia chat allow <name>`: an agent may speak in her chat under `name`, its words drawn as its own. Asked of the person every time. */
export const CHAT_ALLOW: Command<Speakers> = {
  name: 'chat allow',
  usage: '<name>',
  help: [
    'let an agent speak in her chat under a name: its words reach her and the',
    'board as its own, never as yours. Asked of you every time',
  ],
  spec: nameSpec('allow'),
  check: (args) => speakerNameRefusal(nameIn(args)) ?? null,
  writes: true,
  class: 'ask',
  asksAlways: true,
  only: ONLY,
  handler: (args) => Effect.flatMap(StoreRoot, (home) => changed(home, 'allow', nameIn(args), withSpeaker)),
  print: (list, args) => [`${nameIn(args)} may speak in her chat, as itself.`, ...listLines(list)],
};

/** `nemia chat disallow <name>`: no agent speaks in her chat under `name` any more. Asked of the person every time. */
export const CHAT_DISALLOW: Command<Speakers> = {
  name: 'chat disallow',
  usage: '<name>',
  help: ['take a name back: words under it are refused. Asked of you every time'],
  spec: nameSpec('disallow'),
  check: (args) => speakerNameRefusal(nameIn(args)) ?? null,
  writes: true,
  class: 'ask',
  asksAlways: true,
  only: ONLY,
  handler: (args) => Effect.flatMap(StoreRoot, (home) => changed(home, 'disallow', nameIn(args), withoutSpeaker)),
  print: (list, args) => [`${nameIn(args)} may no longer speak in her chat.`, ...listLines(list)],
};

/** The entries of `nemia chat`, in the order `nemia`'s help lists them. */
export const CHAT_SPEAKER_ENTRIES = [CHAT_SPEAKERS, CHAT_ALLOW, CHAT_DISALLOW] as const;

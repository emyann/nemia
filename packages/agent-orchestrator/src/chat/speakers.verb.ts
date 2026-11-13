/**
 * Who may speak in her chat as an agent, the person's to allow: `nemia chat speakers` lists the names they allowed, `nemia chat allow
 * <name>` allows one and `nemia chat disallow <name>` takes one back. Each write is the person's own setting, asked of them every time an
 * agent calls it (`class: 'ask'`, `asksAlways`). The api serves the three as the nemia group's `speakers`, `allowSpeaker` and
 * `disallowSpeaker` (`/api/nemia/chat/speakers`), calling these handlers by their `input`. The list is the chat's
 * own file (`speakers.json`, `chat.store.ts`), which `chatSay` reads to take an agent's words or refuse them, and `nemia say` reads for
 * an agent that speaks to a step's session with no token (`stepSpeaker`, say.ts).
 */
import { CHAT_ALLOW_WORDS, CHAT_DISALLOW_WORDS, CHAT_SPEAKERS_WORDS } from 'objects';
import { StoreRoot } from '../config/root.store.ts';
import path from 'node:path';
import { Effect, Schema } from 'effect';
import { tried } from '../runtime-client.ts';
import type { Served } from '../command/entry.verb.ts';
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

/** `nemia chat speakers`: the names the person allowed an agent to speak under in her chat. */
export const CHAT_SPEAKERS: Served<Speakers, SpeakersInput> = {
  ...CHAT_SPEAKERS_WORDS,
  input: SpeakersInput,
  handler: () =>
    Effect.flatMap(StoreRoot, (home) =>
      Effect.map(
        tried(() => readSpeakers(chatHome(home))),
        (allowed) => ({ allowed }),
      ),
    ),
};

/** `nemia chat allow <name>`: an agent may speak in her chat under `name`, its words drawn as its own. Asked of the person every time. */
export const CHAT_ALLOW: Served<Speakers, SpeakerInput> = {
  ...CHAT_ALLOW_WORDS,
  input: SpeakerInput,
  handler: ({ name }) => Effect.flatMap(StoreRoot, (home) => changed(home, name, withSpeaker)),
};

/** `nemia chat disallow <name>`: no agent speaks in her chat under `name` any more. Asked of the person every time. */
export const CHAT_DISALLOW: Served<Speakers, SpeakerInput> = {
  ...CHAT_DISALLOW_WORDS,
  input: SpeakerInput,
  handler: ({ name }) => Effect.flatMap(StoreRoot, (home) => changed(home, name, withoutSpeaker)),
};

/** The entries of `nemia chat`, in the order `nemia`'s help lists them. */
export const CHAT_SPEAKER_ENTRIES = [CHAT_SPEAKERS, CHAT_ALLOW, CHAT_DISALLOW] as const;

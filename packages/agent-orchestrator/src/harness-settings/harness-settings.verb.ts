/**
 * `nemia factory setting set` and `setting rm`: a harness setting a factory gives every session of its runs' steps on that harness, and
 * taken back. Written into the factory's own file through the Factory door, whether or not it is made from a template: a factory's
 * settings are the person's, never the template's.
 */
import { Effect } from 'effect';
import type { Args, Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { FactoryDoor } from '../factories/factories.store.ts';
import { rooted } from '../wiring/wire.verb.ts';
import { tried } from '../runtime-client.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
import { FactoryName } from '../factory/factory.model.ts';
import { refuseName } from '../factory/factory.store.ts';
import type { Factory } from '../factory/factory.ts';
import {
  SETTABLE,
  SETTINGS_HARNESS,
  harnessSettingsRefusal,
  isHarnessSettings,
  type HarnessSettings,
  settingKeyOf,
  settingsNamed,
  withoutSetting,
  withSetting,
} from './harness-settings.ts';

/** The text under `key`, as the spec read it. */
const textOf = (args: Args, key: string): string => (typeof args[key] === 'string' ? args[key] : '');

/** Why the api does not write a setting: the board shows none yet. */
const ONLY_HERE = { side: 'cli', why: 'the board shows no harness setting yet: nemia factory setting writes them' } as const;

const SET_USAGE = '<factory> <harness>.<key> <json>';
const RM_USAGE = '<factory> <harness>.<key>';

/** The forms of `nemia factory setting`, as `nemia factory --help` lists them beside the factory's others. */
export const SETTING_FORMS = `nemia factory setting set ${SET_USAGE}  (nemia factory setting set --help)
nemia factory setting rm ${RM_USAGE}`;

/** `nemia factory setting set --help`: what a harness setting is, which a factory may set, and why. */
const SETTING_HELP = `${SETTING_FORMS}

A harness setting is a setting of a harness a factory gives every session of its runs' steps on that
harness, on top of the repository's own settings, as a container is given its configuration by its
Pod: the Agent SDK's settings option, never a file written into the repository. Its value is
JSON: nemia factory setting set f ${SETTINGS_HARNESS}.attribution '{"commit":"","pr":""}' writes no
Co-Authored-By trailer and no pull request line. A step's own agent's settings win a key both name.

A factory sets these alone: ${SETTABLE.map((k) => `${SETTINGS_HARNESS}.${k}`).join(', ')}.
Each changes what a session writes or says, and none what it may reach or run. Every other key is
refused, those that widen a fence (permissions, hooks, MCP servers, the sandbox, env) or run a
program among them: each keeps its own field or fence, which the refusal names.

Kept in the factory's own file (factories/<name>.json, "harnessSettings"), never in a template, and
kept by nemia factory adopt and upgrade. Frozen on a run at its start, so a run in flight keeps what
it began with; a key written into the file by hand that a factory may not set refuses the start.
nemia factory lists them under the factory.

Refused, and nothing written: a key that is not <harness>.<key>, a harness other than the default
one (${SETTINGS_HARNESS}), a key or a value a factory may not set, a value that is not JSON, the default
factory, and a setting rm of a key it does not set.`;

/** A spec of `nemia factory setting <verb>`: the factory, the setting, and its value where `valued`. */
const specOf = (verb: string, usage: string, valued: boolean): Spec => ({
  positionals: [
    { key: 'factory', takes: 'required', kind: 'name' },
    { key: 'setting', takes: 'required', kind: 'name' },
    ...(valued ? [{ key: 'value', takes: 'required', kind: 'text' } as const] : []),
  ],
  flags: [],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia factory setting ${verb} does not take ${arg}: nemia factory setting ${verb} ${usage}.`
      : `nemia factory setting ${verb} takes one setting, and ${arg} is one more: nemia factory setting ${verb} ${usage}, once per setting (quote a JSON value).`,
  missing: `nemia factory setting ${verb} takes ${usage}. Nothing was changed.`,
  flagFirst: true,
});

/** `<harness>.<key>` as typed, split, or `Invalid` naming how to type it. */
const keyOf = (spelled: string) => {
  const key = settingKeyOf(spelled);
  return typeof key === 'string' ? Effect.fail(new Invalid({ message: key })) : Effect.succeed(key);
};

/** `text` read as JSON, or `Invalid` naming how to quote it. */
const jsonOf = (text: string): Effect.Effect<unknown, Invalid> =>
  Effect.try({
    try: (): unknown => JSON.parse(text),
    catch: () =>
      new Invalid({ message: `${text} is not JSON: quote it, as '{"commit":"","pr":""}', '"french"' or false. Nothing was changed.` }),
  });

/**
 * `nemia factory setting set`: a harness setting given to every session on its harness of the factory's runs started after, a second of
 * one key replacing the first. Refused before anything is written, each `Invalid`: a setting not spelled `<harness>.<key>`, a value that
 * is not JSON, and a harness, key or value a factory may not set (`harnessSettingsRefusal`); the default factory and a name with no
 * factory, as every factory write refuses them.
 */
export const FACTORY_SETTING_SET: Command<{ file: string; name: string; value: unknown }> = {
  name: 'factory setting set',
  usage: SET_USAGE,
  help: [
    "give every session of a factory's runs on a harness one of its settings,",
    `${SETTINGS_HARNESS}.attribution among them; its value is JSON`,
  ],
  spec: specOf('set', SET_USAGE, true),
  manual: SETTING_HELP,
  writes: true,
  class: 'ask',
  only: ONLY_HERE,
  handler: (args, _env, home) => {
    const name = textOf(args, 'factory');
    return rooted(
      home,
      'factory setting set',
      Effect.gen(function* () {
        const { harness, key } = yield* keyOf(textOf(args, 'setting'));
        const value = yield* jsonOf(textOf(args, 'value'));
        yield* tried(() => refuseName(name, 'setting'));
        const door = yield* FactoryDoor;
        const factory = yield* door.factories.read(FactoryName.read(name));
        const harnessSettings = withSetting(factory.harnessSettings, harness, key, value);
        const refused = harnessSettingsRefusal(harnessSettings, name);
        if (refused) return yield* Effect.fail(new Invalid({ message: `${refused}. Nothing was changed.` }));
        const file = yield* door.factories.rewrite({ ...factory, harnessSettings });
        return { file, name: `${harness}.${key}`, value };
      }),
    );
  },
  print: ({ file, name, value }, args) => [
    `${textOf(args, 'factory')}  setting ${name} ${JSON.stringify(value)}`,
    `changed: ${file} — runs started from now on are given it; a run in flight keeps what it was started with`,
  ],
};

/** `nemia factory setting rm`: a harness setting taken off a factory, by its key; runs started after are given it no more. */
export const FACTORY_SETTING_RM: Command<{ file: string; removed: string }> = {
  name: 'factory setting rm',
  usage: RM_USAGE,
  help: ['take a harness setting off a factory, by its key'],
  spec: specOf('rm', RM_USAGE, false),
  writes: true,
  class: 'ask',
  only: ONLY_HERE,
  handler: (args, _env, home) => {
    const name = textOf(args, 'factory');
    return rooted(
      home,
      'factory setting rm',
      Effect.gen(function* () {
        const { harness, key } = yield* keyOf(textOf(args, 'setting'));
        yield* tried(() => refuseName(name, 'setting'));
        const door = yield* FactoryDoor;
        const factory = yield* door.factories.read(FactoryName.read(name));
        const removed = `${harness}.${key}`;
        const named = settingsNamed(factory.harnessSettings).map((s) => s.name);
        if (!named.includes(removed))
          return yield* Effect.fail(
            new Missing({
              message: `${name} sets no ${removed}: ${named.length ? `its settings are ${named.join(', ')}` : 'it sets none'}. Nothing was removed.`,
            }),
          );
        const { harnessSettings: _gone, ...rest } = factory;
        const left = withoutSetting(factory.harnessSettings, harness, key);
        const file = yield* door.factories.rewrite(left ? { ...rest, harnessSettings: left } : rest);
        return { file, removed };
      }),
    );
  },
  print: ({ file, removed }, args) => [`${textOf(args, 'factory')}  setting ${removed} removed`, `changed: ${file}`],
};

/**
 * The harness settings of `factory` a run in it freezes, or why it cannot start (`harnessSettingsRefusal`, a key a person wrote by hand
 * that a factory may not set); none in the default factory, and for a factory that names none.
 */
export const settingsAt = (factory: Factory | undefined): Effect.Effect<HarnessSettings | undefined, Invalid> => {
  const settings = factory?.harnessSettings;
  if (factory === undefined || settings === undefined) return Effect.succeed(undefined);
  if (isHarnessSettings(settings)) return Effect.succeed(settings);
  return Effect.fail(new Invalid({ message: harnessSettingsRefusal(settings, factory.name) ?? 'its harness settings do not read' }));
};

/** `nemia factory setting`'s entries, in the order `nemia`'s help lists them. */
export const FACTORY_SETTINGS: readonly Command[] = [FACTORY_SETTING_SET, FACTORY_SETTING_RM] as readonly Command[];

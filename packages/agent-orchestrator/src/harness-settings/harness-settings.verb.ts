/**
 * `nemia factory setting set` and `setting rm`: a harness setting a factory gives every session of its runs' steps on that harness, and
 * taken back. Written into the factory's own file through the Factory door, whether or not it is made from a template: a factory's
 * settings are the person's, never the template's. Served on both sides, typed by their `input`: the api's `putSetting` and
 * `deleteSetting` call these handlers.
 */
import { Effect, Schema } from 'effect';
import { FACTORY_SETTING_RM_WORDS, FACTORY_SETTING_SET_WORDS } from 'objects';
import { tableEntry, type Served } from '../command/entry.verb.ts';
import { FactoryDoor, filedFactory, refuseName } from '../factory/door/factories.store.ts';
import { tried } from '../runtime-client.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
import type { Factory } from '../factory/factory.ts';
import {
  harnessSettingsRefusal,
  isHarnessSettings,
  type HarnessSettings,
  settingKeyOf,
  settingsNamed,
  withoutSetting,
  withSetting,
} from './harness-settings.ts';

/**
 * What `nemia factory setting set` takes: the factory, the setting as `<harness>.<key>`, and its value as JSON text, read by the handler
 * as the command line types it (`'{"commit":"","pr":""}'`, `'"french"'`, `false`).
 */
export const SettingSetInput = Schema.Struct({ factory: Schema.String, setting: Schema.String, value: Schema.String });
export type SettingSetInput = typeof SettingSetInput.Type;

/** What `nemia factory setting rm` takes: the factory, and the setting taken back, as `<harness>.<key>`. */
export const SettingRmInput = Schema.Struct({ factory: Schema.String, setting: Schema.String });
export type SettingRmInput = typeof SettingRmInput.Type;

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
export const FACTORY_SETTING_SET: Served<{ file: string; name: string; value: unknown }, SettingSetInput> = {
  ...FACTORY_SETTING_SET_WORDS,
  input: SettingSetInput,
  handler: ({ factory: name, setting, value: text }) =>
    Effect.gen(function* () {
      const { harness, key } = yield* keyOf(setting);
      const value = yield* jsonOf(text);
      yield* tried(() => refuseName(name, 'setting'));
      const door = yield* FactoryDoor;
      const factory = yield* filedFactory(name, 'setting');
      const harnessSettings = withSetting(factory.harnessSettings, harness, key, value);
      const refused = harnessSettingsRefusal(harnessSettings, name);
      if (refused) return yield* Effect.fail(new Invalid({ message: `${refused}. Nothing was changed.` }));
      const file = yield* door.factories.rewrite({ ...factory, harnessSettings });
      return { file, name: `${harness}.${key}`, value };
    }),
};

/** `nemia factory setting rm`: a harness setting taken off a factory, by its key; runs started after are given it no more. */
export const FACTORY_SETTING_RM: Served<{ file: string; removed: string }, SettingRmInput> = {
  ...FACTORY_SETTING_RM_WORDS,
  input: SettingRmInput,
  handler: ({ factory: name, setting }) =>
    Effect.gen(function* () {
      const { harness, key } = yield* keyOf(setting);
      yield* tried(() => refuseName(name, 'setting'));
      const door = yield* FactoryDoor;
      const factory = yield* filedFactory(name, 'setting');
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
export const FACTORY_SETTINGS: readonly Served[] = [tableEntry(FACTORY_SETTING_SET), tableEntry(FACTORY_SETTING_RM)];

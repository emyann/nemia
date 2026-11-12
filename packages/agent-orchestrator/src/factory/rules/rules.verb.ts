/**
 * `nemia factory rules`, an entry of the command table: a factory's rules, the words told to every agent hired into it — read bare,
 * written from `--file`, removed with `--clear`. The api's Factory `rules`, `putRules` and `deleteRules` (`objects`' Api) call its handler
 * by its `input`. Both through the Factory door (`FactoryDoor`); `factoryRules(home, name)` reads the files
 * at the root it is handed, for the package's callers not yet on it.
 */
import { doorAtOnce, FactoryDoor } from '../door/factories.store.ts';
import type { Served } from '../../command/entry.verb.ts';
import { Effect, Schema } from 'effect';
import { FACTORY_RULES_WORDS, FactoryRulesWrite } from 'objects';
import type { Refusal } from '../../refusal/refusal.ts';
import { FactoryName } from '../factory.model.ts';

/**
 * A factory's rules as they read: its factory's `name`; `file`, the file they are kept in; `words`, null where there are none; and `error`,
 * why the file there cannot be told to a step, else null. `removed`, on a clear alone: whether there were rules to remove.
 */
export type FactoryRules = { name: string; file: string; words: string | null; error: string | null; removed?: boolean };

/**
 * The rules of the factory `name` in the store `home`, read afresh where they are kept, through the Factory door at once. Refused as the
 * door refuses the read: the default factory, which keeps none (`Conflict`), a name that is no slug or whose file does not read
 * (`Invalid`), a name with no file (`Missing`).
 */
export function factoryRules(home: string, name: string): FactoryRules {
  return { name, ...doorAtOnce(home, (door) => door.rules.read(FactoryName.read(name))) };
}

/**
 * What `nemia factory rules` takes: the factory, and the words to write (`objects`' `FactoryRulesWrite`, read by the command line's runner
 * from `--file`) or `clear`; neither, a read.
 */
export const RulesInput = Schema.Struct({
  factory: Schema.String,
  words: Schema.optionalKey(FactoryRulesWrite.fields.words),
  clear: Schema.optionalKey(Schema.Boolean),
});
export type RulesInput = typeof RulesInput.Type;

/**
 * The rules of the factory `name`, after they are written from `words` or removed with `clear`, where they ask either. Refused, writing
 * nothing: as `FACTORY_RULES` says.
 */
function ruled({ factory: name, words, clear }: RulesInput): Effect.Effect<FactoryRules, Refusal> {
  return Effect.gen(function* () {
    const door = yield* FactoryDoor;
    const factory = FactoryName.read(name);
    if (clear === true) {
      const removed = yield* door.rules.clear(factory);
      return { name, ...(yield* door.rules.read(factory)), removed };
    }
    if (words !== undefined) yield* door.rules.write(factory, words);
    return { name, ...(yield* door.rules.read(factory)) };
  });
}

/**
 * `nemia factory rules`: the rules of the factory `name` — read bare, written from `words`, removed with `clear` — and the rules read
 * after. Refused, writing nothing: the default factory (`Conflict`); a factory that is not there (`Missing`) or does not read; `--file`
 * with `--clear`; blank words and a frontmatter block (`Invalid`); and a templated factory whose tree is not rendered yet (`Conflict`).
 */
export const FACTORY_RULES: Served<FactoryRules, RulesInput> = {
  ...FACTORY_RULES_WORDS,
  input: RulesInput,
  handler: (args) => ruled(args),
};

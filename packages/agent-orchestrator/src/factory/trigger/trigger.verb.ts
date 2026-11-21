/**
 * A factory's own card triggers, written by `nemia factory trigger` and taken back by `untrigger`: entries of the command table the api
 * serves as a Trigger's writes, `/api/namespaces/:namespace/triggers/:name`, each judged by the wiring (`wiringRefusal`) through `wire`.
 * The trigger of the time kind is the factory's schedule, written by `nemia factory schedule`.
 */
import { Effect, Schema } from 'effect';
import { FACTORY_TRIGGER_WORDS, FACTORY_UNTRIGGER_WORDS } from 'objects';
import { tableEntry, type Served } from '../../command/entry.verb.ts';
import { wire } from '../wiring/wire.verb.ts';
import { triggerSelectorRefusal, untriggeredRefusal, type CardTrigger } from '../factory.ts';
import { Invalid, Missing } from '../../refusal/refusal.ts';
import { selectorsRefusal } from '../../watch/selector.ts';

/** What `nemia factory trigger` takes: the factory, the trigger's name, its selector, and the workflow a card naming none is queued on. */
export const TriggerInput = Schema.Struct({
  factory: Schema.String,
  name: Schema.String,
  selector: Schema.String,
  to: Schema.String,
});
export type TriggerInput = typeof TriggerInput.Type;

/** What `nemia factory untrigger` takes: the factory, and the name of its own trigger taken back. */
export const UntriggerInput = Schema.Struct({ factory: Schema.String, name: Schema.String });
export type UntriggerInput = typeof UntriggerInput.Type;

/** What `nemia factory trigger` answers: the file written, the trigger, and the one it replaced, or null. */
type Triggered = { file: string; trigger: CardTrigger; replaced: CardTrigger | null };

/** `nemia factory trigger`: a card trigger, which queues each card of the factory its selector selects. */
export const FACTORY_TRIGGER: Served<Triggered, TriggerInput> = {
  ...FACTORY_TRIGGER_WORDS,
  input: TriggerInput,
  handler: ({ factory, name, selector, to }) =>
    Effect.gen(function* () {
      const bad = selectorsRefusal([selector]);
      if (bad !== undefined) return yield* Effect.fail(new Invalid({ message: triggerSelectorRefusal(bad) }));
      const trigger: CardTrigger = { selector: selector.trim(), target: { kind: 'Workflow', name: to }, since: new Date().toISOString() };
      const { was, file } = yield* wire(factory, { verb: 'trigger', name, trigger });
      return { file, trigger, replaced: was.triggers?.[name] ?? null } satisfies Triggered;
    }),
};

/** `nemia factory untrigger`: a factory's own card trigger taken back. */
export const FACTORY_UNTRIGGER: Served<{ file: string; cleared: CardTrigger }, UntriggerInput> = {
  ...FACTORY_UNTRIGGER_WORDS,
  input: UntriggerInput,
  handler: ({ factory, name }) =>
    Effect.gen(function* () {
      const { was, file } = yield* wire(factory, { verb: 'untrigger', name });
      const cleared = was.triggers?.[name];
      if (cleared === undefined)
        return yield* Effect.fail(new Missing({ message: untriggeredRefusal(factory, name, Object.keys(was.triggers ?? {})) }));
      return { file, cleared };
    }),
};

/** `nemia factory trigger` and `untrigger`'s entries, in the order `nemia`'s help lists them. */
export const FACTORY_TRIGGERS: readonly Served[] = [tableEntry(FACTORY_TRIGGER), tableEntry(FACTORY_UNTRIGGER)];

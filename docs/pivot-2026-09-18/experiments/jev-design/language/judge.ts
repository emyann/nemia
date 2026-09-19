/**
 * A judgment, the way a check is: asked once over fixed input, a closed set of answers, recorded as a fact.
 *
 * `Judge` is a service with three layers: `live` (TypeSafe), `recording` (live, and every verdict appended to a
 * JSONL keyed by the hash of what was asked) and `replay` (the JSONL alone — a miss is an error, never a call).
 */
import { Context, Effect, Layer, Schedule, Schema } from 'effect';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { TypeSafeClient, APIError, APIConnectionError } from '@typesafe-ai/sdk';

export const MODEL = 'jev-1.13.0';

/** Could not be asked: the network, a 429, a 5xx. Worth another try. */
export class Unreachable extends Schema.TaggedError<Unreachable>()('Unreachable', { message: Schema.String }) {}
/** Asked and refused: a 4xx that another try will not change. */
export class Refused extends Schema.TaggedError<Refused>()('Refused', { status: Schema.Number, message: Schema.String }) {}
/** Answered in a shape the schema does not have. */
export class Malformed extends Schema.TaggedError<Malformed>()('Malformed', { message: Schema.String }) {}
/** Replay only: nothing recorded under this key. */
export class NotRecorded extends Schema.TaggedError<NotRecorded>()('NotRecorded', { key: Schema.String }) {}
export type JudgeError = Unreachable | Refused | Malformed | NotRecorded;

const Noul = Schema.Struct({ noul: Schema.Number });
const Choice = Schema.Struct({ choice: Schema.String, probabilities: Schema.Record(Schema.String, Schema.Number), confidence: Schema.Number });
const Score = Schema.Struct({ score: Schema.Number, probabilities: Schema.Record(Schema.String, Schema.Number), confidence: Schema.Number });
const Answer = Schema.Union([Noul, Choice, Score]);
export const Verdict = Schema.Struct({
  key: Schema.String,
  asking: Schema.Number,
  model: Schema.String,
  answers: Schema.Record(Schema.String, Answer),
  usage: Schema.Struct({ input_tokens: Schema.Number, output_tokens: Schema.Number }),
  ms: Schema.Number,
});
export type Verdict = typeof Verdict.Type;

export type Ask = { state: unknown; questions: Record<string, unknown>; /** which asking of the same thing: 1, 2… */ asking?: number };

/** What was asked, as a name: the same state and questions are the same key, whoever asks. */
export const keyOf = (a: Ask): string =>
  createHash('sha256').update(JSON.stringify([MODEL, a.state, a.questions])).digest('hex').slice(0, 16);

export class Judge extends Context.Service<Judge, { readonly ask: (a: Ask) => Effect.Effect<Verdict, JudgeError> }>()('language/Judge') {
  static live = Layer.sync(Judge)(() => {
    // The SDK's own retries off: the Schedule below is the one policy, and it is visible.
    const client = new TypeSafeClient({ retry: { maxRetries: 0 }, timeout: 30_000 });
    const once = (a: Ask) => Effect.tryPromise({
      try: async () => {
        const t = performance.now();
        const r = await client.systemOne({ model: MODEL, state: a.state as never, questions: a.questions as never });
        return { key: keyOf(a), asking: a.asking ?? 1, model: r.model, answers: r.answers, usage: r.usage, ms: Math.round(performance.now() - t) };
      },
      // Only the status and the class name: an error's message can carry headers.
      catch: (e): Unreachable | Refused => e instanceof APIError && !(e instanceof APIConnectionError) && typeof e.status === 'number' && e.status < 500 && e.status !== 429
        ? new Refused({ status: e.status, message: e.constructor.name })
        : new Unreachable({ message: (e as Error)?.constructor?.name ?? 'unknown' }),
    });
    return Judge.of({
      ask: (a) => once(a).pipe(
        Effect.retry({ schedule: Schedule.exponential('300 millis').pipe(Schedule.jittered), times: 3, while: (e) => e._tag === 'Unreachable' }),
        Effect.flatMap((raw) => Schema.decodeUnknownEffect(Verdict)(raw).pipe(Effect.mapError((e) => new Malformed({ message: String(e).slice(0, 200) })))),
      ),
    });
  });

  /** Live, and every verdict written down. One appender: this process. */
  static recording = (file: string) => Layer.effect(Judge)(Effect.gen(function* () {
    const live = yield* Judge;
    return Judge.of({ ask: (a) => live.ask(a).pipe(Effect.tap((v) => Effect.sync(() => fs.appendFileSync(file, JSON.stringify(v) + '\n')))) });
  })).pipe(Layer.provide(Judge.live));

  /** The record alone. A test, or a tick reading a fact: no network exists in this layer. */
  static replay = (file: string) => Layer.sync(Judge)(() => {
    const seen = new Map<string, Verdict>();
    if (fs.existsSync(file)) for (const l of fs.readFileSync(file, 'utf8').split('\n')) if (l) { const v = JSON.parse(l) as Verdict; seen.set(`${v.key}#${v.asking}`, v); }
    return Judge.of({ ask: (a) => { const k = `${keyOf(a)}#${a.asking ?? 1}`; const v = seen.get(k); return v ? Effect.succeed(v) : Effect.fail(new NotRecorded({ key: k })); } });
  });
}

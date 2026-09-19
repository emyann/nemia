/**
 * A judgment as an Effect: a service with a live layer (TypeSafe's SDK), a recording layer (live, and every answer appended
 * to a file of facts), and a replay layer (the file alone — no network, and a request never asked is a typed failure).
 *
 * The replay layer is not only for tests. It is the production read path the design proposes: a judgment is asked once, recorded,
 * and every later pass reads the record.
 */
import { Context, Effect, Layer, Schedule, Schema } from 'effect';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { TypeSafeClient, APIConnectionError, APIError, RateLimitError, InternalServerError } from '@typesafe-ai/sdk';

export const MODEL = 'jev-1.13.0';

/** The network or the service failed: worth another try. */
export class JudgeUnavailable extends Schema.TaggedError<JudgeUnavailable>()('JudgeUnavailable', { status: Schema.optional(Schema.Number), kind: Schema.String }) {}
/** The service refused the request as written (4xx): trying again changes nothing. */
export class JudgeRefused extends Schema.TaggedError<JudgeRefused>()('JudgeRefused', { status: Schema.optional(Schema.Number), kind: Schema.String }) {}
/** The answer did not have the shape asked for. */
export class JudgeMalformed extends Schema.TaggedError<JudgeMalformed>()('JudgeMalformed', { message: Schema.String }) {}
/** Replay only: nobody ever asked this. */
export class NotRecorded extends Schema.TaggedError<NotRecorded>()('NotRecorded', { key: Schema.String }) {}
export type JudgeError = JudgeUnavailable | JudgeRefused | JudgeMalformed | NotRecorded;

const Noul = Schema.Struct({ type: Schema.Literal('noul'), noul: Schema.Number });
const Choice = Schema.Struct({
  type: Schema.Literal('choice'), choice: Schema.String, confidence: Schema.Number,
  probabilities: Schema.Record(Schema.String, Schema.Number),
});
export const Judged = Schema.Struct({
  model: Schema.String,
  answers: Schema.Record(Schema.String, Schema.Union([Noul, Choice])),
  usage: Schema.Struct({ input_tokens: Schema.Number, output_tokens: Schema.Number }),
});
export type Judged = typeof Judged.Type;

export type Question =
  | { type: 'noul'; instructions: string; criteria?: { true: string; false: string } }
  | { type: 'choice'; instructions: string; criteria: Record<string, string | null> };
export type Ask = { state: unknown; questions: Record<string, Question>; /** Which asking of the same request: 1, 2… */ asking: number };

export const keyOf = (a: Ask) => createHash('sha256').update(JSON.stringify([MODEL, a.state, a.questions, a.asking])).digest('hex').slice(0, 24);

export class Judge extends Context.Service<Judge, { readonly ask: (a: Ask) => Effect.Effect<Judged & { ms: number }, JudgeError> }>()('jev/Judge') {}

const decode = (u: unknown) =>
  Schema.decodeUnknownEffect(Judged)(u).pipe(Effect.mapError((e) => new JudgeMalformed({ message: String(e).slice(0, 300) })));

/** Live: one HTTP call, the SDK's own retries off, Effect's Schedule on the typed error instead. Nothing of the error but its class and status is kept. */
export const JudgeLive = Layer.sync(Judge)(() => {
  const client = new TypeSafeClient({ timeout: 60_000, retry: { maxRetries: 0 } } as never);
  const once = (a: Ask) =>
    Effect.tryPromise({
      try: async () => {
        const t = performance.now();
        const r = await client.systemOne({ model: MODEL, state: a.state as never, questions: a.questions as never });
        return { r, ms: Math.round(performance.now() - t) };
      },
      catch: (e): JudgeUnavailable | JudgeRefused => {
        const status = e instanceof APIError ? (e as { status?: number }).status : undefined;
        const kind = (e as Error)?.constructor?.name ?? 'Error';
        return e instanceof APIConnectionError || e instanceof RateLimitError || e instanceof InternalServerError || (status !== undefined && status >= 500)
          ? new JudgeUnavailable({ status, kind }) : new JudgeRefused({ status, kind });
      },
    });
  return Judge.of({
    ask: (a) =>
      once(a).pipe(
        Effect.retry({ while: (e) => e._tag === 'JudgeUnavailable', times: 4, schedule: Schedule.exponential('400 millis').pipe(Schedule.jittered) }),
        Effect.flatMap(({ r, ms }) => decode(r).pipe(Effect.map((j) => ({ ...j, ms })))),
      ),
  });
});

type Line = { key: string; judged: Judged & { ms: number } };
const readRecord = (file: string) =>
  new Map<string, Line['judged']>(fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { const x = JSON.parse(l) as Line; return [x.key, x.judged]; }) : []);

/** Replay: the record alone. */
export const JudgeReplay = (file: string) => Layer.sync(Judge)(() => {
  const rec = readRecord(file);
  return Judge.of({ ask: (a) => { const k = keyOf(a); const j = rec.get(k); return j ? Effect.succeed(j) : Effect.fail(new NotRecorded({ key: k })); } });
});

/** Recording: the record first, the live judge for what it lacks, and what it answers appended — one writer, append-only. */
export const JudgeRecording = (file: string) => Layer.effect(Judge)(Effect.gen(function* () {
  const live = yield* Judge;
  const rec = readRecord(file);
  return Judge.of({
    ask: (a) => {
      const k = keyOf(a); const had = rec.get(k);
      if (had) return Effect.succeed(had);
      return live.ask(a).pipe(Effect.tap((j) => Effect.sync(() => { rec.set(k, j); fs.appendFileSync(file, JSON.stringify({ key: k, judged: j }) + '\n'); })));
    },
  });
})).pipe(Layer.provide(JudgeLive));

// A judgment as an Effect: typed request, typed answer, typed error channel,
// a live layer, a recording layer and a replay layer (tests never touch the network).
import { Context, Effect, Layer, Schedule, Schema } from 'effect';
import { TypeSafeClient, APIError, APIConnectionError } from '@typesafe-ai/sdk';
import crypto from 'node:crypto';
import fs from 'node:fs';

export const MODEL = 'jev-1.13.0';

// ---- the answer's schema: what comes off the wire is decoded, never trusted ----
const Prob = Schema.Finite;
export const NoulAnswer = Schema.Struct({ type: Schema.Literal('noul'), noul: Prob });
export const ChoiceAnswer = Schema.Struct({
  type: Schema.Literal('choice'),
  choice: Schema.String,
  confidence: Prob,
  probabilities: Schema.Record(Schema.String, Prob),
});
export const ScoreAnswer = Schema.Struct({
  type: Schema.Literal('score'),
  score: Prob,
  confidence: Prob,
  probabilities: Schema.Record(Schema.String, Prob),
});
export const Answer = Schema.Union([NoulAnswer, ChoiceAnswer, ScoreAnswer]);
export const Verdict = Schema.Struct({
  model: Schema.String,
  answers: Schema.Record(Schema.String, Answer),
  usage: Schema.Struct({ input_tokens: Schema.Finite, output_tokens: Schema.Finite }),
});
export type Verdict = typeof Verdict.Type;

// ---- the error channel: three things code does different things with ----
export class JudgeUnavailable extends Schema.TaggedError<JudgeUnavailable>()('JudgeUnavailable', {
  message: Schema.String, // transport, 408/429/5xx, timeout: retry, then "unsure"
}) {}
export class JudgeRefused extends Schema.TaggedError<JudgeRefused>()('JudgeRefused', {
  message: Schema.String, // 4xx, or a replay that holds no such record: a bug in the caller, never retried
}) {}
export class JudgeMalformed extends Schema.TaggedError<JudgeMalformed>()('JudgeMalformed', {
  message: Schema.String, // the answer did not decode: never read as a verdict
}) {}
export type JudgeError = JudgeUnavailable | JudgeRefused | JudgeMalformed;

export interface Request {
  readonly state: unknown;
  readonly questions: Record<string, unknown>;
  readonly salt?: string; // a second asking of the same request is a record of its own
}
export interface Judged extends Verdict { readonly ms: number; readonly key: string }

export const keyOf = (r: Request) =>
  crypto.createHash('sha256').update(JSON.stringify([MODEL, r.state, r.questions, r.salt ?? ''])).digest('hex').slice(0, 24);

export interface JudgeOps { readonly ask: (r: Request) => Effect.Effect<Judged, JudgeError> }
export class Judge extends Context.Service<Judge, JudgeOps>()('supervisor/Judge') {
  static layer = (ops: JudgeOps) => Layer.succeed(Judge)(Judge.of(ops));
}

const redact = (s: string) => s.replace(/(sk|ts|key)[-_][A-Za-z0-9_-]{8,}/g, '[redacted]').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');

const decode = (raw: unknown) =>
  Schema.decodeUnknownEffect(Verdict)(raw).pipe(
    Effect.mapError((e) => new JudgeMalformed({ message: redact(String(e)).slice(0, 400) })),
  );

/** Live: one HTTP call, the SDK's own retries OFF so the policy is one Schedule we can read. */
export const live = (): JudgeOps => {
  const client = new TypeSafeClient({ retry: { maxRetries: 0 }, logLevel: 'off' });
  const once = (r: Request) =>
    Effect.tryPromise({
      try: (signal) => client.systemOne({ model: MODEL, state: r.state as never, questions: r.questions as never }, { timeout: 20_000, signal }),
      catch: (e): JudgeError => {
        const msg = redact(e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 400);
        if (e instanceof APIError) {
          const s = (e as { status?: number }).status ?? 0;
          return s === 408 || s === 429 || s >= 500 ? new JudgeUnavailable({ message: msg }) : new JudgeRefused({ message: msg });
        }
        if (e instanceof APIConnectionError) return new JudgeUnavailable({ message: msg });
        // anything else is the SDK refusing the request before it left (a malformed question): the caller's bug.
        // First written as Unavailable, and the Schedule spent three retries on a request that could never succeed.
        return new JudgeRefused({ message: msg });
      },
    });
  return {
    ask: (r) =>
      Effect.gen(function* () {
        const t0 = performance.now();
        const raw = yield* once(r).pipe(
          Effect.retry({
            schedule: Schedule.exponential('400 millis').pipe(Schedule.jittered),
            times: 3,
            while: (e) => e._tag === 'JudgeUnavailable',
          }),
        );
        const v = yield* decode(raw);
        return { ...v, ms: Math.round(performance.now() - t0), key: keyOf(r) };
      }),
  };
};

/** Recording: wraps any judge, appends every verdict as a fact. One writer, append-only. */
export const recording = (inner: JudgeOps, file: string): JudgeOps => ({
  ask: (r) =>
    inner.ask(r).pipe(
      Effect.tap((j) => Effect.sync(() => fs.appendFileSync(file, JSON.stringify({ key: j.key, at: new Date().toISOString(), verdict: j }) + '\n'))),
    ),
});

/** Replay: reads the facts. A request nobody recorded is refused; the network is never touched. */
export const replay = (file: string): JudgeOps => {
  const seen = new Map<string, Judged>();
  if (fs.existsSync(file)) for (const l of fs.readFileSync(file, 'utf8').split('\n')) if (l) { const o = JSON.parse(l); seen.set(o.key, o.verdict); }
  return {
    ask: (r) => {
      const hit = seen.get(keyOf(r));
      return hit ? decode(hit).pipe(Effect.map((v) => ({ ...v, ms: 0, key: keyOf(r) })))
                 : Effect.fail(new JudgeRefused({ message: `no recorded verdict for ${keyOf(r)}: run once with the live layer` }));
    },
  };
};

/** Cached: replay if the fact exists, else ask live and record. What a `judge:` task would be. */
export const cached = (file: string): JudgeOps => {
  const rep = replay(file); const rec = recording(live(), file);
  return { ask: (r) => rep.ask(r).pipe(Effect.catchTag('JudgeRefused', () => rec.ask(r))) };
};

// ---- the smart `if`: a threshold with a third answer ----
export type Routed = 'yes' | 'no' | 'unsure';
export const route = (p: number, hi: number, lo: number): Routed => (p >= hi ? 'yes' : p <= lo ? 'no' : 'unsure');
/** Any failure of the judge is `unsure`, never a verdict — "a check that did not finish is not a refusal". */
export const orUnsure = <A>(e: Effect.Effect<A, JudgeError>) => e.pipe(Effect.map((a) => ({ ok: true as const, a })), Effect.catch((err) => Effect.succeed({ ok: false as const, err })));

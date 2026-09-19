/**
 * Judge: a judgment as a typed primitive.
 *
 * Three layers behind one service, the way the engine keeps `Journal` and `Runner`:
 *   Judge.live      asks TypeSafe, with a Schedule, a total budget and a typed error channel
 *   Judge.recorded  wraps another Judge: asked once, never re-asked; a failure is a fact too
 *   Judge.replay    answers only from recorded facts, and fails loudly on a miss
 *
 * and one combinator, `decide`: the `if` with judgment in it, whose third branch is a value.
 */
import { Context, Effect, Layer, Schedule, Schema } from 'effect';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  TypeSafeClient, APIError, APITimeoutError, APIConnectionError, RateLimitError,
  type Question, type Questions, type ResultFor, type Usage, type EntryType,
} from '@typesafe-ai/sdk';

// ── questions as typed values ────────────────────────────────────────────────────────────────────

/** A yes/no question. `true`/`false` say what each answer means; the answer is P(yes). */
export const noul = (instructions: string, criteria: { true: string; false: string }) =>
  ({ type: 'noul', instructions, criteria }) as const;

/** One of a closed set. The answer's `choice` is `keyof` the criteria: the type comes from the value. */
export const choice = <const C extends Record<string, string>>(instructions: string, criteria: C) =>
  ({ type: 'choice', instructions, criteria }) as const;

export type Answers<Q extends Questions> = { readonly [K in keyof Q]: ResultFor<Q[K]> };
export type State = Exclude<EntryType, null>;

// ── the error channel ────────────────────────────────────────────────────────────────────────────

/** The service read the request and said no: a bad key, a malformed question, too many tokens. Asking again changes nothing. */
export class Refused extends Schema.TaggedError<Refused>()('Refused', { status: Schema.Number, message: Schema.String }) {}
/** 429 or 529. Asking again later is the fix. */
export class RateLimited extends Schema.TaggedError<RateLimited>()('RateLimited', { status: Schema.Number, retryAfterMs: Schema.optional(Schema.Number) }) {}
/** No whole answer inside the budget. Not a verdict on anything. */
export class TimedOut extends Schema.TaggedError<TimedOut>()('TimedOut', { budgetMs: Schema.Number }) {}
/** DNS, TLS, a closed socket, a 5xx. */
export class Unreachable extends Schema.TaggedError<Unreachable>()('Unreachable', { message: Schema.String }) {}
/** Replay was asked something nobody recorded. A test that reaches the network is a bug; this is how it says so. */
export class ReplayMiss extends Schema.TaggedError<ReplayMiss>()('ReplayMiss', { key: Schema.String, question: Schema.String }) {}
/** The log could not be read or written. */
export class LogError extends Schema.TaggedError<LogError>()('LogError', { message: Schema.String }) {}

export type AskError = Refused | RateLimited | TimedOut | Unreachable;
export type JudgeError = AskError | ReplayMiss | LogError;

// ── the service ──────────────────────────────────────────────────────────────────────────────────

export type Asked<Q extends Questions> = { readonly answers: Answers<Q>; readonly model: string; readonly usage: Usage; readonly asked: number };

export type JudgeOps = {
  /** The model every answer is pinned to. Part of every key. */
  readonly model: string;
  /** Many questions over one state, one request: state is billed once. */
  readonly ask: <const Q extends Questions>(state: State, questions: Q) => Effect.Effect<Asked<Q>, JudgeError>;
};

export class Judge extends Context.Service<Judge, JudgeOps>()('judge/Judge') {
  static layer = (ops: JudgeOps) => Layer.succeed(Judge)(Judge.of(ops));
}

// ── live ─────────────────────────────────────────────────────────────────────────────────────────

export type LiveOptions = {
  model: string;
  /** One attempt. */
  attemptMs?: number;
  /** Every attempt and every wait between them. The SDK has no such bound ("no total retry budget"). */
  budgetMs?: number;
  retries?: number;
  apiKey?: string;
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
};

const scrub = (text: string) => {
  const key = process.env.TYPESAFE_API_KEY;
  return (key ? text.split(key).join('[key]') : text).replace(/Bearer\s+\S+/g, 'Bearer [key]').slice(0, 300);
};

const classify = (budgetMs: number) => (cause: unknown): AskError => {
  if (cause instanceof RateLimitError) return new RateLimited({ status: 429, retryAfterMs: cause.retryAfterMs });
  if (cause instanceof APIError && cause.status === 529) return new RateLimited({ status: 529 });
  if (cause instanceof APIError && cause.status >= 500) return new Unreachable({ message: scrub(`${cause.status} ${cause.message}`) });
  if (cause instanceof APIError) return new Refused({ status: cause.status, message: scrub(cause.message) });
  if (cause instanceof APITimeoutError) return new TimedOut({ budgetMs });
  if (cause instanceof APIConnectionError) return new Unreachable({ message: scrub(cause.message) });
  return new Unreachable({ message: scrub(cause instanceof Error ? cause.message : String(cause)) });
};

export const live = (options: LiveOptions) => {
  const { model, attemptMs = 10_000, budgetMs = 30_000, retries = 3 } = options;
  // A missing key is a refusal at the first ask, not a crash while the layer is built.
  let client: TypeSafeClient | undefined;
  const make = () => (client ??= new TypeSafeClient({ apiKey: options.apiKey, fetch: options.fetch, retry: { maxRetries: 0 }, timeout: attemptMs, logLevel: 'off' }));
  return Judge.layer({
    model,
    ask: (state, questions) =>
      Effect.tryPromise({
        // The fiber's interruption is the request's AbortSignal: a timeout really stops the socket.
        try: (signal) => make().systemOne({ model, state, questions }, { signal }),
        catch: (cause) => (cause instanceof Error && /api key/i.test(cause.message) && !(cause instanceof APIError)
          ? new Refused({ status: 0, message: scrub(cause.message) }) : classify(attemptMs)(cause)),
      }).pipe(
        Effect.retry({
          schedule: Schedule.exponential('200 millis').pipe(Schedule.jittered),
          times: retries,
          while: (e) => e._tag !== 'Refused',
        }),
        Effect.timeoutOrElse({ duration: budgetMs, orElse: () => Effect.fail(new TimedOut({ budgetMs })) }),
        Effect.map((r) => ({ answers: r.answers as Answers<typeof questions>, model: r.model, usage: r.usage, asked: Object.keys(questions).length })),
      ),
  });
};

// ── the log of judgments ─────────────────────────────────────────────────────────────────────────

const Fact = Schema.Struct({
  key: Schema.String,
  at: Schema.String,
  model: Schema.String,
  id: Schema.String,
  question: Schema.Unknown,
  stateHash: Schema.String,
  /** Every probability, the confidence, the choice: the whole answer as it came. Absent on a failure. */
  answer: Schema.optional(Schema.Unknown),
  /** A failure is a fact too. */
  error: Schema.optional(Schema.Struct({ _tag: Schema.String, message: Schema.String })),
  /** The request this question travelled in, and what that request cost: state is billed once for all of them. */
  request: Schema.String,
  usage: Schema.optional(Schema.Struct({ input_tokens: Schema.Number, output_tokens: Schema.Number })),
  ms: Schema.Number,
});
export type Fact = typeof Fact.Type;
const decodeFact = Schema.decodeUnknownSync(Fact);

export type JudgeLogOps = {
  /** The facts on record under these keys. One read of the log per call: level-triggered, nothing carried between passes. */
  readonly lookup: (keys: ReadonlyArray<string>) => Effect.Effect<Map<string, Fact>, LogError>;
  readonly append: (facts: ReadonlyArray<Fact>) => Effect.Effect<void, LogError>;
};

export class JudgeLog extends Context.Service<JudgeLog, JudgeLogOps>()('judge/JudgeLog') {
  static layer = (ops: JudgeLogOps) => Layer.succeed(JudgeLog)(JudgeLog.of(ops));

  /** Append-only JSONL, one writer: whoever holds the recorded Judge. The LAST fact under a key wins, so a person's re-ask is an append. */
  static file = (file: string) => {
    const fail = (cause: unknown) => new LogError({ message: cause instanceof Error ? cause.message : String(cause) });
    const load = () => {
      const facts = new Map<string, Fact>();
      if (fs.existsSync(file)) for (const line of fs.readFileSync(file, 'utf8').split('\n')) if (line) { const f = decodeFact(JSON.parse(line)); facts.set(f.key, f); }
      return facts;
    };
    return JudgeLog.layer({
      lookup: (keys) => Effect.try({ try: () => { const all = load(); return new Map(keys.flatMap((k) => (all.has(k) ? [[k, all.get(k)!] as const] : []))); }, catch: fail }),
      append: (facts) => Effect.try({
        try: () => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, facts.map((f) => JSON.stringify(f) + '\n').join('')); },
        catch: fail,
      }),
    });
  };

  static memory = (seed: ReadonlyArray<Fact> = []) => {
    const facts = new Map(seed.map((f) => [f.key, f]));
    return JudgeLog.layer({
      lookup: (keys) => Effect.sync(() => new Map(keys.flatMap((k) => (facts.has(k) ? [[k, facts.get(k)!] as const] : [])))),
      append: (more) => Effect.sync(() => { for (const f of more) facts.set(f.key, f); }),
    });
  };
}

/** Keys sorted, so two objects that say the same thing hash the same. */
const canonical = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`
  : JSON.stringify(v ?? null);
const sha = (text: string) => crypto.createHash('sha256').update(text).digest('hex');

/** What a judgment is the judgment OF: the pinned model, the question with its options, the state. The question's id is not in it. */
export const keyOf = (model: string, question: Question, state: State, asking = 1) =>
  sha(canonical({ model, question, state: sha(canonical(state)), asking })).slice(0, 32);

const revive = (fact: Fact): JudgeError => {
  const e = fact.error!;
  switch (e._tag) {
    case 'Refused': return new Refused({ status: 0, message: e.message });
    case 'RateLimited': return new RateLimited({ status: 429 });
    case 'TimedOut': return new TimedOut({ budgetMs: 0 });
    default: return new Unreachable({ message: e.message });
  }
};

const fromFacts = <Q extends Questions>(model: string, questions: Q, facts: Map<string, Fact>): Effect.Effect<Asked<Q>, JudgeError> => {
  const failed = [...facts.values()].find((f) => f.error);
  if (failed) return Effect.fail(revive(failed));
  const answers = Object.fromEntries(Object.keys(questions).map((id) => [id, facts.get(id)!.answer])) as Answers<Q>;
  return Effect.succeed({ answers, model, usage: { input_tokens: 0, output_tokens: 0 }, asked: 0 });
};

/**
 * Asked once, never re-asked. Wraps whatever Judge is beneath it.
 *
 * The key is per QUESTION, not per request: a fan-out of 77 where 70 are on record sends 7.
 * `asking` is how a person asks again: a new number is a new key, and the old fact stays on the record.
 */
export const recorded = (options: { asking?: number } = {}) =>
  Layer.effect(Judge)(Effect.gen(function* () {
    const inner = yield* Judge;
    const log = yield* JudgeLog;
    const ask: JudgeOps['ask'] = (state, questions) => Effect.gen(function* () {
      const ids = Object.keys(questions);
      const stateHash = sha(canonical(state));
      const keys = new Map(ids.map((id) => [id, keyOf(inner.model, questions[id]!, state, options.asking)]));
      const known = new Map<string, Fact>();
      const found = yield* log.lookup([...keys.values()]);
      for (const id of ids) { const f = found.get(keys.get(id)!); if (f) known.set(id, f); }
      const missing = ids.filter((id) => !known.has(id));
      if (missing.length === 0) return yield* fromFacts(inner.model, questions, known);

      const subset = Object.fromEntries(missing.map((id) => [id, questions[id]!]));
      const request = crypto.randomUUID();
      const started = Date.now();
      const fact = (id: string, rest: Partial<Fact>): Fact => ({
        key: keys.get(id)!, at: new Date().toISOString(), model: inner.model, id, question: questions[id], stateHash, request, ms: Date.now() - started, ...rest,
      });
      const result = yield* Effect.result(inner.ask(state, subset));
      if (result._tag === 'Failure') {
        const e = result.failure;
        // The failure is written before it is raised: the next pass reads it and does not ask.
        yield* log.append(missing.map((id) => fact(id, { error: { _tag: e._tag, message: e.message || e._tag } })));
        return yield* Effect.fail(e);
      }
      const got = result.success;
      const fresh = missing.map((id) => fact(id, { model: got.model, answer: (got.answers as Record<string, unknown>)[id], usage: got.usage }));
      yield* log.append(fresh);
      for (const f of fresh) known.set(f.id, f);
      const all = yield* fromFacts(inner.model, questions, known);
      return { ...all, usage: got.usage, asked: missing.length };
    });
    return Judge.of({ model: inner.model, ask });
  }));

/** Answers only from the record. For tests, and for every reader that is not the one asker. */
export const replay = (model: string, options: { asking?: number } = {}) =>
  Layer.effect(Judge)(Effect.gen(function* () {
    const log = yield* JudgeLog;
    const ask: JudgeOps['ask'] = (state, questions) => Effect.gen(function* () {
      const known = new Map<string, Fact>();
      const keys = Object.keys(questions).map((id) => [id, keyOf(model, questions[id]!, state, options.asking)] as const);
      const found = yield* log.lookup(keys.map(([, k]) => k));
      for (const [id, key] of keys) {
        const f = found.get(key);
        if (!f) return yield* Effect.fail(new ReplayMiss({ key, question: JSON.stringify(questions[id]!.instructions).slice(0, 120) }));
        known.set(id, f);
      }
      return yield* fromFacts(model, questions, known);
    });
    return Judge.of({ model, ask });
  }));

// ── the point: an `if` with judgment in it ───────────────────────────────────────────────────────

export type Verdict = 'yes' | 'no' | 'unsure';
export type Thresholds = { readonly yes: number; readonly no: number };

/** Pure. The policy is here, in code, and changing it re-asks nothing. */
export const verdictOf = (p: number, t: Thresholds): Verdict => (p >= t.yes ? 'yes' : p <= t.no ? 'no' : 'unsure');

export type Decision = { readonly verdict: Verdict; readonly p: number };

/** One question, three branches. The caller's `switch` does not compile without `unsure`. */
export const decide = (question: ReturnType<typeof noul>, thresholds: Thresholds) => (state: State) =>
  Effect.gen(function* () {
    const judge = yield* Judge;
    const { answers } = yield* judge.ask(state, { q: question });
    return { verdict: verdictOf(answers.q.noul, thresholds), p: answers.q.noul } satisfies Decision;
  });

/** Many questions over one state in ONE request. Same three branches, per question. */
export const decideAll = <const Q extends Record<string, ReturnType<typeof noul>>>(questions: Q, thresholds: Thresholds) => (state: State) =>
  Effect.gen(function* () {
    const judge = yield* Judge;
    const got = yield* judge.ask(state, questions);
    const decisions = Object.fromEntries(Object.keys(questions).map((id) => {
      const p = (got.answers as Record<string, { noul: number }>)[id]!.noul;
      return [id, { verdict: verdictOf(p, thresholds), p }];
    })) as { readonly [K in keyof Q]: Decision };
    return { decisions, usage: got.usage, asked: got.asked };
  });

/**
 * A judgment that did not finish is not a verdict: it is `unsure`, and a person's.
 * A ReplayMiss and a LogError stay errors: they are bugs, not weather.
 */
export const orUnsure = <A extends { verdict: Verdict }, R>(self: Effect.Effect<A, JudgeError, R>, unsure: A) =>
  self.pipe(Effect.catchTags({
    RateLimited: () => Effect.succeed(unsure),
    TimedOut: () => Effect.succeed(unsure),
    Unreachable: () => Effect.succeed(unsure),
    Refused: () => Effect.succeed(unsure),
  }));

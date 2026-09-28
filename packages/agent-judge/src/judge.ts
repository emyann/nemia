/**
 * Judge: a judgment asked once and recorded, in three layers behind one service, the way the engine keeps `Journal` and
 * `Runner`.
 *
 *   Asker.live   asks TypeSafe: one request, the SDK's own retries, a deadline over all of them, every failure one tag
 *   recorded     a Judge over an Asker and a record: each question asked once, its answer or its failure written raw
 *   replay       a Judge over a record alone: it never claims, writes or asks, and a key with no record is a ReplayMiss
 *
 * Effect is how this file is written, not how the package is used: `facade.ts` is plain Promises. What it buys here is
 * that every failure tag is a type the compiler makes `recorded` turn into a fact, and that interrupting the deadline
 * aborts the request's socket through `tryPromise`'s signal.
 */
import { Context, Effect, Layer, Schema } from 'effect';
import crypto from 'node:crypto';
import {
  APIConnectionError, APIError, APITimeoutError, TypeSafeClient, TypeSafeError,
  type Fetch, type Question, type Questions, type Usage,
} from '@typesafe-ai/sdk';
import type { FailureKind, Judgment } from './decide.ts';
import { keyOf, questionOf, stateHash, type State } from './key.ts';
import {
  claim, host, nextN, notAnAnswer, readFacts, readSettled, reading, RecordError as PlainRecordError, settle, writeFact,
  type AnswerFact, type Common, type FailedFact, type Reading,
} from './record.ts';

// ─── the error channel ──────────────────────────────────────────────────────────────────────────

const fields = { message: Schema.String };
/** No `TYPESAFE_API_KEY` in the environment. The judge is off: nothing is claimed, written, built or sent. */
export class NoKey extends Schema.TaggedError<NoKey>()('NoKey', fields) {}
/** The service read the request and said no. Asking the same again changes nothing. */
export class Refused extends Schema.TaggedError<Refused>()('Refused', { ...fields, status: Schema.Number }) {}
/** 429 or 529, after the SDK's own retries. */
export class RateLimited extends Schema.TaggedError<RateLimited>()('RateLimited', { ...fields, status: Schema.Number }) {}
/** No whole answer inside the deadline. Not a verdict on anything. */
export class TimedOut extends Schema.TaggedError<TimedOut>()('TimedOut', fields) {}
/** DNS, TLS, a closed socket, a 5xx, after the SDK's own retries. */
export class Unreachable extends Schema.TaggedError<Unreachable>()('Unreachable', fields) {}

/** What an asking can come to, short of an answer. Each is written as a fact, but `NoKey`, which is no asking at all. */
export type AskFailure = NoKey | Refused | RateLimited | TimedOut | Unreachable;

/** A replay was asked what nobody recorded. A test that would reach the network is a bug; this is how it says so. */
export class ReplayMiss extends Schema.TaggedError<ReplayMiss>()('ReplayMiss', { ...fields, id: Schema.String, key: Schema.String }) {}
/** The record could not be read or written. */
export class RecordError extends Schema.TaggedError<RecordError>()('RecordError', fields) {}
/** A bad argument: an alias for a model, a state that is not JSON, no questions. */
export class Invalid extends Schema.TaggedError<Invalid>()('Invalid', fields) {}

/** What rejects a caller: bugs and bad arguments, never weather. */
export type JudgeError = ReplayMiss | RecordError | Invalid;

// ─── the asker ──────────────────────────────────────────────────────────────────────────────────

/** A reply as it came: its body is not trusted to be an answer until it is read. */
export type Reply = { readonly body: unknown; readonly requestId: string | null };

export type AskerOps = {
  readonly ask: (model: string, state: State, questions: Questions) => Effect.Effect<Reply, AskFailure>;
  /** How long a claim holds, from the moment it is made: the asker's deadline, and a grace for writing what came of it. */
  readonly holdMs: number;
  /** Whether there is a key to ask with. Without one the judge is off, and `recorded` claims and writes nothing. */
  readonly keyed: () => boolean;
};

export class Asker extends Context.Service<Asker, AskerOps>()('judge/Asker') {
  static layer = (ops: AskerOps) => Layer.succeed(Asker)(Asker.of(ops));

  /**
   * TypeSafe, through its SDK. Nothing is sent but the model, the questions and the caller's `state`. The key is read from
   * `env` — the process's environment unless a test hands it another — at each ask, and is never written or said.
   */
  static live = (options: LiveOptions = {}) => {
    const { env = process.env, fetch, attemptMs = 5_000, deadlineMs = 20_000, retries = 2 } = options;
    return Asker.layer({
      holdMs: deadlineMs + GRACE_MS,
      keyed: () => Boolean(env.TYPESAFE_API_KEY?.trim()),
      ask: (model, state, questions) => {
        const key = env.TYPESAFE_API_KEY?.trim();
        if (!key) return Effect.fail(new NoKey({ message: NO_KEY }));
        const scrub = (text: string) => text.split(key).join('[key]').replace(/Bearer\s+\S+/g, 'Bearer [key]').slice(0, 300);
        return Effect.tryPromise({
          try: async (signal) => {
            // Everything the SDK would take from the environment is given here, so nothing but the key comes from it:
            // TYPESAFE_BASE_URL cannot send the state elsewhere, and TYPESAFE_LOG_LEVEL=debug cannot print it.
            const client = new TypeSafeClient({
              apiKey: key, baseURL: BASE_URL, logLevel: 'off', timeout: attemptMs, retry: { maxRetries: retries }, ...(fetch ? { fetch } : {}),
            });
            const { data, requestId } = await client.systemOne({ model, state, questions }, { signal }).withResponse();
            return { body: data as unknown, requestId: requestId ?? null };
          },
          catch: classify(scrub),
        }).pipe(
          // The SDK has no bound over all its attempts ("there is no total retry budget"): this is it. Interrupting the
          // fiber aborts the signal above, and the socket with it.
          Effect.timeoutOrElse({ duration: deadlineMs, orElse: () => Effect.fail(new TimedOut({ message: `no answer within ${deadlineMs} ms` })) }),
        );
      },
    });
  };
}

export type LiveOptions = {
  /** Where the key is read from. The process's environment unless a test hands it another. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** A `fetch` for tests. The global one otherwise. */
  readonly fetch?: Fetch;
  /** One attempt. */
  readonly attemptMs?: number;
  /** Every attempt and every wait between them. */
  readonly deadlineMs?: number;
  /** The SDK's retries after the first attempt, on 408, 429, 5xx, a lost connection and a timed-out attempt. */
  readonly retries?: number;
};

export const BASE_URL = 'https://api.typesafe.ai';
const NO_KEY = 'no TYPESAFE_API_KEY in the environment';
const GRACE_MS = 5_000;

const classify = (scrub: (s: string) => string) => (cause: unknown): AskFailure => {
  const message = scrub(cause instanceof Error ? cause.message : String(cause));
  if (cause instanceof APIError) {
    if (cause.status === 429 || cause.status === 529) return new RateLimited({ status: cause.status, message });
    if (cause.status >= 500) return new Unreachable({ message });
    return new Refused({ status: cause.status, message });
  }
  if (cause instanceof APITimeoutError) return new TimedOut({ message });
  if (cause instanceof APIConnectionError) return new Unreachable({ message });
  // The SDK's own refusal of a question, before any request: empty questions, a score with one level.
  if (cause instanceof TypeSafeError) return new Refused({ status: 0, message });
  return new Unreachable({ message });
};

const kindOf: { readonly [T in Exclude<AskFailure['_tag'], 'NoKey'>]: FailedFact['kind'] } & { readonly NoKey: 'no-key' } = {
  NoKey: 'no-key', Refused: 'refused', RateLimited: 'rate-limited', TimedOut: 'timed-out', Unreachable: 'unreachable',
};

// ─── the judge ──────────────────────────────────────────────────────────────────────────────────

export type Answers<Q extends Questions> = { readonly [K in keyof Q]: Judgment<Q[K]> };

export type Asked<Q extends Questions> = {
  readonly answers: Answers<Q>;
  /** Requests this ask made: 0 when everything was on record, else 1. */
  readonly requests: number;
  /** Questions that request carried. */
  readonly sent: number;
  /** What it cost, as the service said; absent when nothing was asked or nothing came back. */
  readonly usage?: Usage;
  readonly ms?: number;
};

export type AskOptions = {
  /** `failed`: ask again exactly the questions whose last asking failed, and nothing else. */
  readonly reask?: 'failed';
};

export type JudgeOps = {
  /** Every answer is pinned to this model, and every key carries it. */
  readonly model: string;
  /** Many questions over one state, in one request: the state is billed once. */
  readonly ask: <const Q extends Questions>(state: State, questions: Q, options?: AskOptions) => Effect.Effect<Asked<Q>, JudgeError>;
};

export class Judge extends Context.Service<Judge, JudgeOps>()('judge/Judge') {
  static layer = (ops: JudgeOps) => Layer.succeed(Judge)(Judge.of(ops));
}

type Keyed = { readonly id: string; readonly key: string; readonly question: Question };

const keyed = (model: string, state: State, questions: Questions) =>
  Effect.try({
    try: () => {
      const ids = Object.keys(questions ?? {});
      if (ids.length === 0) throw new Error('judge: ask takes at least one question.');
      return { state: stateHash(state), keyed: ids.map((id): Keyed => ({ id, key: keyOf(model, questions[id]!, state), question: questions[id]! })) };
    },
    catch: (e) => new Invalid({ message: (e as Error).message }),
  });

const onRecord = <A>(f: () => A) =>
  Effect.try({ try: f, catch: (e) => new RecordError({ message: e instanceof PlainRecordError ? e.message : String(e) }) });

/** The recorded judge's read: a whole answer left unlinked by a crash is settled as the key's first. */
const read = (root: string, k: Keyed, model: string) => onRecord(() => reading(k.key, readSettled(root, k.key, k.question, model), k.question, model, Date.now()));
/** A replay's read: it links nothing, so an unsettled answer stays unsettled. */
const look = (root: string, k: Keyed, model: string) => onRecord(() => reading(k.key, readFacts(root, k.key), k.question, model, Date.now()));

/** Retryable is a failure of the asking, not of the words: a person may ask it again. `in-flight` is someone else's. */
const failedAsking = (r: Reading) => r.status === 'failed' && r.kind !== 'in-flight';

const WAIT_MS = 50;

/** A judgment from a key's reading, once it is one. */
const settled = (r: Reading, k: Keyed): Judgment => {
  const flying = (message: string): Judgment => ({ status: 'failed', key: k.key, at: new Date().toISOString(), kind: 'in-flight', message });
  if (r.status === 'none') return flying('asking ? is still in flight');
  if (r.status === 'waiting') return flying(`asking ${r.n} is still in flight`);
  if (r.status === 'unsettled') return flying(`asking ${r.n}'s answer is on record and is not yet the key's; the recorded judge settles it when it next reads it`);
  return r;
};

const answersOf = <Q extends Questions>(keyed: readonly Keyed[], judgments: ReadonlyMap<string, Judgment>) =>
  Object.fromEntries(keyed.map((k) => [k.id, judgments.get(k.key)!])) as Answers<Q>;

/**
 * Asked once, never re-asked. Wraps the Asker beneath it.
 *
 * Each key is looked up; the ones with nothing on record are claimed, and all of the claimed go out in ONE request. A key
 * another asker has claimed is waited on, not asked. A failure is written as a fact, and reads as one for ever, until a
 * person asks with `reask: 'failed'`: that claims the next asking of exactly the failed keys.
 */
export const recorded = (options: { readonly model: string; readonly record: string }) =>
  Layer.effect(Judge)(Effect.gen(function* () {
    const asker = yield* Asker;
    const { model, record } = options;
    const ask: JudgeOps['ask'] = (state, questions, opts = {}) => Effect.gen(function* () {
      const { state: hash, keyed: all } = yield* keyed(model, state, questions);
      // No key is no asking: the judge is off. Nothing is claimed or written, so a key set later asks these as if for the
      // first time, with no re-ask, and a record read by replay never holds a missing key as a fact about the words.
      if (!asker.keyed()) {
        const at = new Date().toISOString();
        const off = new Map(all.map((k): [string, Judgment] => [k.key, { status: 'failed', key: k.key, at, kind: 'no-key', message: NO_KEY }]));
        return { answers: answersOf(all, off), requests: 0, sent: 0 };
      }
      const unique = [...new Map(all.map((k) => [k.key, k])).values()];
      const judgments = new Map<string, Judgment>();
      const mine: { k: Keyed; n: number }[] = [];
      const theirs: Keyed[] = [];
      const request = crypto.randomUUID();
      const started = Date.now();
      const common = (k: Keyed, n: number): Common => ({ v: 1, key: k.key, n, id: k.id, model, question: questionOf(k.question) as Question, state: hash, at: new Date().toISOString() });

      for (const k of unique) {
        const facts = yield* onRecord(() => readSettled(record, k.key, k.question, model));
        const r = reading(k.key, facts, k.question, model, Date.now());
        if (r.status === 'answered' || (r.status === 'failed' && !(opts.reask === 'failed' && failedAsking(r)))) {
          judgments.set(k.key, r);
          continue;
        }
        if (r.status === 'waiting') { theirs.push(k); continue; }
        const n = nextN(facts);
        const deadline = new Date(Date.now() + asker.holdMs).toISOString();
        const won = yield* onRecord(() => claim(record, { ...common(k, n), deadline, pid: process.pid, host }));
        if (won) mine.push({ k, n });
        else theirs.push(k);
      }

      let usage: Usage | undefined;
      let ms: number | undefined;
      let requests = 0;
      if (mine.length > 0) {
        const sent = Object.fromEntries(mine.map(({ k }) => [k.id, questionOf(k.question) as Question]));
        const result = yield* Effect.result(asker.ask(model, state, sent));
        ms = Date.now() - started;
        if (result._tag === 'Failure') {
          const e = result.failure;
          // The key was there when the keys were claimed and is gone now: still no request, and still a fact of this asking.
          requests = e._tag === 'NoKey' ? 0 : 1;
          const kind = e._tag === 'NoKey' ? 'unreachable' : kindOf[e._tag];
          const message = e._tag === 'NoKey' ? `${e.message} by the time of the request, though there was one when it was claimed; no request was made` : e.message;
          for (const { k, n } of mine) {
            yield* onRecord(() => writeFact(record, 'failed', { ...common(k, n), request, ms: ms!, kind, message }));
          }
        } else {
          requests = 1;
          const { body, requestId } = result.success;
          const b = (typeof body === 'object' && body !== null ? body : {}) as { model?: unknown; answers?: unknown; usage?: Usage };
          const answers = typeof b.answers === 'object' && b.answers !== null ? b.answers as Record<string, unknown> : undefined;
          usage = b.usage;
          for (const { k, n } of mine) {
            const fact: AnswerFact = {
              ...common(k, n), request, requestId, ms, answeredBy: b.model ?? null, raw: answers?.[k.id] ?? null,
              ...(answers ? {} : { body: typeof body === 'string' ? body.slice(0, 2000) : body ?? null }),
              usage: { ...(typeof b.usage === 'object' ? b.usage : {}), questions: mine.length },
            };
            yield* onRecord(() => writeFact(record, 'answer', fact));
            // The first whole answer to land is the key's; a later one, even at a lower asking, is kept and never read.
            if (!notAnAnswer(fact, k.question, model)) yield* onRecord(() => settle(record, k.key, n));
          }
        }
        for (const { k } of mine) judgments.set(k.key, settled(yield* read(record, k, model), k));
      }

      // Another asker holds these: its deadline is on its claim, and past it the claim reads as interrupted.
      for (const k of theirs) {
        let r = yield* read(record, k, model);
        while (r.status === 'waiting') {
          yield* Effect.sleep(WAIT_MS);
          r = yield* read(record, k, model);
        }
        judgments.set(k.key, settled(r, k));
      }

      return { answers: answersOf(all, judgments), requests, sent: requests * mine.length, usage, ms };
    });
    return Judge.of({ model, ask });
  }));

/**
 * Answers from the record alone: for tests, and for any reader that is not the asker. It never claims, writes or asks. A
 * key with nothing on record is a ReplayMiss naming the question; a claim still inside its deadline reads as `in-flight`.
 */
export const replay = (options: { readonly model: string; readonly record: string }) => {
  const { model, record } = options;
  return Judge.layer({
    model,
    ask: (state, questions) => Effect.gen(function* () {
      const { keyed: all } = yield* keyed(model, state, questions);
      const judgments = new Map<string, Judgment>();
      for (const k of all) {
        const r = yield* look(record, k, model);
        if (r.status === 'none') {
          const words = JSON.stringify(k.question.instructions ?? null).slice(0, 120);
          return yield* Effect.fail(new ReplayMiss({
            id: k.id, key: k.key,
            message: `judge: replay holds no record of \`${k.id}\` (${words}) under ${record}. Ask it once with the recorded judge, or check that its words, model and state are the ones recorded.`,
          }));
        }
        judgments.set(k.key, settled(r, k));
      }
      return { answers: answersOf(all, judgments), requests: 0, sent: 0 };
    }),
  });
};

/** The failure kind each tag is written as. Exported for the tests that make each one happen. */
export const FAILURE_OF: { readonly [T in AskFailure['_tag']]: FailureKind } = kindOf;

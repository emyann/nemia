/**
 * The record: what was asked, and what came of it, a write-once file each.
 *
 * Plain code, no Effect: a handful of synchronous file operations, and one pure function that reads what they found.
 *
 *   <record>/<key>/<n>.asked.json    a claim: this asker is asking, until its deadline
 *   <record>/<key>/<n>.answer.json   what came back, raw, exactly as it came
 *   <record>/<key>/<n>.failed.json   why nothing came back
 *
 * `n` is the asking: 1 the first time, one more each time a person re-asks a failure. One writer per file: a claim is made
 * with `wx`, which only one process can do, and only the claimer writes that asking's answer or failure, through a temp
 * file and `link`, which is atomic and refuses to replace. Nothing is ever rewritten or removed. A crash between the
 * claim and the answer leaves a claim alone, which reads as `interrupted` once its deadline has passed: never a silent
 * re-ask.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Question } from '@typesafe-ai/sdk';
import type { FailureKind, Judgment } from './decide.ts';

/** What every file under a key carries. */
export type Common = {
  readonly v: 1;
  readonly key: string;
  readonly n: number;
  /** The question's id where it was asked. Not part of the key: two ids asking the same words share one. */
  readonly id: string;
  readonly model: string;
  readonly question: Question;
  /** The state's hash, never its text. */
  readonly state: string;
  readonly at: string;
};

export type Claim = Common & { readonly deadline: string; readonly pid: number; readonly host: string };

export type AnswerFact = Common & {
  /** This asking's request, shared by every question that travelled in it. */
  readonly request: string;
  /** The service's own id for the request, when it gave one. */
  readonly requestId: string | null;
  readonly ms: number;
  /** The model the service says answered. */
  readonly answeredBy: unknown;
  /** The answer to this question, exactly as it came; `null` when the reply held none. */
  readonly raw: unknown;
  /** The reply's body, when it held no answers at all: kept so a malformed reply is paid for and still on disk. */
  readonly body?: unknown;
  /** What the request cost, and how many questions shared it: the state is billed once for all of them. */
  readonly usage: unknown;
};

export type FailedFact = Common & {
  readonly request: string;
  readonly ms: number;
  readonly kind: Exclude<FailureKind, 'malformed' | 'wrong-model' | 'interrupted' | 'in-flight'>;
  readonly message: string;
};

export type Asking = { claim?: Claim; answer?: AnswerFact; failed?: FailedFact };

/** Every asking under a key, by `n`. */
export type Facts = ReadonlyMap<number, Asking>;

/** The record could not be read or written. A bug or a disk, not weather: it rejects, and says which file. */
export class RecordError extends Error {
  readonly exitCode = 2;
  readonly _tag = 'RecordError';
}

const FILE = /^(\d+)\.(asked|answer|failed)\.json$/;

const failRecord = (what: string, file: string, e: unknown): never => {
  throw new RecordError(`judge: cannot ${what} ${file}: ${(e as Error).message}. Check the record directory, or pass another with --record.`);
};

export const keyDir = (root: string, key: string) => path.join(root, key);

/** Every fact on record under `key`. A file that is not JSON is refused by name: the record is never guessed at. */
export const readFacts = (root: string, key: string): Facts => {
  const dir = keyDir(root, key);
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return new Map();
    return failRecord('read', dir, e);
  }
  const facts = new Map<number, Asking>();
  for (const name of names) {
    const m = FILE.exec(name);
    if (!m) continue; // a temp file on its way in
    const file = path.join(dir, name);
    let fact: unknown;
    try {
      fact = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      failRecord('read', file, e);
    }
    if (typeof fact !== 'object' || fact === null || (fact as Common).key !== key || (fact as Common).n !== Number(m[1])) {
      failRecord('read', file, new Error(`it is not a record of key ${key.slice(0, 12)}…, asking ${m[1]}`));
    }
    const n = Number(m[1]);
    const asking = facts.get(n) ?? {};
    if (m[2] === 'asked') asking.claim = fact as Claim;
    else if (m[2] === 'answer') asking.answer = fact as AnswerFact;
    else asking.failed = fact as FailedFact;
    facts.set(n, asking);
  }
  return facts;
};

/** Claim asking `n` of `key`. False when another asker holds it already. */
export const claim = (root: string, c: Claim): boolean => {
  const dir = keyDir(root, c.key);
  const file = path.join(dir, `${c.n}.asked.json`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(c) + '\n', { flag: 'wx' });
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false;
    return failRecord('write', file, e);
  }
};

/** Write what came of asking `n`: whole or not at all, and never over another. */
export const writeFact = (root: string, kind: 'answer' | 'failed', fact: AnswerFact | FailedFact): void => {
  const file = path.join(keyDir(root, fact.key), `${fact.n}.${kind}.json`);
  const temp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(fact) + '\n', { flag: 'wx' });
    fs.linkSync(temp, file);
  } catch (e) {
    failRecord('write', file, e);
  } finally {
    fs.rmSync(temp, { force: true });
  }
};

export const host = os.hostname();

// ─── reading a key ──────────────────────────────────────────────────────────────────────────────

/** Why a raw answer is not an answer to `q` from `model`, or null when it is one. */
export const notAnAnswer = (fact: AnswerFact, q: Question, model: string): { kind: 'malformed' | 'wrong-model'; message: string } | null => {
  const a = fact.raw as Record<string, unknown> | null;
  const malformed = (why: string) => ({ kind: 'malformed' as const, message: `${why}; the reply is kept raw in ${fact.n}.answer.json` });
  if (typeof fact.answeredBy === 'string' && fact.answeredBy !== model) {
    return { kind: 'wrong-model', message: `answered by ${fact.answeredBy}, and the question is pinned to ${model}` };
  }
  if (typeof a !== 'object' || a === null) return malformed('the reply held no answer to this question');
  if (a.type !== q.type) return malformed(`the answer is a ${String(a.type)}, and the question a ${q.type}`);
  const probability = (x: unknown) => typeof x === 'number' && x >= 0 && x <= 1;
  if (q.type === 'noul' && !probability(a.noul)) return malformed(`its noul is ${JSON.stringify(a.noul)}, not a probability`);
  if (q.type === 'score') {
    const top = (q.criteria as readonly unknown[]).length - 1;
    if (!(typeof a.score === 'number' && a.score >= 0 && a.score <= top)) return malformed(`its score is ${JSON.stringify(a.score)}, not between 0 and ${top}`);
  }
  if (q.type === 'choice' && !(typeof a.choice === 'string' && Object.hasOwn(q.criteria, a.choice))) {
    return malformed(`its choice ${JSON.stringify(a.choice)} is not one of the options`);
  }
  if (q.type !== 'noul' && !probability(a.confidence)) return malformed(`its confidence is ${JSON.stringify(a.confidence)}, not a probability`);
  if (typeof fact.answeredBy !== 'string') return malformed('the reply does not say which model answered');
  return null;
};

/** What a key's facts say, read at `now`: a judgment, nothing yet, or a claim still inside its deadline. */
export type Reading =
  | { readonly status: 'none' }
  | { readonly status: 'waiting'; readonly n: number; readonly deadline: number }
  | Judgment;

/**
 * Pure. The lowest asking with a whole answer wins: an answer is used for ever, even one that came late, after a person
 * re-asked. Without one, the last asking says what there is: its failure, its bad answer, or its claim.
 */
export const reading = (key: string, facts: Facts, q: Question, model: string, now: number): Reading => {
  const ns = [...facts.keys()].sort((a, b) => a - b);
  for (const n of ns) {
    const answer = facts.get(n)!.answer;
    if (answer && !notAnAnswer(answer, q, model)) {
      return { status: 'answered', answer: answer.raw as never, key, at: answer.at, model: answer.answeredBy as string };
    }
  }
  if (ns.length === 0) return { status: 'none' };
  const n = ns[ns.length - 1]!;
  const { claim: c, answer, failed } = facts.get(n)!;
  if (answer) return { status: 'failed', key, at: answer.at, ...notAnAnswer(answer, q, model)! };
  if (failed) return { status: 'failed', key, at: failed.at, kind: failed.kind, message: failed.message };
  const deadline = Date.parse(c!.deadline);
  if (now <= deadline) return { status: 'waiting', n, deadline };
  return {
    status: 'failed', key, at: c!.at, kind: 'interrupted',
    message: `asking ${n} was claimed by process ${c!.pid} on ${c!.host} at ${c!.at} and nothing came of it by ${c!.deadline}; re-ask it`,
  };
};

/** The next asking's number. */
export const nextN = (facts: Facts) => Math.max(0, ...facts.keys()) + 1;

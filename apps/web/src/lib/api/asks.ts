/**
 * What a person asks of a run from the board — a try, a round, an approval (a gate's, or a loop's as it stands), words to a session
 * (the command table's routes, apps/api/src/commands/routes.ts).
 */

import { Schema } from 'effect';
import { decodes } from './decodes.ts';
import { send } from './read.ts';

/**
 * Mirrors `Said` in agent-orchestrator, the engine's `said` entry: words a person said to a step's running session, when, to which attempt
 * of its task, and the last event of the session's transcript before they were handed over (`after`, by its `kind` and `id`), null where
 * the transcript held none.
 */
export type Said = { at: string; attempt: number; text: string; after: { kind: string; id: string } | null };

/** Decodes a `Said`. */
const SaidSchema = decodes<Said>()(
  Schema.Struct({
    at: Schema.String,
    attempt: Schema.Number,
    text: Schema.String,
    after: Schema.NullOr(Schema.Struct({ kind: Schema.String, id: Schema.String })),
  }),
);

/**
 * Mirrors `Answer` in agent-orchestrator's question/question.ts: a person's answer to one question a step asks, by its title — the labels
 * they chose, and words of their own.
 */
export type QuestionAnswer = { question: string; chose: readonly string[]; own?: string };

/** How the CLI's `retry` tries a step again: continue its session, a new one, or its check run again and no session. */
export type RetryMode = 'continue' | 'fresh' | 'recheck';

/** What an ask for a try answers: the try asked for, its ask file, and whether the tick stops the step's blocked session first. */
export type AskedTry = { try: number; file: string; stopFirst: boolean };

/** Decodes an `AskedTry`. */
const AskedTrySchema = decodes<AskedTry>()(
  Schema.Struct({
    try: Schema.Number,
    file: Schema.String,
    stopFirst: Schema.Boolean,
  }),
);

/** What an ask for a round answers: the looping step, the round asked for, and its ask file. */
export type AskedRound = { step: string; round: number; file: string };

/** Decodes an `AskedRound`. */
const AskedRoundSchema = decodes<AskedRound>()(
  Schema.Struct({
    step: Schema.String,
    round: Schema.Number,
    file: Schema.String,
  }),
);

/** What an approval answers: the try approved, when, its words — null for none — and the approval's file. */
export type Approved = { try: number; at: string; message: string | null; file: string };

/** Decodes an `Approved`. */
const ApprovedSchema = decodes<Approved>()(
  Schema.Struct({
    try: Schema.Number,
    at: Schema.String,
    message: Schema.NullOr(Schema.String),
    file: Schema.String,
  }),
);

/**
 * Ask for another try of a step, as the CLI's `retry` does: the api calls the package's `retry()`, which writes the ask and nothing else,
 * and the next tick files the try. Resolves with the try asked for, its ask file, and the package's `stopFirst` — the tick stops the step's
 * blocked session before it files the try; rejects with the api's refusal in full — the package's words for a message or a budget that
 * cannot ride on the ask, a step that may not be tried again that way, or a budget not above what its tries have cost — or the api's own
 * about the request; and an answer the board does not read, saying the ask may be written. `budget` is `--budget`: the cap a step over its
 * budget, or ended at it, is raised to. `answers` are a person's to the questions the step's closeout asks: the api refuses those that do
 * not fit, and writes the rest as the try's message.
 *
 * Sent as `application/json`, which the api requires of it, as of a start.
 */
export const askTry = (
  runId: string,
  step: string,
  how: { mode: RetryMode; model?: string; message?: string; budget?: number; answers?: readonly QuestionAnswer[] },
): Promise<AskedTry> =>
  send('POST', `/api/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(step)}/retry`, AskedTrySchema, {
    body: how,
    may: "The ask may be written: look at the step's note on the run's page before asking again.",
  });

/**
 * Ask for another round of a run's loop, as the CLI's `round` does — past a cap, with `budget`, `--budget`: the api calls the package's
 * `round()`, which writes the ask and nothing else, and the next tick files the round. Resolves with the looping step, the round asked for,
 * and its ask file; rejects with the api's refusal in full — the package's words for a round the loop may not go, or a budget not above
 * what its steps have cost — or the api's own about the request; and an answer the board does not read, saying the ask may be written.
 *
 * Sent as `application/json`, which the api requires of it, as of a try.
 */
export const askRound = (runId: string, how: { step?: string; budget?: number }): Promise<AskedRound> =>
  send('POST', `/api/runs/${encodeURIComponent(runId)}/round`, AskedRoundSchema, {
    body: how,
    may: "The ask may be written: look at the looping step's note on the run's page before asking again.",
  });

/**
 * Approve a step waiting at its gate, as the CLI's `approve` does — with `message`, `--message`, the words every step after the gate is
 * handed: the api calls the package's `approve()`, which writes the approval and nothing else, and the next tick files what waits on the
 * step. Resolves with the try approved, when, the words and the approval's file; rejects with the api's refusal in full — the package's
 * words for a step that may not be approved, or for empty words — or the api's own about the request; and an answer the board does not
 * read, saying the approval may be written.
 *
 * With `answers`, a person's answers to the questions the step asks at its gate: the api checks them against what the step asks now and
 * writes them, `message` their note, as the approval's words — or refuses them, and nothing is approved.
 *
 * On a loop out of rounds it takes the loop's work as it stands, as the CLI's `approve` of a loop does: `message` is then required, why
 * the work is good enough with its findings open, and the package refuses it missing or empty.
 *
 * Sent as `application/json`, which the api requires of it, as of an ask. Sending the step back is an ask for a try with words (`askTry`).
 */
export const approveStep = (
  runId: string,
  step: string,
  how: { message?: string; answers?: readonly QuestionAnswer[] },
): Promise<Approved> =>
  send('POST', `/api/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(step)}/approve`, ApprovedSchema, {
    body: how,
    may: "The approval may be written: look at the step on the run's page before approving again.",
  });

/**
 * Tell a step's running session something, as the CLI's `say` does: the api calls the package's `say()`, which hands the words to the
 * session through the engine, and the engine journals them on the step's task. Resolves with that entry; rejects with the api's refusal in
 * full — the package's words or the engine's, verbatim — or the api's own about the request; and an answer the board does not read, saying
 * the words may have been said.
 *
 * Sent as `application/json`, which the api requires of it, as of a start and an ask.
 */
export const sayToStep = (runId: string, step: string, text: string): Promise<Said> =>
  send('POST', `/api/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(step)}/say`, SaidSchema, {
    body: { text },
    may: "The words may have been said: read the step's conversation on its page before saying them again.",
  });

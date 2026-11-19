/**
 * A harness's check turn, judged: the one tiny real turn the server files through a harness to prove it answers (`startTurn`,
 * `harness-turn.verb.ts`), what it is told and how it is bounded (`TURN_PROMPT`, `TURN_BUDGET_USD`, `TURN_DEADLINE_SECONDS`), and what its
 * task as the engine answers it comes to (`turnCheckOf`, whose laws are contracts/harness-turn.contract.ts'). Pure: the task's view is
 * read and handed in.
 */
import type { TurnCheckOf, TurnSeen, TurnVerdict } from '../../contracts/harness-turn.contract.ts';

export type { TurnSeen, TurnVerdict } from '../../contracts/harness-turn.contract.ts';

/** What the check turn is told: the smallest question with an answer to read. */
export const TURN_PROMPT = 'Answer with the one word: ready';

/** The spend cap a check turn runs under, in dollars: its harness ends it past this. */
export const TURN_BUDGET_USD = 0.05;

/** How long a check turn may run, in seconds, before the engine stops it. */
export const TURN_DEADLINE_SECONDS = 90;

/** The statement a check turn is asked to give, so its answer is carried on its attempt's closeout: one word, `answer`. */
export const TURN_SCHEMA = {
  type: 'object',
  properties: { answer: { type: 'string', description: 'The one word asked for.' } },
  required: ['answer'],
} as const;

/**
 * What a check turn's task came to: running until it settles; passed exactly on an answer — the harness ended it itself, under no limit,
 * having said something; else failed, saying why.
 * @param s The turn's task as the engine answers it.
 */
export const turnCheckOf: TurnCheckOf = (s: TurnSeen): TurnVerdict => {
  if (!s.settled) return { state: 'running' };
  if (s.end === 'deadline') return { state: 'failed', failure: 'deadline' };
  if (s.end === 'operator') return { state: 'failed', failure: 'stopped' };
  if (s.end !== 'harness') return { state: 'failed', failure: 'unstarted' };
  if (s.budget) return { state: 'failed', failure: 'budget' };
  if (s.answer === undefined || s.answer.trim() === '') return { state: 'failed', failure: 'unanswered' };
  return { state: 'passed' };
};

/**
 * The closeout a step hands the steps after it, as the tick writes it in the step's files directory (`HANDED_CLOSEOUT`): v1's envelope
 * as the person reads it, its artifacts typed, and its declared output. Pure: the files that are there are handed to it.
 */
import { LOOP_REPLIES, outputFields, type Workflow } from '../step/step.ts';
import { declaredOutput, type Closeout } from './closeout.ts';
import { CLOSEOUT_V1 } from './envelope.ts';

/** A closeout as a later step reads it in `closeout.json`: an artifact is a file by its absolute path, or a value by its name. */
export type HandedCloseout = {
  apiVersion: typeof CLOSEOUT_V1;
  outcome: 'done' | 'blocked';
  summary: string;
  body: string | null;
  artifacts: Array<{ path: string } | { name: string; value: string }>;
  needs: string | null;
  output: Record<string, unknown>;
};

/**
 * What step `step`'s closeout `said` hands on, in v1's shape whatever version it was given in: its summary cut and its body as every
 * reader reads them (`parseCloseout`), each file it named that is `there`, by its absolute path in its files directory, then each value,
 * and the fields its `output:` declares that it gave, its `replies` with them where it gave some.
 */
export function handedCloseout(step: Workflow, said: Closeout, there: readonly string[]): HandedCloseout {
  const replies = said.output && Object.hasOwn(said.output, LOOP_REPLIES) ? [LOOP_REPLIES] : [];
  return {
    apiVersion: CLOSEOUT_V1,
    outcome: said.outcome,
    summary: said.summary,
    body: said.body ?? null,
    artifacts: [...there.map((path) => ({ path })), ...(said.values ?? [])],
    needs: said.needs ?? null,
    output: declaredOutput(step, said, [...outputFields(step), ...replies]).given,
  };
}

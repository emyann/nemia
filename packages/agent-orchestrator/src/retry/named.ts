/**
 * The `nemia retry` commands a text names for one run (`retriesNamed`): what `nemia decide` judges a blocked step's `needs` by, so a
 * command the store would refuse is said refused where a person reads it (`answerLines`). Pure. Free text read as it is written: a command
 * split across lines, or built from a variable, is not found.
 */
import type { RetryHow } from './retry-ask.ts';

/** A `nemia retry` a text names: the step, and how it asks for its try. */
export type RetryNamed = { step: string; how: RetryHow };

/** `nemia retry <run> <step>`, and the rest of its line, up to a backtick or the line's end. */
const COMMAND = /\bnemia retry ([\w.-]+) ([\w-]+)([^\n`]*)/g;

/** A flag of `nemia retry` and its value where it takes one: a word, or a quoted text. */
const FLAG = /--(recheck|fresh|continue|model|budget|message)\b(?:[ =]("[^"]*"|'[^']*'|(?!--)\S+))?/g;

/** Whether a value is a placeholder a person fills (`<answer>`), which names no message. */
const placeholder = (value: string): boolean => /^<[^>]*>$/.test(value);

/** A flag's value, its quotes taken off. */
const unquoted = (value: string): string => value.replace(/^(["'])(.*)\1$/, '$2');

/** How the flags after a named command ask for the try (`RetryHow`), as `nemia retry` would read them. */
function howOf(flags: string): RetryHow {
  let how: RetryHow = { mode: 'continue' };
  for (const [, flag, raw] of flags.matchAll(FLAG)) {
    const value = raw === undefined ? undefined : unquoted(raw);
    if (flag === 'recheck' || flag === 'fresh') how = { ...how, mode: flag };
    else if (flag === 'model' && value !== undefined) how = { ...how, model: value };
    else if (flag === 'budget' && value !== undefined && Number.isFinite(Number(value))) how = { ...how, budget: Number(value) };
    else if (flag === 'message' && value !== undefined && !placeholder(value)) how = { ...how, message: value };
  }
  return how;
}

/** Each `nemia retry <runId> <step> …` `text` names, in order, with how it asks; another run's commands are left out. */
export function retriesNamed(text: string, runId: string): RetryNamed[] {
  const named: RetryNamed[] = [];
  for (const [, run, step, rest] of text.matchAll(COMMAND)) {
    if (run !== runId || step === undefined) continue;
    named.push({ step, how: howOf(rest ?? '') });
  }
  return named;
}

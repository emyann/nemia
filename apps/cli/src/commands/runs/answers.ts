/**
 * A person's `--answer <n>=<letter>`s, as `nemia retry` and `nemia approve` take them, resolved into the `answers` the api takes (by
 * question title and option label): the questions numbered 1, 2… across the fields of the step's current closeout, in the order `nemia
 * decide` prints them, each option lettered a, b… (`aa` past `z`). The questions are read off the step's current try (`steps.tries`);
 * what is left to refuse — a question answered twice or not at all, several labels where one is taken, a step that asks none — is the
 * api's, in its words.
 */
import type { RunRetry, StepTries } from 'objects';
import { asked } from '../../objects.ts';
import { Refused } from '../../refused.ts';

/** An answer as the api takes it. */
type Answer = NonNullable<RunRetry['answers']>[number];

/** A question a closeout asks. */
type Question = NonNullable<StepTries['tries'][number]['closeout']>['questions'][number]['questions'][number];

/** The letter of the option at `index` from 0: `a` to `z`, then `aa`, `ab`… */
const letterOf = (index: number): string =>
  index < 26 ? String.fromCharCode(97 + index) : `${letterOf(Math.floor(index / 26) - 1)}${letterOf(index % 26)}`;

/** The forms an `--answer` takes, as its refusal says them. */
const FORMS = "`n=a`, `n=a,c` where the question takes several, `n=a: words` or `n: words`, n the question's number";

/** One `--answer` value read: the question's number, the letters chosen, and the person's own words. */
type Typed = { n: number; letters: string[]; own?: string };

/** An `--answer` value read (`1=a`, `2=a,c`, `3=b: words`, `3: words`), or null where it takes no form of them. */
function typedOf(value: string): Typed | null {
  const m = /^\s*(\d+)\s*(?:=\s*([a-z]+(?:\s*,\s*[a-z]+)*))?\s*(?::([\s\S]*))?$/i.exec(value);
  if (!m) return null;
  const own = m[3]?.trim();
  if (m[2] === undefined && !own) return null;
  return { n: Number(m[1]), letters: m[2] ? m[2].split(',').map((l) => l.trim().toLowerCase()) : [], ...(own ? { own } : {}) };
}

/** `typed` resolved against question `q`: its letters as the labels they name; refused where one names none. */
function resolved(q: Question, typed: Typed, value: string): Answer {
  const letters = q.options.map((_, i) => letterOf(i));
  const stray = typed.letters.find((l) => !letters.includes(l));
  if (stray !== undefined) {
    const offered = q.options.map((o, i) => `${letterOf(i)} (${o.label})`).join(', ');
    throw new Refused(`--answer ${value}: "${q.title}" offers no ${stray}: its options are ${offered}.`);
  }
  const chose = typed.letters.flatMap((l) => {
    const option = q.options[letters.indexOf(l)];
    return option === undefined ? [] : [option.label];
  });
  return { question: q.title, chose, ...(typed.own ? { own: typed.own } : {}) };
}

/**
 * Each of `typed` resolved against `questions`, numbered as `nemia decide <runId>` prints them; refused, exit 2, naming the forms or the
 * command that prints the numbering, where one cannot be read. None for a step that asks none, which the api refuses in its own words.
 */
export function numberedAnswers(questions: readonly Question[], typed: readonly string[], runId: string): Answer[] {
  if (!questions.length) return [];
  return typed.map((value) => {
    const read = typedOf(value);
    if (!read) throw new Refused(`--answer ${value} is not an answer: it takes ${FORMS}, quoted where it has spaces.`);
    const q = questions[read.n - 1];
    if (!q)
      throw new Refused(
        `--answer ${value} names question ${read.n}, and the step asks ${questions.length} now, numbered from 1 as nemia decide ${runId} prints them.`,
      );
    return resolved(q, read, value);
  });
}

/** The questions the current try of `step` of run `runId` asks, field by field, in the order its closeout lists them. */
export async function askedNow(command: string, runId: string, step: string): Promise<Question[]> {
  const { tries } = await asked(command, (c) => c.steps.tries({ params: { runId, step }, query: {} }));
  const current = tries.find((t) => t.current) ?? tries.at(-1);
  return (current?.closeout?.questions ?? []).flatMap((asked) => asked.questions);
}

/** The `answers` the api takes for `typed`, the `--answer`s given to `command` for `step` of `runId`; none where none were typed. */
export async function answersOf(command: string, runId: string, step: string, typed: readonly string[]): Promise<{ answers?: Answer[] }> {
  if (!typed.length) return {};
  return { answers: numberedAnswers(await askedNow(command, runId, step), typed, runId) };
}

import type { ReactNode } from 'react';
import { Tag } from '@/components/ui/ds';
import { type Outcome, outcomeWord } from '../../lib/outcome';
import { Markdown } from '../markdown/Markdown';
import { container } from '../../lib/meaning';

const BADGE: Record<Outcome['by'] | 'blocked', string> = {
  agent: container.sage,
  blocked: container.yours,
  machine: container.failure,
  unreadable: container.failure,
  nobody: 'bg-surface-container-highest text-on-surface',
};

const BY: Record<Outcome['by'], string> = {
  agent: 'said by the agent',
  unreadable: 'said by the agent, not readable',
  machine: 'no statement: the machine’s reason',
  nobody: 'no statement',
};

/**
 * How a try ended, first, in words: the agent's `done` or `blocked`, or the machine's reason it has no statement — and who said it.
 * `aside` sits at the right of the line: the Raw switch, for a try with a statement to show.
 */
export function OutcomeHead({ outcome, aside }: { outcome: Outcome; aside?: ReactNode }) {
  const word = outcomeWord(outcome);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p data-outcome={word} data-by={outcome.by} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Tag className={BADGE[outcome.by === 'agent' && outcome.outcome === 'blocked' ? 'blocked' : outcome.by]}>{word}</Tag>{' '}
          <span className="text-body-small text-on-surface-variant">{BY[outcome.by]}</span>
        </p>
        {aside}
      </div>
      {outcome.by === 'agent' && outcome.cut && <p className="text-body-small text-failure">… {outcome.cut}.</p>}
      {outcome.by !== 'agent' && (
        <p data-reason className="text-on-surface-variant">
          {outcome.words}
        </p>
      )}
    </div>
  );
}

const text = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value));

const ANSWER: Record<string, string> = {
  fixed: container.sage,
  "won't fix": 'bg-surface-container-highest text-on-surface',
};

/**
 * A loop's target's answers, `finding → answer · why`: the finding, then its answer and why beneath it — the finding and why as the
 * markdown they are, each maybe more than a line, and the answer a badge.
 */
export function Replies({ replies }: { replies: ReadonlyArray<Record<string, unknown>> }) {
  return (
    <ul className="space-y-2 text-body-small">
      {replies.map((reply, i) => {
        const answer = text(reply.answer ?? '');
        const why = reply.why === undefined ? '' : text(reply.why);
        return (
          <li key={i} data-answer={answer} className="space-y-0.5">
            <Markdown>{text(reply.finding ?? '')}</Markdown>{' '}
            <div className="flex items-start gap-1.5 text-on-surface-variant">
              <span className="shrink-0">
                → <Tag className={ANSWER[answer] ?? ANSWER["won't fix"]}>{answer}</Tag>
              </span>
              {why && (
                <>
                  {' '}
                  <span aria-hidden>·</span> <Markdown>{why}</Markdown>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** A value as the JSON it came as. */
export function Json({ value, ...data }: { value: unknown } & Record<`data-${string}`, string | boolean>) {
  return (
    <pre
      {...data}
      className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-surface-container-highest p-2 font-mono text-body-small leading-snug"
    >
      {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}

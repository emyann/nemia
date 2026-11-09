import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { container } from '../../lib/meaning';

/** What a run waits on other runs for, in the package's words: a start `--after` runs (`waiting`) or a person's hold (`holding`). */
export type RunWaitFacts = {
  runs: ReadonlyArray<{ run: string; missing: boolean }>;
  word: string;
  advice: string;
  waitingOnYou: boolean;
};

/**
 * A run's wait on other runs, on its page, as the CLI's `decide` says it: the CLI `ls`'s word, what it leaves a person to do, and each run
 * it names, linked to its page where the store has it and plain where it does not. In the yours container when it never ends without a
 * person, in the grey one at rest. `label` names the banner — `Waiting on runs` for a start `--after` runs, `Held` for a person's hold —
 * and `children` are what a person can do about it, the hold's Lift.
 */
export function RunWait({ label, wait, children }: { label: string; wait: RunWaitFacts; children?: ReactNode }) {
  return (
    <section
      aria-label={label}
      data-on-you={wait.waitingOnYou}
      className={`space-y-1 rounded px-3 py-2 text-body-medium ${wait.waitingOnYou ? container.yours : container.grey}`}
    >
      <p className="font-mono">{wait.word}</p>
      <p data-advice>{wait.advice}</p>
      {wait.runs.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 text-body-small">
          {wait.runs.map((w) => (
            <li key={w.run}>
              {w.missing ? (
                <span className="font-mono">{w.run}</span>
              ) : (
                <Link to="/runs/$runId" params={{ runId: w.run }} className="font-mono underline underline-offset-2">
                  {w.run}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      {children}
    </section>
  );
}

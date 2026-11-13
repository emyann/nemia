/**
 * The top of a run's page: what the run asks of a person, a line each (`runAsksOf`), each line pointing to the step it is of, where its
 * part holds the form that answers it (the gate, the answer, Continue); then what the run waits on other runs for and a person's hold;
 * and, folded, what the command line's decide shows of the run. It lists and points: nothing is answered here.
 */
import type { ReactNode } from 'react';
import { stepAnchor } from '@/lib/asks';
import { useQuery } from '@tanstack/react-query';
import { decisionQuery } from '@/lib/api/decision';
import { decidableRun, decisionStamp, isDecidable } from '@/lib/decide';
import { container } from '@/lib/meaning';
import { runAsksOf, type RunAsk } from '@/lib/runAsks';
import type { RunDetail } from '@/lib/runView';
import { setTry } from '@/lib/tryAddress';
import { cn, focusRing } from '@/components/ui/ds/utils';
import { TextLink } from '../look';
import { Decide } from '../gate/Decide';
import { Fold } from '../step/part/Fold';
import { RunWait } from './RunWait';

/** How a line points to its step: underlined, in the line's ink. */
const POINT = cn('rounded-sm underline underline-offset-2', focusRing());

/**
 * The link of a line to the step `step`: on the run's page, the step's part (`#step-<name>`), showing its current try, the one that asks;
 * given `onStep`, as in the frame's bar where the parts are not drawn, a button that shows the step there.
 */
function ToStep({ run, step, onStep, children }: { run: string; step: string; onStep?: (step: string) => void; children: ReactNode }) {
  if (onStep)
    return (
      <button type="button" data-ask-link={step} className={POINT} onClick={() => onStep(step)}>
        {children}
      </button>
    );
  return (
    <TextLink
      to="/runs/$runId"
      params={{ runId: run }}
      hash={stepAnchor(step)}
      search={(prev) => setTry(prev, step, null)}
      data-ask-link={step}
      className="underline underline-offset-2"
    >
      {children}
    </TextLink>
  );
}

/** A line of what the run asks: the step's name and what it asks, the whole line pointing to the step; a result with no step, its words. */
function AskLine({ run, ask, onStep }: { run: string; ask: RunAsk; onStep?: (step: string) => void }) {
  return (
    <li data-ask={ask.kind} data-step={ask.step ?? undefined} className="min-w-0 break-words">
      {ask.step === null ? (
        ask.line
      ) : (
        <ToStep run={run} step={ask.step} onStep={onStep}>
          {ask.kind === 'decide' || ask.kind === 'gate' ? (
            ask.line
          ) : (
            <>
              <strong>{ask.step}</strong> {ask.line}
            </>
          )}
        </ToStep>
      )}
    </li>
  );
}

/**
 * What the run `run` asks of a person, top of its page: a line per ask, linked to its step's part, or given `onStep` (the frame's bar) a
 * button that shows the step; then its wait on runs and its hold, each in the package's words (`RunWait`), Lift being the run's menu's;
 * and, on the page, what the command line's decide shows, folded: under the asks, or where nothing is asked, once the api says there is
 * something to decide — a finished run asks nothing and still has its branch to land or drop. Nothing at all for a run that asks nothing,
 * waits on nobody and has nothing to decide.
 */
export function AsksOfYou({ run, onStep }: { run: RunDetail; onStep?: (step: string) => void }) {
  const asks = runAsksOf(run);
  const decidable = !onStep && decidableRun(run);
  const { data } = useQuery({ ...decisionQuery(run.id, decisionStamp(run)), enabled: decidable && !asks.length });
  const decide = decidable && (asks.length > 0 || isDecidable(data));
  if (!asks.length && !run.waiting && !run.holding && !decide) return null;
  return (
    <div data-asks={asks.length} className="space-y-2">
      {asks.length > 0 && (
        <section aria-label="Asks of you" className={cn('space-y-1.5 rounded px-3 py-2 text-body-medium', container.yours)}>
          <h2 className="text-label-large">Asks of you</h2>
          <ul className="space-y-1">
            {asks.map((ask) => (
              <AskLine key={`${ask.kind}:${ask.step ?? ''}`} run={run.id} ask={ask} onStep={onStep} />
            ))}
          </ul>
        </section>
      )}
      {decide && (
        <Fold name="decide" title="What there is to decide, and the commands">
          <Decide run={run} />
        </Fold>
      )}
      {run.waiting && <RunWait label="Waiting on runs" wait={run.waiting} />}
      {run.holding && <RunWait label="Held" wait={run.holding} />}
    </div>
  );
}

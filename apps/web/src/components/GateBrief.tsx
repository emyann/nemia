import { useQuery } from '@tanstack/react-query';
import { decisionQuery, type RunDetail } from '../lib/api';
import { needOf, stepAnchor } from '../lib/asks';
import { decidableRun, decisionStamp, isDecidable } from '../lib/decide';
import { gateBrief, gateFacts, gateOfStep, needWords, type GateFact } from '../lib/gate';
import { cn } from '../lib/utils';
import { RouteLink } from './AgentParts';
import { Gate } from './Gate';

type Step = RunDetail['steps'][number];

const LINK =
  'rounded-sm underline decoration-neutral-400 underline-offset-2 outline-none hover:decoration-neutral-700 focus-visible:ring-2 focus-visible:ring-ring/50 dark:decoration-neutral-500 dark:hover:decoration-neutral-300';

/**
 * What a run asks of a person at this step, first in its inspector, above everything else: at a gate, which step waits, what approving
 * does and what sending back does, the facts to decide on, and the answer itself (`Gate`); for a question or a blocked session, what is
 * asked and a link to the run's page where it is answered; for a result nobody decided, the same, on whichever step is open. Nothing where
 * the run waits on nobody.
 */
export function Asked({ run, step }: { run: RunDetail; step: Step }) {
  const gate = gateOfStep(run, step);
  if (gate) return <GateBrief run={run} step={step} />;
  const need = needOf(step, run.waitingOnYou.includes(step.name), run.cancelledAt !== null);
  if (need) return <Waits run={run} anchor={step.name} said={needWords(need)} kind={need.kind} />;
  if (run.toDecide?.kind === 'git' && run.cancelledAt === null)
    return <Waits run={run} anchor={null} said={`The run's result waits on you: ${run.toDecide.said}.`} kind="git" />;
  return null;
}

/**
 * A gate, told: the words off the record, the facts under them, then Approve and Send back. The facts read the run's decision once for this
 * state of the run, as the run page's Decide section does — what it touched, and whether each branch still merges onto the base — on the
 * detail the inspector has, never on the list the Factory polls.
 */
function GateBrief({ run, step }: { run: RunDetail; step: Step }) {
  const gate = gateOfStep(run, step)!;
  const next = run.graph.edges.filter((e) => e.kind === 'after' && e.from === step.name).map((e) => e.to);
  const says = run.toDecide?.kind === 'approve' && run.toDecide.step === step.name ? run.toDecide.says : null;
  const brief = gateBrief(gate, gate.ends ? says : null, next);
  const { data } = useQuery({ ...decisionQuery(run.id, decisionStamp(run)), enabled: decidableRun(run) });
  const facts = gateFacts(run, isDecidable(data) ? data : null);

  return (
    <section
      aria-label={`What ${step.name} asks of you`}
      data-asked="approve"
      className="space-y-3 rounded border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/30"
    >
      <h3 className="text-xs font-semibold tracking-wide text-amber-900 uppercase dark:text-amber-200">Waiting on you</h3>
      <p data-brief="waits" className="break-words">
        {brief.waits}
      </p>
      <p data-brief="approving" className="break-words">
        {brief.approving}
      </p>
      <p data-brief="sending-back" className="break-words">
        {brief.sendingBack}
      </p>
      <dl
        aria-label="What to decide on"
        className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 border-t border-amber-200 pt-2 text-xs dark:border-amber-900"
      >
        {facts.map((fact, i) => (
          <div key={`${fact.label}-${i}`} className="contents">
            <dt className="text-neutral-500">{fact.label}</dt>
            <dd data-fact={fact.label} data-state={fact.state} className={cn('min-w-0 break-words', STATE[fact.state ?? 'none'])}>
              <FactWords run={run} fact={fact} />
            </dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-amber-200 pt-3 dark:border-amber-900">
        <Gate runId={run.id} step={step.name} back={gate.back} acts={gate.ends} framed={false} />
      </div>
    </section>
  );
}

const STATE = {
  good: 'text-emerald-800 dark:text-emerald-300',
  bad: 'text-red-700 dark:text-red-400',
  none: '',
} as const;

/** A fact's words, linked to the step's section on the run's page where there is more to read: a review's findings, a check's output. */
function FactWords({ run, fact }: { run: RunDetail; fact: GateFact }) {
  if (!fact.step) return <>{fact.said}</>;
  return (
    <RouteLink to="/runs/$runId" params={{ runId: run.id }} hash={stepAnchor(fact.step)} data-fact-link={fact.step} className={LINK}>
      {fact.said}
    </RouteLink>
  );
}

/**
 * What else a run waits on a person for — a question, a session the harness blocked, a result nobody decided — in words, with the way to
 * the run's page where it is answered: the step's section, or the Decide section. No answer here: inline answers are for gates alone.
 */
function Waits({ run, anchor, said, kind }: { run: RunDetail; anchor: string | null; said: string; kind: string }) {
  return (
    <section
      aria-label="What the run asks of you"
      data-asked={kind}
      className="space-y-2 rounded border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/30"
    >
      <h3 className="text-xs font-semibold tracking-wide text-amber-900 uppercase dark:text-amber-200">Waiting on you</h3>
      <p className="break-words whitespace-pre-wrap">{said}</p>
      <RouteLink
        to="/runs/$runId"
        params={{ runId: run.id }}
        hash={anchor ? stepAnchor(anchor) : 'decide'}
        data-answer-link
        className={cn('text-xs', LINK)}
      >
        Answer it on the run's page
      </RouteLink>
    </section>
  );
}

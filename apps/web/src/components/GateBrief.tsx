import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { decisionQuery, type RunDetail } from '../lib/api';
import { askedIn, needOf, stepAnchor } from '../lib/asks';
import { decidableRun, decisionStamp, isDecidable } from '../lib/decide';
import { gateBrief, gateFacts, gateOfStep, needWords } from '../lib/gate';
import { cn } from '../lib/utils';
import { RouteLink } from './AgentParts';
import { FactList, LINK } from './Facts';
import { Gate } from './Gate';
import { Markdown } from './Markdown';
import { StepPolicy } from './Told';

type Step = RunDetail['steps'][number];

/**
 * What a run asks of a person at this step, first in its inspector, above everything else: at a gate, which step waits, what approving does
 * and what sending back does, the facts to decide on, the step's policy (`StepPolicy`), and the answer itself (`Gate`); for a question or a
 * blocked session, what is asked and a link to the run's page where it is answered; for a result nobody decided, the same, on whichever
 * step is open. Nothing where the run waits on nobody.
 */
export function Asked({ run, step }: { run: RunDetail; step: Step }) {
  const gate = gateOfStep(run, step);
  if (gate) return <GateBrief run={run} step={step} />;
  const need = needOf(step, run.waitingOnYou.includes(step.name), run.cancelledAt !== null);
  if (need?.kind === 'asks')
    return (
      <Waits run={run} anchor={step.name} kind={need.kind}>
        <div className="break-words">
          <strong>{need.step}</strong> asks: <Markdown className="max-h-72 overflow-y-auto pr-1">{need.needs}</Markdown>
        </div>
      </Waits>
    );
  if (need) return <Waits run={run} anchor={step.name} kind={need.kind} said={needWords(need)} />;
  if (run.toDecide?.kind === 'result' && run.cancelledAt === null)
    return <Waits run={run} anchor={null} kind="result" said={`The run's result waits on you: ${run.toDecide.said}.`} />;
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
      className="space-y-3 rounded border border-yours bg-card p-3"
    >
      <h3 className="text-label-medium text-yours uppercase">Waiting on you</h3>
      <p data-brief="waits" className="break-words">
        {brief.waits}
      </p>
      <p data-brief="approving" className="break-words">
        {brief.approving}
      </p>
      <p data-brief="sending-back" className="break-words">
        {brief.sendingBack}
      </p>
      <FactList runId={run.id} facts={facts} label="What to decide on" className="border-t border-outline-variant pt-2" />
      <StepPolicy layers={step.layers} />
      <div className="border-t border-outline-variant pt-3">
        <Gate
          runId={run.id}
          step={step.name}
          approveLine={step.commands.approve}
          back={gate.back}
          acts={gate.ends}
          framed={false}
          questions={askedIn(step.closeout)}
        />
      </div>
    </section>
  );
}

/**
 * What else a run waits on a person for — a question, a session the harness blocked, a result nobody decided — in words, with the way to
 * the run's page where it is answered: the step's section, or the Decide section. No answer here: inline answers are for gates alone.
 * `said` is words the board composed, said as they are; `children`, what an agent wrote, drawn as its markdown, in their place.
 */
function Waits({
  run,
  anchor,
  kind,
  said,
  children,
}: {
  run: RunDetail;
  anchor: string | null;
  kind: string;
  said?: string;
  children?: ReactNode;
}) {
  return (
    <section aria-label="What the run asks of you" data-asked={kind} className="space-y-2 rounded border border-yours bg-card p-3">
      <h3 className="text-label-medium text-yours uppercase">Waiting on you</h3>
      {children ?? <p className="break-words whitespace-pre-wrap">{said}</p>}
      <RouteLink
        to="/runs/$runId"
        params={{ runId: run.id }}
        hash={anchor ? stepAnchor(anchor) : 'decide'}
        data-answer-link
        className={cn('text-body-small', LINK)}
      >
        Answer it on the run's page
      </RouteLink>
    </section>
  );
}

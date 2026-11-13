/**
 * What a step asks of a person, in its part: the run's page's own parts, never a copy, picked as her chat picks them (`broughtPart`): its
 * gate told and answered (`GateBrief`), beside the work an ending would act on (`ActsOn`); the Decide section's row for its answer
 * (`AnswerRow`); Continue for a session the harness blocked; the note of a try already asked (`AskedRow`); else, in words, what it needs,
 * the calls its harness denied, and what it waits for. On the graph's node, one line of it.
 */
import { askedOf, needNodeText, needOf, offersOf, type Answer } from '@/lib/asks';
import { broughtFacts, broughtPart } from '@/lib/brought';
import { gateNodeLine, gateOfStep } from '@/lib/gate';
import { ink } from '@/lib/meaning';
import type { RunDetail, StepView } from '@/lib/runView';
import type { PartSize, StepPartModel } from '@/lib/stepPart';
import { cn } from '@/lib/utils';
import { AnswerRow, Continue } from '../../gate/Decide';
import { ActsOn, endsTheRun } from '../../gate/Gate';
import { GateBrief } from '../../gate/GateBrief';
import { AskedRow } from '../../gate/Questions';
import { Markdown } from '../../markdown/Markdown';

/** What the step asks, as its part's model has it. */
type Asks = Exclude<StepPartModel['asks'], 'none'>;

/** What the step asks, in one line: its gate's, its need's, or what it waits for. */
function lineOf(run: RunDetail, step: StepView, asks: Asks): string {
  const gate = gateOfStep(run, step);
  if (gate) return gateNodeLine(gate);
  const need = needOf(step, run.waitingOnYou.includes(step.name), run.cancelledAt !== null);
  if (need) return needNodeText(need);
  return asks.denied?.words ?? asks.waitingFor?.words ?? asks.needs ?? '';
}

/** What it asks where no form answers it here: what it needs, the calls denied, and what it waits for with the advice beside it. */
function Words({ asks }: { asks: Asks }) {
  return (
    <>
      {asks.needs && (
        <div data-asks-needs className="break-words">
          <Markdown className="max-h-72 overflow-y-auto pr-1">{asks.needs}</Markdown>
        </div>
      )}
      {asks.denied && (
        <p data-asks-denied className="break-words">
          {asks.denied.words}
        </p>
      )}
      {asks.waitingFor && (
        <p data-asks-waiting className="break-words">
          {asks.waitingFor.words}
          <span className="block text-body-small text-on-surface-variant">{asks.waitingFor.advice}</span>
        </p>
      )}
    </>
  );
}

/** The form that answers the step, or its note, or its words, as `broughtPart` picks off the run as it is read now. */
function Answered({ run, step, asks }: { run: RunDetail; step: StepView; asks: Asks }) {
  const part = broughtPart(broughtFacts(run, step.name));
  if (part === 'gate')
    return (
      <>
        {endsTheRun(step) && step.taskId === null && <ActsOn run={run} step={step} />}
        <GateBrief run={run} step={step} />
      </>
    );
  if (part === 'continue') return <Continue runId={run.id} step={step.name} line={step.commands.retry} />;
  const offer = offersOf(run).find((o): o is Answer => o.step === step.name && o.case !== 'continue');
  if (part === 'answer' && offer)
    return (
      <ul className="space-y-3">
        <AnswerRow runId={run.id} offer={offer} line={step.commands[offer.kind]} />
      </ul>
    );
  const asked = askedOf(run, step.name);
  if (part === 'asked' && asked)
    return (
      <ul>
        <AskedRow step={step.name} said={asked.note ?? `try ${asked.try} asked`} />
      </ul>
    );
  return <Words asks={asks} />;
}

/** What the step `step` of `run` asks of a person (`asks`), at `size`: one line on the graph's node, else the form that answers it. */
export function PartAsks({ run, step, asks, size }: { run: RunDetail; step: StepView; asks: Asks; size: PartSize }) {
  if (size === 'S') {
    const line = lineOf(run, step, asks);
    return (
      <p data-part-asks="S" title={line} className={cn('truncate text-body-small', ink.yours)}>
        {line}
      </p>
    );
  }
  return (
    <section data-part-asks={size} aria-label={`What ${step.name} asks of you`} className="min-w-0 space-y-3 text-body-medium">
      <Answered run={run} step={step} asks={asks} />
    </section>
  );
}

/**
 * A step of a run her message links to (`/runs/<run>?step=<step>`), drawn under her words as the run's page's own part for it: its gate
 * (`GateBrief`), the Decide section's row for its answer (`AnswerRow`), the banner's Continue for a session the harness blocked, the note
 * of a try asked already (`AskedRow`), or its state alone — the one `broughtPart` names off the run as it is read now. The answer goes to
 * the step through the run's page's own routes, and a step answered anywhere else reads as answered the next time the feed moves the run.
 * Her words above it are hers; nothing here is a copy of what the step asks.
 */
import type { ReactNode } from 'react';
import { readGone } from '@/lib/api/gone';
import { offersOf, askedOf, type Answer } from '@/lib/asks';
import { broughtFacts, broughtPart, type BroughtPart } from '@/lib/brought';
import { titleOf } from '@/lib/factory';
import { useRunRead, type RunView, type StepView } from '@/lib/runView';
import { AnswerRow, Continue } from '@/components/gate/Decide';
import { Approved, endsTheRun } from '@/components/gate/Gate';
import { GateBrief } from '@/components/gate/GateBrief';
import { AskedRow } from '@/components/gate/Questions';
import { RunGone } from '@/components/run/RunGone';
import { StatusChip, StepNote } from '@/components/step/StatusChip';
import { Unread } from '@/components/step/StepBar';

/** The step `step` of the run `run`, read live, drawn as the run's page answers it. */
export function ChatBrought({ run: id, step: name }: { run: string; step: string }) {
  const { view: run, error } = useRunRead(id);
  if (run && readGone(error)) return <RunGone run={run} />;
  if (!run) {
    return (
      <Frame part="reading" run={id} step={name}>
        <Unread id={id} error={error} />
      </Frame>
    );
  }
  const part = broughtPart(broughtFacts(run, name));
  const step = run.steps.find((s) => s.name === name);
  return (
    <Frame part={part} run={id} step={name}>
      {step ? (
        <Part part={part} run={run} step={step} />
      ) : (
        <p data-no-step className="text-body-medium text-yours">
          {titleOf(run)} has no step named {name}.
        </p>
      )}
    </Frame>
  );
}

/** The frame every brought step sits in, at the width of her asks, saying which part it holds and of which step. */
function Frame({ part, run, step, children }: { part: BroughtPart | 'reading'; run: string; step: string; children: ReactNode }) {
  return (
    <div data-chat-brought={part} data-run={run} data-step={step} className="flex max-w-[94%] min-w-0 flex-col gap-2">
      {children}
    </div>
  );
}

/** The run's page's part `part` for `step` of `run`. */
function Part({ part, run, step }: { part: BroughtPart; run: RunView; step: StepView }) {
  if (part === 'gate') return <GateBrief run={run} step={step} />;
  if (part === 'continue') return <Continue runId={run.id} step={step.name} line={step.commands.retry} />;
  if (part === 'answer') {
    const offer = offersOf(run).find((o): o is Answer => o.step === step.name && o.case !== 'continue');
    if (offer) {
      return (
        <ul className="space-y-3">
          <AnswerRow runId={run.id} offer={offer} line={step.commands[offer.kind]} />
        </ul>
      );
    }
  }
  if (part === 'asked') {
    const asked = askedOf(run, step.name);
    if (asked) {
      return (
        <ul>
          <AskedRow step={step.name} said={asked.note ?? `try ${asked.try} asked`} />
        </ul>
      );
    }
  }
  return <Settled run={run} step={step} />;
}

/** A step that waits on nobody: its state and note as the inspector says them, and its approval where it was approved. */
function Settled({ run, step }: { run: RunView; step: StepView }) {
  return (
    <div className="space-y-2 rounded border border-outline-variant bg-card p-3 text-body-medium">
      <p className="break-words">
        <strong>{step.name}</strong> of {titleOf(run)} waits on nobody now.
      </p>
      <div className="space-y-1">
        <StatusChip codes={step} runCancelled={run.cancelledAt !== null} runHeld={run.holding != null} />
        <StepNote note={step.note} />
      </div>
      {step.gate?.approval && <Approved step={step.name} approval={step.gate.approval} ends={endsTheRun(step)} />}
    </div>
  );
}

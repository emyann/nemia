/**
 * The frame's side sheet for one step of a run: the step's card, its part whole on the bar's own cut frame in the step's hue
 * (`StepInspector`), and its conversation shown in its place only once a person opens it from the bar's ⋯ menu, read from the run's
 * record, which a read again keeps current.
 */
import { useState } from 'react';
import { readGone } from '@/lib/api/gone';
import { useRunRead, type RunDetail } from '@/lib/runView';
import { titleOf } from '@/lib/factory';
import { hueOfStep } from '@/lib/stepPart';
import { BarPanel } from '../frame/BarPanel';
import { RunGone } from '../run/RunGone';
import { StepInspector } from './StepInspector';
import { Reading, ReadingLines } from '@/components/look';
import { Skeleton } from '@/components/ui/ds';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

/**
 * The bar for the step `step` of the run `run`, titled by the step and described by its run's title. While the run is read it says so; a
 * run gone from the store, a read that failed and a step the run no longer has are each said in the bar, which stays open until a person
 * closes it: a read never writes the address.
 */
export function StepBar({ run: id, step: name }: { run: string; step: string }) {
  const { view: run, error } = useRunRead(id);
  return <StepPanel id={id} name={name} run={run} error={error} />;
}

/**
 * The bar of the step `name` of the run `id`, as `run` was last read and `error` its read's failure, if any: the whole bar is a cut frame
 * in the step's hue, and its ⋯ menu holds Open and, where the step is drawn, Open conversation, which shows the step's conversation in
 * place of its card until Back. The conversation shown is that of one step: the bar moved to another step shows that step's card, and its
 * conversation, unmounted, is followed no more.
 * @param props.id The run's id.
 * @param props.name The step's name.
 * @param props.run The run, as it was last read; undefined while it is read.
 * @param props.error Its read's failure, if any.
 */
export function StepPanel({ id, name, run, error }: { id: string; name: string; run: RunDetail | undefined; error: unknown }) {
  const shown = `${id}/${name}`;
  const [talking, setTalking] = useState<string | null>(null);
  const talk = talking === shown;
  const step = run?.steps.find((s) => s.name === name);
  const more = step && !talk ? [{ id: 'conversation', label: 'Open conversation', onAction: () => setTalking(shown) }] : [];
  return (
    <BarPanel title={name} description={run ? titleOf(run) : id} hue={run && step ? hueOfStep(run, name) : 'none'} more={more}>
      <StepBody id={id} name={name} run={run} error={error} talk={talk} onBack={() => setTalking(null)} />
    </BarPanel>
  );
}

/**
 * What the step bar holds for the step `name` of the run `id`, as `run` was last read and `error` its read's failure, if any: its card,
 * or its conversation while `talk`, with `onBack` to the card.
 */
function StepBody({
  id,
  name,
  run,
  error,
  talk,
  onBack,
}: {
  id: string;
  name: string;
  run: RunDetail | undefined;
  error: unknown;
  talk: boolean;
  onBack: () => void;
}) {
  if (run && readGone(error)) return <RunGone run={run} />;
  if (!run) return <Unread id={id} error={error} />;
  const step = run.steps.find((s) => s.name === name);
  if (!step) {
    return (
      <p data-no-step className="text-body-medium text-yours">
        {titleOf(run)} has no step named {name}.
      </p>
    );
  }
  return <StepInspector run={run} step={step} talk={talk} onBack={onBack} />;
}

/** A bar's body for the run `id` not read yet: that it is read, or, with `error`, why the read failed. */
export function Unread({ id, error }: { id: string; error: unknown }) {
  return error ? (
    <ReadTrouble what={`the run ${id}`} error={error} />
  ) : (
    <Reading label="Reading the run…" className="flex flex-col gap-4">
      <Skeleton className="w-1/2 text-title-medium" />
      <ReadingLines widths={['w-full', 'w-5/6', 'w-2/3']} className="text-body-medium" />
      <Skeleton shape="rectangle" className="h-40 rounded-none" />
    </Reading>
  );
}

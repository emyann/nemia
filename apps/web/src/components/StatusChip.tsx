import { CircleDashed } from 'lucide-react';
import { stateClass, stateMeaning, stepState } from '../lib/status';

/**
 * A step's status in the CLI `ls`'s words, coloured by what it means, and what that is on hover.
 *
 * `unverified` carries a dashed circle before its words: its colour is neutral, like a step still to do,
 * and the mark says it is not one — it signed off, and nothing but its own word says it worked.
 * `data-state` is the state the colour was chosen for, so a check can read it without reading a colour.
 *
 * `runHeld` is whether a person holds the run (the CLI's `hold`): a gate or a step not filed is drawn `held`, in its own words.
 *
 * `note` is what the CLI's `ls` prints beside the status — `try 2, by retries: 1`, `round 2 of 3` — on its own line after
 * the meaning, on hover: for where there is no room under the chip, on a canvas or in a list. Where there is, `StepNote`.
 *
 * No wider than where it is put: a root's `waiting on <run> (cancelled)` names a run by its id, and on a card it is cut short, whole in
 * the card's own line of what the run waits on.
 */
export function StatusChip({
  status,
  runCancelled,
  runHeld,
  note = null,
}: {
  status: string;
  runCancelled: boolean;
  runHeld: boolean;
  note?: string | null;
}) {
  const state = stepState(status, runCancelled, runHeld);
  return (
    <span
      title={note ? `${stateMeaning[state]}\n${note}` : stateMeaning[state]}
      data-state={state}
      className={`inline-flex max-w-full min-w-0 items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-body-small leading-none ${stateClass[state]}`}
    >
      {state === 'unverified' && <CircleDashed aria-hidden strokeWidth={2.5} className="size-2.5 shrink-0" />}
      <span className="truncate">{status}</span>
    </span>
  );
}

/** What the CLI's `ls` prints beside a step's status, under its chip: the try or round it is on, or the one due; nothing for none. */
export function StepNote({ note }: { note: string | null }) {
  if (!note) return null;
  return (
    <p data-note className="font-mono text-body-small leading-snug text-muted-foreground">
      {note}
    </p>
  );
}

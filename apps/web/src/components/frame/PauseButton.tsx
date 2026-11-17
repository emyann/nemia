import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleStop, Pause, Play } from 'lucide-react';
import { Button, Popover, PopoverTrigger, TextField, Title } from '@/components/ui/ds';
import { pauseNowQuery, pauseQuery, putPause, resumePause } from '@/lib/api/pause';
import { interruptSentence, PAUSE_PARKS, type PauseState, type PauseWords, pauseWords } from '@/lib/pause';
import { cn } from '@/lib/utils';
import { useNow } from '@/lib/useNow';
import type { Actor as ActorRead } from 'objects';
import { Actor } from '../actor/Actor';
import { Reading, ReadingLines } from '@/components/look';

/** The popover's heading: the pause's state. */
const HEADINGS: Record<PauseState, string> = {
  running: 'Running',
  pausing: 'Pausing',
  paused: 'Paused',
  reading: 'Reading',
};

/** What the popover asks before it acts: nothing, why before a pause, or what Stop now stops before it does. */
type Asking = 'pause' | 'now' | null;

/** The why of a pause, asked before it is put: optional, sent as given. */
function WhyField({ why, setWhy }: { why: string; setWhy: (why: string) => void }) {
  return (
    <TextField data-pause-why label="Why (optional)" placeholder="merging by hand on main" value={why} onChange={setWhy} maxLength={200} />
  );
}

/** Cancel, which puts nothing (`onClose`), and the form's submit, `label`; both off while the api is asked. */
function FormActions({ label, onClose, isPending }: { label: string; onClose: () => void; isPending: boolean }) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outlined" size="xsmall" onPress={onClose} isDisabled={isPending}>
        Cancel
      </Button>
      <Button type="submit" size="xsmall" isDisabled={isPending}>
        {label}
      </Button>
    </div>
  );
}

/**
 * Why all factories are paused, asked in the popover before the pause is put: optional, and sent as given (`onPut`); `onClose` puts
 * nothing.
 */
function WhyForm({ onPut, onClose, isPending }: { onPut: (why: string) => void; onClose: () => void; isPending: boolean }) {
  const [why, setWhy] = useState('');
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onPut(why.trim());
      }}
    >
      <p className="text-body-small text-muted-foreground">Until they resume, in every factory: {PAUSE_PARKS}.</p>
      <WhyField why={why} setWhy={setWhy} />
      <FormActions label="Pause" onClose={onClose} isPending={isPending} />
    </form>
  );
}

/** A list of `lines` in the popover, one each, under `data`'s attribute; none when there are none. */
function Lines({ lines, data, className }: { lines: readonly string[]; data: string; className?: string }) {
  if (lines.length === 0) return null;
  return (
    <ul {...{ [data]: '' }} className={cn('flex flex-col gap-0.5 font-mono text-body-small', className)}>
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

/**
 * What Stop now stops (a pause at once), read afresh as it opens (`GET /api/pause/now`) and confirmed before it is sent: each run's step
 * whose session or check it stops, or that it stops nothing, and what an interrupted step costs, in the api's words. It asks why only
 * where no pause stands (`standing`): one that stands is kept as it was. `onPut` sends the why; `onClose` puts nothing.
 */
export function NowForm({
  standing,
  onPut,
  onClose,
  isPending,
}: {
  standing: boolean;
  onPut: (why: string) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [why, setWhy] = useState('');
  const read = useQuery(pauseNowQuery);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onPut(standing ? '' : why.trim());
      }}
    >
      {read.error && !read.data ? (
        <p data-pause-now-reading className="text-body-small text-muted-foreground">
          What runs could not be read: {read.error.message}
        </p>
      ) : !read.data ? (
        <div data-pause-now-reading>
          <Reading label="Reading what runs.">
            <ReadingLines widths={['w-full', 'w-1/2']} className="text-body-small" />
          </Reading>
        </div>
      ) : (
        <>
          <p className="text-body-small text-muted-foreground">
            {read.data.interrupts.length === 0
              ? 'Nothing outside a landing is at work: stopping now stops nothing.'
              : `A landing finishes; stopping now cuts ${read.data.interrupts.length} at work, each going on at Resume:`}
          </p>
          <Lines lines={read.data.interrupts.map(interruptSentence)} data="data-pause-interrupt" />
          <p data-pause-cost className="text-body-small">
            {read.data.cost}
          </p>
        </>
      )}
      {!standing && <WhyField why={why} setWhy={setWhy} />}
      <FormActions label="Stop now" onClose={onClose} isPending={isPending || !read.data} />
    </form>
  );
}

/**
 * The pause in the popover: its whole sentence, each task still finishing, each session parked and each landing held, then what may be
 * done — Pause… while all factories run (`onAsk('pause')`), Stop now… while they run or are Pausing (`onAsk('now')`), Resume while a
 * pause stands (`onResume`). Under its sentence, who put the pause (`Actor`), where its file says.
 */
function PauseFacts({
  words,
  unread,
  actor,
  onAsk,
  onResume,
  isPending,
}: {
  words: PauseWords;
  /** Whether the pause is still out on its first read, its sentence then drawn as the kit's skeletons under a status that says it. */
  unread: boolean;
  /** Who put the pause, where its file says. */
  actor: ActorRead | undefined;
  onAsk: (asking: Asking) => void;
  onResume: () => void;
  isPending: boolean;
}) {
  return (
    <>
      {unread ? (
        <Reading label={words.line}>
          <ReadingLines widths={['w-full', 'w-2/3']} className="text-body-small" />
        </Reading>
      ) : (
        <p data-pause-line className="text-body-small text-muted-foreground">
          {words.line}
        </p>
      )}
      {words.state !== 'running' && <Actor actor={actor} />}
      <Lines lines={words.finishing} data="data-pause-finishing" />
      <Lines lines={words.parked} data="data-pause-parked" />
      <Lines lines={words.staged} data="data-pause-staged" className="text-yours" />
      <Lines lines={words.held} data="data-pause-held" />
      <ul data-pause-actions className="flex flex-col gap-1">
        {words.state === 'running' && (
          <li>
            <Button variant="outlined" size="xsmall" icon={Pause} className="w-full justify-start" onPress={() => onAsk('pause')}>
              Pause…
            </Button>
          </li>
        )}
        {(words.state === 'running' || words.state === 'pausing') && (
          <li>
            <Button variant="outlined" size="xsmall" icon={CircleStop} className="w-full justify-start" onPress={() => onAsk('now')}>
              Stop now…
            </Button>
          </li>
        )}
        {(words.state === 'pausing' || words.state === 'paused') && (
          <li>
            <Button variant="outlined" size="xsmall" icon={Play} className="w-full justify-start" onPress={onResume} isDisabled={isPending}>
              Resume
            </Button>
          </li>
        )}
      </ul>
    </>
  );
}

/**
 * What opens the pause's popover: the kit's text button, a play icon once all factories are paused and a pause icon else, and the
 * pause's word beside it where it has one, its whole sentence on hover.
 * @param words The pause in words (`pauseWords`).
 * @param finishing How many tasks still finish under the pause, which the button carries for the e2e.
 */
function PauseTrigger({ words, finishing }: { words: PauseWords; finishing: number }) {
  return (
    <Button
      variant="text"
      size="xsmall"
      icon={words.state === 'paused' ? Play : Pause}
      aria-label={words.label}
      data-pause={words.state}
      data-finishing={finishing}
      className="min-w-0 text-on-surface-variant"
    >
      {words.text && (
        <span title={words.line} className="truncate">
          {words.text}
        </span>
      )}
    </Button>
  );
}

/**
 * The pause of all factories, in the frame's top bar: one button, a pause icon while they run, `Pausing · N` while each working session
 * stops at its current tool call's end, and a play icon with `Paused` once nothing does (`pauseWords`, read again on each poll of
 * `GET /api/pause`).
 * It opens a popover with the whole of it — since when, by whom and why, each task still finishing, each session parked at a tool call's
 * end, named by the call it stopped after, each landing held with its merge
 * staged, so a person who paused to use main knows why `MERGE_HEAD` is there, and each other check held — and a list of what may be
 * done: Pause…, which asks an optional why (`WhyForm`) and puts the pause (`POST /api/pause`); Stop now…, which says what it stops and
 * what that costs (`NowForm`) and pauses at once, each session cut at once (`POST /api/pause` with `now`); or Resume
 * (`DELETE /api/pause`); the popover closes once the api answered. A refusal — a pause put or resumed elsewhere meanwhile — is said in
 * the package's words, the popover open.
 */
export function PauseButton() {
  const queryClient = useQueryClient();
  const read = useQuery(pauseQuery);
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<Asking>(null);
  const act = useMutation({
    mutationFn: (put: { why: string; now: boolean } | null) => (put ? putPause(put.why || undefined, put.now) : resumePause()),
    onSuccess: () => {
      setOpen(false);
      setAsking(null);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['pause'], exact: true }),
  });
  const now = new Date(useNow(30_000));
  const words = pauseWords(read.data, read.error, now);
  const refused = act.error ?? read.error;
  return (
    <PopoverTrigger
      isOpen={open}
      onOpenChange={(opening) => {
        setOpen(opening);
        if (opening) return;
        setAsking(null);
        act.reset();
      }}
    >
      <PauseTrigger words={words} finishing={read.data?.finishing.length ?? 0} />
      <Popover
        aria-label="The pause of all factories"
        data-pause-popover
        placement="bottom end"
        offset={6}
        className="flex w-72 flex-col gap-2"
      >
        <Title size="small" component="h2">
          {asking === 'pause' ? 'Pause all factories' : asking === 'now' ? 'Stop all factories now' : HEADINGS[words.state]}
        </Title>
        {asking === 'pause' && (
          <WhyForm onPut={(why) => act.mutate({ why, now: false })} onClose={() => setAsking(null)} isPending={act.isPending} />
        )}
        {asking === 'now' && (
          <NowForm
            standing={words.state !== 'running'}
            onPut={(why) => act.mutate({ why, now: true })}
            onClose={() => setAsking(null)}
            isPending={act.isPending}
          />
        )}
        {asking === null && (
          <PauseFacts
            words={words}
            unread={words.state === 'reading' && !read.error}
            actor={read.data?.pause?.actor}
            onAsk={setAsking}
            onResume={() => act.mutate(null)}
            isPending={act.isPending}
          />
        )}
        {refused && (
          <p role="alert" data-pause-refused className="font-mono text-body-small break-words whitespace-pre-wrap text-destructive">
            {refused.message}
          </p>
        )}
      </Popover>
    </PopoverTrigger>
  );
}

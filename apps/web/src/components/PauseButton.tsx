import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleStop, Pause, Play } from 'lucide-react';
import { Dialog, DialogTrigger, Form, Heading, Popover, TextField } from 'react-aria-components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { POPOVER } from './CardGate';
import { pauseNowQuery, pauseQuery, putPause, resumePause } from '@/lib/api';
import { interruptSentence, type PauseState, type PauseWords, pauseWords } from '@/lib/pause';
import { cn } from '@/lib/utils';
import { useNow } from '@/lib/useNow';

/** The popover's heading: the pause's state. */
const HEADINGS: Record<PauseState, string> = {
  running: 'Running',
  pausing: 'Pausing',
  paused: 'Paused',
  reading: 'Reading',
};

/** What the popover asks before it acts: nothing, why before a pause, or what a pause at once stops before it does. */
type Asking = 'pause' | 'now' | null;

/** The why of a pause, asked before it is put: optional, sent as given. */
function WhyField({ why, setWhy }: { why: string; setWhy: (why: string) => void }) {
  return (
    <TextField value={why} onChange={setWhy} maxLength={200} className="flex flex-col gap-1">
      <Label className="text-xs">Why (optional)</Label>
      <Input data-pause-why placeholder="merging by hand on main" />
    </TextField>
  );
}

/** Cancel, which puts nothing (`onClose`), and the form's submit, `label`; both off while the api is asked. */
function FormActions({ label, onClose, isPending }: { label: string; onClose: () => void; isPending: boolean }) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" size="sm" onPress={onClose} isDisabled={isPending}>
        Cancel
      </Button>
      <Button type="submit" size="sm" isDisabled={isPending}>
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
    <Form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onPut(why.trim());
      }}
    >
      <p className="text-xs text-muted-foreground">Nothing new starts in any factory until they resume; what runs finishes.</p>
      <WhyField why={why} setWhy={setWhy} />
      <FormActions label="Pause" onClose={onClose} isPending={isPending} />
    </Form>
  );
}

/** A list of `lines` in the popover, one each, under `data`'s attribute; none when there are none. */
function Lines({ lines, data, className }: { lines: readonly string[]; data: string; className?: string }) {
  if (lines.length === 0) return null;
  return (
    <ul {...{ [data]: '' }} className={cn('flex flex-col gap-0.5 font-mono text-xs', className)}>
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

/**
 * What a pause at once stops, read afresh as it opens (`GET /api/pause/now`) and confirmed before it is sent: each run's step whose session
 * or check it stops, or that it stops nothing, and what an interrupted step costs, in the api's words. It asks why only where no pause
 * stands (`standing`): one that stands is kept as it was. `onPut` sends the why; `onClose` puts nothing.
 */
function NowForm({
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
    <Form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onPut(standing ? '' : why.trim());
      }}
    >
      {!read.data ? (
        <p data-pause-now-reading className="text-xs text-muted-foreground">
          {read.error ? `What runs could not be read: ${read.error.message}` : 'Reading what runs.'}
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {read.data.interrupts.length === 0
              ? 'Nothing outside a landing is at work: pausing now stops nothing.'
              : `A landing finishes; this stops ${read.data.interrupts.length} at work, each tried again on Resume:`}
          </p>
          <Lines lines={read.data.interrupts.map(interruptSentence)} data="data-pause-interrupt" />
          <p data-pause-cost className="text-xs">
            {read.data.cost}
          </p>
        </>
      )}
      {!standing && <WhyField why={why} setWhy={setWhy} />}
      <FormActions label="Pause now" onClose={onClose} isPending={isPending || !read.data} />
    </Form>
  );
}

/**
 * The pause in the popover: its whole sentence, each task still finishing and each landing held, then what may be done — Pause… while
 * all factories run (`onAsk('pause')`), Pause now… while they run or are Pausing (`onAsk('now')`), Resume while a pause stands
 * (`onResume`).
 */
function PauseFacts({
  words,
  onAsk,
  onResume,
  isPending,
}: {
  words: PauseWords;
  onAsk: (asking: Asking) => void;
  onResume: () => void;
  isPending: boolean;
}) {
  return (
    <>
      <p data-pause-line className="text-xs text-muted-foreground">
        {words.line}
      </p>
      <Lines lines={words.finishing} data="data-pause-finishing" />
      <Lines lines={words.staged} data="data-pause-staged" className="text-yours" />
      <Lines lines={words.held} data="data-pause-held" />
      <ul data-pause-actions className="flex flex-col gap-1">
        {words.state === 'running' && (
          <li>
            <Button variant="outline" size="sm" className="w-full justify-start" onPress={() => onAsk('pause')}>
              <Pause data-icon="inline-start" />
              Pause…
            </Button>
          </li>
        )}
        {(words.state === 'running' || words.state === 'pausing') && (
          <li>
            <Button variant="outline" size="sm" className="w-full justify-start" onPress={() => onAsk('now')}>
              <CircleStop data-icon="inline-start" />
              Pause now…
            </Button>
          </li>
        )}
        {(words.state === 'pausing' || words.state === 'paused') && (
          <li>
            <Button variant="outline" size="sm" className="w-full justify-start" onPress={onResume} isDisabled={isPending}>
              <Play data-icon="inline-start" />
              Resume
            </Button>
          </li>
        )}
      </ul>
    </>
  );
}

/**
 * The pause of all factories, in the frame's bottom bar right after the daemon's dot: one button, a pause icon while they run,
 * `Pausing · N` while what runs finishes, and a play icon with `Paused` once nothing does (`pauseWords`, read again on each poll of
 * `GET /api/pause`).
 * It opens a popover with the whole of it — since when, by whom and why, each task still finishing, each landing held with its merge
 * staged, so a person who paused to use main knows why `MERGE_HEAD` is there, and each other check held — and a list of what may be
 * done: Pause…, which asks an optional why (`WhyForm`) and puts the pause (`POST /api/pause`); Pause now…, which says what it stops and
 * what that costs (`NowForm`) and pauses at once (`POST /api/pause` with `now`); or Resume (`DELETE /api/pause`); the popover closes
 * once the api answered. A refusal — a pause put or resumed elsewhere meanwhile — is said in the package's words, the popover open.
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
    <DialogTrigger
      isOpen={open}
      onOpenChange={(opening) => {
        setOpen(opening);
        if (opening) return;
        setAsking(null);
        act.reset();
      }}
    >
      <Button
        variant="ghost"
        size="xs"
        aria-label={words.label}
        data-pause={words.state}
        data-finishing={read.data?.finishing.length ?? 0}
        className="min-w-0 font-normal text-muted-foreground"
      >
        {words.state === 'paused' ? <Play data-icon="inline-start" /> : <Pause data-icon="inline-start" />}
        {words.text && (
          <span title={words.line} className="truncate">
            {words.text}
          </span>
        )}
      </Button>
      <Popover placement="top start" offset={6} className={POPOVER}>
        <Dialog aria-label="The pause of all factories" data-pause-popover className="flex flex-col gap-2 outline-none">
          <Heading slot="title" className="font-medium">
            {asking === 'pause' ? 'Pause all factories' : asking === 'now' ? 'Pause all factories now' : HEADINGS[words.state]}
          </Heading>
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
          {asking === null && <PauseFacts words={words} onAsk={setAsking} onResume={() => act.mutate(null)} isPending={act.isPending} />}
          {refused && (
            <p role="alert" data-pause-refused className="font-mono text-xs break-words whitespace-pre-wrap text-destructive">
              {refused.message}
            </p>
          )}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

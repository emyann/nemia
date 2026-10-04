import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pause, Play } from 'lucide-react';
import { Dialog, DialogTrigger, Form, Heading, Popover, TextField } from 'react-aria-components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { POPOVER } from './CardGate';
import { pauseQuery, putPause, resumePause } from '@/lib/api';
import { type PauseState, type PauseWords, pauseWords } from '@/lib/pause';
import { cn } from '@/lib/utils';
import { useNow } from '@/lib/useNow';

/** The popover's heading, by the pause's state. */
const HEADINGS: Record<PauseState, string> = {
  running: 'The store runs',
  pausing: 'Pausing',
  paused: 'Paused',
  reading: 'The store’s pause',
};

/** Why the store is paused, asked in the popover before the pause is put: optional, and sent as given (`onPut`); `onClose` puts nothing. */
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
      <p className="text-xs text-muted-foreground">Nothing new starts, in any run, until it is resumed; what runs finishes.</p>
      <TextField value={why} onChange={setWhy} maxLength={200} className="flex flex-col gap-1">
        <Label className="text-xs">Why (optional)</Label>
        <Input data-pause-why placeholder="merging by hand on main" />
      </TextField>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onPress={onClose} isDisabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" isDisabled={isPending}>
          Pause
        </Button>
      </div>
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
 * The pause in the popover: its whole sentence, each task still finishing and each landing held, then what may be done — Pause… while
 * the store runs (`onPause`), Resume while a pause stands (`onResume`).
 */
function PauseFacts({
  words,
  onPause,
  onResume,
  isPending,
}: {
  words: PauseWords;
  onPause: () => void;
  onResume: () => void;
  isPending: boolean;
}) {
  return (
    <>
      <p data-pause-line className="text-xs text-muted-foreground">
        {words.line}
      </p>
      <Lines lines={words.finishing} data="data-pause-finishing" />
      <Lines lines={words.staged} data="data-pause-staged" className="text-amber-700 dark:text-amber-400" />
      <ul data-pause-actions className="flex flex-col gap-1">
        {words.state === 'running' && (
          <li>
            <Button variant="outline" size="sm" className="w-full justify-start" onPress={onPause}>
              <Pause data-icon="inline-start" />
              Pause…
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
 * The store's pause, in the frame's bottom bar right after the daemon's dot: one button, a pause icon while the store runs, `Pausing · N`
 * while what runs finishes, and a play icon with `Paused` once nothing does (`pauseWords`, read again on each poll of `GET /api/pause`).
 * It opens a popover with the whole of it — since when, by whom and why, each task still finishing, each landing held with its merge
 * staged, so a person who paused to use main knows why `MERGE_HEAD` is there — and a list of what may be done: Pause…, which asks an
 * optional why (`WhyForm`) and puts the pause (`POST /api/pause`), or Resume (`DELETE /api/pause`); the popover closes once the api
 * answered. A refusal — a pause put or resumed elsewhere meanwhile — is said in the package's words, the popover open.
 */
export function PauseButton() {
  const queryClient = useQueryClient();
  const read = useQuery(pauseQuery);
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const act = useMutation({
    mutationFn: (put: { why: string } | null) => (put ? putPause(put.why || undefined) : resumePause()),
    onSuccess: () => {
      setOpen(false);
      setAsking(false);
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
        setAsking(false);
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
        <Dialog aria-label="The store’s pause" data-pause-popover className="flex flex-col gap-2 outline-none">
          <Heading slot="title" className="font-medium">
            {asking ? 'Pause the store' : HEADINGS[words.state]}
          </Heading>
          {asking ? (
            <WhyForm onPut={(why) => act.mutate({ why })} onClose={() => setAsking(false)} isPending={act.isPending} />
          ) : (
            <PauseFacts words={words} onPause={() => setAsking(true)} onResume={() => act.mutate(null)} isPending={act.isPending} />
          )}
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

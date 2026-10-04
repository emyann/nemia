import { useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, Form, Heading, Popover, TextField } from 'react-aria-components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { POPOVER } from './CardGate';
import { pauseQuery, resumePause, putPause, type Pause, type PauseStaged } from '@/lib/api';
import { clockWord } from '@/lib/quota';
import { useNow } from '@/lib/useNow';

/** Since when and by whom, as the header says it: `since 16:40 by ann`, and what the file no longer says, said so. */
export function pauseSince(pause: Pause, now: Date): string {
  const at = Number.isNaN(Date.parse(pause.at)) ? 'a time its file no longer says' : clockWord(new Date(pause.at), now);
  return `since ${at} by ${pause.by || 'someone its file no longer names'}`;
}

/** A landing the pause holds with its merge staged, in a sentence: whose, where, and that its check waits on the lift. */
export const stagedSentence = ({ run, step, repo }: PauseStaged): string =>
  `${run}'s ${step} has its merge staged in ${repo} (MERGE_HEAD), and its check waits on the lift`;

/**
 * Why the store is paused, asked in a popover under the switch before the pause is put: optional, and sent as given (`onPut`); `onClose`
 * puts nothing.
 */
function WhyForm({ onPut, onClose }: { onPut: (why: string) => void; onClose: () => void }) {
  const [why, setWhy] = useState('');
  return (
    <Form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onPut(why.trim());
      }}
    >
      <Heading slot="title" className="font-medium">
        Pause the store
      </Heading>
      <p className="text-xs text-muted-foreground">Nothing new starts, in any run, until it is lifted; what runs finishes.</p>
      <TextField value={why} onChange={setWhy} maxLength={200} className="flex flex-col gap-1">
        <Label className="text-xs">Why (optional)</Label>
        <Input data-pause-why placeholder="merging by hand on main" />
      </TextField>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onPress={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm">
          Pause
        </Button>
      </div>
    </Form>
  );
}

/**
 * The store's pause, in the frame's header: a switch labelled Pause, with what it does beside it — nothing new starts. On, it asks why
 * in a popover (`WhyForm`) and puts the pause through the api with it (`POST /api/pause`); off, it lifts it (`DELETE /api/pause`); and
 * the pause is read again either way. While one stands it says since when, by whom and why (the whole of it on hover), and names each
 * run whose ending has its merge staged in a repository's checkout while the pause holds its check, so a person who paused to use main
 * knows why `MERGE_HEAD` is there. A refusal — a pause put or lifted elsewhere meanwhile — is said in the package's words.
 */
export function PauseButton() {
  const id = useId();
  const queryClient = useQueryClient();
  const read = useQuery(pauseQuery);
  const anchor = useRef<HTMLDivElement>(null);
  const [asking, setAsking] = useState(false);
  const toggle = useMutation({
    mutationFn: (put: { why: string } | null) => (put ? putPause(put.why || undefined) : resumePause()),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['pause'], exact: true }),
  });
  const now = new Date(useNow(30_000));
  const pause = read.data?.pause ?? null;
  const staged = read.data?.staged ?? [];
  const since = pause ? pauseSince(pause, now) : null;
  const refused = toggle.error ?? read.error;
  const said = since && [`paused ${since}`, pause?.why, ...staged.map(stagedSentence)].filter(Boolean).join('\n');
  return (
    <div ref={anchor} data-pause={pause ? 'on' : 'off'} className="flex min-w-0 items-center gap-2 text-sm" title={said || undefined}>
      <Switch
        id={id}
        size="sm"
        isSelected={asking || (toggle.isPending ? toggle.variables !== null : pause !== null)}
        onChange={(on) => (on ? setAsking(true) : toggle.mutate(null))}
        isDisabled={!read.data || toggle.isPending}
      />
      <Popover triggerRef={anchor} isOpen={asking} onOpenChange={setAsking} placement="bottom end" offset={6} className={POPOVER}>
        <Dialog aria-label="Pause the store" data-pause-ask className="outline-none">
          <WhyForm
            onPut={(why) => {
              setAsking(false);
              toggle.mutate({ why });
            }}
            onClose={() => setAsking(false)}
          />
        </Dialog>
      </Popover>
      <label htmlFor={id} className="cursor-pointer font-medium">
        Pause
      </label>{' '}
      <span className="hidden truncate text-muted-foreground lg:inline">
        nothing new starts{since && ` · ${since}`}
        {pause?.why && `: ${pause.why}`}
      </span>
      {staged.map((s) => (
        <span
          key={`${s.run}/${s.step}`}
          data-pause-staged={s.run}
          title={stagedSentence(s)}
          className="shrink-0 font-mono text-xs text-amber-700 dark:text-amber-400"
        >
          {`${s.run} staged`}
        </span>
      ))}
      {refused && (
        <span role="alert" data-pause-refused className="max-w-64 truncate text-xs text-destructive" title={refused.message}>
          {refused.message}
        </span>
      )}
    </div>
  );
}

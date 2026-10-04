import { useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, Form, Heading, Popover, TextField } from 'react-aria-components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { POPOVER } from './CardGate';
import { cordonQuery, liftCordon, putCordon, type Cordon, type CordonStaged } from '@/lib/api';
import { clockWord } from '@/lib/quota';
import { useNow } from '@/lib/useNow';

/** Since when and by whom, as the header says it: `since 16:40 by ann`, and what the file no longer says, said so. */
export function cordonSince(cordon: Cordon, now: Date): string {
  const at = Number.isNaN(Date.parse(cordon.at)) ? 'a time its file no longer says' : clockWord(new Date(cordon.at), now);
  return `since ${at} by ${cordon.by || 'someone its file no longer names'}`;
}

/** A landing the cordon holds with its merge staged, in a sentence: whose, where, and that its check waits on the lift. */
export const stagedSentence = ({ run, step, repo }: CordonStaged): string =>
  `${run}'s ${step} has its merge staged in ${repo} (MERGE_HEAD), and its check waits on the lift`;

/**
 * Why the store is cordoned, asked in a popover under the switch before the cordon is put: optional, and sent as given (`onPut`); `onClose`
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
        Cordon the store
      </Heading>
      <p className="text-xs text-muted-foreground">Nothing new starts, in any run, until it is lifted; what runs finishes.</p>
      <TextField value={why} onChange={setWhy} maxLength={200} className="flex flex-col gap-1">
        <Label className="text-xs">Why (optional)</Label>
        <Input data-cordon-why placeholder="merging by hand on main" />
      </TextField>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onPress={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm">
          Cordon
        </Button>
      </div>
    </Form>
  );
}

/**
 * The store's cordon, in the frame's header: a switch labelled Cordon, with what it does beside it — nothing new starts. On, it asks why
 * in a popover (`WhyForm`) and puts the cordon through the api with it (`POST /api/cordon`); off, it lifts it (`DELETE /api/cordon`); and
 * the cordon is read again either way. While one stands it says since when, by whom and why (the whole of it on hover), and names each
 * run whose ending has its merge staged in a repository's checkout while the cordon holds its check, so a person who cordoned to use main
 * knows why `MERGE_HEAD` is there. A refusal — a cordon put or lifted elsewhere meanwhile — is said in the package's words.
 */
export function CordonSwitch() {
  const id = useId();
  const queryClient = useQueryClient();
  const read = useQuery(cordonQuery);
  const anchor = useRef<HTMLDivElement>(null);
  const [asking, setAsking] = useState(false);
  const toggle = useMutation({
    mutationFn: (put: { why: string } | null) => (put ? putCordon(put.why || undefined) : liftCordon()),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['cordon'], exact: true }),
  });
  const now = new Date(useNow(30_000));
  const cordon = read.data?.cordon ?? null;
  const staged = read.data?.staged ?? [];
  const since = cordon ? cordonSince(cordon, now) : null;
  const refused = toggle.error ?? read.error;
  const said = since && [`cordoned ${since}`, cordon?.why, ...staged.map(stagedSentence)].filter(Boolean).join('\n');
  return (
    <div ref={anchor} data-cordon={cordon ? 'on' : 'off'} className="flex min-w-0 items-center gap-2 text-sm" title={said || undefined}>
      <Switch
        id={id}
        size="sm"
        isSelected={asking || (toggle.isPending ? toggle.variables !== null : cordon !== null)}
        onChange={(on) => (on ? setAsking(true) : toggle.mutate(null))}
        isDisabled={!read.data || toggle.isPending}
      />
      <Popover triggerRef={anchor} isOpen={asking} onOpenChange={setAsking} placement="bottom end" offset={6} className={POPOVER}>
        <Dialog aria-label="Cordon the store" data-cordon-ask className="outline-none">
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
        Cordon
      </label>{' '}
      <span className="hidden truncate text-muted-foreground lg:inline">
        nothing new starts{since && ` · ${since}`}
        {cordon?.why && `: ${cordon.why}`}
      </span>
      {staged.map((s) => (
        <span
          key={`${s.run}/${s.step}`}
          data-cordon-staged={s.run}
          title={stagedSentence(s)}
          className="shrink-0 font-mono text-xs text-amber-700 dark:text-amber-400"
        >
          {`${s.run} staged`}
        </span>
      ))}
      {refused && (
        <span role="alert" data-cordon-refused className="max-w-64 truncate text-xs text-destructive" title={refused.message}>
          {refused.message}
        </span>
      )}
    </div>
  );
}

import { useState, type ReactNode } from 'react';
import { TextField } from 'react-aria-components';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { clearCustomInstructions, customInstructionsQuery, writeCustomInstructions, type CustomInstructions as Words } from '../lib/api';
import { AgentRefused } from './AgentParts';

/**
 * What a panel of custom instructions says of where the words reach and when a save takes effect: `told`, who is told them; `takes`, when
 * a change reaches them, marked `frozen` or `told`; `saved` and `cleared`, said after a write; `clearAsks`, the question Clear asks;
 * `placeholder`, the empty draft's hint; `unread`, what words that do not read stop.
 */
export type Reach = {
  told: (name: ReactNode) => ReactNode;
  takes: { mark: 'frozen' | 'told'; words: string };
  saved: string;
  cleared: string;
  clearAsks: string;
  placeholder: (name: string) => string;
  unread: (name: string) => string;
};

/** The words for an agent hired by steps: told to each step it fills, frozen on a run as it starts. */
export const HIRED: Reach = {
  told: (name) => (
    <>Your words for every agent named {name}, wherever it is hired: told after its instructions, and before a step's policy.</>
  ),
  takes: {
    mark: 'frozen',
    words: 'A run already started keeps the words it froze; only runs started after you save or clear get the change.',
  },
  saved: 'Saved: runs started from now are told these words.',
  cleared: 'Cleared: runs started from now are told none.',
  clearAsks: 'Remove these words, for runs started from now?',
  placeholder: (name) => `What every ${name} is told after its own instructions: a house rule, a language, a habit of your team's.`,
  unread: (name) => `These do not read, so no run can start a step naming ${name} until you clear them or save words over them:`,
};

/** The words for the store's own agent, hired by no step: told in her session as it is filed, and to her open session when they change. */
export const SESSION: Reach = {
  told: (name) => (
    <>
      Your words for {name}, the store's own agent: told after her own instruction, in the session she is filed with, and to her open
      session when they change.
    </>
  ),
  takes: {
    mark: 'told',
    words: 'Her open session is told a save or a clear at her keeper’s next beat, within seconds: no restart, no new session.',
  },
  saved: 'Saved: her open session is told these words.',
  cleared: 'Cleared: her open session is told she has none.',
  clearAsks: 'Remove these words? Her open session is told.',
  placeholder: () => 'What she is told after her own instruction: how your factories are run, what she may answer for you at Auto.',
  unread: () =>
    'These do not read, so her open session is told nothing and she cannot be filed again until you clear them or save words over them:',
};

/**
 * A person's custom instructions for every agent named `name`: what they are and when they reach the agent, in the words of its `reach`
 * (`HIRED` unless given), the file the api keeps them in, the words to write, and Clear. They are the person's, not the agent's file's, so
 * the repository's agents take them too. A save or a clear sets what the page shows from the api's answer and reads the words again; a
 * refusal is shown in the api's words.
 */
export function CustomInstructions({ name, reach = HIRED }: { name: string; reach?: Reach }) {
  const queryClient = useQueryClient();
  const query = customInstructionsQuery(name);
  const { data, error } = useQuery(query);
  const settle = (now: Words) => {
    queryClient.setQueryData(query.queryKey, now);
    void queryClient.invalidateQueries({ queryKey: query.queryKey, exact: true });
  };
  const save = useMutation({
    mutationFn: (words: string) => writeCustomInstructions(name, words),
    onSuccess: settle,
  });
  const clear = useMutation({
    mutationFn: () => clearCustomInstructions(name),
    onSuccess: (cleared) => settle({ name, file: cleared.file, words: null, error: null }),
  });
  const done = save.isSuccess ? reach.saved : clear.isSuccess ? reach.cleared : null;
  const failed = save.error
    ? { verb: 'Not saved', message: save.error.message }
    : clear.error
      ? { verb: 'Not cleared', message: clear.error.message }
      : null;
  return (
    <section
      id="custom-instructions"
      aria-label="Custom instructions"
      data-custom-instructions
      className="space-y-3 border-t border-neutral-200 pt-4 dark:border-neutral-800"
    >
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Custom instructions</h2>
        <p className="text-xs text-muted-foreground">{reach.told(<code className="font-mono">{name}</code>)}</p>
        <p
          data-custom-frozen={reach.takes.mark === 'frozen' || undefined}
          data-custom-told={reach.takes.mark === 'told' || undefined}
          className="text-xs text-muted-foreground"
        >
          {reach.takes.words}
        </p>
      </div>
      {data ? (
        <CustomForm
          key={`${data.words ?? ''}\n${data.error ?? ''}`}
          custom={data}
          reach={reach}
          pending={save.isPending || clear.isPending}
          onSave={(words) => {
            clear.reset();
            save.mutate(words);
          }}
          onClear={() => {
            save.reset();
            clear.mutate();
          }}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          {error instanceof Error ? `Could not read the custom instructions: ${error.message}` : 'Reading the custom instructions…'}
        </p>
      )}
      {done && (
        <p data-custom-done className="text-xs text-muted-foreground">
          {done}
        </p>
      )}
      {failed && (
        <div data-custom-refused>
          <AgentRefused message={failed.message} users={[]} from="yours" verb={failed.verb} />
        </div>
      )}
    </section>
  );
}

/**
 * The file, the words and the buttons, drawn anew whenever the words read change: Save while the draft holds words other than those kept,
 * and Clear, asked twice, while there is a file.
 */
function CustomForm({
  custom,
  reach,
  pending,
  onSave,
  onClear,
}: {
  custom: Words;
  reach: Reach;
  pending: boolean;
  onSave: (words: string) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState(custom.words ?? '');
  const [asking, setAsking] = useState(false);
  const unchanged = draft.trim() === (custom.words ?? '');
  const held = custom.words !== null || custom.error !== null;

  return (
    <form
      aria-label={`Custom instructions for ${custom.name}`}
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.trim() && !unchanged) onSave(draft);
      }}
    >
      <p data-custom-file className="font-mono text-[11px] break-all text-muted-foreground">
        {custom.file}
        {!held && ' — none yet'}
      </p>
      {custom.error !== null && (
        <div
          data-custom-error
          className="space-y-1 rounded border border-red-300 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40"
        >
          <p className="text-sm font-medium text-red-800 dark:text-red-300">{reach.unread(custom.name)}</p>
          <p className="font-mono text-xs whitespace-pre-wrap break-words text-red-800 dark:text-red-300">{custom.error}</p>
        </div>
      )}
      <TextField value={draft} onChange={setDraft} className="space-y-1.5">
        <Label className="text-xs">Words</Label>
        <Textarea placeholder={reach.placeholder(custom.name)} className="min-h-24 leading-relaxed" />
      </TextField>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" isDisabled={pending || !draft.trim() || unchanged}>
          {pending ? 'Writing…' : 'Save'}
        </Button>
        {held && (
          <Clear
            asks={reach.clearAsks}
            asking={asking}
            pending={pending}
            onAsk={setAsking}
            onClear={() => {
              setAsking(false);
              onClear();
            }}
          />
        )}
      </div>
    </form>
  );
}

/** Clear, asked twice: the first press asks, `asks` the question, and the second removes the words. */
function Clear({
  asks,
  asking,
  pending,
  onAsk,
  onClear,
}: {
  asks: string;
  asking: boolean;
  pending: boolean;
  onAsk: (asking: boolean) => void;
  onClear: () => void;
}) {
  if (!asking)
    return (
      <Button variant="outline" onPress={() => onAsk(true)} isDisabled={pending}>
        Clear…
      </Button>
    );
  return (
    <span data-custom-clear-asks className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {asks}
      <Button variant="destructive" onPress={onClear} isDisabled={pending}>
        {pending ? 'Clearing…' : 'Clear'}
      </Button>
      <Button variant="ghost" onPress={() => onAsk(false)} isDisabled={pending}>
        Keep them
      </Button>
    </span>
  );
}

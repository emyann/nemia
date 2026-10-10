import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { clearRules, factoryRulesQuery, writeRules, type FactoryRules as Rules } from '../lib/api';

/** What a person asks of a factory's rules: their words saved, or the rules removed. */
type Change = { kind: 'save'; words: string } | { kind: 'clear' };

/** What a change did, said once it is done, and what a refusal of it is headed with. */
const SAID: Record<Change['kind'], { done: string; refused: string }> = {
  save: { done: 'Saved: a run started from now on is told them.', refused: 'Not saved' },
  clear: { done: 'Cleared: this factory tells its agents no rules.', refused: 'Not cleared' },
};

/**
 * A factory's rules, on its settings page: the words every agent hired into it is told, where they are kept, and a form to write them —
 * saved, or cleared, asked twice. A file there that cannot be told is said in the api's words, with what it stops; a change sets what the
 * page shows from the api's answer and reads the rules again; a refusal is shown in the api's words.
 */
export function FactoryRules({ name }: { name: string }) {
  const queryClient = useQueryClient();
  const query = factoryRulesQuery(name);
  const { data, error } = useQuery(query);
  const change = useMutation({
    mutationFn: (asked: Change) => (asked.kind === 'save' ? writeRules(name, asked.words) : clearRules(name)),
    onSuccess: (now) => {
      queryClient.setQueryData(query.queryKey, now);
      void queryClient.invalidateQueries({ queryKey: query.queryKey, exact: true });
    },
  });
  const ask = (asked: Change) => {
    change.reset();
    change.mutate(asked);
  };
  const said = change.variables ? SAID[change.variables.kind] : null;
  return (
    <section aria-label="Rules" data-factory-rules className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Rules</h2>
        <p data-rules-told className="text-sm text-muted-foreground">
          Told to every agent hired into this factory, after its custom instructions and before the step's own policy. Runs already started
          keep what they were told.
        </p>
      </div>
      {data ? (
        <>
          {data.error !== null && (
            <Alert variant="destructive" data-rules-error>
              <AlertTitle>These rules cannot be told, and no run starts in this factory until they can</AlertTitle>
              <AlertDescription className="break-words">{data.error}</AlertDescription>
            </Alert>
          )}
          <RulesForm key={`${data.words ?? ''}\n${data.error ?? ''}`} data={data} pending={change.isPending} onChange={ask} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? `Could not read the rules: ${error.message}` : 'Reading the rules…'}
        </p>
      )}
      {change.isSuccess && said && (
        <p data-rules-done className="text-sm text-muted-foreground">
          {said.done}
        </p>
      )}
      {change.error && said && (
        <Alert variant="destructive" data-rules-refused>
          <AlertTitle>{said.refused}</AlertTitle>
          <AlertDescription className="break-words">{change.error.message}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}

/** The rules' words, to edit: Save while the draft differs from them, and Clear, asked twice, while the factory keeps a file of them. */
function RulesForm({ data, pending, onChange }: { data: Rules; pending: boolean; onChange: (change: Change) => void }) {
  const id = useId();
  const [draft, setDraft] = useState(data.words ?? '');
  const [asking, setAsking] = useState(false);
  const unchanged = draft.trim() === (data.words?.trim() ?? '');
  const kept = data.words !== null || data.error !== null;
  return (
    <form
      aria-label={`The rules of ${data.name}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.trim() && !unchanged) onChange({ kind: 'save', words: draft });
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={id}>Words</FieldLabel>
          <Textarea
            id={id}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="What everyone working here keeps to: what is never done without asking, what a change must come with, who decides what."
            className="min-h-40 leading-relaxed"
          />
          <FieldDescription>
            Words only: they set no key and widen no fence. Kept in{' '}
            <span data-rules-file className="font-mono text-xs break-all">
              {data.file}
            </span>
          </FieldDescription>
        </Field>
        <Field orientation="horizontal" className="flex-wrap">
          <Button type="submit" isDisabled={pending || !draft.trim() || unchanged}>
            {pending ? 'Writing…' : 'Save'}
          </Button>
          {kept &&
            (asking ? (
              <span data-rules-clear-asks className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                Remove the rules of this factory?
                <Button
                  variant="destructive"
                  isDisabled={pending}
                  onPress={() => {
                    setAsking(false);
                    onChange({ kind: 'clear' });
                  }}
                >
                  Clear
                </Button>
                <Button variant="ghost" isDisabled={pending} onPress={() => setAsking(false)}>
                  Keep them
                </Button>
              </span>
            ) : (
              <Button variant="outline" isDisabled={pending} onPress={() => setAsking(true)}>
                Clear…
              </Button>
            ))}
        </Field>
      </FieldGroup>
    </form>
  );
}

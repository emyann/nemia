import { useState, type ReactNode } from 'react';
import { TextField } from 'react-aria-components';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  clearInstruction,
  factoryInstructionQuery,
  placeInstruction,
  resetInstructionPlace,
  writeInstruction,
  type FactoryInstruction as Instruction,
} from '../lib/api';
import { Markdown } from './Markdown';

/** What a person asks of a factory's instruction: its words saved or cleared in the store, or the place it is read from changed. */
type Change = { kind: 'save'; words: string } | { kind: 'clear' } | { kind: 'store' } | { kind: 'path'; path: string } | { kind: 'reset' };

/** The write a change sends, answered with the instruction as it then reads. */
function sent(name: string, change: Change): Promise<Instruction> {
  if (change.kind === 'save') return writeInstruction(name, change.words);
  if (change.kind === 'clear') return clearInstruction(name);
  if (change.kind === 'store') return placeInstruction(name, { store: true });
  if (change.kind === 'path') return placeInstruction(name, { path: change.path });
  return resetInstructionPlace(name);
}

/** What a change did, said once it is done, and what a refusal of it is headed with. */
const SAID: Record<Change['kind'], { done: string; refused: string }> = {
  save: { done: 'Saved.', refused: 'Not saved' },
  clear: { done: 'Cleared: the store keeps no instruction for this factory.', refused: 'Not cleared' },
  store: { done: 'Kept in the store from now on.', refused: 'Not moved' },
  path: { done: "Read from the folder's file from now on.", refused: 'Not moved' },
  reset: { done: "Read from NEMIA.md in the factory's folder from now on.", refused: 'Not moved' },
};

/**
 * A factory's instruction, on its settings page — what Nemia is to know about it, which no step of a run is told: where it is kept, in a
 * person's words, and its words. Kept in the store, it is edited here — saved, or cleared, asked twice; kept in a file of the factory's
 * first folder, it is shown as that file reads, edited in the checkout. Either way the person may keep it in the store, read it from
 * another file in the folder, or go back to `NEMIA.md`. A change sets what the page shows from the api's answer and reads the instruction
 * again; a refusal is shown in the api's words.
 */
export function FactoryInstruction({ name }: { name: string }) {
  const queryClient = useQueryClient();
  const query = factoryInstructionQuery(name);
  const { data, error } = useQuery(query);
  const change = useMutation({
    mutationFn: (asked: Change) => sent(name, asked),
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
    <section aria-label="Instruction" data-factory-instruction className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-title-medium">Instruction</h2>
        <p className="text-body-medium text-muted-foreground">
          What Nemia is to know about this factory: what it is for, how its work goes, what to ask you first. She reads it before she acts
          here; no step of a run is told it. One text, read where it is kept.
        </p>
      </div>
      {data ? (
        <Kept data={data} pending={change.isPending} onChange={ask} />
      ) : (
        <p className="text-body-medium text-muted-foreground">
          {error instanceof Error ? `Could not read the instruction: ${error.message}` : 'Reading the instruction…'}
        </p>
      )}
      {change.isSuccess && said && (
        <p data-instruction-done className="text-body-medium text-muted-foreground">
          {said.done}
        </p>
      )}
      {change.error && said && (
        <Refused heading={`${said.refused}:`} data-instruction-refused>
          {change.error.message}
        </Refused>
      )}
    </section>
  );
}

/** The instruction as it reads where it is kept, then the choice of where to keep it. */
function Kept({ data, pending, onChange }: { data: Instruction; pending: boolean; onChange: (change: Change) => void }) {
  return (
    <div data-instruction-kept={data.store ? 'store' : 'folder'} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-body-medium font-medium">{data.store ? 'Kept in the store' : "Kept in a file of the factory's folder"}</p>
        <p data-instruction-file className="font-mono text-body-small break-all text-muted-foreground">
          {data.file}
        </p>
      </div>
      {data.error !== null && (
        <Refused heading="This file does not read, so it is not the instruction:" data-instruction-error>
          {data.error}
        </Refused>
      )}
      {data.store ? (
        <StoreForm key={`${data.words ?? ''}\n${data.error ?? ''}`} data={data} pending={pending} onChange={onChange} />
      ) : (
        <FolderText data={data} />
      )}
      <Place key={data.path ?? ''} data={data} pending={pending} onChange={onChange} />
    </div>
  );
}

/** A folder's file, read-only: its words, or that there is none yet, and where to change it. */
function FolderText({ data }: { data: Instruction }) {
  return (
    <div className="flex flex-col gap-2">
      {data.words !== null ? (
        <div data-instruction-words className="rounded-lg border px-4 py-3 text-body-medium">
          <Markdown>{data.words}</Markdown>
        </div>
      ) : (
        data.error === null && (
          <p data-instruction-none className="text-body-medium text-muted-foreground">
            No file there yet: the factory has no instruction until one is written there.
          </p>
        )
      )}
      <p className="text-body-small text-muted-foreground">
        It is edited in the checkout, with the code it speaks of, and read as it is on each request: this page does not write it.
      </p>
      {data.stored && (
        <p data-instruction-unread className="text-body-small text-muted-foreground">
          The store still holds an instruction for this factory, unread while the folder's file is: keep it in the store to read it again.
        </p>
      )}
    </div>
  );
}

/** The words the store keeps, to edit: Save while the draft differs from them, and Clear, asked twice, while there is a file. */
function StoreForm({ data, pending, onChange }: { data: Instruction; pending: boolean; onChange: (change: Change) => void }) {
  const [draft, setDraft] = useState(data.words?.trimEnd() ?? '');
  const [asking, setAsking] = useState(false);
  const unchanged = draft.trim() === (data.words?.trim() ?? '');
  return (
    <form
      aria-label={`The instruction of ${data.name}`}
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.trim() && !unchanged) onChange({ kind: 'save', words: draft });
      }}
    >
      <TextField value={draft} onChange={setDraft} className="flex flex-col gap-1.5">
        <Label className="text-body-small">Words</Label>
        <Textarea
          placeholder="What Nemia is to know about this factory: what it is for, how its work goes, what to ask you before she acts."
          className="min-h-40 leading-relaxed"
        />
      </TextField>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" isDisabled={pending || !draft.trim() || unchanged}>
          {pending ? 'Writing…' : 'Save'}
        </Button>
        {data.stored &&
          (asking ? (
            <span data-instruction-clear-asks className="flex flex-wrap items-center gap-2 text-body-small text-muted-foreground">
              Remove the words the store keeps?
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
      </div>
    </form>
  );
}

/**
 * Where the instruction is kept, to change: the store, while it is read from a folder; `NEMIA.md`, while the store or another file keeps
 * it; and a file of the folder, by its path from it — an empty path naming `NEMIA.md`, but in the store, where Back to NEMIA.md says it.
 */
function Place({ data, pending, onChange }: { data: Instruction; pending: boolean; onChange: (change: Change) => void }) {
  const [path, setPath] = useState(data.path ?? '');
  const asked = path.trim();
  const same = data.store ? asked === '' : asked === (data.path ?? '');
  return (
    <div data-instruction-place className="flex flex-col gap-3 border-t pt-4">
      <p className="text-body-medium font-medium">Where it is kept</p>
      <div className="flex flex-wrap gap-2">
        {!data.store && (
          <Button variant="outline" size="sm" isDisabled={pending} onPress={() => onChange({ kind: 'store' })}>
            Keep it in the store instead
          </Button>
        )}
        {(data.store || data.path !== null) && (
          <Button variant="outline" size="sm" isDisabled={pending} onPress={() => onChange({ kind: 'reset' })}>
            Back to NEMIA.md
          </Button>
        )}
      </div>
      <form
        aria-label="Read it from a file in the folder"
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!same) onChange(asked ? { kind: 'path', path: asked } : { kind: 'reset' });
        }}
      >
        <TextField value={path} onChange={setPath} className="flex min-w-60 flex-1 flex-col gap-1.5">
          <Label className="text-body-small">Or read it from a file in the factory's first folder, by its path from there</Label>
          <Input placeholder="NEMIA.md" className="font-mono" />
        </TextField>
        <Button type="submit" variant="outline" size="sm" isDisabled={pending || same}>
          Read this file
        </Button>
      </form>
    </div>
  );
}

/** Words the api refused, or why a file does not read, under a heading. */
function Refused({ heading, children, ...data }: { heading: string; children: ReactNode } & Record<`data-${string}`, boolean>) {
  return (
    <div {...data} className="flex flex-col gap-1 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
      <p className="text-body-medium font-medium text-destructive">{heading}</p>
      <p className="font-mono text-body-small break-words whitespace-pre-wrap text-destructive">{children}</p>
    </div>
  );
}

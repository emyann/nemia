import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LibraryAdd } from 'objects';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addable, addToFactory, type AddableItem, libraryAddsQuery, libraryQuery, removeFromFactory } from '../../lib/api/storeLibrary.ts';
import { Reading, ReadingLines } from '@/components/look';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

/** What a person asks of a factory's adds: an item of the library added, or an add taken off. */
type Change = { kind: 'add'; item: AddableItem } | { kind: 'remove'; name: string };

/** The words an add's state is said in, on its badge. */
const STATE_WORDS: Record<LibraryAdd['status']['state'], string> = {
  resolved: 'resolved',
  shadowed: 'shadowed',
  missing: 'missing',
};

/** The key an addable item is picked by, `<kind>.<name>`, as its add is named. */
const keyOf = (change: Change) => (change.kind === 'add' ? `${change.item.kind}.${change.item.name}` : change.name);

/**
 * A factory's adds from the store's library, on its settings page: each add with its state — resolved, shadowed by the factory's own, or
 * missing from the library with the fix in the api's words — and a Remove; then Add from library, a pick of what it has not added. A
 * change reads the adds and the library again; a refusal is shown in the api's words.
 */
export function LibraryAdds({ name }: { name: string }) {
  const queryClient = useQueryClient();
  const adds = useQuery(libraryAddsQuery(name));
  const items = useQuery(libraryQuery());
  const [picked, setPicked] = useState<string | null>(null);
  const change = useMutation({
    mutationFn: (asked: Change) => (asked.kind === 'add' ? addToFactory(name, asked.item) : removeFromFactory(name, asked.name)),
    onSuccess: () => {
      setPicked(null);
      void queryClient.invalidateQueries({ queryKey: libraryAddsQuery(name).queryKey });
      void queryClient.invalidateQueries({ queryKey: libraryQuery().queryKey });
    },
  });
  const offered = adds.data && items.data ? addable(items.data, adds.data).map((item) => ({ kind: 'add', item }) satisfies Change) : [];
  const chosen = offered.find((one) => keyOf(one) === picked);
  return (
    <section aria-label="From the library" data-library-adds className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-title-medium">From the library</h2>
        <p className="text-body-medium text-on-surface-variant">
          The agents, skills and MCP servers of the store's library this factory resolves. An item is a reference, never a copy: an edit in
          the library reaches every factory that adds it.
        </p>
      </div>
      {adds.data ? (
        <AddList adds={adds.data} pending={change.isPending} onRemove={(added) => change.mutate({ kind: 'remove', name: added })} />
      ) : adds.error instanceof Error ? (
        <ReadTrouble what="the adds" error={adds.error} className="text-on-surface-variant" />
      ) : (
        <Reading label="Reading the adds…">
          <ReadingLines widths={['w-48', 'w-40', 'w-56']} className="gap-2 text-body-medium" />
        </Reading>
      )}
      {offered.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Add from library" value={picked} onChange={(key) => setPicked(String(key))} isDisabled={change.isPending}>
            <SelectTrigger size="sm" data-library-pick className="w-64">
              <SelectValue>{() => picked ?? 'Pick an item of the library'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {offered.map((one) => (
                <SelectItem key={keyOf(one)} id={keyOf(one)}>
                  {keyOf(one)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            data-library-add-press
            isDisabled={chosen === undefined || change.isPending}
            onPress={() => chosen && change.mutate(chosen)}
          >
            Add from library
          </Button>
        </div>
      )}
      {change.error && (
        <Alert variant="destructive" data-library-refused>
          <AlertTitle>{change.variables?.kind === 'add' ? 'Not added' : 'Not removed'}</AlertTitle>
          <AlertDescription className="break-words">{change.error.message}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}

/** Each add of a factory with its state, why it is shadowed or what fixes it missing, and a Remove; a line where there is none. */
function AddList({ adds, pending, onRemove }: { adds: readonly LibraryAdd[]; pending: boolean; onRemove: (name: string) => void }) {
  return (
    <ul className="flex flex-col gap-2">
      {adds.map((add) => (
        <li key={add.metadata.name} data-library-add={add.metadata.name} className="flex flex-wrap items-center gap-2 text-body-medium">
          <span className="font-mono">{add.metadata.name}</span>
          <Badge variant={add.status.state === 'missing' ? 'destructive' : 'outline'} data-add-state={add.status.state}>
            {STATE_WORDS[add.status.state]}
          </Badge>
          {add.status.shadowedBy !== undefined && (
            <span className="text-body-small text-on-surface-variant">the factory's own {add.status.shadowedBy} holds the name first</span>
          )}
          {add.status.message !== undefined && <span className="text-body-small text-failure">{add.status.message}</span>}
          <Button
            size="xs"
            variant="outline"
            className="ml-auto"
            data-add-remove={add.metadata.name}
            isDisabled={pending}
            onPress={() => onRemove(add.metadata.name)}
          >
            Remove
          </Button>
        </li>
      ))}
      {adds.length === 0 && <li className="text-body-medium text-on-surface-variant">Nothing added from the library yet.</li>}
    </ul>
  );
}

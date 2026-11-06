/**
 * A factory's delegations on its settings page, the person's alone: each agent it lets approve proposals at Auto, with its grants in words
 * and a Remove; and a form that writes one whole, as the api's PUT takes it: an agent of the factory, then one or more grants, each the
 * resources it reaches (`DELEGABLE`, every kind a proposal changes), the names among them (none: every name) and the verbs. Naming an agent
 * that has one loads its grants to edit. A write sets the list again from the api; a refusal is shown in its words.
 */
import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CHANGE_VERBS, type ChangeVerb, type Delegation, type DelegationRule } from 'objects';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { delegableAgentsQuery, delegationsKey, delegationsQuery, putDelegation, removeDelegation } from '@/lib/api';
import { DELEGABLE } from '@/lib/proposals';

/** One grant as the form holds it: resources and verbs picked, and the names typed, comma-separated. */
type Draft = { resources: readonly string[]; names: string; verbs: readonly ChangeVerb[] };

/** A grant with nothing picked yet. */
const EMPTY: Draft = { resources: [], names: '', verbs: [] };

/** A grant of a delegation, as the form holds it. */
const draftOf = (rule: DelegationRule): Draft => ({
  resources: [...rule.resources],
  names: rule.resourceNames.join(', '),
  verbs: [...rule.verbs],
});

/** A grant the form holds, as the api takes it; none where it picks no resource or no verb. */
const ruleOf = (draft: Draft): DelegationRule | undefined => {
  if (draft.resources.length === 0 || draft.verbs.length === 0) return undefined;
  const names = draft.names
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n !== '');
  return { resources: [...draft.resources], resourceNames: names, verbs: [...draft.verbs] };
};

/** A grant in words: its verbs, its resources, and its names or every name. */
const grantWords = (rule: DelegationRule): string =>
  `${rule.verbs.join(', ')} ${rule.resources.join(', ')}${rule.resourceNames.length ? ` named ${rule.resourceNames.join(', ')}` : ', any name'}`;

/** `list` with `value` in it where `on`, else without it. */
const toggled = <T,>(list: readonly T[], value: T, on: boolean): T[] =>
  on ? [...new Set([...list, value])] : list.filter((v) => v !== value);

/** The delegations of the factory `name`, listed, written and removed. */
export function FactoryDelegations({ name }: { name: string }) {
  const queryClient = useQueryClient();
  const { data, error } = useQuery(delegationsQuery(name));
  const moved = () => queryClient.invalidateQueries({ queryKey: delegationsKey(name), exact: true });
  const remove = useMutation({ mutationFn: (agent: string) => removeDelegation(name, agent), onSuccess: moved });
  return (
    <section aria-label="Delegations" data-factory-delegations className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-title-medium">Delegations</h2>
        <p className="text-body-medium text-muted-foreground">
          An agent named here may approve, at Auto, a proposal of this factory's that its grants cover. Only you write them.
        </p>
      </div>
      {data ? (
        data.length ? (
          <ul className="flex flex-col gap-1.5">
            {data.map((delegation) => (
              <DelegationRow
                key={delegation.metadata.name}
                delegation={delegation}
                pending={remove.isPending}
                onRemove={() => {
                  remove.reset();
                  remove.mutate(delegation.metadata.name);
                }}
              />
            ))}
          </ul>
        ) : (
          <p data-no-delegation className="text-body-medium text-muted-foreground">
            None: every proposal of this factory waits on you.
          </p>
        )
      ) : (
        <p className="text-body-medium text-muted-foreground">
          {error instanceof Error ? `Could not read the delegations: ${error.message}` : 'Reading the delegations…'}
        </p>
      )}
      {remove.error && (
        <Alert variant="destructive" data-delegation-refused>
          <AlertTitle>Not removed</AlertTitle>
          <AlertDescription className="break-words">{remove.error.message}</AlertDescription>
        </Alert>
      )}
      <DelegationForm factory={name} delegations={data ?? []} onWritten={moved} />
    </section>
  );
}

/** One delegation: its agent, its grants in words, and a Remove. */
function DelegationRow({ delegation, pending, onRemove }: { delegation: Delegation; pending: boolean; onRemove: () => void }) {
  return (
    <li data-delegation={delegation.metadata.name} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border px-3 py-2">
      <span className="min-w-0 flex-1 text-body-medium">
        <span className="font-mono">{delegation.metadata.name}</span> may approve what{' '}
        {delegation.spec.rules.map((rule, i) => (
          <span key={i} data-delegation-grant>
            {i > 0 ? '; or ' : ''}
            {grantWords(rule)}
          </span>
        ))}
      </span>
      <Button variant="outline" size="sm" data-delegation-remove isDisabled={pending} onPress={onRemove}>
        Remove
      </Button>
    </li>
  );
}

/** The form that writes a delegation whole: an agent, then its grants. */
function DelegationForm({
  factory,
  delegations,
  onWritten,
}: {
  factory: string;
  delegations: readonly Delegation[];
  onWritten: () => Promise<void>;
}) {
  const id = useId();
  const { data: agents } = useQuery(delegableAgentsQuery(factory));
  const [agent, setAgent] = useState('');
  const [drafts, setDrafts] = useState<readonly Draft[]>([EMPTY]);
  const rules = drafts.map(ruleOf);
  const whole = rules.every((r) => r !== undefined);
  const write = useMutation({
    mutationFn: () => putDelegation(factory, agent.trim(), { rules: rules.filter((r) => r !== undefined) }),
    onSuccess: async () => {
      setAgent('');
      setDrafts([EMPTY]);
      await onWritten();
    },
  });
  const named = (value: string) => {
    setAgent(value);
    const kept = delegations.find((d) => d.metadata.name === value.trim());
    if (kept) setDrafts(kept.spec.rules.map(draftOf));
  };
  const put = (i: number, draft: Draft) => setDrafts(drafts.map((d, j) => (j === i ? draft : d)));
  return (
    <form
      aria-label={`A delegation of ${factory}`}
      data-delegation-form
      className="flex flex-col gap-3 rounded-lg border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (agent.trim() && whole) {
          write.reset();
          write.mutate();
        }
      }}
    >
      <FieldGroup>
        <AgentField id={`${id}-agent`} agents={agents ?? []} agent={agent} onAgent={named} />
        {drafts.map((draft, i) => (
          <GrantFields
            key={i}
            id={`${id}-grant-${i}`}
            index={i}
            draft={draft}
            onDraft={(next) => put(i, next)}
            onTakeOut={drafts.length > 1 ? () => setDrafts(drafts.filter((_, j) => j !== i)) : undefined}
          />
        ))}
        <FieldDescription>Each grant needs a resource and a verb.</FieldDescription>
        <Field orientation="horizontal" className="flex-wrap">
          <Button type="submit" data-delegation-save isDisabled={write.isPending || !agent.trim() || !whole}>
            {write.isPending ? 'Writing…' : 'Save'}
          </Button>
          <Button variant="outline" isDisabled={write.isPending} onPress={() => setDrafts([...drafts, EMPTY])}>
            Add a grant
          </Button>
        </Field>
      </FieldGroup>
      {write.error && (
        <Alert variant="destructive" data-delegation-refused>
          <AlertTitle>Not saved</AlertTitle>
          <AlertDescription className="break-words">{write.error.message}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}

/** One grant's fields: its resources, its names and its verbs, and a way to take it out where it is not the only one. */
function GrantFields({
  id,
  index,
  draft,
  onDraft,
  onTakeOut,
}: {
  id: string;
  index: number;
  draft: Draft;
  onDraft: (draft: Draft) => void;
  onTakeOut: (() => void) | undefined;
}) {
  return (
    <fieldset data-delegation-grant-form={index} className="flex flex-col gap-2 rounded-md border px-3 py-2">
      <legend className="px-1 text-label-medium text-muted-foreground">Grant {index + 1}</legend>
      <div className="flex flex-wrap gap-3" aria-label="Resources">
        {DELEGABLE.map((resource) => (
          <Checkbox
            key={resource}
            data-delegation-resource={resource}
            isSelected={draft.resources.includes(resource)}
            onChange={(on) => onDraft({ ...draft, resources: toggled(draft.resources, resource, on) })}
          >
            {resource}
          </Checkbox>
        ))}
      </div>
      <Field>
        <FieldLabel htmlFor={`${id}-names-${index}`}>Names</FieldLabel>
        <Input
          id={`${id}-names-${index}`}
          data-delegation-names
          value={draft.names}
          onChange={(event) => onDraft({ ...draft, names: event.target.value })}
          placeholder="Blank for every name; else comma-separated"
        />
      </Field>
      <div className="flex flex-wrap gap-3" aria-label="Verbs">
        {CHANGE_VERBS.map((verb) => (
          <Checkbox
            key={verb}
            data-delegation-verb={verb}
            isSelected={draft.verbs.includes(verb)}
            onChange={(on) => onDraft({ ...draft, verbs: toggled(draft.verbs, verb, on) })}
          >
            {verb}
          </Checkbox>
        ))}
      </div>
      {onTakeOut && (
        <div>
          <Button variant="ghost" size="sm" onPress={onTakeOut}>
            Take this grant out
          </Button>
        </div>
      )}
    </fieldset>
  );
}

/** The agent a delegation names, typed or picked among the factory's agents. */
function AgentField({
  id,
  agents,
  agent,
  onAgent,
}: {
  id: string;
  agents: readonly string[];
  agent: string;
  onAgent: (agent: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>Agent</FieldLabel>
      <Input
        id={id}
        data-delegation-agent
        list={`${id}s`}
        value={agent}
        onChange={(event) => onAgent(event.target.value)}
        placeholder="An agent of this factory"
      />
      <datalist id={`${id}s`}>
        {agents.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </datalist>
    </Field>
  );
}

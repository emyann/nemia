import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { AgentForm } from '../components/AgentForm';
import { AgentRefused, FromBadge, UsedBy } from '../components/AgentParts';
import { AsWritten } from '../components/FilePage';
import { TryAgent, TryYours } from '../components/TryAgent';
import { agentQuery, AgentRefusal, keyFormQuery, readAgent, removeAgent, saveAgent, type AgentDraft, type AgentListing } from '../lib/api';
import { formKeyOf, keptAfterCopy, keptAfterSave, settleSave, type KeptForm } from '../lib/agents';
import { invalidateAgents } from '../lib/agentWrites';
import { BackToAgents } from './agents_.new';

// `agents_`: at /agents/$from/$agent, and not drawn inside the Agents page, which has no outlet for it.
export const Route = createFileRoute('/agents_/$from/$agent')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(agentQuery(params.from, params.agent)),
      context.queryClient.prefetchQuery(keyFormQuery),
    ]),
  component: AgentPage,
  errorComponent: ({ error }) => (
    <div className="space-y-3">
      <BackToAgents />
      <p className="text-sm text-red-600">Could not load this agent: {error instanceof Error ? error.message : String(error)}</p>
    </div>
  ),
});

const code = (text: string) => <code className="font-mono text-xs">{text}</code>;

/**
 * One agent: the nodes it is attached to, each linked, and its form — to edit, when it is yours; to read, when it is the repository's, which
 * the board does not write. Save puts it back against the version it was read at, and Remove takes it away while no node names it. Under it,
 * the Try panel, for an agent of yours.
 */
function AgentPage() {
  const { from, agent: name } = Route.useParams();
  const { data: agent } = useSuspenseQuery(agentQuery(from, name));
  const { data: keyForm } = useQuery(keyFormQuery);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const mine = agent.from === 'yours';
  const [kept, setKept] = useState<KeptForm | null>(null);
  const formKey = formKeyOf(agent.version, kept);

  const save = useMutation({
    mutationFn: (draft: AgentDraft) => saveAgent(agent.name, agent.version, draft),
    onSuccess: (saved) =>
      settleSave({
        rename:
          saved.agent.name !== agent.name
            ? () => navigate({ to: '/agents/$from/$agent', params: { from: 'yours', agent: saved.agent.name } })
            : undefined,
        invalidate: () => invalidateAgents(queryClient),
        // The form a copy kept stays until the agent reads at the save's version: let go before, it was drawn from the file before the save.
        release: () =>
          setKept((was) => keptAfterSave(was, queryClient.getQueryData(agentQuery('yours', saved.agent.name).queryKey)?.version)),
      }),
  });
  const remove = useMutation({
    mutationFn: () => removeAgent(agent.name, agent.version),
    onSuccess: async () => {
      await navigate({ to: '/agents' });
      await invalidateAgents(queryClient);
    },
  });
  const error = save.error ?? remove.error;
  const form = (
    <AgentForm
      // A new version is a new form: what was saved, as it now reads — but for the version this page's own copy of a skill moved it to.
      key={formKey}
      listing={agent}
      keyForm={keyForm}
      readOnly={!mine}
      onSkillCopied={async () => {
        // Read before the copy's invalidation lands, past the cache, so the form is kept before the page sees the version move. A read that
        // fails keeps nothing: the page reads the agent again, as after any write.
        const now = await readAgent(from, name).catch(() => null);
        setKept(now && keptAfterCopy(agent, now, formKey));
      }}
      saving={save.isPending || remove.isPending}
      refusal={error && <AgentRefused message={error.message} users={error instanceof AgentRefusal ? error.users : []} from="yours" />}
      onSave={(draft) => {
        remove.reset();
        save.mutate(draft);
      }}
      footer={
        mine && (
          <Remove
            agent={agent}
            pending={remove.isPending}
            onRemove={() => {
              save.reset();
              remove.mutate();
            }}
          />
        )
      }
    />
  );

  return (
    <article className="space-y-6">
      <BackToAgents />

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-mono text-base font-semibold">{agent.name}</h1>
          <span className="text-xs text-neutral-500">an agent</span>
          <FromBadge from={agent.from} />
        </div>
        {agent.description && <p className="text-sm text-neutral-700 dark:text-neutral-300">{agent.description}</p>}
        <UsedBy listing={agent} />
        {!mine && (
          <p data-read-only className="text-xs text-neutral-500">
            The repository's agents are read here, not written: they change with the repository, in a commit. To start one of yours from
            this one, {code(`cp ${agent.file} ~/.agent-workflows/workflows/agents/`)}.
          </p>
        )}
      </header>

      {agent.error !== null && (
        <div
          data-agent-error
          className="space-y-1 rounded border border-red-300 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40"
        >
          <p className="text-sm font-medium text-red-800 dark:text-red-300">
            Does not read as an agent, so no run can start a node that names it:
          </p>
          <p className="font-mono text-xs whitespace-pre-wrap break-words text-red-800 dark:text-red-300">{agent.error}</p>
        </div>
      )}

      {mine ? (
        <>
          <p className="border-b border-neutral-200 pb-2 font-mono text-[11px] break-all text-neutral-500 dark:border-neutral-800">
            {agent.file}
          </p>
          {form}
        </>
      ) : (
        // Only the repository's has Source: yours is edited, and a toggle would drop what was typed.
        <AsWritten file={agent.file} source={agent.source}>
          {form}
        </AsWritten>
      )}

      {/* Only an agent of yours is tried: a try runs with no repository, where a repository's agent is not read. */}
      {mine ? <TryAgent agent={agent} /> : <TryYours agent={agent} />}
    </article>
  );
}

/** Remove, asked twice: the first press asks, the second removes. */
function Remove({ agent, pending, onRemove }: { agent: AgentListing; pending: boolean; onRemove: () => void }) {
  const [asking, setAsking] = useState(false);
  // The file the agent names beside it, which goes with it unless another agent names it: the result schema.
  const beside = [agent.keys.output].filter((file): file is string => Boolean(file));
  if (!asking)
    return (
      <Button variant="outline" className="ml-auto" onPress={() => setAsking(true)} isDisabled={pending}>
        Remove…
      </Button>
    );
  return (
    <span data-remove-asks className="ml-auto flex flex-wrap items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
      Remove {code(`agents/${agent.name}.md`)}
      {beside.length > 0 && (
        <>
          and{' '}
          {beside.map((file, i) => (
            <span key={file}>
              {i > 0 && <>, </>}
              {code(file)}
            </span>
          ))}
          , unless another agent names {beside.length === 1 ? 'it' : 'them'}
        </>
      )}
      ?
      <Button variant="destructive" onPress={onRemove} isDisabled={pending}>
        {pending ? 'Removing…' : 'Remove'}
      </Button>
      <Button variant="ghost" onPress={() => setAsking(false)} isDisabled={pending}>
        Keep it
      </Button>
    </span>
  );
}

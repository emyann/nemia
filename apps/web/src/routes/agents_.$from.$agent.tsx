import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { AgentForm } from '../components/AgentForm';
import { AgentFace, AgentRefused, FromBadge, personOf, UsedBy } from '../components/AgentParts';
import { CustomInstructions } from '../components/CustomInstructions';
import { AsWritten } from '../components/FilePage';
import { TryAgent, TryYours } from '../components/TryAgent';
import {
  agentQuery,
  AgentRefusal,
  customInstructionsQuery,
  keyFormQuery,
  readAgent,
  removeAgent,
  saveAgent,
  type AgentDraft,
  type AgentListing,
} from '../lib/api';
import { formKeyOf, keptAfterCopy, keptAfterSave, settleSave, type KeptForm } from '../lib/agents';
import { invalidateAgents } from '../lib/agentWrites';
import { BackToAgents } from './agents_.new';

/** The page of an agent, at /agents/$from/$agent: `agents_` draws it on its own, not inside the Agents page, which has no outlet for it. */
export const Route = createFileRoute('/agents_/$from/$agent')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(agentQuery(params.from, params.agent)),
      context.queryClient.prefetchQuery(keyFormQuery),
      context.queryClient.prefetchQuery(customInstructionsQuery(params.agent)),
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
 * One agent: the nodes it is attached to, each linked, and its form — to edit, when it is yours; to read, with its Source, when it is the
 * repository's, which the board does not write. Yours has no Source, whose toggle would drop what was typed. The form is drawn under
 * `formKeyOf`'s key, so a new version is a new form. Save puts it back against the version it was read at, and Remove takes it away while
 * no node names it. Once the form copies a skill, the page reads the agent past the cache, before the copy's invalidation lands, to keep
 * the form (`keptAfterCopy`); a read that fails keeps nothing, and the page reads the agent again as after any write. Under it, your custom
 * instructions for its name, for an agent of either place, then the Try panel for an agent of yours; the repository's is not tried, since a
 * try runs with no repository, where its agents are not read.
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
      key={formKey}
      listing={agent}
      keyForm={keyForm}
      readOnly={!mine}
      onSkillCopied={async () => {
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

      <AgentHeader agent={agent} mine={mine} />

      {agent.error !== null && <Unread error={agent.error} />}

      <FormIn agent={agent} mine={mine}>
        {form}
      </FormIn>

      <CustomInstructions name={agent.name} />

      {mine ? <TryAgent agent={agent} /> : <TryYours agent={agent} />}
    </article>
  );
}

/** The form in its frame: under the file's path for an agent of yours, beside its Source for the repository's. */
function FormIn({ agent, mine, children }: { agent: AgentListing; mine: boolean; children: ReactNode }) {
  if (!mine)
    return (
      <AsWritten file={agent.file} source={agent.source}>
        {children}
      </AsWritten>
    );
  return (
    <>
      <p className="border-b border-neutral-200 pb-2 font-mono text-[11px] break-all text-muted-foreground dark:border-neutral-800">
        {agent.file}
      </p>
      {children}
    </>
  );
}

/** Why the agent's file does not read as an agent, in the parser's words: no run can start a node that names it. */
function Unread({ error }: { error: string }) {
  return (
    <div data-agent-error className="space-y-1 rounded border border-red-300 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40">
      <p className="text-sm font-medium text-red-800 dark:text-red-300">
        Does not read as an agent, so no run can start a node that names it:
      </p>
      <p className="font-mono text-xs whitespace-pre-wrap break-words text-red-800 dark:text-red-300">{error}</p>
    </div>
  );
}

/**
 * Who the agent is, at the head of its page: its face and name as a person's, the job it holds and the name a node gives it, what it is
 * for, the nodes that name it, and, for the repository's, how to start one of yours from it: the copy the api answers (`untried`).
 */
function AgentHeader({ agent, mine }: { agent: AgentListing; mine: boolean }) {
  return (
    <header className="space-y-2">
      <div className="flex items-center gap-4">
        <AgentFace name={agent.name} size={96} follows plate />
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-lg font-semibold">{personOf(agent.name)}</h1>
            <FromBadge from={agent.from} />
          </div>
          <p data-agent-role className="text-sm text-muted-foreground">
            {agent.role ?? 'No role yet'} · <span className="font-mono text-xs">agent: {agent.name}</span>
          </p>
        </div>
      </div>
      {agent.description && <p className="text-sm text-foreground">{agent.description}</p>}
      <UsedBy listing={agent} />
      {!mine && (
        <p data-read-only className="text-xs text-muted-foreground">
          The repository's agents are read here, not written: they change with the repository, in a commit.
          {agent.untried?.copy && <> To start one of yours from this one, {code(agent.untried.copy)}.</>}
        </p>
      )}
    </header>
  );
}

/**
 * Remove, asked twice: the first press asks, the second removes. The question names the agent's file and the file it names beside it, its
 * result schema (`output`), which goes with it unless another agent names it.
 */
function Remove({ agent, pending, onRemove }: { agent: AgentListing; pending: boolean; onRemove: () => void }) {
  const [asking, setAsking] = useState(false);
  const beside = [agent.keys.output].filter((file): file is string => Boolean(file));
  if (!asking)
    return (
      <Button variant="outline" className="ml-auto" onPress={() => setAsking(true)} isDisabled={pending}>
        Remove…
      </Button>
    );
  return (
    <span data-remove-asks className="ml-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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

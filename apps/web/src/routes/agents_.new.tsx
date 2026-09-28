import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AgentForm } from '../components/AgentForm';
import { AgentRefused, RouteLink } from '../components/AgentParts';
import { AgentRefusal, createAgent, keyFormQuery, type AgentDraft } from '../lib/api';
import { invalidateAgents } from '../lib/agentWrites';

/** The New agent page, at /agents/new: `agents_` draws it on its own, not inside the Agents page, which has no outlet for it. */
export const Route = createFileRoute('/agents_/new')({
  loader: ({ context }) => context.queryClient.prefetchQuery(keyFormQuery),
  component: NewAgentPage,
});

/** A new agent of yours: the form, empty, and a Create that writes `agents/<name>.md` and opens its page. */
function NewAgentPage() {
  const { data: keyForm } = useQuery(keyFormQuery);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: (draft: AgentDraft) => createAgent(draft),
    onSuccess: async (saved) => {
      await invalidateAgents(queryClient);
      await navigate({ to: '/agents/$from/$agent', params: { from: 'yours', agent: saved.agent.name } });
    },
  });
  const refused = create.error instanceof AgentRefusal ? create.error : null;

  return (
    <article className="space-y-6">
      <BackToAgents />
      <header className="space-y-1">
        <h1 className="text-base font-semibold">New agent</h1>
        <p className="text-sm text-neutral-500">
          Written to <code className="font-mono text-xs">~/.agent-workflows/workflows/agents/&lt;name&gt;.md</code>, beside your workflows.
          A node of one of them takes it with <code className="font-mono text-xs">agent: &lt;name&gt;</code>.
        </p>
      </header>
      <AgentForm
        listing={null}
        keyForm={keyForm}
        saving={create.isPending}
        refusal={create.error && <AgentRefused message={create.error.message} users={refused?.users ?? []} from="yours" />}
        onSave={(draft) => create.mutate(draft)}
      />
    </article>
  );
}

export function BackToAgents() {
  return (
    <RouteLink
      to="/agents"
      className="rounded-sm text-sm text-neutral-500 outline-none hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-ring/50 dark:hover:text-neutral-100"
    >
      ← Agents
    </RouteLink>
  );
}

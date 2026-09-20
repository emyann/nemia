import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { LinkButton } from '@/components/ui/button';
import { FromBadge, RouteLink, Skills, UsedBy } from '../components/AgentParts';
import { routeLink } from '../components/routeLink';
import { agentsQuery, type AgentListing } from '../lib/api';
import { KEY_LABELS, ROLE_KEYS } from '../lib/agents';

export const Route = createFileRoute('/agents')({
  loader: ({ context }) => context.queryClient.ensureQueryData(agentsQuery),
  component: AgentsPage,
  errorComponent: ({ error }) => (
    <p className="text-sm text-red-600">
      Could not load the agents: {error instanceof Error ? error.message : String(error)}. Is the api running (<code>npm run dev</code>)?
    </p>
  ),
});

const RouterLinkButton = routeLink(LinkButton);
const code = (text: string) => <code className="font-mono text-xs">{text}</code>;

/**
 * The agents beside the workflows: yours, which the board writes, then this repository's, which it only reads. An agent is one kind of thing
 * a workflow's node may have attached — what that node's work is told first and runs with — and each lists the nodes that name it.
 */
function AgentsPage() {
  const { data: agents } = useSuspenseQuery(agentsQuery);
  const yours = agents.filter((a) => a.from === 'yours');
  const theirs = agents.filter((a) => a.from === 'repo');

  return (
    <article className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm text-neutral-500">
          An agent is a file in the {code('agents/')} folder beside the workflows: what a node that names it ({code('agent: <name>')}) is told
          first, and how its sessions run. Yours are under {code('~/.agent-workflows/workflows/agents/')} and are edited here; this
          repository's are under {code('workflows/agents/')}, read-only. An edit changes what a later {code('wf start')} freezes, never a run
          already started.
        </p>
        <RouterLinkButton to="/agents/new" variant="outline">
          <Plus data-icon="inline-start" />
          New agent
        </RouterLinkButton>
      </div>

      <Place title="Yours" agents={yours} empty={<>None yet. New agent makes one in {code('~/.agent-workflows/workflows/agents/')}.</>} />
      <Place title="This repository" agents={theirs} empty={<>None: the repository has no {code('workflows/agents/')}.</>} />
    </article>
  );
}

function Place({ title, agents, empty }: { title: string; agents: AgentListing[]; empty: React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {agents.length ? (
        <ul className="grid gap-3 lg:grid-cols-2">
          {agents.map((agent) => (
            <li key={`${agent.from}:${agent.name}`}>
              <AgentCard agent={agent} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-neutral-500">{empty}</p>
      )}
    </section>
  );
}

/** One agent: its name, linked to its page, what it is for, what it says it can do, the keys it sets, and the nodes that name it. */
function AgentCard({ agent }: { agent: AgentListing }) {
  const set = ROLE_KEYS.filter((key) => agent.keys[key] !== undefined);
  return (
    <section
      aria-label={`Agent ${agent.name}`}
      data-agent={agent.name}
      data-from={agent.from}
      className="h-full space-y-2 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="font-mono text-sm font-semibold">
          <RouteLink
            to="/agents/$from/$agent"
            params={{ from: agent.from, agent: agent.name }}
            className="rounded-sm underline decoration-neutral-300 underline-offset-4 outline-none hover:decoration-current focus-visible:ring-2 focus-visible:ring-ring/50 dark:decoration-neutral-600"
          >
            {agent.name}
          </RouteLink>
        </h3>
        <FromBadge from={agent.from} />
      </header>
      {agent.description && <p className="text-sm text-neutral-700 dark:text-neutral-300">{agent.description}</p>}
      {agent.error === null && (
        <Skills skills={agent.skills?.list} none={<>Says nothing it can do: no {code('skills:')} file beside it.</>} />
      )}
      {agent.error !== null ? (
        <p className="font-mono text-xs break-words text-red-700 dark:text-red-400">{agent.error}</p>
      ) : (
        set.length > 0 && (
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {set.map((key) => (
              <div key={key} className="flex gap-1.5">
                <dt className="text-neutral-500">{KEY_LABELS[key].toLowerCase()}</dt>
                <dd className="font-mono text-neutral-800 dark:text-neutral-200">{agent.keys[key]}</dd>
              </div>
            ))}
          </dl>
        )
      )}
      <UsedBy listing={agent} />
    </section>
  );
}

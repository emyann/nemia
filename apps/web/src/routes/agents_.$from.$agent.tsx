import { createFileRoute } from '@tanstack/react-router';
import { BackToAgents } from '../components/agent/AgentParts';
import { AgentPage, loadAgent } from '../components/agent/AgentPage';
import { pagePlaceOf } from '../lib/factories';

/**
 * The page of an agent, at /agents/$from/$agent: `agents_` draws it on its own, not inside the Agents page, which has no outlet for it. A
 * factory's own agent, or a repository's, is read in its factory, under its path (`/factories/$factory/agents/$agent`); here the default
 * one serves it, on the repository the search names.
 */
export const Route = createFileRoute('/agents_/$from/$agent')({
  validateSearch: pagePlaceOf,
  loaderDeps: ({ search }) => ({ repo: search.repo }),
  loader: ({ context, deps, params }) => loadAgent(context.queryClient, params.from, params.agent, deps),
  component: Page,
  errorComponent: ({ error }) => (
    <div className="space-y-3">
      <BackToAgents />
      <p className="text-body-medium text-failure">Could not load this agent: {error instanceof Error ? error.message : String(error)}</p>
    </div>
  ),
});

/** The agent's page, read off its address. */
function Page() {
  const { from, agent } = Route.useParams();
  return <AgentPage from={from} name={agent} place={Route.useSearch()} />;
}

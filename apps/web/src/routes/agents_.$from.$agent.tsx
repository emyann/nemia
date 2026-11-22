import { createFileRoute } from '@tanstack/react-router';
import { DefinitionTrail } from '../components/agent/AgentParts';
import { AgentPage, loadAgent } from '../components/agent/AgentPage';
import { pagePlaceOf } from '../lib/factories';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

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
  errorComponent: Failed,
});

/** The agent's page, read off its address. */
function Page() {
  const { from, agent } = Route.useParams();
  return <AgentPage from={from} name={agent} place={Route.useSearch()} />;
}

/** That the agent could not be loaded, and why, under where its page is. */
function Failed({ error }: { error: unknown }) {
  const { agent } = Route.useParams();
  return (
    <div className="space-y-3">
      <DefinitionTrail kind="agent" name={agent} place={{ ...Route.useSearch() }} />
      <ReadTrouble what="this agent" error={error} />
    </div>
  );
}

import { createFileRoute } from '@tanstack/react-router';
import { DefinitionTrail } from '../components/agent/AgentParts';
import { AgentPage, loadAgent } from '../components/agent/AgentPage';
import { definitionSearch } from '../lib/factoryAddress';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

/**
 * The page of an agent read in a factory, at /factories/$factory/agents/$agent: the factory's own, or a repository's where the search says
 * so (`?from=repo`), on the repository it names.
 */
export const Route = createFileRoute('/factories/$factory_/agents_/$agent')({
  validateSearch: definitionSearch,
  loaderDeps: ({ search }) => ({ from: search.from ?? 'factory', repo: search.repo }),
  loader: ({ context, deps: { from, repo }, params }) =>
    loadAgent(context.queryClient, from, params.agent, { factory: params.factory, ...(repo && { repo }) }),
  component: Page,
  errorComponent: Failed,
});

/** The agent's page, read off its address. */
function Page() {
  const { factory, agent } = Route.useParams();
  const { from, repo } = Route.useSearch();
  return <AgentPage from={from ?? 'factory'} name={agent} place={{ factory, ...(repo && { repo }) }} />;
}

/** That the agent could not be loaded, and why, under where its page is. */
function Failed({ error }: { error: unknown }) {
  const { factory, agent } = Route.useParams();
  const { repo } = Route.useSearch();
  return (
    <div className="space-y-3">
      <DefinitionTrail kind="agent" name={agent} place={{ factory, ...(repo && { repo }) }} />
      <ReadTrouble what="this agent" error={error} />
    </div>
  );
}

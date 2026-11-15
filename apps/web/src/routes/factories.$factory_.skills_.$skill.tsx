import { createFileRoute } from '@tanstack/react-router';
import { BackToAgents } from '../components/agent/AgentParts';
import { SkillPage } from '../components/agent/SkillPage';
import { skillQuery } from '../lib/api/skills.ts';
import { definitionSearch } from '../lib/factoryAddress';

/**
 * The page of a skill read in a factory, at /factories/$factory/skills/$skill: the factory's own, or a repository's where the search says
 * so (`?from=repo`), on the repository it names.
 */
export const Route = createFileRoute('/factories/$factory_/skills_/$skill')({
  validateSearch: definitionSearch,
  loaderDeps: ({ search }) => ({ from: search.from ?? 'factory', repo: search.repo }),
  loader: ({ context, deps: { from, repo }, params }) =>
    context.queryClient.ensureQueryData(skillQuery(from, params.skill, { factory: params.factory, ...(repo && { repo }) })),
  component: Page,
  errorComponent: ({ error }) => (
    <div className="space-y-3">
      <BackToAgents />
      <p className="text-body-medium text-failure">Could not load this skill: {error instanceof Error ? error.message : String(error)}</p>
    </div>
  ),
});

/** The skill's page, read off its address. */
function Page() {
  const { factory, skill } = Route.useParams();
  const { from, repo } = Route.useSearch();
  return <SkillPage from={from ?? 'factory'} name={skill} place={{ factory, ...(repo && { repo }) }} />;
}

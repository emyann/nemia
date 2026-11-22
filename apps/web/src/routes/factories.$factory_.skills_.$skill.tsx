import { createFileRoute } from '@tanstack/react-router';
import { DefinitionTrail } from '../components/agent/AgentParts';
import { SkillPage } from '../components/agent/SkillPage';
import { skillQuery } from '../lib/api/skills.ts';
import { definitionSearch } from '../lib/factoryAddress';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

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
  errorComponent: Failed,
});

/** The skill's page, read off its address. */
function Page() {
  const { factory, skill } = Route.useParams();
  const { from, repo } = Route.useSearch();
  return <SkillPage from={from ?? 'factory'} name={skill} place={{ factory, ...(repo && { repo }) }} />;
}

/** That the skill could not be loaded, and why, under where its page is. */
function Failed({ error }: { error: unknown }) {
  const { factory, skill } = Route.useParams();
  const { repo } = Route.useSearch();
  return (
    <div className="space-y-3">
      <DefinitionTrail kind="skill" name={skill} place={{ factory, ...(repo && { repo }) }} />
      <ReadTrouble what="this skill" error={error} />
    </div>
  );
}

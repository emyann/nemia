import { createFileRoute } from '@tanstack/react-router';
import { DefinitionTrail } from '../components/agent/AgentParts';
import { SkillPage } from '../components/agent/SkillPage';
import { skillQuery } from '../lib/api/skills.ts';
import { pagePlaceOf } from '../lib/factories';

/**
 * The page of a skill, at /agents/skills/$from/$skill: `agents_` draws it on its own, not inside the Agents page, which has no outlet for
 * it. A factory's own skill, or a repository's, is read in its factory, under its path (`/factories/$factory/skills/$skill`); here the
 * default one serves it, on the repository the search names.
 */
export const Route = createFileRoute('/agents_/skills/$from/$skill')({
  validateSearch: pagePlaceOf,
  loaderDeps: ({ search }) => ({ repo: search.repo }),
  loader: ({ context, deps, params }) => context.queryClient.ensureQueryData(skillQuery(params.from, params.skill, deps)),
  component: Page,
  errorComponent: Failed,
});

/** The skill's page, read off its address. */
function Page() {
  const { from, skill } = Route.useParams();
  return <SkillPage from={from} name={skill} place={Route.useSearch()} />;
}

/** That the skill could not be loaded, and why, under where its page is. */
function Failed({ error }: { error: unknown }) {
  const { skill } = Route.useParams();
  return (
    <div className="space-y-3">
      <DefinitionTrail kind="skill" name={skill} place={{ ...Route.useSearch() }} />
      <p className="text-body-medium text-failure">Could not load this skill: {error instanceof Error ? error.message : String(error)}</p>
    </div>
  );
}

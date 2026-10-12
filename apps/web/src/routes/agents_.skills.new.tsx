import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { SkillRefused } from '../components/AgentParts';
import { SkillForm } from '../components/SkillForm';
import { createSkill, storeQuery, type SkillDraft } from '../lib/api';
import { invalidateSkills } from '../lib/agentWrites';
import { BackToAgents } from './agents_.new';

/** The New skill page, at /agents/skills/new: `agents_` draws it on its own, not inside the Agents page, which has no outlet for it. */
export const Route = createFileRoute('/agents_/skills/new')({
  loader: ({ context }) => context.queryClient.ensureQueryData(storeQuery),
  component: NewSkillPage,
});

/** A new skill of yours: the form, empty, and a Create that writes `skills/<name>/SKILL.md` in your library and opens its page. */
function NewSkillPage() {
  const { data: store } = useSuspenseQuery(storeQuery);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: (draft: SkillDraft) => createSkill(draft),
    onSuccess: async (saved) => {
      await invalidateSkills(queryClient);
      await navigate({ to: '/agents/skills/$from/$skill', params: { from: 'yours', skill: saved.skill.name } });
    },
  });

  return (
    <article className="space-y-6">
      <BackToAgents />
      <header className="space-y-1">
        <h1 className="text-base font-semibold">New skill</h1>
        <p className="text-sm text-muted-foreground">
          Written to <code className="font-mono text-xs">{store.skills}/&lt;name&gt;/SKILL.md</code>, your library. An agent of yours gives
          it by its name, from its page's skills.
        </p>
      </header>
      <SkillForm
        detail={null}
        saving={create.isPending}
        refusal={create.error && <SkillRefused message={create.error.message} />}
        onSave={(draft) => create.mutate(draft)}
      />
    </article>
  );
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { SkillRefused } from '../components/AgentParts';
import { SkillForm } from '../components/SkillForm';
import { createSkill, type SkillDraft } from '../lib/api';
import { invalidateSkills } from '../lib/agentWrites';
import { BackToAgents } from './agents_.new';

// `agents_`: at /agents/skills/new, and not drawn inside the Agents page, which has no outlet for it.
export const Route = createFileRoute('/agents_/skills/new')({
  component: NewSkillPage,
});

/** A new skill of yours: the form, empty, and a Create that writes `skills/<name>/SKILL.md` in your library and opens its page. */
function NewSkillPage() {
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
        <p className="text-sm text-neutral-500">
          Written to <code className="font-mono text-xs">~/.agent-workflows/workflows/skills/&lt;name&gt;/SKILL.md</code>, your library. An agent
          of yours gives it by its name, from its page's skills.
        </p>
      </header>
      <SkillForm detail={null} saving={create.isPending} refusal={create.error && <SkillRefused message={create.error.message} />} onSave={(draft) => create.mutate(draft)} />
    </article>
  );
}

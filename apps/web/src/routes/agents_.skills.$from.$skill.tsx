import { useId } from 'react';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Switch } from '@/components/ui/switch';
import { AgentLink, SkillRefused, SkillSourceBadge } from '../components/AgentParts';
import { SkillForm } from '../components/SkillForm';
import { saveSkill, skillQuery, switchPreload, type SkillDetail, type SkillDraft } from '../lib/api';
import { costWords, preloadWords, reachWords } from '../lib/skills';
import { invalidateSkills } from '../lib/agentWrites';
import { BackToAgents } from './agents_.new';

// `agents_`: at /agents/skills/$from/$skill, and not drawn inside the Agents page, which has no outlet for it.
export const Route = createFileRoute('/agents_/skills/$from/$skill')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(skillQuery(params.from, params.skill)),
  component: SkillPage,
  errorComponent: ({ error }) => (
    <div className="space-y-3">
      <BackToAgents />
      <p className="text-sm text-red-600">Could not load this skill: {error instanceof Error ? error.message : String(error)}</p>
    </div>
  ),
});

const code = (text: string) => <code className="font-mono text-xs break-all">{text}</code>;

/**
 * One skill: the agents that give it, each linked; what it costs a turn and the switch that loads it every turn; and its form — to edit, when
 * it is yours; to read, when it is the repository's or one HKB ships, which the board does not write. Save and the switch each write it back
 * against the version it was read at, and each changes every agent that gives it.
 */
function SkillPage() {
  const { from, skill: name } = Route.useParams();
  const { data: detail } = useSuspenseQuery(skillQuery(from, name));
  const queryClient = useQueryClient();
  const mine = detail.skill.from === 'yours';

  const save = useMutation({
    mutationFn: (draft: SkillDraft) => saveSkill(detail.skill.name, detail.version, draft),
    onSuccess: () => invalidateSkills(queryClient),
  });
  const toggle = useMutation({
    mutationFn: (on: boolean) => switchPreload(detail.skill.name, detail.version, on),
    onSuccess: () => invalidateSkills(queryClient),
  });
  const error = save.error ?? toggle.error;
  const { skill } = detail;

  return (
    <article className="space-y-6">
      <BackToAgents />

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-mono text-base font-semibold">{skill.name}</h1>
          <span className="text-xs text-neutral-500">a skill</span>
          <SkillSourceBadge from={skill.from} />
        </div>
        {skill.entry && (
          <p className="text-sm text-neutral-700 dark:text-neutral-300">
            {skill.entry.name !== skill.name && <span className="font-medium">{skill.entry.name}. </span>}
            {skill.entry.description}
          </p>
        )}
        <GivenBy detail={detail} />
        <Elsewhere detail={detail} />
      </header>

      {skill.error !== null && (
        <div data-skill-error className="space-y-1 rounded border border-red-300 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">Does not read as a skill, so no agent can be given it:</p>
          <p className="font-mono text-xs whitespace-pre-wrap break-words text-red-800 dark:text-red-300">{skill.error}</p>
        </div>
      )}

      <p className="border-b border-neutral-200 pb-2 font-mono text-[11px] break-all text-neutral-500 dark:border-neutral-800">{skill.dir}/SKILL.md</p>
      <SkillForm
        // A new version is a new form: what was saved or switched, as it now reads.
        key={detail.version}
        detail={detail}
        readOnly={!mine}
        saving={save.isPending || toggle.isPending}
        refusal={error && <SkillRefused message={error.message} />}
        onSave={(draft) => {
          toggle.reset();
          save.mutate(draft);
        }}
        between={(changed) => (
          <Preload
            detail={detail}
            pending={toggle.isPending || save.isPending}
            changed={changed}
            onSwitch={(on) => {
              save.reset();
              toggle.mutate(on);
            }}
          />
        )}
      />
    </article>
  );
}

/** The agents that give this very skill, each linked, or that none does. */
function GivenBy({ detail }: { detail: SkillDetail }) {
  return (
    <p data-skill-users className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-neutral-500">
      {detail.users.length ? (
        <>
          <span>Given by</span>
          {detail.users.map((user, i) => (
            <span key={`${user.from}:${user.name}`}>
              <AgentLink from={user.from} name={user.name} className="text-xs text-neutral-700 dark:text-neutral-300" />
              {user.from === 'repo' && <span className="text-neutral-400"> (this repository)</span>}
              {i < detail.users.length - 1 && ','}
            </span>
          ))}
        </>
      ) : (
        <span>No agent gives it yet.</span>
      )}
    </p>
  );
}

/** Where else it could be, and the command that takes it there: the board writes your library alone, never a checkout. */
function Elsewhere({ detail }: { detail: SkillDetail }) {
  const { from } = detail.skill;
  return (
    <p data-copy-hint className="text-xs text-neutral-500">
      {from === 'yours' && detail.copyHint && (
        <>For this repository's agents to be given it, copy it into the repository by hand — the board writes no checkout — and commit it: {code(detail.copyHint)}.</>
      )}
      {from === 'repo' && detail.copyHint && (
        <>The repository's skills are read here, not written: they change with the repository, in a commit. To make one of yours from it, {code(detail.copyHint)}.</>
      )}
      {from === 'shipped' && <>Shipped with HKB, and read here: an agent of yours is given a copy in your library, made from its page's skills.</>}
    </p>
  );
}

/**
 * The switch that loads it every turn (`preload: true`), what a turn carries either way, and whom it changes: every agent that gives it. It
 * writes the file as it is on disk, so it waits while the form holds unsaved words; the repository's and HKB's are shown, not switched.
 */
function Preload({ detail, pending, changed, onSwitch }: { detail: SkillDetail; pending: boolean; changed: boolean; onSwitch: (on: boolean) => void }) {
  const id = useId();
  const { skill } = detail;
  const mine = skill.from === 'yours';
  return (
    <fieldset data-preload className="space-y-2 rounded border border-neutral-200 px-3 py-3 dark:border-neutral-800">
      <legend className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Every turn, or when needed</legend>
      <div className="flex items-center gap-2 text-sm">
        <Switch id={id} isSelected={skill.preload} onChange={onSwitch} isDisabled={!mine || changed || pending} />
        <label htmlFor={id} className={mine && !changed && !pending ? 'cursor-pointer' : 'text-neutral-500'}>
          Load it every turn <code className="font-mono text-xs text-neutral-500">(preload: true)</code>
        </label>
      </div>
      {skill.cost && (
        <>
          <p data-skill-cost className="text-xs text-neutral-700 dark:text-neutral-300">Now: {costWords(skill.cost)}.</p>
          <p className="text-xs text-muted-foreground">{preloadWords(skill.cost)}</p>
        </>
      )}
      <p data-skill-reach className="text-xs text-muted-foreground">{reachWords(detail.users)}</p>
      {mine && changed && <p className="text-xs text-amber-700 dark:text-amber-400">Save or discard the changes below first: the switch writes the file as it is on disk.</p>}
    </fieldset>
  );
}

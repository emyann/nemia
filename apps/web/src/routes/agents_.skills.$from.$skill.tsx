import { useId, useState } from 'react';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { AgentLink, SkillRefused, SkillSourceBadge } from '../components/AgentParts';
import { SkillForm } from '../components/SkillForm';
import { saveSkill, SkillRefusal, skillQuery, switchPreload, type SkillDetail, type SkillDraft, type SkillSaved } from '../lib/api';
import { costWords, drawnSkill, preloadWords, reachWords } from '../lib/skills';
import { invalidateSkills } from '../lib/agentWrites';
import { BackToAgents } from './agents_.new';

/**
 * The page of a skill, at /agents/skills/$from/$skill: `agents_` draws it on its own, not inside the Agents page, which has no outlet for
 * it.
 */
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
 * One skill: the agents that give it, each linked; what it costs a turn and the switch that loads it every turn; and its form — to edit,
 * when it is yours; to read, when it is the repository's or one Nemia ships, which the board does not write. Save and the switch each write
 * it back against the version it was read at, and each changes every agent that gives it.
 *
 * The form is drawn from the skill as read, but for a file that moved under unsaved words (`drawnSkill`), and drawn anew under each new
 * version a save or the switch brings. A write of the page is read back at once as the form's own, so its words do not read as unsaved. A
 * write refused as stale reads the skill again: a form with unsaved words keeps them and says the file moved; one without shows the file as
 * it now reads, and says beside the refusal that it has been read again since.
 */
function SkillPage() {
  const { from, skill: name } = Route.useParams();
  const { data: detail } = useSuspenseQuery(skillQuery(from, name));
  const queryClient = useQueryClient();
  const mine = detail.skill.from === 'yours';
  const [changed, setChanged] = useState(false);
  const [drawn, setDrawn] = useState(detail);
  const shown = drawnSkill(drawn, detail, changed);
  if (shown !== drawn) setDrawn(shown);
  const moved = shown.version !== detail.version;

  const wroteIt = async ({ written: _, ...now }: SkillSaved) => {
    queryClient.setQueryData(skillQuery(from, name).queryKey, now);
    setDrawn(now);
    await invalidateSkills(queryClient);
  };
  const readAgainIfStale = (err: Error) => (err instanceof SkillRefusal && err.status === 409 ? invalidateSkills(queryClient) : undefined);
  const save = useMutation({
    mutationFn: ({ draft, version }: { draft: SkillDraft; version: string }) => saveSkill(name, version, draft),
    onSuccess: wroteIt,
    onError: readAgainIfStale,
  });
  const toggle = useMutation({
    mutationFn: ({ on, version }: { on: boolean; version: string }) => switchPreload(name, version, on),
    onSuccess: wroteIt,
    onError: readAgainIfStale,
  });
  const error = save.error ?? toggle.error;
  const refusedAt = save.error ? save.variables?.version : toggle.variables?.version;
  const readPast = error instanceof SkillRefusal && error.status === 409 && !moved && refusedAt !== detail.version;
  const { skill } = detail;

  return (
    <article className="space-y-6">
      <BackToAgents />

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-mono text-base font-semibold">{skill.name}</h1>
          <span className="text-xs text-muted-foreground">a skill</span>
          <SkillSourceBadge from={skill.from} />
        </div>
        {skill.entry && (
          <p className="text-sm text-foreground">
            {skill.entry.name !== skill.name && <span className="font-medium">{skill.entry.name}. </span>}
            {skill.entry.description}
          </p>
        )}
        <GivenBy detail={detail} />
        <Elsewhere detail={detail} />
      </header>

      {skill.error !== null && (
        <div
          data-skill-error
          className="space-y-1 rounded border border-red-300 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40"
        >
          <p className="text-sm font-medium text-red-800 dark:text-red-300">Does not read as a skill, so no agent can be given it:</p>
          <p className="font-mono text-xs whitespace-pre-wrap break-words text-red-800 dark:text-red-300">{skill.error}</p>
        </div>
      )}

      <p className="border-b border-neutral-200 pb-2 font-mono text-[11px] break-all text-muted-foreground dark:border-neutral-800">
        {skill.dir}/SKILL.md
      </p>
      <SkillForm
        key={shown.version}
        detail={shown}
        readOnly={!mine}
        saving={save.isPending || toggle.isPending}
        onChanged={setChanged}
        refusal={
          (error || moved) && (
            <>
              {error && <SkillRefused message={error.message} />}
              {moved ? (
                <Moved
                  file={`skills/${skill.name}/SKILL.md`}
                  onReadAgain={() => {
                    save.reset();
                    toggle.reset();
                    setDrawn(detail);
                  }}
                />
              ) : (
                readPast && (
                  <p data-skill-read-again className="text-xs text-muted-foreground">
                    It has been read again since: the page shows it as it now reads.
                  </p>
                )
              )}
            </>
          )
        }
        onSave={(draft) => {
          toggle.reset();
          save.mutate({ draft, version: shown.version });
        }}
        between={(changed) => (
          <Preload
            detail={shown}
            pending={toggle.isPending || save.isPending}
            changed={changed}
            onSwitch={(on) => {
              save.reset();
              toggle.mutate({ on, version: shown.version });
            }}
          />
        )}
      />
    </article>
  );
}

/**
 * The file changed since the form was drawn — by hand, or from another page — while it holds unsaved words. A save of the form would be
 * refused, so nothing is written over the change; reading it again draws the form from the file as it now reads, and drops the words.
 */
function Moved({ file, onReadAgain }: { file: string; onReadAgain: () => void }) {
  return (
    <div
      data-skill-moved
      className="flex flex-wrap items-center gap-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/40"
    >
      <p className="min-w-0 flex-1 text-sm text-amber-900 dark:text-amber-200">
        {file} has changed since this form was drawn, so a save of it would write over that change and is refused. What you typed stays here
        until you read it again, which draws the form from the file as it now reads and drops it: copy out what you want to keep first.
      </p>
      <Button variant="outline" onPress={onReadAgain}>
        Read it again
      </Button>
    </div>
  );
}

/** The agents that give this very skill, each linked, or that none does. */
function GivenBy({ detail }: { detail: SkillDetail }) {
  return (
    <p data-skill-users className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-muted-foreground">
      {detail.users.length ? (
        <>
          <span>Given by</span>
          {detail.users.map((user, i) => (
            <span key={`${user.from}:${user.name}`}>
              <AgentLink from={user.from} name={user.name} className="text-xs text-foreground" />
              {user.from === 'repo' && <span className="text-muted-foreground"> (this repository)</span>}
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
    <p data-copy-hint className="text-xs text-muted-foreground">
      {from === 'yours' && detail.copyHint && (
        <>
          For this repository's agents to be given it, copy it into the repository by hand — the board writes no checkout — and commit it:{' '}
          {code(detail.copyHint)}.
        </>
      )}
      {from === 'repo' && detail.copyHint && (
        <>
          The repository's skills are read here, not written: they change with the repository, in a commit. To make one of yours from it,{' '}
          {code(detail.copyHint)}.
        </>
      )}
      {from === 'shipped' && (
        <>Shipped with Nemia, and read here: an agent of yours is given a copy in your library, made from its page's skills.</>
      )}
    </p>
  );
}

/**
 * The switch that loads it every turn (`preload: true`), what a turn carries either way, and whom it changes: every agent that gives it. It
 * writes the file as it is on disk, so it waits while the form holds unsaved words; the repository's and Nemia's are shown, not switched.
 */
function Preload({
  detail,
  pending,
  changed,
  onSwitch,
}: {
  detail: SkillDetail;
  pending: boolean;
  changed: boolean;
  onSwitch: (on: boolean) => void;
}) {
  const id = useId();
  const { skill } = detail;
  const mine = skill.from === 'yours';
  return (
    <fieldset data-preload className="space-y-2 rounded border border-neutral-200 px-3 py-3 dark:border-neutral-800">
      <legend className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Every turn, or when needed</legend>
      <div className="flex items-center gap-2 text-sm">
        <Switch id={id} isSelected={skill.preload} onChange={onSwitch} isDisabled={!mine || changed || pending} />
        <label htmlFor={id} className={mine && !changed && !pending ? 'cursor-pointer' : 'text-muted-foreground'}>
          Load it every turn <code className="font-mono text-xs text-muted-foreground">(preload: true)</code>
        </label>
      </div>
      {skill.cost && (
        <>
          <p data-skill-cost className="text-xs text-foreground">
            Now: {costWords(skill.cost)}.
          </p>
          <p className="text-xs text-muted-foreground">{preloadWords(skill.cost)}</p>
        </>
      )}
      <p data-skill-reach className="text-xs text-muted-foreground">
        {reachWords(detail.users)}
      </p>
      {mine && changed && (
        <p className="text-xs text-yours">Save or discard the changes below first: the switch writes the file as it is on disk.</p>
      )}
    </fieldset>
  );
}

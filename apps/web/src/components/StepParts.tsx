/**
 * The parts of a step's page that say what a run of it will be told, read now: its agent, hired by the factory picked or named by its
 * file; the layers, each beside where it is edited; and its newest runs, each linked to what that run was told. And the way back from a
 * run's step to this page (`StepPageLink`).
 */
import { Badge } from '@/components/ui/badge';
import type { PagePlace, WorkflowPageAddress, WorkflowStepPage } from '../lib/api';
import { stepAnchor } from '../lib/asks';
import { SOURCE_BADGES } from '../lib/skills';
import { titleOf } from '../lib/factory';
import { placeOfAddress } from '../lib/factories';
import { clockWord } from '../lib/quota';
import { useNow } from '../lib/useNow';
import { cn } from '../lib/utils';
import { AgentLink, RouteLink, SkillLink } from './AgentParts';
import { AsWritten, KeyTable } from './FilePage';
import { FactoryTag } from './FactoryTag';
import { Markdown } from './Markdown';
import { Told, type LayerHomes } from './Told';

const LINK =
  'rounded-sm underline decoration-outline underline-offset-2 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/50';

/**
 * The step's agent: the one the factory picked hires into it, marked as hired (`data-hired`); else the one its file names, or that it names
 * none, and with no factory picked, each factory that hires into the step, linked to this page in that factory (`data-hired-in`).
 */
export function StepAgent({ page }: { page: WorkflowStepPage }) {
  const { from, workflow, step, factory, hired, hiredIn } = page;
  if (factory && hired) {
    return (
      <p data-step-agent className="text-body-small leading-6 text-muted-foreground">
        Its agent: <AgentLink from={from} name={hired} className="text-foreground" />{' '}
        <Badge variant="outline" data-hired={factory}>
          hired by {factory}
        </Badge>
        , whose instructions it is told first.
      </p>
    );
  }
  const named = page.keys.find((row) => row.key === 'agent')?.value ?? null;
  return (
    <div className="space-y-1">
      <p data-step-agent className="text-body-small text-muted-foreground">
        {named ? (
          <>
            Its agent: <AgentLink from={from} name={named} className="text-foreground" />, named by its file, whose instructions it is told
            first.
          </>
        ) : (
          'Its file names no agent.'
        )}
      </p>
      {!factory && hiredIn.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-body-small text-muted-foreground">
          Hired into this step by:
          {hiredIn.map((hire) => (
            <RouteLink
              key={hire.factory}
              to="/workflows/$from/$workflow/$step"
              params={{ from, workflow, step }}
              search={{ factory: hire.factory }}
              data-hired-in={hire.factory}
              className={cn('text-foreground', LINK)}
            >
              {hire.factory}
              <span className="text-muted-foreground"> ({hire.agent})</span>
            </RouteLink>
          ))}
        </p>
      )}
    </div>
  );
}

/**
 * Where each layer of the step lives, for `Told`: the agent's file, on its page; your custom instructions, on the agent's page too; the
 * factory's rules, on the Settings of the factory the page is read in, null where it is read in none; the step's own file, edited in its
 * workflow's builder for one of yours and named by its path for the repository's; and each skill's page, where the api found it, or
 * for one with no page that the repository has, a skill named with its folder, its name as written and that it is the repository's.
 * `place` is the factory and repository the page is read in, kept on the way to the builder.
 */
export function homesOf(page: WorkflowStepPage, place: PagePlace): LayerHomes {
  const agent = page.layers.agent;
  const file = `${page.dir}/${page.step}.md`;
  return {
    instructions: agent && (
      <>
        lives in <AgentLink from={page.from} name={agent} />
        's file
      </>
    ),
    custom: agent && (
      <>
        written on{' '}
        <RouteLink
          to="/agents/$from/$agent"
          params={{ from: page.from, agent }}
          hash="custom-instructions"
          data-home-link="custom"
          className={cn('font-mono', LINK)}
        >
          {agent}'s page
        </RouteLink>
      </>
    ),
    factory: agent && page.factory && (
      <>
        written on{' '}
        <RouteLink to="/factories/$factory/settings" params={{ factory: page.factory }} data-home-link="factory" className={LINK}>
          {page.factory}'s Settings
        </RouteLink>
      </>
    ),
    words:
      page.from === 'yours' ? (
        <>
          lives in its file, edited in{' '}
          <RouteLink
            to="/workflows/$from/$workflow"
            params={{ from: page.from, workflow: page.workflow }}
            search={{ ...place, build: true }}
            data-home-link="words"
            className={LINK}
          >
            the workflow's builder
          </RouteLink>
        </>
      ) : (
        <>
          lives in <code className="font-mono">{file}</code>
        </>
      ),
    skill: (name) => {
      const found = page.skillsFrom.find((skill) => skill.name === name);
      if (found?.from) return <SkillLink from={found.from} name={name} />;
      if (!found?.foundIn) return name;
      return (
        <span data-skill-found-in={found.foundIn} title={found.foundIn}>
          {name} <span className="text-muted-foreground">· {SOURCE_BADGES.repo}</span>
        </span>
      );
    },
  };
}

/**
 * The step's file: its own words, rendered — the policy, never the agent's words the loader fills its body with — and every key as the
 * loader reads them, the `agent` row the hire's where the factory picked hires one; or, with Source, the file as written.
 */
export function StepWritten({ page }: { page: WorkflowStepPage }) {
  return (
    <AsWritten file={`${page.dir}/${page.step}.md`} source={page.source}>
      <Markdown className="text-body-medium">{page.layers.policy}</Markdown>
      <KeyTable
        rows={page.keys}
        note={
          <>
            As the loader reads them, which a run freezes as it starts: <code>after</code> names the step <code>resume</code> names, and a
            loop that sets no <code>rounds</code> runs 3.
            {page.factory && page.hired && (
              <span data-hired-row>
                {' '}
                In {page.factory}, <code>agent</code> is its hire, not the file's.
              </span>
            )}{' '}
            Source shows what the file says.
          </>
        }
      />
    </AsWritten>
  );
}

/** What a run of the step will be told, read now: the layers, each beside where it lives (`homesOf`). */
export function StepTold({ page, place }: { page: WorkflowStepPage; place: PagePlace }) {
  return <Told told={null} layers={page.layers} filed={false} homes={homesOf(page, place)} />;
}

/**
 * The step's newest runs, in the factory picked: each by its title, its time and its factory, linked to the step on its run's page, where
 * what it was told is read — or that the run has not reached the step yet; or that no run holds the step yet.
 */
export function RecentRuns({ page }: { page: WorkflowStepPage }) {
  const now = new Date(useNow(60_000));
  return (
    <section aria-label="Recent runs" data-recent-runs className="space-y-2">
      <h2 className="text-label-medium text-muted-foreground uppercase">Recent runs</h2>
      {page.recentRuns.length === 0 ? (
        <p className="text-body-medium text-muted-foreground">No run holds this step yet{page.factory ? ` in ${page.factory}` : ''}.</p>
      ) : (
        <ul className="space-y-1.5">
          {page.recentRuns.map((run) => (
            <li key={run.id} data-recent-run={run.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-medium">
              <RouteLink to="/runs/$runId" params={{ runId: run.id }} hash={stepAnchor(page.step)} className={cn('min-w-0 truncate', LINK)}>
                {titleOf(run)}
              </RouteLink>
              <span className="text-body-small text-muted-foreground">{clockWord(new Date(run.createdAt), now)}</span>
              {run.factory && <FactoryTag name={run.factory} />}
              <span className="text-body-small text-muted-foreground">{run.filed ? 'What it was told' : 'not reached yet'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The way from a run's step to the step's own page, in the run's place: what a run of it will be told now. Nothing for a run whose
 * workflow the board pages on no address (`page` null).
 */
export function StepPageLink({ page, step }: { page: WorkflowPageAddress | null; step: string }) {
  if (!page) return null;
  return (
    <RouteLink
      to="/workflows/$from/$workflow/$step"
      params={{ from: page.from, workflow: page.workflow, step }}
      search={placeOfAddress(page)}
      data-step-page-link={step}
      className="text-body-small text-muted-foreground hover:text-foreground"
    >
      What it will be told now →
    </RouteLink>
  );
}

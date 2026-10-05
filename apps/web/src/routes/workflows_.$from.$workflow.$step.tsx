import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AgentLink, Skills } from '../components/AgentParts';
import { AsWritten, KeyTable } from '../components/FilePage';
import { Markdown } from '../components/Markdown';
import { stepQuery } from '../lib/api';

/**
 * The page of a workflow's step, at /workflows/$from/$workflow/$step: `workflows_` draws it on its own, not inside the Workflows page,
 * which has no outlet for it.
 */
export const Route = createFileRoute('/workflows_/$from/$workflow/$step')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(stepQuery(params.from, params.workflow, params.step)),
  component: StepPage,
  errorComponent: ({ error }) => (
    <div className="space-y-3">
      <BackToWorkflows />
      <p className="text-sm text-red-600">Could not load this step: {error instanceof Error ? error.message : String(error)}</p>
    </div>
  ),
});

/**
 * One step of a workflow, to read: what it is told, rendered; the agent attached to it, if one is, read from the `agents/` beside its
 * workflow and linked to its page in the step's own place, with what that agent says it can do (`skills:`), a description of the work that
 * fences nothing; then every key a step may set with its value and what it means — or, with Source, its file as written. It starts nothing:
 * the Workflows page does.
 */
function StepPage() {
  const { from, workflow, step } = Route.useParams();
  const { data: page } = useSuspenseQuery(stepQuery(from, workflow, step));
  const agent = page.keys.find((row) => row.key === 'agent')?.value ?? null;

  return (
    <article className="space-y-6">
      <BackToWorkflows />

      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-mono text-base font-semibold">{page.step}</h1>
          <span className="text-xs text-neutral-500">
            a step of <span className="font-mono text-neutral-700 dark:text-neutral-300">{page.workflow}</span>
          </span>
          <span
            data-from={page.from}
            className={`rounded-full px-2 py-0.5 text-[11px] leading-none font-medium ${
              page.from === 'yours'
                ? 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300'
                : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
            }`}
          >
            {page.from === 'yours' ? 'yours' : 'this repository'}
          </span>
        </div>
        {agent && (
          <div className="space-y-1">
            <p data-step-agent className="text-xs text-neutral-500">
              Its agent: <AgentLink from={page.from} name={agent} className="text-neutral-700 dark:text-neutral-300" />, whose instructions
              it is told first.
            </p>
            <Skills skills={page.agentSkills} className="pl-3" />
          </div>
        )}
      </header>

      <AsWritten file={`${page.dir}/${page.step}.md`} source={page.source}>
        <Markdown className="text-sm">{page.body}</Markdown>
        <KeyTable
          rows={page.keys}
          note={
            <>
              As the loader reads them, which a run freezes as it starts: <code>after</code> names the step <code>resume</code> names, and a
              loop that sets no <code>rounds</code> runs 3. Source shows what the file says.
            </>
          }
        />
      </AsWritten>
    </article>
  );
}

function BackToWorkflows() {
  return (
    <Link to="/workflows" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
      ← Workflows
    </Link>
  );
}

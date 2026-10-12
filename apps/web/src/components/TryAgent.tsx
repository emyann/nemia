import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { runGone, runQuery, runsQuery, tryAgent, type AgentListing, type RunSummary } from '../lib/api';
import { latestTryOf, TRY_FENCE, TRY_TERMS, tryHeld, tryStatusWord } from '../lib/agents';
import { costText } from '../lib/cost';
import { AgentRefused, RouteLink } from './AgentParts';
import { Artifacts } from './Artifacts';
import { CopyButton } from './CopyButton';
import { StatusChip } from './StatusChip';
import { runsMoved } from '@/lib/runWrites';

const code = (text: string) => <code className="font-mono text-xs break-all">{text}</code>;

/**
 * An agent of yours tried on a short brief: the fence said in one line, the brief and the button, and the latest try of it — its state,
 * what it spent of its dollar, the files it wrote and a link to its run. The api starts one try of an agent at a time, as an ordinary
 * folder run of the store's hidden `tries/<agent>` team, and the button is held while one moves, with the reason beside it.
 */
export function TryAgent({ agent }: { agent: AgentListing }) {
  if (agent.untried) return <Untried untried={agent.untried} />;
  return <TryForm agent={agent} />;
}

/**
 * The brief, the button and the try shown: the one this page started, before the list read again has it, else the agent's latest. A start
 * reads the list of runs again alone (`exact`): a prefix would reach every run's decision, which is keyed by the run's state.
 */
function TryForm({ agent }: { agent: AgentListing }) {
  const queryClient = useQueryClient();
  const [brief, setBrief] = useState('');
  const [started, setStarted] = useState<string | null>(null);
  const { data: runs } = useQuery(runsQuery);
  const latest = latestTryOf(runs ?? [], agent.name);
  const shown = started ?? latest?.id ?? null;
  const field = useId();
  const start = useMutation({
    mutationFn: (asked: string) => tryAgent(agent.name, asked),
    onSuccess: (tried) => {
      setBrief('');
      setStarted(tried.id);
      void runsMoved(queryClient);
    },
  });
  const held = tryHeld(brief, latest);

  return (
    <section aria-label="Try it" data-try-agent className="space-y-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Try it</h2>
        <p data-try-fence className="text-xs text-neutral-600 dark:text-neutral-400">
          {TRY_FENCE}: {TRY_TERMS}.
        </p>
      </div>
      <form
        aria-label={`Try ${agent.name}`}
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!held) start.mutate(brief);
        }}
      >
        <label htmlFor={field} className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
          Brief
        </label>
        <textarea
          id={field}
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          rows={3}
          placeholder="A short brief to try it on: what it is told, in a folder of its own."
          className="block w-full resize-y rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:placeholder:text-neutral-500 dark:focus:border-neutral-400"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={held !== null || start.isPending}
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 dark:disabled:hover:bg-neutral-100"
          >
            {start.isPending ? 'Starting…' : 'Try it'}
          </button>
          {held && (
            <span data-try-held className="text-xs text-neutral-500">
              {held}
            </span>
          )}
        </div>
        {start.isError && <AgentRefused message={start.error.message} users={[]} from="yours" verb="Not started" />}
      </form>
      {shown && <TryRun id={shown} listed={runs?.find((run) => run.id === shown)} />}
    </section>
  );
}

/**
 * One try, as its run reads: the state, what it spent of its budget, the files its folder holds, and its run's page. `listed` is its row on
 * the list of runs, which says what stopped a failed try (`tryStatusWord`); undefined before the list has it.
 */
export function TryRun({ id, listed }: { id: string; listed?: RunSummary }) {
  const { data: run, error } = useQuery(runQuery(id));
  const link = (
    <RouteLink to="/runs/$runId" params={{ runId: id }} data-try-run={id} className="font-mono text-xs underline underline-offset-2">
      {id}
    </RouteLink>
  );
  if (runGone(error)) {
    return (
      <p data-try-gone className="text-xs text-neutral-500">
        The try {code(id)} was removed.
      </p>
    );
  }
  if (!run)
    return (
      <p className="text-xs text-neutral-500">
        {error instanceof Error ? `Could not read the try ${id}: ${error.message}` : 'Reading the try…'}
      </p>
    );
  const step = run.steps[0];
  const spent = step ? costText(step) : null;
  return (
    <div data-try={id} className="space-y-2 rounded border border-neutral-200 px-3 py-2 dark:border-neutral-800">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400">
        <span>The latest try, {link}:</span>
        {step && <StatusChip status={step.status} runCancelled={run.cancelledAt !== null} runHeld={run.holding != null} />}
        <span data-try-status>{tryStatusWord(run.status, listed)}</span>
        {spent && (
          <span data-try-spent>
            spent <span className="font-mono">{spent}</span>
          </span>
        )}
      </p>
      {step && step.taskId !== null ? (
        <div data-try-files className="text-xs text-neutral-500">
          {step.filesError === null ? (
            <>
              Files it wrote:
              <Artifacts artifacts={step.files} size none="the folder is empty" />
            </>
          ) : (
            <span data-files-error>{step.filesError}</span>
          )}
        </div>
      ) : (
        <p className="text-xs text-neutral-500">Not filed yet: nothing is filed until the daemon&apos;s next pass.</p>
      )}
    </div>
  );
}

/**
 * What an agent's page says in place of the Try panel when it cannot be tried: why, in the api's words (`untried`, which its try's route
 * refuses with), and the command that copies it to yours when that is the fix — into the store the api reads, which the api names.
 */
function Untried({ untried, yours = false }: { untried: NonNullable<AgentListing['untried']>; yours?: boolean }) {
  return (
    <section
      aria-label="Try it"
      data-try-yours={yours ? '' : undefined}
      data-try-untried
      className="space-y-1 border-t border-neutral-200 pt-4 dark:border-neutral-800"
    >
      <h2 className="text-sm font-semibold">Try it</h2>
      <p className="text-xs text-neutral-600 dark:text-neutral-400">{untried.why}</p>
      {untried.copy && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
          {code(untried.copy)}
          <CopyButton text={untried.copy} />
        </p>
      )}
    </section>
  );
}

/**
 * What a repository agent's page says in place of the Try panel: only yours are tried, and the copy, from the api, that makes one of yours.
 */
export function TryYours({ agent }: { agent: AgentListing }) {
  return (
    <Untried yours untried={agent.untried ?? { why: 'Only an agent of yours can be tried. Copy it to yours to try it.', copy: null }} />
  );
}

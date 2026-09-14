import type { RunDetail } from '../lib/api';
import { needsOf, needText, unblockCommands } from '../lib/asks';
import { CopyButton } from './Decide';

/**
 * The banner at the top of a run's page: who the run waits on, in the package's words, and what each step needs — its question, or that
 * the harness blocked its session, with what the session said last. For a session the harness blocked, the board says plainly that it
 * cannot continue it, and gives the two commands that can: nothing on the page asks for a try the package refuses.
 */
export function NeedsBanner({ run }: { run: RunDetail }) {
  const needs = needsOf(run);
  if (!run.waitingOnYou.length && !needs.length) return null;
  return (
    <section aria-label="Waiting on you" className="space-y-1.5 rounded bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      {run.waitingOnYou.length > 0 && (
        <p>
          Waiting on you: <strong>{run.waitingOnYou.join(', ')}</strong> — signed off blocked, unsigned, refused by its check, or out of
          rounds —{' '}<code>wf decide {run.id}</code>
        </p>
      )}
      {needs.length > 0 && (
        <ul className="space-y-2">
          {needs.map((need) => {
            const taskId = run.steps.find((s) => s.name === need.step)?.taskId;
            return (
              <li key={need.step} data-need={need.kind} data-step={need.step} className="space-y-1">
                <p className="line-clamp-4 whitespace-pre-wrap break-words" title={needText(need)}>
                  <strong>{need.step}</strong> {need.kind === 'harness' ? 'is ' : ''}
                  {needText(need)}
                </p>
                {need.kind === 'harness' && taskId && <Unblock runId={run.id} step={need.step} taskId={taskId} />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** What a person can do about a session the harness blocked, since the board cannot: stop it, then try it again (`unblockCommands`). */
function Unblock({ runId, step, taskId }: { runId: string; step: string; taskId: string }) {
  const [stop, retry] = unblockCommands(runId, step, taskId);
  return (
    <div data-unblock className="space-y-1 text-xs">
      <p>
        The board cannot continue it: its session has not ended, so the run reads it as still running and <code>wf retry</code> has no try
        to replace, and nothing in the run resumes a session the harness blocked yet. Stop the session, then, once{' '}
        <code>wf ls {runId}</code> says {step} stopped, try it again — which continues the session, told what happened:
      </p>
      <ol className="space-y-1">
        {[stop, retry].map((command) => (
          <li key={command} className="flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded bg-amber-50 px-2 py-1 font-mono dark:bg-amber-900/40">{command}</code>
            <CopyButton text={command} />
          </li>
        ))}
      </ol>
    </div>
  );
}

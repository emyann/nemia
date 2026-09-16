import type { ReactNode } from 'react';
import type { ReadOnlyCommands, StepReach } from '../lib/api';

export const CHIP = 'inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] leading-none whitespace-nowrap';
export const PLAIN = 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300';
export const STRUCK = 'bg-red-50 text-red-800 line-through decoration-red-500 dark:bg-red-950/60 dark:text-red-300';
/** A command that runs without asking. */
const RUNS = 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300';
/** One said to, and not measured. */
const DOCUMENTED = 'border border-dashed border-emerald-400 text-emerald-800 dark:border-emerald-700 dark:text-emerald-300';

/** One part of what a step gets, under its label. */
export function Reach({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[8rem_minmax(0,1fr)]">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  );
}

/**
 * What a Claude Code step runs without being asked: Claude Code's read-only commands, which ask for no rule in any mode, then what the settings
 * allow of what asks. In `dontAsk` the rest of what asks is denied without a prompt, so the part is its Bash; in any other mode, what asks is
 * the mode's to decide. Then the allows a deny takes back, and those of a tool the step does not have.
 */
export function AllowedReach({ allowed, readOnly, commands }: { allowed: StepReach['allowed']; readOnly: StepReach['readOnly']; commands: ReadOnlyCommands }) {
  const exceptOf = (rule: string) => allowed.exceptions.find((e) => e.rule === rule)?.except ?? [];
  const runsReadOnly = readOnly !== null && readOnly.length > 0;

  return (
    <Reach label={allowed.dontAsk ? 'Bash it may run' : 'Allowed without asking'}>
      {allowed.dontAsk ? (
        allowed.why ? (
          <p data-no-bash className="text-xs text-neutral-500">{allowed.why}</p>
        ) : (
          <>
            <p className="text-xs text-neutral-500">
              In dontAsk, a command that asks is denied without a prompt unless a rule allows it.{' '}
              {runsReadOnly && `${commands.harness}'s read-only commands do not ask:`}
            </p>
            {runsReadOnly && <ReadOnly readOnly={readOnly} commands={commands} />}
            <p className="text-xs text-neutral-500">Of the commands that ask, the settings allow it:</p>
            {allowed.bash.length ? (
              <span className="flex flex-wrap gap-x-3 gap-y-1">
                {allowed.bash.map((b) => (
                  <span key={b.rule} className="inline-flex flex-wrap items-center gap-1">
                    <code data-bash={b.command} className={`${CHIP} ${RUNS}`}>{b.command}</code>
                    {b.except.length > 0 && <span data-except={b.command} className="text-[11px] text-neutral-500">except {b.except.join(', ')}</span>}
                  </span>
                ))}
              </span>
            ) : (
              <p data-none-allowed className="text-xs text-neutral-500">None.</p>
            )}
          </>
        )
      ) : (
        <>
          {allowed.rules.length ? (
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              {allowed.rules.map((rule) => (
                <span key={rule} className="inline-flex flex-wrap items-center gap-1">
                  <code data-allowed={rule} className={`${CHIP} ${PLAIN}`}>{rule}</code>
                  {exceptOf(rule).length > 0 && <span data-except={rule} className="text-[11px] text-neutral-500">except {exceptOf(rule).join(', ')}</span>}
                </span>
              ))}
            </span>
          ) : (
            <p className="text-xs text-neutral-500">Nothing: no allow rule of the settings reaches it, so what asks is its permission mode&apos;s to decide.</p>
          )}
          {runsReadOnly && (
            <>
              <p className="text-xs text-neutral-500">And, in every mode, {commands.harness}&apos;s read-only commands, which ask for no rule:</p>
              <ReadOnly readOnly={readOnly} commands={commands} />
            </>
          )}
        </>
      )}
      {allowed.takenBack.length > 0 && (
        <p className="flex flex-wrap items-center gap-1 text-xs text-neutral-500">
          Taken back by a deny, which beats an allow:
          {allowed.takenBack.map(({ rule, by }) => (
            <code key={rule} data-taken-back={rule} title={`Denied by ${by.rule} (${by.source})`} className={`${CHIP} ${STRUCK}`}>{rule}</code>
          ))}
        </p>
      )}
      {allowed.unused.length > 0 && (
        <p className="flex flex-wrap items-center gap-1 text-xs text-neutral-500">
          Of a tool its tools: do not have:
          {allowed.unused.map((rule) => <code key={rule} data-unused={rule} className={`${CHIP} ${PLAIN} opacity-60`}>{rule}</code>)}
        </p>
      )}
    </Reach>
  );
}

/**
 * Claude Code's read-only commands as they reach a step: solid where they were measured running without a rule, dashed where only its docs say
 * so, struck where a deny refuses the whole command — then when, on which version and from where that was learned, never claimed current.
 */
function ReadOnly({ readOnly, commands }: { readOnly: NonNullable<StepReach['readOnly']>; commands: ReadOnlyCommands }) {
  return (
    <>
      <span className="flex flex-wrap gap-1">
        {readOnly.map(({ command, measured, denied }) => (
          <code
            key={command}
            data-read-only={command}
            data-documented={measured ? undefined : true}
            data-denied={denied?.rule}
            title={
              denied
                ? `Denied by ${denied.rule} (${denied.source}), which beats the harness's own leave`
                : measured
                  ? `Ran with no rule allowing it on ${commands.measuredAt}, ${commands.harness} ${commands.version}`
                  : `Named by ${commands.harness}'s docs, not measured`
            }
            className={`${CHIP} ${denied ? STRUCK : measured ? RUNS : DOCUMENTED}`}
          >
            {command === 'git' ? 'git, read-only' : command}
          </code>
        ))}
      </span>
      <p data-read-only-measured={commands.measuredAt} className="text-xs text-neutral-500">
        The solid ones ran with no rule allowing them on {commands.measuredAt} with {commands.version} ({commands.source}). The dashed ones are named
        by its docs ({commands.docs}), which say the set includes them, not that it is all of it; git is its read-only forms. A deny naming one
        still refuses it. Not asked again: a later version may run others.
      </p>
    </>
  );
}

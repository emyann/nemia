import type { ReactNode } from 'react';
import type { ReadOnlyCommands, StepReach } from '../lib/api';
import { container, dashed } from '../lib/meaning';

export const CHIP = 'inline-flex items-center rounded px-1.5 py-0.5 font-mono text-body-small leading-none whitespace-nowrap';
export const PLAIN = 'bg-muted text-foreground';
export const STRUCK = `${container.grey} line-through decoration-outline`;
/** A command that runs without asking. */
const RUNS = container.sage;
/** One said to, and not measured. */
const DOCUMENTED = dashed.sage;
/** One an ask rule makes ask, on a step that prompts. In dontAsk, or on a job, which deny what asks, it is struck. */
export const ASKS = container.yours;

/** One part of what a step gets, under its label. */
export function Reach({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[8rem_minmax(0,1fr)]">
      <p className="text-body-small font-medium text-muted-foreground">{label}</p>
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  );
}

/**
 * What a Claude Code step runs without being asked: Claude Code's read-only commands, which ask for no rule in any mode unless an ask rule
 * names one, then what the settings allow of what asks. In `dontAsk` the rest of what asks is denied without a prompt, so the part is its
 * Bash; in any other mode, what asks is the mode's to decide, and on a job, which asks nobody, what would still ask is denied
 * (`askDenier`). Then the allows a deny takes back, those an ask rule takes back, and those of a tool the step does not have.
 */
export function AllowedReach({
  allowed,
  readOnly,
  commands,
}: {
  allowed: StepReach['allowed'];
  readOnly: StepReach['readOnly'];
  commands: ReadOnlyCommands;
}) {
  const exceptionOf = (rule: string) => allowed.exceptions.find((e) => e.rule === rule) ?? { except: [], asks: [] };
  const runsReadOnly = readOnly !== null && readOnly.length > 0;
  const { askDenier } = allowed;

  return (
    <Reach label={allowed.dontAsk ? 'Bash it may run' : 'Allowed without asking'}>
      {allowed.dontAsk ? (
        allowed.why ? (
          <p data-no-bash className="text-body-small text-muted-foreground">
            {allowed.why}
          </p>
        ) : (
          <>
            <p className="text-body-small text-muted-foreground">
              In dontAsk, a command that asks is denied without a prompt unless a rule allows it.{' '}
              {runsReadOnly && `${commands.harness}'s read-only commands do not ask:`}
            </p>
            {runsReadOnly && <ReadOnly readOnly={readOnly} commands={commands} askDenier={askDenier} />}
            <p className="text-body-small text-muted-foreground">Of the commands that ask, the settings allow it:</p>
            {allowed.bash.length ? (
              <span className="flex flex-wrap gap-x-3 gap-y-1">
                {allowed.bash.map((b) => (
                  <span key={b.rule} className="inline-flex flex-wrap items-center gap-1">
                    <code data-bash={b.command} className={`${CHIP} ${RUNS}`}>
                      {b.command}
                    </code>
                    <Exceptions of={b.command} except={b.except} asks={b.asks} askDenier={askDenier} />
                  </span>
                ))}
              </span>
            ) : (
              <p data-none-allowed className="text-body-small text-muted-foreground">
                None.
              </p>
            )}
          </>
        )
      ) : (
        <>
          {allowed.rules.length ? (
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              {allowed.rules.map((rule) => (
                <span key={rule} className="inline-flex flex-wrap items-center gap-1">
                  <code data-allowed={rule} className={`${CHIP} ${PLAIN}`}>
                    {rule}
                  </code>
                  <Exceptions of={rule} {...exceptionOf(rule)} askDenier={askDenier} />
                </span>
              ))}
            </span>
          ) : (
            <p className="text-body-small text-muted-foreground">
              Nothing: no allow rule of the settings reaches it, so what asks is its permission mode&apos;s to decide
              {askDenier === 'a job' ? ', and what would still ask is denied: a job asks nobody.' : '.'}
            </p>
          )}
          {runsReadOnly && (
            <>
              <p className="text-body-small text-muted-foreground">
                And, in every mode, {commands.harness}&apos;s read-only commands, which ask for no rule:
              </p>
              <ReadOnly readOnly={readOnly} commands={commands} askDenier={askDenier} />
            </>
          )}
        </>
      )}
      {allowed.takenBack.length > 0 && (
        <p className="flex flex-wrap items-center gap-1 text-body-small text-muted-foreground">
          Taken back by a deny, which beats an allow:
          {allowed.takenBack.map(({ rule, by }) => (
            <code key={rule} data-taken-back={rule} title={`Denied by ${by.rule} (${by.source})`} className={`${CHIP} ${STRUCK}`}>
              {rule}
            </code>
          ))}
        </p>
      )}
      {allowed.asked.length > 0 && (
        <p className="flex flex-wrap items-center gap-1 text-body-small text-muted-foreground">
          {askDenier
            ? `Taken back by an ask rule, which beats an allow, and ${askDenier} denies what asks:`
            : 'Taken back by an ask rule, which beats an allow: these ask.'}
          {allowed.asked.map(({ rule, by }) => (
            <code
              key={rule}
              data-asked={rule}
              title={`Asks by ${by.rule} (${by.source})`}
              className={`${CHIP} ${askDenier ? STRUCK : ASKS}`}
            >
              {rule}
            </code>
          ))}
        </p>
      )}
      {allowed.unused.length > 0 && (
        <p className="flex flex-wrap items-center gap-1 text-body-small text-muted-foreground">
          Of a tool its tools: do not have:
          {allowed.unused.map((rule) => (
            <code key={rule} data-unused={rule} className={`${CHIP} text-muted-foreground ring-1 ring-outline-variant ring-inset`}>
              {rule}
            </code>
          ))}
        </p>
      )}
    </Reach>
  );
}

/**
 * After an allow that stands, what of it a narrower deny still refuses, and what a narrower ask rule still makes ask — in dontAsk, or on a
 * job, denied.
 */
function Exceptions({
  of,
  except,
  asks,
  askDenier,
}: {
  of: string;
  except: readonly string[];
  asks: readonly string[];
  askDenier: string | null;
}) {
  return (
    <>
      {except.length > 0 && (
        <span data-except={of} className="text-body-small text-muted-foreground">
          except {except.join(', ')}
        </span>
      )}
      {asks.length > 0 && (
        <span data-asks={of} className="text-body-small text-muted-foreground">
          {except.length > 0 ? 'and ' : ''}asks for {asks.join(', ')}
          {askDenier ? `, which ${askDenier} denies` : ''}
        </span>
      )}
    </>
  );
}

/** A read-only command as a sentence names it. */
const named = (command: string) => (command === 'git' ? 'read-only git' : command);

/**
 * Claude Code's read-only commands as they reach a step: solid where they were measured running without a rule, dashed where only its docs
 * say so, amber where an ask rule makes one ask, struck where a deny refuses the whole command or, in dontAsk or on a job, an ask rule does
 * — each said with its rule — then the day and the version it was measured on, and where that is recorded: a measurement of that day, never
 * claimed current.
 */
function ReadOnly({
  readOnly,
  commands,
  askDenier,
}: {
  readOnly: NonNullable<StepReach['readOnly']>;
  commands: ReadOnlyCommands;
  askDenier: string | null;
}) {
  const taken = readOnly.filter((c) => c.denied || c.asks);
  return (
    <>
      <span className="flex flex-wrap gap-1">
        {readOnly.map(({ command, measured, denied, asks }) => (
          <code
            key={command}
            data-read-only={command}
            data-documented={measured ? undefined : true}
            data-denied={denied?.rule}
            data-asks={asks?.rule}
            title={
              asks
                ? `Asks by ${asks.rule} (${asks.source}), which beats the harness's own leave${denied && askDenier ? `, and ${askDenier} denies what asks` : ''}`
                : denied
                  ? `Denied by ${denied.rule} (${denied.source}), which beats the harness's own leave`
                  : measured
                    ? `Measured on ${commands.measuredAt}, ${commands.harness} ${commands.version}: it ran with no rule allowing it, under that day's settings`
                    : `Named by ${commands.harness}'s docs, not measured`
            }
            className={`${CHIP} ${denied ? STRUCK : asks ? ASKS : measured ? RUNS : DOCUMENTED}`}
          >
            {command === 'git' ? 'git, read-only' : command}
          </code>
        ))}
      </span>
      {taken.length > 0 && (
        <p data-read-only-taken className="text-body-small text-muted-foreground">
          {taken
            .map(({ command, denied, asks }) =>
              asks
                ? `${named(command)} asks, by ${asks.rule} (${asks.source})${askDenier ? `, which ${askDenier} denies` : ''}`
                : `${named(command)} is denied, by ${denied!.rule} (${denied!.source})`,
            )
            .join('; ')}
          .
        </p>
      )}
      <p data-read-only-measured={commands.measuredAt} className="text-body-small text-muted-foreground">
        The solid ones were measured on {commands.measuredAt} with {commands.version} ({commands.source}): that day, under that day&apos;s
        settings, they ran with no rule allowing them. The dashed ones are named by its docs ({commands.docs}), which say the set includes
        them, not that it is all of it; git is its read-only forms. A deny covering one still refuses it, and an ask rule covering one makes
        it ask{askDenier ? `, which ${askDenier} denies` : ''}. Not asked again: a later version may run others.
      </p>
    </>
  );
}

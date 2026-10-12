import { useEffect, useId, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import {
  decisionQuery,
  type Decidable,
  type DecideCommand,
  type DiffFile,
  type Group,
  type Lesson,
  type RetryMode,
  type RunDetail,
  type SensitiveDiff,
  type Touched,
} from '../lib/api';
import { answersOf, askedSaid, type Answer } from '../lib/asks';
import { acceptStepOf, barOf, changeOf, decidableRun, decisionStamp, diffLine, isDecidable, mostLines, type DiffLine } from '../lib/decide';
import { cn } from '../lib/utils';
import { BUTTON, MODES, Refusal, TEXTAREA, useAccept, useAsk } from './Ask';
import { CopyButton } from './CopyButton';
import { Facts, HEADING, pathRow, readRows, TrialMerges } from './Facts';
import { Asks, QuestionsForm } from './Questions';
import { RaiseRow } from './Raise';

/**
 * The Decide section of a run's page: the answer each step waiting on you can be given (`answersOf`), then what the CLI's `decide` shows a
 * person — read once for the run's state (`decisionQuery`), only while the run has something to decide, and shown when the api says
 * there is. The answers keep their place in one frame while the decision is read, refused or drawn, so a row keeps what was typed in it
 * and the refusal of its ask. A run that still runs with a try asked — of a session the harness blocked, continued from the banner — has
 * that try's note and nothing to decide. An api that refuses says why, here.
 */
export function Decide({ run }: { run: RunDetail }) {
  const decidable = decidableRun(run);
  const { data, error } = useQuery({ ...decisionQuery(run.id, decisionStamp(run)), enabled: decidable });
  const offers = answersOf(run);
  const answers = offers.length > 0 ? <Offers runId={run.id} offers={offers} /> : null;
  const body =
    decidable && error ? (
      <p className="text-sm text-red-600 dark:text-red-400">
        Could not read what there is to decide: {error.message} <code>{run.decide}</code> reads it from the command line.
      </p>
    ) : decidable && isDecidable(data) ? (
      <DecisionParts runId={run.id} decision={data} run={run} />
    ) : null;
  if (!answers && !body) return null;
  return (
    <DecideFrame>
      {answers}
      {body}
    </DecideFrame>
  );
}

/** The Decide section's frame: its heading, and what the board does from it and what it leaves to you. */
function DecideFrame({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label="Decide"
      id="decide"
      className="scroll-mt-4 space-y-5 rounded border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <div className="space-y-1">
        <h2 className="font-semibold">Decide</h2>
        <p className="text-xs text-muted-foreground">
          What there is to decide on this run. Copy a command to run it yourself; the board runs one of them, accepting a loop's work as it
          stands with your reason. An answer given here asks for a try, or a round; each row says what the tick does with it.
        </p>
      </div>
      {children}
    </section>
  );
}

/**
 * What there is to decide, in the CLI `decide`'s order: the OVER BUDGET line where a step is held on its budget, what each branch touched
 * and the lesson line, the check-affecting files in full, what the run consumed and cost, and the commands — copyable, and none of them run
 * from here but the CLI's `accept`, which the board presses with a person's reason (`AcceptCommand`). `offers` go first. The OVER BUDGET
 * line says why each step past its budget is held, as the CLI's `decide` prints it first: its own amounts, or the step its loop's round
 * would file. A folder run has no branch and nothing to merge, so nothing is said of one: where its work is instead, as the CLI's `decide`
 * says.
 */
export const DecideSection = ({ offers = null, ...parts }: DecisionProps & { offers?: ReactNode }) => (
  <DecideFrame>
    {offers}
    <DecisionParts {...parts} />
  </DecideFrame>
);

/** What `DecisionParts` reads: the run's id, its decision, and where it worked, if known. */
type DecisionProps = { runId: string; decision: Decidable; run?: Pick<RunDetail, 'place' | 'work'> | null };

/** What there is to decide, after the answers, as `DecideSection` lists it; a fragment, so its parts sit in the frame's own spacing. */
function DecisionParts({ runId, decision, run = null }: DecisionProps) {
  const { touched, lesson, sensitive, total, cost, overBudget, commands } = decision;
  const inFolders = run?.place === 'folder';
  return (
    <>
      {overBudget && (
        <p
          data-over-budget
          className="rounded bg-amber-100 px-3 py-2 font-mono text-xs break-words text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          {overBudget}
        </p>
      )}

      <div className="space-y-4">
        {inFolders ? (
          <div data-in-folders className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Worked in folders of its own, and changed nothing anywhere else: what it made is there, to keep or to forget.
            </p>
            <Facts rows={[['work', pathRow(run.work)]]} />
          </div>
        ) : touched.length ? (
          touched.map((t) => <TouchedBranch key={t.branch} touched={t} />)
        ) : (
          <p className="text-sm text-muted-foreground">No branch to read: no step worked on one.</p>
        )}
        {!inFolders && <LessonChip lesson={lesson} />}
      </div>

      {decision.collisions && <TrialMerges runId={runId} collisions={decision.collisions} />}

      {!inFolders && <InFull sensitive={sensitive} touched={touched} />}

      <section aria-label="Used" className="space-y-1">
        <h3 className={HEADING}>Used, over every step's current try — and what every try of the run cost</h3>
        <Facts rows={[['used', total.used], ['cost', total.cost], ...readRows(total), ['every try', cost]]} />
      </section>

      <Commands runId={runId} commands={commands} />
    </>
  );
}

/**
 * What the board can ask for each step waiting on you (`offersOf`), a row a step: a step whose closeout asks questions as data is answered
 * by choosing (`QuestionsForm`). Each ask is the CLI `retry`'s, made by the api through the
 * package's `retry()`, which writes the ask and nothing else; the next tick files the try.
 */
export function Offers({ runId, offers }: { runId: string; offers: readonly Answer[] }) {
  return (
    <section aria-label="Answer" className="space-y-2">
      <h3 className={HEADING}>Answer — each asks for a try of its step, or a round of its loop, as the command line would</h3>
      <ul className="space-y-3">
        {offers.map((offer) =>
          offer.kind === 'raise' ? (
            <RaiseRow key={offer.step} runId={runId} offer={offer} />
          ) : offer.kind === 'answer' && offer.questions.length > 0 ? (
            <QuestionsForm key={offer.step} runId={runId} offer={offer} />
          ) : (
            <OfferRow key={offer.step} runId={runId} offer={offer} />
          ),
        )}
      </ul>
    </section>
  );
}

/** What a step needs, as its row says it after its name, when it is not a question: a question is drawn as the markdown it is (`Asks`). */
function offerSaid(offer: Exclude<Answer, { kind: 'asked' | 'raise' }>): string {
  switch (offer.kind) {
    case 'answer':
      return 'signed off blocked, and said nothing of what it needs';
    case 'try-again':
      return !offer.recheck
        ? "gave no closeout the run accepts — none, one short of a field it declares, or one naming a file the run does not have; the CLI's decide says which"
        : offer.unfinished
          ? 'has a check that did not finish: no verdict on the work'
          : 'was refused by its check';
    case 'denied':
      return `signed off having been denied a call${offer.calls ? ` (${offer.calls})` : ''}, and says denials: fail. This run's allowedTools: is frozen, so a try is denied the same again: a new session is told to do without it`;
  }
}

/**
 * One step's answer: what it needs, then the box and the button that ask — an answer to a step that signed off blocked, `Try again` for a
 * refused check or an unsigned step — and the api's refusal beside them, verbatim. Once the api has the ask, the run is read again and the
 * row says what the CLI's `ls` says: `try 2 asked (…) — the next tick files it`; a step waiting on you again later starts afresh.
 *
 * As the CLI's `decide` offers it, a check that did not finish is run again first, since the run spent no retry on it, and a denied step
 * gets a new session first, since the one it had was denied and carries on the same permissions. A recheck files no session, so it carries
 * no message (`messageRefusal` refuses one) and the box is closed while it is chosen. An answer goes as it was typed, as `--message` takes
 * it; something to tell a try is optional, and none is sent when nothing was written or with a recheck, whatever the closed box still
 * holds.
 */
export function OfferRow({ runId, offer }: { runId: string; offer: Exclude<Answer, { kind: 'raise' }> }) {
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<RetryMode>(
    offer.kind === 'try-again' && offer.unfinished ? 'recheck' : offer.kind === 'denied' ? 'fresh' : 'nudge',
  );
  const field = useId();
  const rechecking = mode === 'recheck';
  const ask = useAsk(runId, offer.step, () => setMessage(''));
  const { reset } = ask;
  useEffect(() => {
    if (offer.kind === 'asked') reset();
  }, [offer.kind, reset]);

  if (offer.kind === 'asked' || ask.isSuccess) {
    return (
      <li data-offer="asked" data-step={offer.step} className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800">
        <strong>{offer.step}</strong>{' '}
        <span data-note className="font-mono text-xs text-muted-foreground">
          {offer.kind === 'asked' ? (offer.note ?? `try ${offer.try} asked`) : ask.isSuccess ? askedSaid(ask.data) : null}
        </span>
      </li>
    );
  }

  const modes: RetryMode[] =
    offer.kind === 'try-again' && offer.recheck
      ? ['nudge', 'fresh', 'recheck']
      : offer.kind === 'denied'
        ? ['fresh', 'nudge']
        : ['nudge', 'fresh'];
  return (
    <li
      data-offer={offer.kind}
      data-step={offer.step}
      className="space-y-2 rounded border border-amber-300 bg-amber-50/60 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30"
    >
      {offer.kind === 'answer' && offer.needs ? (
        <Asks data-said step={offer.step} needs={offer.needs} />
      ) : (
        <p data-said className="break-words">
          <strong>{offer.step}</strong> {offerSaid(offer)}
        </p>
      )}
      <form
        aria-label={offer.kind === 'answer' ? `Answer ${offer.step}` : `Try ${offer.step} again`}
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          const said = !rechecking && (offer.kind === 'answer' || message.trim()) ? { message } : {};
          ask.mutate({ mode, ...said });
        }}
      >
        <label htmlFor={field} className="sr-only">
          {offer.kind === 'answer' ? `Your answer to ${offer.step}` : `What to tell ${offer.step}, if anything`}
        </label>
        <textarea
          id={field}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={offer.kind === 'answer' ? 3 : 2}
          disabled={rechecking}
          placeholder={
            offer.kind === 'answer'
              ? 'Your answer: the next try is told it, under “Your answer”.'
              : rechecking
                ? 'A recheck runs the check again and files no session: there is nobody to tell.'
                : 'Anything to tell it (optional): the next try is told it.'
          }
          className={cn(TEXTAREA, 'disabled:cursor-not-allowed disabled:opacity-50')}
        />
        {rechecking && message.trim() && (
          <p data-recheck-note className="text-xs text-muted-foreground">
            Not sent with a recheck: it files no session to read it. Choose a session to send it.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="submit" disabled={ask.isPending || (offer.kind === 'answer' && !message.trim())} className={BUTTON}>
            {ask.isPending ? 'Asking…' : offer.kind === 'answer' ? 'Answer and continue' : 'Try again'}
          </button>
          <fieldset className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <legend className="sr-only">How to try {offer.step} again</legend>
            {modes.map((m) => (
              <label key={m} className="flex cursor-pointer items-center gap-1.5">
                <input type="radio" name={`${field}-mode`} value={m} checked={mode === m} onChange={() => setMode(m)} />
                {MODES[m]} <code className="text-muted-foreground">--{m}</code>
              </label>
            ))}
          </fieldset>
        </div>
      </form>
      {ask.isError && <Refusal error={ask.error} />}
    </li>
  );
}

/**
 * Continue a session the harness blocked, from the banner beside what it said last, as the CLI's `retry` continues it: a nudge — with
 * something to tell it, if you like — which the package's `retry()` takes for such a step, and the tick honours by stopping the session,
 * then filing the try, which continues it told what happened. The api's refusal shows beside the button, verbatim. Once the api has the
 * ask, what the tick does with it (`askedSaid`), until the run is read again and the banner says it in the CLI `ls`'s words. Nothing
 * written is a nudge with no message, as the CLI's `retry` sends one; something written goes as it was typed, as `--message` takes it.
 */
export function Continue({ runId, step, line }: { runId: string; step: string; line: string }) {
  const [message, setMessage] = useState('');
  const field = useId();
  const ask = useAsk(runId, step, () => setMessage(''));
  if (ask.isSuccess) {
    return (
      <p data-asked className="font-mono text-xs">
        {askedSaid(ask.data)}
      </p>
    );
  }
  return (
    <div data-continue className="space-y-2">
      <form
        aria-label={`Continue ${step}`}
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          ask.mutate({ mode: 'nudge', ...(message.trim() ? { message } : {}) });
        }}
      >
        <label htmlFor={field} className="sr-only">
          {`What to tell ${step}, if anything`}
        </label>
        <textarea
          id={field}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={2}
          placeholder="Anything to tell it (optional): the next try is told it."
          className={TEXTAREA}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="submit" disabled={ask.isPending} className={BUTTON}>
            {ask.isPending ? 'Asking…' : 'Continue'}
          </button>
          <p className="text-xs">
            as <code>{line}</code> asks it: the next tick stops its session, and files the try once it has stopped
          </p>
        </div>
      </form>
      {ask.isError && <Refusal error={ask.error} />}
    </div>
  );
}

/**
 * What one branch touched: a row per group with its +/− bar, then the agent-facing and check-affecting files, each only when there are any
 * — or, where the run's place did not say, the api's sentence saying what the run changed is not known, as it is given.
 */
export function TouchedBranch({ touched: { branch, radius } }: { touched: Touched }) {
  return (
    <div data-touched={branch} className="space-y-2">
      <p className="text-sm">
        <span className="text-muted-foreground">touched </span>
        <span className="break-all font-mono text-xs">{branch}</span>
      </p>
      {'error' in radius ? (
        <p className="text-sm text-red-700 dark:text-red-400">{radius.error}</p>
      ) : radius.changes.length ? (
        <>
          <GroupRows groups={radius.groups} />
          <Chips agentFacing={radius.agentFacing} checkAffecting={radius.checkAffecting} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">nothing — the branch changed no file against the base</p>
      )}
    </div>
  );
}

function GroupRows({ groups }: { groups: readonly Group[] }) {
  const most = mostLines(groups);
  return (
    <ul
      aria-label="Groups"
      className="grid grid-cols-[minmax(0,max-content)_max-content_minmax(3rem,1fr)_max-content] items-center gap-x-3 gap-y-1 text-xs"
    >
      {groups.map((g) => {
        const counted = g.files - g.binary;
        return (
          <li key={g.name} data-group={g.name} className="contents">
            <span className="truncate font-mono" title={g.name}>
              {g.name}
            </span>
            <span className="text-right tabular-nums text-muted-foreground">
              {g.files} file{g.files === 1 ? '' : 's'}
            </span>
            <GroupBar group={g} most={most} />
            <span className="font-mono tabular-nums">
              {counted > 0 && (
                <>
                  <span className="text-emerald-700 dark:text-emerald-400">+{g.added}</span>{' '}
                  <span className="text-red-700 dark:text-red-400">−{g.removed}</span>
                </>
              )}
              {g.binary > 0 && <span className="text-muted-foreground">{counted > 0 ? ` · ${g.binary} binary` : 'binary'}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** A group's lines as a bar: added then removed, as long as the group's share of the most lines any group on the branch changed. */
export function GroupBar({ group, most }: { group: Pick<Group, 'added' | 'removed'>; most: number }) {
  const { added, removed } = barOf(group, most);
  return (
    <span
      data-bar
      role="img"
      aria-label={`+${group.added} −${group.removed}`}
      className="flex h-2 w-full overflow-hidden rounded-sm bg-neutral-100 dark:bg-neutral-800"
    >
      <span data-added className="h-full bg-emerald-500" style={{ width: `${added}%` }} />
      <span data-removed className="h-full bg-red-500" style={{ width: `${removed}%` }} />
    </span>
  );
}

const AGENT_FACING = 'the next agent reads this';
const CHECK_AFFECTING = 'could make its check pass';

/**
 * The files an agent reads as instructions (amber), and those that decide what a check means (red outline). Nothing for a list that is
 * empty.
 */
export function Chips({ agentFacing, checkAffecting }: { agentFacing: readonly string[]; checkAffecting: readonly string[] }) {
  if (!agentFacing.length && !checkAffecting.length) return null;
  const row = (label: string, files: readonly string[], kind: string, title: string, className: string) =>
    files.length > 0 && (
      <p className="flex flex-wrap items-center gap-1.5">
        <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
        {files.map((file) => (
          <span
            key={file}
            data-chip={kind}
            title={title}
            className={cn('break-all rounded px-1.5 py-0.5 font-mono text-[11px]', className)}
          >
            {file}
          </span>
        ))}
      </p>
    );
  return (
    <div className="space-y-1.5 text-xs">
      {row('agent-facing', agentFacing, 'agent-facing', AGENT_FACING, 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300')}
      {row(
        'check-affecting',
        checkAffecting,
        'check-affecting',
        CHECK_AFFECTING,
        'text-red-700 ring-1 ring-red-400 ring-inset dark:text-red-400 dark:ring-red-700',
      )}
    </div>
  );
}

/** The lesson line: green when the run wrote where the next agent reads, amber when it wrote nothing there, dashed when nobody can say. */
export function LessonChip({ lesson }: { lesson: Lesson }) {
  const [text, title, className] =
    lesson.state === 'written'
      ? [
          `lesson · ${lesson.said}`,
          'The run changed a file where the next agent reads.',
          'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
        ]
      : lesson.state === 'nothing'
        ? [
            lesson.said,
            'What this run learned is written nowhere the next agent reads (CLAUDE.md, "When you miss").',
            'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
          ]
        : [
            `lesson ${lesson.said}`,
            'A branch could not be read, so nobody can say what it wrote.',
            'border border-dashed border-neutral-300 text-muted-foreground dark:border-neutral-700',
          ];
  return (
    <p>
      <span data-lesson={lesson.state} title={title} className={cn('inline-block rounded px-2 py-0.5 font-mono text-xs', className)}>
        {text}
      </span>
    </p>
  );
}

/** The check-affecting files of each branch in full, collapsed a file each. */
function InFull({ sensitive, touched }: { sensitive: readonly SensitiveDiff[]; touched: readonly Touched[] }) {
  return (
    <section aria-label="In full" className="space-y-2">
      <h3 className={HEADING}>In full: the check-affecting files — what a change could edit to make its check pass</h3>
      {sensitive.map(({ branch, files, error }) => (
        <div key={branch} className="space-y-1.5">
          {sensitive.length > 1 && <p className="break-all font-mono text-xs text-muted-foreground">{branch}</p>}
          {error ? (
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          ) : files.length ? (
            files.map((file) => (
              <DiffFileView
                key={file.path}
                file={file}
                counts={changeOf(
                  touched.find((t) => t.branch === branch),
                  file.path,
                )}
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">none</p>
          )}
        </div>
      ))}
    </section>
  );
}

const LINE_CLASS: Record<DiffLine, string> = {
  meta: 'font-semibold text-muted-foreground',
  hunk: 'bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300',
  added: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
  removed: 'bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-300',
  context: '',
};

/**
 * One file's unified diff, folded under its name, coloured by line; where the api cut it, how much more the CLI's `decide` prints. Its
 * summary is a flex row, which draws no marker of its own: a chevron says it opens, and turns when it has.
 */
export function DiffFileView({ file, counts }: { file: DiffFile; counts?: { added: number | null; removed: number | null } }) {
  return (
    <details data-diff={file.path} className="group rounded border border-neutral-200 dark:border-neutral-800">
      <summary className="flex cursor-pointer items-center gap-2 px-2 py-1 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-900">
        <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
        <span className="min-w-0 flex-1 truncate font-mono" title={file.path}>
          {file.path}
        </span>
        {counts && (
          <span className="shrink-0 font-mono tabular-nums">
            {counts.added === null ? (
              'binary'
            ) : (
              <>
                <span className="text-emerald-700 dark:text-emerald-400">+{counts.added}</span>{' '}
                <span className="text-red-700 dark:text-red-400">−{counts.removed}</span>
              </>
            )}
          </span>
        )}
      </summary>
      <pre className="max-h-96 overflow-auto border-t border-neutral-200 py-1 font-mono text-[11px] leading-snug dark:border-neutral-800">
        {file.lines.map((line, i) => {
          const kind = diffLine(line);
          return (
            <span key={i} data-line={kind} className={cn('block w-max min-w-full whitespace-pre px-2', LINE_CLASS[kind])}>
              {line || ' '}
            </span>
          );
        })}
      </pre>
      {file.cut > 0 && (
        <p data-cut={file.cut} className="border-t border-neutral-200 px-2 py-1 text-xs text-muted-foreground dark:border-neutral-800">
          {file.cut} more line{file.cut === 1 ? '' : 's'} — the command line&apos;s decide prints them all
        </p>
      )}
    </details>
  );
}

/**
 * Ship it, drop it, once more: each command on a line of its own with a button that copies it. Nothing here runs one but the CLI's
 * `accept`, which a person who never opens a terminal has no other way to give: its row also takes their reason and presses it
 * (`AcceptCommand`).
 */
export function Commands({ runId, commands }: { runId: string; commands: readonly DecideCommand[] }) {
  return (
    <section aria-label="Commands" className="space-y-2">
      <h3 className={HEADING}>Commands — copy one to run it; the board runs only accept, with your reason</h3>
      {commands.length ? (
        <ul className="space-y-2">
          {commands.map((c) => {
            const accepts = acceptStepOf(c);
            return accepts ? (
              <AcceptCommand key={`${c.label} ${c.command}`} runId={runId} step={accepts} command={c} />
            ) : (
              <li key={`${c.label} ${c.command}`} data-command={c.label} className="space-y-0.5">
                <CommandLine command={c} />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">None yet: the run is still moving.</p>
      )}
    </section>
  );
}

/** A command's words, then its label, the command and the button that copies it. */
function CommandLine({ command: c }: { command: DecideCommand }) {
  return (
    <>
      {c.said && <p className="text-xs text-muted-foreground">{c.said.replace(`:  ${c.command}`, '')}</p>}
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-xs text-muted-foreground">{c.label}</span>
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded bg-neutral-100 px-2 py-1 font-mono text-xs dark:bg-neutral-950">
          {c.command}
        </code>
        <CopyButton text={c.command} />
      </div>
    </>
  );
}

/**
 * The CLI's `accept` as a button: the command to copy, as every row has it, and a box for the reason — required, as `--message` is, so the
 * button waits for it, and sent as typed — and the button that accepts the loop's work as it stands through the api (`acceptLoop`), which
 * calls the package's `accept()`. What may be accepted is the package's to say: its refusal shows beside the button, verbatim. Once the api
 * has it, what the tick does with it, until the run is read again and the loop is offered no more.
 */
export function AcceptCommand({ runId, step, command }: { runId: string; step: string; command: DecideCommand }) {
  const [message, setMessage] = useState('');
  const field = useId();
  const accept = useAccept(runId, step);
  return (
    <li data-command={command.label} data-step={step} className="space-y-2">
      <div className="space-y-0.5">
        <CommandLine command={command} />
      </div>
      {accept.isSuccess ? (
        <p data-accepted className="pl-18 font-mono text-xs">
          try {accept.data.try} of {step} accepted as it stands — what waits on it is filed on the next tick
        </p>
      ) : (
        <form
          aria-label={`Accept ${step} as it stands`}
          className="space-y-2 pl-18"
          onSubmit={(event) => {
            event.preventDefault();
            accept.mutate({ message });
          }}
        >
          <label htmlFor={field} className="sr-only">
            {`Why ${step}'s work is good enough as it stands`}
          </label>
          <textarea
            id={field}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={3}
            placeholder="Why the work is good enough with its findings open (required): every step after the loop is handed it."
            className={TEXTAREA}
          />
          <button type="submit" disabled={accept.isPending || !message.trim()} className={BUTTON}>
            {accept.isPending ? 'Accepting…' : 'Accept as it stands'}
          </button>
          {accept.isError && <Refusal error={accept.error} not="Not accepted" />}
        </form>
      )}
    </li>
  );
}

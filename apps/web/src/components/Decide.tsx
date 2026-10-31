import { useId, useState, type ReactNode } from 'react';
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
import { answersOf, askedOf, askedSaid, type Answer } from '../lib/asks';
import { barOf, changeOf, decidableRun, decisionStamp, diffLine, isDecidable, mostLines, type DiffLine } from '../lib/decide';
import { cn } from '../lib/utils';
import { BUTTON, MODES, Refusal, TEXTAREA, useAsk } from './Ask';
import { CommandLine } from './CommandLine';
import { Facts, HEADING, pathRow, readRows, TrialMerges } from './Facts';
import { AskedRow, Asks, QuestionsForm } from './Questions';
import { EnoughRow } from './Enough';
import { RaiseRow } from './Raise';
import { container, dashed, hairline, ringed } from '../lib/meaning';
import { OFFERS } from '../lib/words';

/**
 * The Decide section of a run's page: the answer each step waiting on you can be given (`answersOf`), then what the CLI's `decide` shows a
 * person — read once for the run's state (`decisionQuery`), only while the run has something to decide, and shown when the api says
 * there is. The answers keep their place in one frame while the decision is read, refused or drawn, so a row keeps what was typed in it
 * and the refusal of its ask. A step whose next try a person asked for has that try's note there (`askedOf`) — a run that still runs
 * with a try asked of a session the harness blocked, continued from the banner, has that note and nothing to decide. An api that
 * refuses says why, here.
 */
export function Decide({ run }: { run: RunDetail }) {
  const decidable = decidableRun(run);
  const { data, error } = useQuery({ ...decisionQuery(run.id, decisionStamp(run)), enabled: decidable });
  const offers = answersOf(run);
  const asked = run.steps.flatMap((step) => {
    const one = askedOf(run, step.name);
    return one ? [{ step: step.name, ...one }] : [];
  });
  const answers = offers.length + asked.length > 0 ? <Offers runId={run.id} offers={offers} asked={asked} steps={run.steps} /> : null;
  const body =
    decidable && error ? (
      <p className="text-body-medium text-failure">
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
    <section aria-label="Decide" id="decide" className="scroll-mt-4 space-y-5 rounded border border-outline-variant p-4">
      <div className="space-y-1">
        <h2 className="font-semibold">Decide</h2>
        <p className="text-body-small text-muted-foreground">
          What there is to decide on this run. Copy a command to run it yourself. An answer given here runs its step's command, as the
          command line would: a try, a round, or approving a loop's work as it stands with your reason; each row says what the tick does
          with it.
        </p>
      </div>
      {children}
    </section>
  );
}

/**
 * What there is to decide, in the CLI `decide`'s order: the OVER BUDGET line where a step is held on its budget, what each branch touched
 * and the lesson line, the check-affecting files in full, what the run consumed and cost, and the commands — copyable, and none of them run
 * from here: what the board presses is an answer's (`Offers`). `offers` go first. The OVER BUDGET
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
        <p data-over-budget className={`rounded px-3 py-2 font-mono text-body-small break-words ${container.yours}`}>
          {overBudget}
        </p>
      )}

      <div className="space-y-4">
        {inFolders ? (
          <div data-in-folders className="space-y-1">
            <p className="text-body-medium text-muted-foreground">
              Worked in folders of its own, and changed nothing anywhere else: what it made is there, to keep or to forget.
            </p>
            <Facts rows={[['work', pathRow(run.work)]]} />
          </div>
        ) : touched.length ? (
          touched.map((t) => <TouchedBranch key={t.branch} touched={t} />)
        ) : (
          <p className="text-body-medium text-muted-foreground">No branch to read: no step worked on one.</p>
        )}
        {!inFolders && <LessonChip lesson={lesson} />}
      </div>

      {decision.collisions && <TrialMerges runId={runId} collisions={decision.collisions} />}

      {!inFolders && <InFull sensitive={sensitive} touched={touched} />}

      <section aria-label="Used" className="space-y-1">
        <h3 className={HEADING}>Used, over every step's current try — and what every try of the run cost</h3>
        <Facts rows={[['used', total.used], ['cost', total.cost], ...readRows(total), ['every try', cost]]} />
      </section>

      <Commands commands={commands} />
    </>
  );
}

/** A step whose next try a person asked for, as the Answer section notes it (`askedOf`). */
type AskedNote = { step: string; try: number; note: string | null };

/**
 * What the board can answer for each step waiting on you (`offersOf`), a row a step, each pressing the step's own command (`kind`) with
 * the words its case says (`OFFERS`): a step whose closeout asks questions as data is answered by choosing (`QuestionsForm`), a raise
 * with its amount (`RaiseRow`), a loop out of rounds approved as it stands (`EnoughRow`), every other a try (`OfferRow`). Each is made by
 * the api through the package's own verb, which writes the ask and nothing else; the next tick files what follows. Then a note for each
 * step whose next try is already asked.
 */
export function Offers({
  runId,
  offers,
  asked = [],
  steps,
}: {
  runId: string;
  offers: readonly Answer[];
  asked?: readonly AskedNote[];
  steps: readonly Pick<RunDetail['steps'][number], 'name' | 'commands'>[];
}) {
  const lineOf = (offer: Answer): string => steps.find((s) => s.name === offer.step)?.commands[offer.kind] ?? '';
  return (
    <section aria-label="Answer" className="space-y-2">
      <h3 className={HEADING}>Answer — each runs its step's command, as the command line would: a try, a round, or an approval</h3>
      <ul className="space-y-3">
        {offers.map((offer) =>
          offer.case === 'raise' ? (
            <RaiseRow key={offer.step} runId={runId} offer={offer} />
          ) : offer.case === 'answer' && offer.questions.length > 0 ? (
            <QuestionsForm key={offer.step} runId={runId} offer={offer} />
          ) : offer.case === 'enough' ? (
            <EnoughRow key={offer.step} runId={runId} offer={offer} line={lineOf(offer)} />
          ) : (
            <OfferRow key={offer.step} runId={runId} offer={offer} />
          ),
        )}
        {asked.map((one) => (
          <AskedRow key={one.step} step={one.step} said={one.note ?? `try ${one.try} asked`} />
        ))}
      </ul>
    </section>
  );
}

/** What a step needs, as its row says it after its name, when it is not a question: a question is drawn as the markdown it is (`Asks`). */
function offerSaid(offer: Extract<Answer, { case: 'answer' | 'try-again' | 'denied' }>): string {
  if (offer.case === 'answer') return OFFERS.answer.said;
  if (offer.case === 'denied') return OFFERS.denied.said(offer.calls);
  const { said } = OFFERS['try-again'];
  return !offer.recheck ? said.unsigned : offer.unfinished ? said.unfinished : said.refused;
}

/**
 * One step's answer: what it needs, then the box and the button that ask — an answer to a step that signed off blocked, `Try again` for a
 * refused check or an unsigned step — and the api's refusal beside them, verbatim. Once the api has the ask, the row says what the tick
 * does with it, until the run is read again and the step's note says what the CLI's `ls` says: `try 2 asked (…) — the next tick files it`.
 *
 * As the CLI's `decide` offers it, a check that did not finish is run again first, since the run spent no retry on it, and a denied step
 * gets a new session first, since the one it had was denied and carries on the same permissions. A recheck files no session, so it carries
 * no message (`messageRefusal` refuses one) and the box is closed while it is chosen. An answer goes as it was typed, as `--message` takes
 * it; something to tell a try is optional, and none is sent when nothing was written or with a recheck, whatever the closed box still
 * holds.
 */
export function OfferRow({ runId, offer }: { runId: string; offer: Extract<Answer, { case: 'answer' | 'try-again' | 'denied' }> }) {
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<RetryMode>(
    offer.case === 'try-again' && offer.unfinished ? 'recheck' : offer.case === 'denied' ? 'fresh' : 'nudge',
  );
  const field = useId();
  const rechecking = mode === 'recheck';
  const ask = useAsk(runId, offer.step, () => setMessage(''));
  const words = OFFERS[offer.case];
  const recheck = OFFERS['try-again'].recheck;

  if (ask.isSuccess) return <AskedRow step={offer.step} said={askedSaid(ask.data)} />;

  const modes: RetryMode[] =
    offer.case === 'try-again' && offer.recheck
      ? ['nudge', 'fresh', 'recheck']
      : offer.case === 'denied'
        ? ['fresh', 'nudge']
        : ['nudge', 'fresh'];
  return (
    <li
      data-offer={offer.case}
      data-kind={offer.kind}
      data-step={offer.step}
      className="space-y-2 rounded border border-yours bg-card p-3 text-body-medium"
    >
      {offer.case === 'answer' && offer.needs ? (
        <Asks data-said step={offer.step} needs={offer.needs} />
      ) : (
        <p data-said className="break-words">
          <strong>{offer.step}</strong> {offerSaid(offer)}
        </p>
      )}
      <form
        aria-label={words.form(offer.step)}
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          const said = !rechecking && (offer.case === 'answer' || message.trim()) ? { message } : {};
          ask.mutate({ mode, ...said });
        }}
      >
        <label htmlFor={field} className="sr-only">
          {words.field(offer.step)}
        </label>
        <textarea
          id={field}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={offer.case === 'answer' ? 3 : 2}
          disabled={rechecking}
          placeholder={rechecking ? recheck.placeholder : words.placeholder}
          className={cn(TEXTAREA, 'disabled:cursor-not-allowed disabled:opacity-50')}
        />
        {rechecking && message.trim() && (
          <p data-recheck-note className="text-body-small text-muted-foreground">
            {recheck.note}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="submit" disabled={ask.isPending || (offer.case === 'answer' && !message.trim())} className={BUTTON}>
            {ask.isPending ? 'Asking…' : words.button}
          </button>
          <fieldset className="flex flex-wrap gap-x-3 gap-y-1 text-body-small">
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
      <p data-asked className="font-mono text-body-small">
        {askedSaid(ask.data)}
      </p>
    );
  }
  return (
    <div data-continue className="space-y-2">
      <form
        aria-label={OFFERS.continue.form(step)}
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          ask.mutate({ mode: 'nudge', ...(message.trim() ? { message } : {}) });
        }}
      >
        <label htmlFor={field} className="sr-only">
          {OFFERS.continue.field(step)}
        </label>
        <textarea
          id={field}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={2}
          placeholder={OFFERS.continue.placeholder}
          className={TEXTAREA}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="submit" disabled={ask.isPending} className={BUTTON}>
            {ask.isPending ? 'Asking…' : OFFERS.continue.button}
          </button>
          <p className="text-body-small">
            as <code>{line}</code> {OFFERS.continue.said}
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
      <p className="text-body-medium">
        <span className="text-muted-foreground">touched </span>
        <span className="break-all font-mono text-body-small">{branch}</span>
      </p>
      {'error' in radius ? (
        <p className="text-body-medium text-failure">{radius.error}</p>
      ) : radius.changes.length ? (
        <>
          <GroupRows groups={radius.groups} />
          <Chips agentFacing={radius.agentFacing} checkAffecting={radius.checkAffecting} />
        </>
      ) : (
        <p className="text-body-medium text-muted-foreground">nothing — the branch changed no file against the base</p>
      )}
    </div>
  );
}

function GroupRows({ groups }: { groups: readonly Group[] }) {
  const most = mostLines(groups);
  return (
    <ul
      aria-label="Groups"
      className="grid grid-cols-[minmax(0,max-content)_max-content_minmax(3rem,1fr)_max-content] items-center gap-x-3 gap-y-1 text-body-small"
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
                  <span className="text-foreground">+{g.added}</span> <span className="text-muted-foreground">−{g.removed}</span>
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
      className="flex h-2 w-full overflow-hidden rounded-sm bg-muted"
    >
      <span data-added className="h-full bg-foreground" style={{ width: `${added}%` }} />
      <span data-removed className="h-full bg-outline" style={{ width: `${removed}%` }} />
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
            className={cn('break-all rounded px-1.5 py-0.5 font-mono text-body-small', className)}
          >
            {file}
          </span>
        ))}
      </p>
    );
  return (
    <div className="space-y-1.5 text-body-small">
      {row('agent-facing', agentFacing, 'agent-facing', AGENT_FACING, hairline)}
      {row('check-affecting', checkAffecting, 'check-affecting', CHECK_AFFECTING, ringed.yours)}
    </div>
  );
}

/** The check-affecting files of each branch in full, collapsed a file each. */
function InFull({ sensitive, touched }: { sensitive: readonly SensitiveDiff[]; touched: readonly Touched[] }) {
  return (
    <section aria-label="In full" className="space-y-2">
      <h3 className={HEADING}>In full: the check-affecting files — what a change could edit to make its check pass</h3>
      {sensitive.map(({ branch, files, error }) => (
        <div key={branch} className="space-y-1.5">
          {sensitive.length > 1 && <p className="break-all font-mono text-body-small text-muted-foreground">{branch}</p>}
          {error ? (
            <p className="text-body-medium text-failure">{error}</p>
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
            <p className="text-body-medium text-muted-foreground">none</p>
          )}
        </div>
      ))}
    </section>
  );
}

const LINE_CLASS: Record<DiffLine, string> = {
  meta: 'font-semibold text-muted-foreground',
  hunk: 'bg-muted text-muted-foreground',
  added: 'bg-accent text-foreground',
  removed: 'text-muted-foreground',
  context: '',
};

/**
 * One file's unified diff, folded under its name, coloured by line; where the api cut it, how much more the CLI's `decide` prints. Its
 * summary is a flex row, which draws no marker of its own: a chevron says it opens, and turns when it has.
 */
export function DiffFileView({ file, counts }: { file: DiffFile; counts?: { added: number | null; removed: number | null } }) {
  return (
    <details data-diff={file.path} className="group rounded border border-outline-variant">
      <summary className="flex cursor-pointer items-center gap-2 px-2 py-1 text-body-small hover:bg-accent">
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
                <span className="text-foreground">+{counts.added}</span> <span className="text-muted-foreground">−{counts.removed}</span>
              </>
            )}
          </span>
        )}
      </summary>
      <pre className="max-h-96 overflow-auto border-t border-outline-variant py-1 font-mono text-body-small leading-snug">
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
        <p data-cut={file.cut} className="border-t border-outline-variant px-2 py-1 text-body-small text-muted-foreground">
          {file.cut} more line{file.cut === 1 ? '' : 's'} — the command line&apos;s decide prints them all
        </p>
      )}
    </details>
  );
}

/** The lesson line: sage when the run wrote where the next agent reads, a grey ring when it wrote nothing, dashed when nobody can say. */
export function LessonChip({ lesson }: { lesson: Lesson }) {
  const [text, title, className] =
    lesson.state === 'written'
      ? [`lesson · ${lesson.said}`, 'The run changed a file where the next agent reads.', container.sage]
      : lesson.state === 'nothing'
        ? [lesson.said, 'What this run learned is written nowhere the next agent reads (CLAUDE.md, "When you miss").', ringed.grey]
        : [`lesson ${lesson.said}`, 'A branch could not be read, so nobody can say what it wrote.', dashed.grey];
  return (
    <p>
      <span
        data-lesson={lesson.state}
        title={title}
        className={cn('inline-block rounded px-2 py-0.5 font-mono text-body-small', className)}
      >
        {text}
      </span>
    </p>
  );
}

/**
 * Land it, drop it, once more: each command on a line of its own with a button that copies it. The board runs none of them: what it
 * presses is an answer's, in the Answer section (`Offers`).
 */
export function Commands({ commands }: { commands: readonly DecideCommand[] }) {
  return (
    <section aria-label="Commands" className="space-y-2">
      <h3 className={HEADING}>Commands — copy one to run it</h3>
      {commands.length ? (
        <ul className="space-y-2">
          {commands.map((c) => (
            <li key={`${c.label} ${c.command}`} data-command={c.label} className="space-y-0.5">
              <CommandLine command={c} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body-medium text-muted-foreground">None yet: the run is still moving.</p>
      )}
    </section>
  );
}

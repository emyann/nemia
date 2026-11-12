import { useState } from 'react';
import { CircleAlert, CircleCheck, CircleHelp, Play, type LucideIcon } from 'lucide-react';
import type { FixStart, NeedState, Readiness, ReadinessFix, ReadinessPiece } from 'objects';
import { CutField, CutFrame, CutPress } from '@/components/look';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/ds/utils';
import { container, dashed, ringed } from '@/lib/meaning';
import { answered, answersOf, AREA_WORDS, piecesByArea } from '@/lib/setup';
import { CopyText } from './CopyText';

/**
 * How each state of a piece is drawn: a word and a glyph, so it is read without its colour, and a hue — missing waits on the person,
 * in place is done, unknown is what the board cannot read.
 */
const STATE: Record<NeedState, { word: string; icon: LucideIcon; className: string }> = {
  missing: { word: 'Missing', icon: CircleAlert, className: ringed.yours },
  met: { word: 'In place', icon: CircleCheck, className: container.sage },
  unknown: { word: 'Unknown', icon: CircleHelp, className: dashed.grey },
};

/** The key a fix is started and said under: its piece's factory, workflow and name, and its index among the piece's fixes. */
const fixKeyOf = (piece: ReadinessPiece, fix: ReadinessFix, i: number): string =>
  [piece.factory ?? '', piece.workflow ?? '', piece.name, String(fix.index ?? i)].join('/');

/** What starts `fix` of `piece`, with `answers` to its asks. */
const startOf = (piece: ReadinessPiece, fix: ReadinessFix, i: number, answers: Record<string, string>): FixStart => ({
  need: piece.name,
  ...(piece.factory === undefined ? {} : { factory: piece.factory }),
  ...(piece.workflow === undefined ? {} : { workflow: piece.workflow }),
  index: fix.index ?? i,
  ...(fix.asks?.length ? { answers: answersOf(fix.asks, answers) } : {}),
});

/** What the list is told to do, and what it says of a start: the key being started, and a start refused, in the api's words. */
type Starts = {
  onStart: (start: FixStart, key: string) => void;
  starting?: string;
  refused?: { key: string; message: string };
};

/**
 * One fix the server starts: a Start press, or for a fix that asks first, a press that opens a small form of its asks — a field each,
 * labelled by what it asks — whose Start sends the answers with the fix. A refusal of its start is said under it.
 */
function StartableFix({ piece, fix, i, starts }: { piece: ReadinessPiece; fix: ReadinessFix; i: number; starts: Starts }) {
  const key = fixKeyOf(piece, fix, i);
  const asks = fix.asks ?? [];
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const pending = starts.starting === key;
  const start = () => starts.onStart(startOf(piece, fix, i, answers), key);
  const refused = starts.refused?.key === key ? starts.refused.message : undefined;
  return (
    <div data-fix-start={key} className="flex flex-col gap-2">
      {asks.length > 0 && open ? (
        <form
          aria-label={`Answers for: ${fix.message}`}
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (answered(asks, answers)) start();
          }}
        >
          {asks.map((ask) => (
            <label key={ask.name} className="flex flex-col gap-1">
              <span className="text-label-medium text-on-surface-variant">{ask.message}</span>
              <CutField>
                <input
                  data-fix-ask={ask.name}
                  name={ask.name}
                  autoComplete="off"
                  value={answers[ask.name] ?? ''}
                  disabled={pending}
                  onChange={(event) => setAnswers({ ...answers, [ask.name]: event.target.value })}
                  className="w-full bg-transparent px-3.5 py-2 text-body-medium text-on-surface outline-none"
                />
              </CutField>
            </label>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <CutPress type="submit" isDisabled={pending || !answered(asks, answers)}>
              {pending ? 'Starting…' : 'Start the fix'}
            </CutPress>
            <Button variant="ghost" isDisabled={pending} onPress={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <Button variant="outline" data-fix-press isDisabled={pending} onPress={asks.length > 0 ? () => setOpen(true) : start}>
            <Play aria-hidden />
            {pending ? 'Starting…' : asks.length > 0 ? 'Answer and start' : 'Start the fix'}
          </Button>
        </div>
      )}
      {refused !== undefined && (
        <p role="alert" data-fix-refused className="text-body-small break-words text-failure">
          Not started. The api refused it: {refused}
        </p>
      )}
    </div>
  );
}

/** One piece of the read: its state in a word and a glyph, its name and what it is, whose it is, and each of its fixes. */
function Piece({ piece, starts }: { piece: ReadinessPiece; starts: Starts }) {
  const state = STATE[piece.state];
  const Icon = state.icon;
  const whose = [piece.factory, piece.workflow].filter((part) => part !== undefined).join(' · ');
  return (
    <li data-piece={piece.name} data-piece-state={piece.state} className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          data-piece-word
          className={cn('inline-flex items-center gap-1 rounded-shape-full px-2 py-0.5 text-label-medium', state.className)}
        >
          <Icon aria-hidden className="size-3.5" />
          {state.word}
        </span>
        <span className="font-mono text-body-medium break-all text-on-surface">{piece.name}</span>
        {whose !== '' && <span className="text-body-small text-on-surface-variant">{whose}</span>}
      </div>
      <p className="text-body-medium break-words text-on-surface-variant">{piece.message}</p>
      {piece.state !== 'met' && piece.fixes.length > 0 && (
        <ul className="flex flex-col gap-3 border-l-2 border-outline-variant pl-3">
          {piece.fixes.map((fix, i) => (
            <li key={fixKeyOf(piece, fix, i)} data-fix={fix.startable ? 'startable' : 'typed'} className="flex flex-col gap-1.5">
              <p className="text-body-small text-on-surface">{fix.message}</p>
              {fix.startable ? (
                <StartableFix piece={piece} fix={fix} i={i} starts={starts} />
              ) : (
                <CopyText text={fix.command} label={`the command: ${fix.command}`} />
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * The readiness read, grouped by area in `objects`' order (`piecesByArea`), each area in a cut frame under its heading: each piece's
 * state — in place, missing or unknown, said in a word and a glyph as well as a hue — its sentence, and, for a piece not in place, its
 * fixes: a command to type, shown with the control that copies it, or a fix the server runs, started by a press (`onStart`), which asks
 * its answers first where it has asks. Above, whether everything is in place.
 */
export function ReadinessList({ readiness, ...starts }: { readiness: Readiness } & Starts) {
  const missing = readiness.pieces.filter((piece) => piece.state === 'missing').length;
  return (
    <div data-readiness={readiness.ready ? 'ready' : 'missing'} className="flex flex-col gap-6">
      <p data-readiness-said className="text-body-medium text-on-surface-variant">
        {readiness.ready
          ? 'Everything is in place.'
          : `${missing} ${missing === 1 ? 'piece is' : 'pieces are'} missing: each says how to put it in place.`}
      </p>
      {piecesByArea(readiness.pieces).map((group) => (
        <section key={group.area} data-area={group.area} aria-labelledby={`area-${group.area}`} className="flex flex-col gap-2">
          <h3 id={`area-${group.area}`} className="text-title-small font-title-small">
            {AREA_WORDS[group.area]}
          </h3>
          <CutFrame size={12}>
            <ul className="flex flex-col divide-y divide-outline-variant px-4">
              {group.pieces.map((piece) => (
                <Piece key={`${piece.factory ?? ''}/${piece.workflow ?? ''}/${piece.name}`} piece={piece} starts={starts} />
              ))}
            </ul>
          </CutFrame>
        </section>
      ))}
    </div>
  );
}

/**
 * A turn of a conversation, as shadcn's Trace draws it in the look: a line a call, with its tool's glyph, its sentence and its quiet
 * fact in mono, in the state `traceStatusOf` gives it. A turn with a line still at work is drawn open, that line alive; one with none
 * folds into the single line `turnWords` gives it — `Worked for 2m 14s · 9 steps` — whose lines are drawn only while it is open.
 *
 * A line that carries what it asked or what came back opens to show them, each block capped and scrolling inside itself, the result in
 * the failure's ink where the call failed; a line that carries neither is drawn plain, with nothing to open. Every data mark is written
 * under the prefix `marks` names (`mark`), so each conversation keeps the names its own pages read.
 */
import {
  BrainIcon,
  FileTextIcon,
  GlobeIcon,
  InfoIcon,
  PauseIcon,
  PencilIcon,
  SearchIcon,
  TerminalIcon,
  UsersIcon,
  WorkflowIcon,
  WrenchIcon,
} from 'lucide-react';
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from '@/components/ui/trace';
import { ink } from '@/lib/meaning';
import { mark, traceStatusOf, turnWords, type ConversationItem, type ConversationLine } from '@/lib/conversation';
import { cn } from '@/lib/utils';

/** A turn of a conversation: what the family's `work` item holds. */
type Work = Extract<ConversationItem, { kind: 'work' }>;

/**
 * The glyph a line is drawn with, by the tool it called; a tool the board does not know draws the plain one. A line that called
 * nothing names what it is instead — a thought of the session's, a line its harness wrote — and is drawn by that.
 */
const TOOL_ICON: Record<string, typeof WrenchIcon> = {
  Thinking: BrainIcon,
  Harness: InfoIcon,
  Read: FileTextIcon,
  Write: PencilIcon,
  Edit: PencilIcon,
  Glob: SearchIcon,
  Grep: SearchIcon,
  Bash: TerminalIcon,
  Task: UsersIcon,
  Agent: UsersIcon,
  WebFetch: GlobeIcon,
  WebSearch: GlobeIcon,
};

/** How tall a block of what was asked or what came back grows before it scrolls inside itself. */
const BODY_CAP = 'max-h-56 overflow-y-auto';

/** The line itself: the glyph of its tool, or the pause of one that waits on the person, its sentence, and its fact. */
function Said({ line, marks }: { line: ConversationLine; marks: string }) {
  const Glyph = line.state === 'waits' ? PauseIcon : (TOOL_ICON[line.tool] ?? WrenchIcon);
  return (
    <TraceLine {...mark(marks, 'step', line.state)} status={traceStatusOf(line.state)} className="min-w-0">
      <TraceIcon>
        <Glyph />
      </TraceIcon>
      <TraceTitle className="min-w-0 break-words">{line.sentence}</TraceTitle>
      {line.fact !== undefined && <TraceDescription>{line.fact}</TraceDescription>}
    </TraceLine>
  );
}

/**
 * One line of a turn: plain where it carries neither what it asked nor what came back, and a fold that opens to what it has where it
 * carries either — a call still at work has its input before it has a result.
 */
export function WorkedLine({ line, marks, open }: { line: ConversationLine; marks: string; open?: boolean }) {
  const [asked, came] = [line.input, line.result];
  if (asked === undefined && came === undefined) return <Said line={line} marks={marks} />;
  return (
    <TraceCollapsible defaultExpanded={open}>
      <TraceCollapsibleTrigger>
        <Said line={line} marks={marks} />
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent kind="body">
        {asked !== undefined && (
          <div {...mark(marks, 'asked')} className={BODY_CAP}>
            {asked}
          </div>
        )}
        {came !== undefined && (
          <div {...mark(marks, 'came')} className={cn(BODY_CAP, asked !== undefined && 'mt-2', line.state === 'error' && ink.failure)}>
            {came}
          </div>
        )}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

/**
 * A turn between two of anything else: open and alive while one of its lines is at work, folded into one line once none is. A folded
 * turn stands open from the start where `open` asks for it, which is how a story shows what it holds.
 */
export function Worked({ work, marks, open }: { work: Work; marks: string; open?: boolean }) {
  const lines = work.lines.map((line) => <WorkedLine key={line.id} line={line} marks={marks} />);
  if (work.running) return <Trace {...mark(marks, 'turn', 'running')}>{lines}</Trace>;
  return (
    <TraceCollapsible {...mark(marks, 'turn', 'folded')} defaultExpanded={open}>
      <TraceCollapsibleTrigger>
        <TraceLine>
          <TraceIcon>
            <WorkflowIcon />
          </TraceIcon>
          <TraceTitle>{turnWords(work.ms, work.lines.length)}</TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent kind="nest">
        <Trace>{lines}</Trace>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

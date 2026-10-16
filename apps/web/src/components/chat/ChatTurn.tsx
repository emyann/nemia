/**
 * Her steps, as shadcn's Trace draws them in the look: a line a step, with its icon, its sentence and its quiet fact in mono, in the
 * state `traceStatusOf` gives it. A turn still at work is drawn open, its running line last and alive; a finished one folds into the
 * one line the canvas gives it — `Worked for 2m 14s · 9 steps` — whose steps are drawn only while it is open.
 */
import {
  FileTextIcon,
  GlobeIcon,
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
import { traceStatusOf, turnWords, type ChatStep, type ChatTurn as Turn } from '@/lib/chatFollowing';

/** The glyph a step is drawn with, by the tool it called; a tool the board does not know draws the plain one. */
const TOOL_ICON: Record<string, typeof WrenchIcon> = {
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

/** One step as a line: the glyph of its tool, or the pause of one that waits on the person, its sentence, and its fact. */
function Line({ step }: { step: ChatStep }) {
  const status = traceStatusOf(step.state);
  const Glyph = step.state === 'waits' ? PauseIcon : (TOOL_ICON[step.tool] ?? WrenchIcon);
  return (
    <TraceLine data-chat-step={step.state} status={status} className="min-w-0">
      <TraceIcon>
        <Glyph />
      </TraceIcon>
      <TraceTitle className="min-w-0 break-words">{step.sentence}</TraceTitle>
      {step.fact !== undefined && <TraceDescription>{step.fact}</TraceDescription>}
    </TraceLine>
  );
}

/** Her steps between two of anything else: open and alive while one of them is at work, folded into one line once none is. */
export function ChatTurn({ turn }: { turn: Turn }) {
  if (turn.running) {
    return (
      <Trace data-chat-turn="running">
        {turn.steps.map((step) => (
          <Line key={step.id} step={step} />
        ))}
      </Trace>
    );
  }
  return (
    <TraceCollapsible data-chat-turn="folded">
      <TraceCollapsibleTrigger>
        <TraceLine>
          <TraceIcon>
            <WorkflowIcon />
          </TraceIcon>
          <TraceTitle>{turnWords(turn)}</TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent kind="nest">
        <Trace>
          {turn.steps.map((step) => (
            <Line key={step.id} step={step} />
          ))}
        </Trace>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

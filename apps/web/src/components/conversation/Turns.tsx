import { ChevronDownIcon, FlagIcon, InfoIcon, ListTreeIcon, SendIcon } from 'lucide-react';
import { CodeBlock } from '@/components/ai-elements/code-block';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput, type ToolState } from '@/components/ai-elements/tool';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Markdown } from '@/components/Markdown';
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker';
import { Message, MessageContent } from '@/components/ui/message';
import { timeOfDay } from '@/lib/timeOfDay';
import {
  closeoutOf,
  CLOSEOUT_TOOL,
  bodyLeadsWith,
  summaryShown,
  detailOf,
  type CloseoutTurn,
  type ThinkingTurn,
  type ToldTurn,
  type ToolCall,
  type ToolsTurn,
  type Turn,
} from '@/lib/transcript';
import { cn } from '@/lib/utils';
import { container } from '../../lib/meaning';

/**
 * One turn of a step's conversation, as `foldTranscript` gives it. `live` is whether the session may still add to it; `last`,
 * whether nothing at all has come after it, which is when a thought is still being had; and `tail`, whether nothing has been
 * said after it (`tailStart`), which is when a call with no result may still be answered — and so is running.
 */
export function TurnView({ turn, live, last, tail }: { turn: Turn; live: boolean; last: boolean; tail: boolean }) {
  switch (turn.kind) {
    case 'said':
      return turn.role === 'user' ? (
        <Message align="end" data-turn="said" data-role="user">
          <MessageContent>
            <Bubble variant="secondary" align="end">
              <BubbleContent className="max-h-72 overflow-y-auto scroll-fade-b">
                <Markdown>{turn.text}</Markdown>
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      ) : (
        <Message data-turn="said" data-role="assistant">
          <MessageContent>
            <Bubble variant="ghost" className="w-full">
              <BubbleContent>
                <Markdown>{turn.text}</Markdown>
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      );
    case 'told':
      return <Told turn={turn} />;
    case 'thinking':
      return <Thinking turn={turn} streaming={live && last} />;
    case 'tool':
      return <ToolCallView call={turn.call} running={live && tail} />;
    case 'tools':
      return <ToolRun turn={turn} live={live} tail={tail} />;
    case 'closeout':
      return <Closeout turn={turn} />;
    case 'system':
      return (
        <Marker data-turn="system" className="text-body-small">
          <MarkerIcon>
            <InfoIcon className="size-3.5" />
          </MarkerIcon>
          <MarkerContent>{turn.text}</MarkerContent>
        </Marker>
      );
  }
}

/**
 * What a person said to the session, off the engine's journal: on the reader's side, as their words, marked as said to the session while it
 * ran, with when — and, once the session's transcript shows the words reaching it, that they are in its conversation. Drawn once: the
 * session's own line for them is taken out (`heardIn`). The words as given, not as markdown: they are on the record as typed.
 */
function Told({ turn }: { turn: ToldTurn }) {
  return (
    <Message align="end" data-turn="told" data-attempt={turn.attempt}>
      <MessageContent>
        <p className="flex items-center justify-end gap-1.5 text-body-small text-muted-foreground">
          <SendIcon className="size-3" />
          <span>You said, while it ran</span>
          <span aria-hidden>·</span>
          <time dateTime={turn.at} title={turn.at}>
            {timeOfDay(new Date(turn.at))}
          </time>
          {turn.arrived && (
            <>
              <span aria-hidden>·</span>
              <span data-arrived={turn.arrived} title={`In the session's conversation at ${turn.arrived}`}>
                in its conversation
              </span>
            </>
          )}
        </p>
        <Bubble variant="tinted" align="end">
          <BubbleContent className="max-h-72 overflow-y-auto whitespace-pre-wrap scroll-fade-b">{turn.text}</BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}

/** A thought, folded: its text once opened, or a word that the harness kept none. */
function Thinking({ turn, streaming }: { turn: ThinkingTurn; streaming: boolean }) {
  return (
    <Reasoning data-turn="thinking" className="mb-0" defaultOpen={false} isStreaming={streaming}>
      <ReasoningTrigger
        getThinkingMessage={(isStreaming) =>
          isStreaming ? <Shimmer duration={1}>Thinking…</Shimmer> : <p>{turn.text ? 'Thought' : 'Thought, with no text kept'}</p>
        }
      />
      <ReasoningContent className="mt-2 border-l pl-4">
        {turn.text ?? '_The harness wrote this thought down without its text._'}
      </ReasoningContent>
    </Reasoning>
  );
}

/** How a call went: by its result, or — without one — running while the session may still answer it, and unanswered once it cannot. */
const stateOf = (call: ToolCall, running: boolean): ToolState =>
  call.result ? (call.result.isError ? 'error' : 'completed') : running ? 'running' : 'no-result';

/** One call, folded to its line — its name, what it was about, how it went — and opened, its input and its result. */
export function ToolCallView({ call, running, defaultOpen = false }: { call: ToolCall; running: boolean; defaultOpen?: boolean }) {
  return (
    <Tool data-turn="tool" data-tool={call.name} defaultExpanded={defaultOpen}>
      <ToolHeader title={call.name} detail={detailOf(call)} state={stateOf(call, running)} />
      <ToolContent>
        <ToolInput input={call.input} />
        {call.result && <ToolOutput output={call.result.text} isError={call.result.isError} />}
      </ToolContent>
    </Tool>
  );
}

/**
 * Calls with nothing said between them, as one line — "Ran 3 commands, read 3 files" — that opens to them. Every call in it
 * waits on the same thing: in the tail of a live session, each without a result is running, as a batch of parallel calls is. Its calls are
 * drawn only while it is open, and spaced inside the panel: a closed panel is hidden, not taken out (`ToolContent`). A thought in it is
 * followed by a call, so it is never the one being had now.
 */
export function ToolRun({
  turn,
  live,
  tail,
  defaultOpen = false,
}: {
  turn: ToolsTurn;
  live: boolean;
  tail: boolean;
  defaultOpen?: boolean;
}) {
  return (
    <Collapsible data-turn="tools" className="group/tools" defaultExpanded={defaultOpen}>
      {({ isExpanded }) => (
        <>
          <CollapsibleTrigger className="flex w-full items-center gap-2 text-left text-body-medium text-muted-foreground transition-colors hover:text-foreground">
            <ListTreeIcon className="size-4 shrink-0" />
            {live && tail && turn.waiting > 0 ? <Shimmer as="span">{turn.summary}</Shimmer> : <span>{turn.summary}</span>}
            {turn.failed > 0 && (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-body-small text-destructive">{turn.failed} failed</span>
            )}
            <ChevronDownIcon className="size-4 shrink-0 transition-transform group-data-expanded/tools:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            {isExpanded && (
              <div className="mt-2 space-y-2 border-l pl-4">
                {turn.turns.map((inner) => (
                  <TurnView key={inner.key} turn={inner} live={live} last={false} tail={tail} />
                ))}
              </div>
            )}
          </CollapsibleContent>
        </>
      )}
    </Collapsible>
  );
}

/**
 * The step's closeout, named: its outcome, summary and body, what it needs, the files it left and the values it handed on — or, in any
 * other shape, the statement as given.
 */
function Closeout({ turn }: { turn: CloseoutTurn }) {
  const closeout = closeoutOf(turn.call);
  const refused = turn.call.result?.isError ? turn.call.result.text : null;
  return (
    <section
      data-turn="closeout"
      aria-label="Closeout"
      className="space-y-2 rounded-lg border bg-card p-4 text-body-medium text-card-foreground"
    >
      <header className="flex flex-wrap items-center gap-2">
        <FlagIcon className="size-4 text-muted-foreground" />
        <h3 className="font-medium">Closeout</h3>
        <span className="font-mono text-body-small text-muted-foreground">{CLOSEOUT_TOOL}</span>
        {closeout && (
          <span
            data-outcome={closeout.outcome}
            className={cn(
              'rounded-full px-2 py-0.5 font-mono text-body-small',
              closeout.outcome === 'blocked' ? container.yours : 'bg-surface-container-highest text-on-surface',
            )}
          >
            {closeout.outcome}
          </span>
        )}
      </header>
      {closeout ? (
        <>
          {!bodyLeadsWith(closeout.summary, closeout.body) && <p data-summary>{summaryShown(closeout.summary)}</p>}
          {closeout.body && <Markdown>{closeout.body}</Markdown>}
          {closeout.needs && (
            <div data-needs className="text-yours">
              <p className="font-medium">Needs:</p>
              <Markdown>{closeout.needs}</Markdown>
            </div>
          )}
          {closeout.artifacts.length > 0 && (
            <p className="text-body-small text-muted-foreground">
              Artifacts: <span className="font-mono">{closeout.artifacts.join(', ')}</span>
            </p>
          )}
          {closeout.values.map((v) => (
            <p key={v.name} className="text-body-small text-muted-foreground">
              {v.name}: <span className="font-mono">{v.value}</span>
            </p>
          ))}
        </>
      ) : (
        <CodeBlock code={JSON.stringify(turn.call.input ?? null, null, 2)} language="json" />
      )}
      {refused && <p className="whitespace-pre-wrap text-body-small text-destructive">The harness refused it: {refused}</p>}
    </section>
  );
}

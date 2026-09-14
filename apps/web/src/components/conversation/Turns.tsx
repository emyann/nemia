import { ChevronDownIcon, FlagIcon, InfoIcon, ListTreeIcon } from 'lucide-react';
import { CodeBlock } from '@/components/ai-elements/code-block';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { Response } from '@/components/ai-elements/response';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput, type ToolState } from '@/components/ai-elements/tool';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker';
import { Message, MessageContent } from '@/components/ui/message';
import { closeoutOf, CLOSEOUT_TOOL, detailOf, type CloseoutTurn, type ThinkingTurn, type ToolCall, type ToolsTurn, type Turn } from '@/lib/transcript';
import { cn } from '@/lib/utils';

/**
 * One turn of a step's conversation, as `foldTranscript` gives it. `live` is whether the session may still add to it, and
 * `last` whether nothing has come after it: a call with no result is running only then, and a thought is still being had.
 */
export function TurnView({ turn, live, last }: { turn: Turn; live: boolean; last: boolean }) {
  switch (turn.kind) {
    case 'said':
      return turn.role === 'user' ? (
        <Message align="end" data-turn="said" data-role="user">
          <MessageContent>
            <Bubble variant="secondary" align="end">
              <BubbleContent className="max-h-72 overflow-y-auto scroll-fade-b">
                <Response>{turn.text}</Response>
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      ) : (
        <Message data-turn="said" data-role="assistant">
          <MessageContent>
            <Bubble variant="ghost" className="w-full">
              <BubbleContent>
                <Response>{turn.text}</Response>
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      );
    case 'thinking':
      return <Thinking turn={turn} streaming={live && last} />;
    case 'tool':
      return <ToolCallView call={turn.call} running={live && last} />;
    case 'tools':
      return <ToolRun turn={turn} live={live} last={last} />;
    case 'closeout':
      return <Closeout turn={turn} />;
    case 'system':
      return (
        <Marker data-turn="system" className="text-xs">
          <MarkerIcon>
            <InfoIcon className="size-3.5" />
          </MarkerIcon>
          <MarkerContent>{turn.text}</MarkerContent>
        </Marker>
      );
  }
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
    <Tool data-turn="tool" data-tool={call.name} defaultOpen={defaultOpen}>
      <ToolHeader title={call.name} detail={detailOf(call)} state={stateOf(call, running)} />
      <ToolContent>
        <ToolInput input={call.input} />
        {call.result && <ToolOutput output={call.result.text} isError={call.result.isError} />}
      </ToolContent>
    </Tool>
  );
}

/** Calls with nothing said between them, as one line — "Ran 3 commands, read 3 files" — that opens to them. */
function ToolRun({ turn, live, last }: { turn: ToolsTurn; live: boolean; last: boolean }) {
  const lastCall = turn.turns.filter((t) => t.kind === 'tool').at(-1);
  return (
    <Collapsible data-turn="tools" className="group/tools">
      <CollapsibleTrigger className="flex w-full items-center gap-2 text-left text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ListTreeIcon className="size-4 shrink-0" />
        {live && last && turn.waiting > 0 ? <Shimmer as="span">{turn.summary}</Shimmer> : <span>{turn.summary}</span>}
        {turn.failed > 0 && (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">{turn.failed} failed</span>
        )}
        <ChevronDownIcon className="size-4 shrink-0 transition-transform group-data-[state=open]/tools:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2 border-l pl-4">
        {turn.turns.map((inner) => (
          <TurnView key={inner.key} turn={inner} live={live} last={last && inner === lastCall} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** The step's closeout, named: its outcome, summary, what it needs and what it left — or, in any other shape, the statement as given. */
function Closeout({ turn }: { turn: CloseoutTurn }) {
  const closeout = closeoutOf(turn.call);
  const refused = turn.call.result?.isError ? turn.call.result.text : null;
  return (
    <section data-turn="closeout" aria-label="Closeout" className="space-y-2 rounded-lg border bg-card p-4 text-sm text-card-foreground">
      <header className="flex flex-wrap items-center gap-2">
        <FlagIcon className="size-4 text-muted-foreground" />
        <h3 className="font-medium">Closeout</h3>
        <span className="font-mono text-xs text-muted-foreground">{CLOSEOUT_TOOL}</span>
        {closeout && (
          <span
            data-outcome={closeout.outcome}
            className={cn(
              'rounded-full px-2 py-0.5 font-mono text-xs',
              closeout.outcome === 'blocked' ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : 'bg-secondary text-secondary-foreground',
            )}
          >
            {closeout.outcome}
          </span>
        )}
      </header>
      {closeout ? (
        <>
          <Response>{closeout.summary}</Response>
          {closeout.needs && (
            <p className="whitespace-pre-wrap text-amber-700 dark:text-amber-400">
              <span className="font-medium">Needs:</span> {closeout.needs}
            </p>
          )}
          {closeout.artifacts.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Artifacts: <span className="font-mono">{closeout.artifacts.join(', ')}</span>
            </p>
          )}
        </>
      ) : (
        <CodeBlock code={JSON.stringify(turn.call.input ?? null, null, 2)} language="json" />
      )}
      {refused && <p className="whitespace-pre-wrap text-xs text-destructive">The harness refused it: {refused}</p>}
    </section>
  );
}

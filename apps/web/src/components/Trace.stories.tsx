import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  CheckIcon,
  FactoryIcon,
  FileTextIcon,
  InboxIcon,
  ListChecksIcon,
  PauseIcon,
  SearchIcon,
  SquareIcon,
  TerminalIcon,
  UsersIcon,
  WorkflowIcon,
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
  type TraceStatus,
} from './ui/trace';

/** The board's Trace, drawn in the look: a line in each state, a step opened, a sub-agent's steps nested, a turn folded and unfolded. */
const meta: Meta = { title: 'Board/Trace' };
export default meta;

/** Where a trace stands in its story: a panel's width, on the card's ground. */
const PANEL = { width: 460, padding: 16, background: 'var(--card)' };

/** One line: its icon, its sentence, its fact, in `status`. */
function Line({ icon, status, fact, children }: { icon: ReactNode; status?: TraceStatus; fact?: string; children: ReactNode }) {
  return (
    <TraceLine status={status}>
      <TraceIcon>{icon}</TraceIcon>
      <TraceTitle>{children}</TraceTitle>
      {fact && <TraceDescription>{fact}</TraceDescription>}
    </TraceLine>
  );
}

/** A line in each state: done, running, error, pending, and waiting on you. */
export const Lines: StoryObj = {
  render: () => (
    <div style={PANEL}>
      <Trace>
        <Line icon={<FileTextIcon />} fact="212 lines">
          Read <code>harness/claude/attached.ts</code>
        </Line>
        <Line icon={<TerminalIcon />} status="running" fact="14s">
          Running <code>npm run lint</code>
        </Line>
        <Line icon={<TerminalIcon />} status="error" fact="exit 1">
          Failed to run <code>node --test attached.boundary</code>
        </Line>
        <Line icon={<SquareIcon />} status="pending">
          Run the whole suite
        </Line>
        <Line icon={<PauseIcon />} status="yours" fact="2m">
          Waits for your approval: land
        </Line>
      </Trace>
    </div>
  ),
};

/** The line at work alone, its title shimmering in alive: still where the person asked for reduced motion. */
export const Running: StoryObj = {
  render: () => (
    <div style={PANEL}>
      <Trace>
        <Line icon={<TerminalIcon />} status="running" fact="14s">
          Running <code>npm run lint</code>
        </Line>
      </Trace>
    </div>
  ),
};

/** What a search asked and what came back. */
const SEARCHED = `rg -n drainsThis packages/agent-runtime/src
attached.ts:88        const held = () => draining || drainsThis(root);
attached-file.ts:141  export const drainsThis = (root: string) => …
1 more, in attached.boundary.test.ts`;

/** A step opened: what it asked and what came back. */
export const Opened: StoryObj = {
  render: () => (
    <div style={PANEL}>
      <Trace>
        <TraceCollapsible defaultExpanded>
          <TraceCollapsibleTrigger>
            <Line icon={<SearchIcon />} fact="3 matches">
              Searched for <code>drainsThis</code>
            </Line>
          </TraceCollapsibleTrigger>
          <TraceCollapsibleContent kind="body">{SEARCHED}</TraceCollapsibleContent>
        </TraceCollapsible>
      </Trace>
    </div>
  ),
};

/** An agent she asked, its steps nested under it. */
export const SubAgent: StoryObj = {
  render: () => (
    <div style={PANEL}>
      <Trace>
        <TraceCollapsible defaultExpanded>
          <TraceCollapsibleTrigger>
            <Line icon={<UsersIcon />} fact="2m 10s">
              Agora reviewed the change
            </Line>
          </TraceCollapsibleTrigger>
          <TraceCollapsibleContent>
            <Trace>
              <Line icon={<FileTextIcon />} fact="+214 −38">
                Read the diff
              </Line>
              <Line icon={<TerminalIcon />} fact="41s">
                Ran <code>npm run typecheck</code>
              </Line>
              <Line icon={<CheckIcon />}>Asked for one more round: a mutant survived</Line>
            </Trace>
          </TraceCollapsibleContent>
        </TraceCollapsible>
      </Trace>
    </div>
  ),
};

/** A whole turn, its steps under one line. */
function Turn({ open }: { open: boolean }) {
  return (
    <div style={PANEL}>
      <Trace>
        <TraceCollapsible defaultExpanded={open}>
          <TraceCollapsibleTrigger>
            <Line icon={<WorkflowIcon />} fact="9 steps">
              Worked for 2m 14s
            </Line>
          </TraceCollapsibleTrigger>
          <TraceCollapsibleContent>
            <Trace>
              <Line icon={<InboxIcon />} fact="16 cards">
                Read the inbox
              </Line>
              <Line icon={<ListChecksIcon />} fact="2 gates">
                Read the runs that wait
              </Line>
            </Trace>
          </TraceCollapsibleContent>
        </TraceCollapsible>
      </Trace>
    </div>
  );
}

/** A turn folded into one line once she has answered. */
export const Folded: StoryObj = { render: () => <Turn open={false} /> };

/** The same turn, unfolded. */
export const Unfolded: StoryObj = { render: () => <Turn open /> };

/** A turn at work, as her panel shows it while she answers: the turn running, its steps done and the one at work under it. */
export const Working: StoryObj = {
  render: () => (
    <div style={PANEL}>
      <Trace>
        <TraceCollapsible defaultExpanded>
          <TraceCollapsibleTrigger>
            <Line icon={<WorkflowIcon />} status="running" fact="41s">
              Working on it
            </Line>
          </TraceCollapsibleTrigger>
          <TraceCollapsibleContent>
            <Trace>
              <Line icon={<InboxIcon />} fact="16 cards">
                Read the inbox
              </Line>
              <Line icon={<FactoryIcon />} fact="3, all ticking">
                Read the factories
              </Line>
              <Line icon={<ListChecksIcon />} status="running" fact="8s">
                Reading the runs that wait
              </Line>
            </Trace>
          </TraceCollapsibleContent>
        </TraceCollapsible>
      </Trace>
    </div>
  ),
};

import { Blocks, Bot, ChartColumn, Factory, House, Inbox, List, Network, Waypoints } from 'lucide-react';

/** Whether `path` is `to` or a page under it: `/agents/new` is under `/agents`, `/agentsx` is not. */
const under = (to: string) => (path: string) => path === to || path.startsWith(`${to}/`);

/**
 * The sidebar's list, until the sidebar is rebuilt around a factory. The Inbox first: where an idea waits to be started, and so where work
 * begins — lit on a card's page too. Then the Factories, a block each, lit inside one too, which the frame lists under it; Runs, lit on a
 * run's page too, since the list is where a run is reached from; Stats, how well the runs went, measured; and Workflows, where one starts,
 * lit on a step's page.
 */
export const NAV = [
  { to: '/inbox', label: 'Inbox', icon: Inbox, active: under('/inbox') },
  { to: '/', label: 'Factories', icon: Factory, active: (path: string) => path === '/' || path.startsWith('/factories/') },
  { to: '/runs', label: 'Runs', icon: List, active: under('/runs') },
  { to: '/stats', label: 'Stats', icon: ChartColumn, active: (path: string) => path === '/stats' },
  { to: '/workflows', label: 'Workflows', icon: Waypoints, active: under('/workflows') },
] as const;

/**
 * The rail, the frame's narrow column of icons at the left: Home, the factories' canvas, lit on it and on a factory's floor only; Agents,
 * what a workflow's nodes may have attached, lit on an agent's page; Machines, the state machines drawn from their code; and, at its foot,
 * Capabilities, what the repository offers a step.
 */
export const RAIL = [
  { to: '/', label: 'Home', icon: House, active: (path: string) => path === '/' || path.startsWith('/factories/') },
  { to: '/agents', label: 'Agents', icon: Bot, active: under('/agents') },
  { to: '/machines', label: 'Machines', icon: Network, active: (path: string) => path === '/machines' },
  { to: '/capabilities', label: 'Capabilities', icon: Blocks, active: (path: string) => path === '/capabilities' },
] as const;

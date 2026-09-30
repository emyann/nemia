import { Blocks, Bot, ChartColumn, Factory, Inbox, List, Network, Waypoints } from 'lucide-react';

/**
 * The menu. The Inbox first: where an idea waits to be started, and so where work begins — lit on a card's page too. Then the Factories,
 * a block each, lit inside one too, which the frame lists under it; Runs, lit on a run's page too, since the list is where a run is reached
 * from; Stats, how well the runs went, measured; Workflows, where one starts, lit on a step's page; Agents, what a workflow's nodes may
 * have attached, lit on an agent's page; Capabilities, what the repository offers a step; and Machines, the state machines drawn from
 * their code.
 */
export const NAV = [
  { to: '/inbox', label: 'Inbox', icon: Inbox, active: (path: string) => path === '/inbox' || path.startsWith('/inbox/') },
  { to: '/', label: 'Factories', icon: Factory, active: (path: string) => path === '/' || path.startsWith('/factories/') },
  { to: '/runs', label: 'Runs', icon: List, active: (path: string) => path === '/runs' || path.startsWith('/runs/') },
  { to: '/stats', label: 'Stats', icon: ChartColumn, active: (path: string) => path === '/stats' },
  {
    to: '/workflows',
    label: 'Workflows',
    icon: Waypoints,
    active: (path: string) => path === '/workflows' || path.startsWith('/workflows/'),
  },
  { to: '/agents', label: 'Agents', icon: Bot, active: (path: string) => path === '/agents' || path.startsWith('/agents/') },
  { to: '/capabilities', label: 'Capabilities', icon: Blocks, active: (path: string) => path === '/capabilities' },
  { to: '/machines', label: 'Machines', icon: Network, active: (path: string) => path === '/machines' },
] as const;

import { Blocks, Bot, Factory, Inbox, List, Waypoints } from 'lucide-react';

/**
 * The menu. The Inbox first: where an idea waits to be started, and so where work begins — lit on a card's page too. Then the Factory, the
 * runs in flight; Runs, lit on a run's page too, since the list is where a run is reached from; Workflows, where one starts, lit on a
 * step's page; and Agents, what a workflow's nodes may have attached, lit on an agent's page.
 */
export const NAV = [
  { to: '/inbox', label: 'Inbox', icon: Inbox, active: (path: string) => path === '/inbox' || path.startsWith('/inbox/') },
  { to: '/', label: 'Factory', icon: Factory, active: (path: string) => path === '/' },
  { to: '/runs', label: 'Runs', icon: List, active: (path: string) => path === '/runs' || path.startsWith('/runs/') },
  {
    to: '/workflows',
    label: 'Workflows',
    icon: Waypoints,
    active: (path: string) => path === '/workflows' || path.startsWith('/workflows/'),
  },
  { to: '/agents', label: 'Agents', icon: Bot, active: (path: string) => path === '/agents' || path.startsWith('/agents/') },
  { to: '/capabilities', label: 'Capabilities', icon: Blocks, active: (path: string) => path === '/capabilities' },
] as const;

import { Blocks, Factory, Inbox, List, Waypoints } from 'lucide-react';

/**
 * The menu. The Inbox first: where an idea waits to be started, and so where work begins. Then the Factory, the runs in flight; Runs,
 * lit on a run's page too, since the list is where a run is reached from; and Workflows, where one starts.
 */
export const NAV = [
  { to: '/inbox', label: 'Inbox', icon: Inbox, active: (path: string) => path === '/inbox' },
  { to: '/', label: 'Factory', icon: Factory, active: (path: string) => path === '/' },
  { to: '/runs', label: 'Runs', icon: List, active: (path: string) => path === '/runs' || path.startsWith('/runs/') },
  { to: '/workflows', label: 'Workflows', icon: Waypoints, active: (path: string) => path === '/workflows' },
  { to: '/capabilities', label: 'Capabilities', icon: Blocks, active: (path: string) => path === '/capabilities' },
] as const;

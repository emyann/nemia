import { createFileRoute } from '@tanstack/react-router';
import { AgentsPage, loadAgents } from '../components/agent/AgentsPage';

/** A factory's agents: the Agents page, the nearest page there is until a factory's own roster is read. */
export const Route = createFileRoute('/factories/$factory_/agents')({
  loader: ({ context }) => loadAgents(context.queryClient),
  component: AgentsPage,
  errorComponent: ({ error }) => (
    <p className="text-body-medium text-failure">
      Could not load the agents: {error instanceof Error ? error.message : String(error)}. Is the api running (<code>npm run dev</code>)?
    </p>
  ),
});

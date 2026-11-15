import { createFileRoute } from '@tanstack/react-router';
import { AgentsPage, loadAgents } from '../components/agent/AgentsPage';

/** Your agents and the skills an agent can be given. */
export const Route = createFileRoute('/agents')({
  loader: ({ context }) => loadAgents(context.queryClient),
  component: AgentsPage,
  errorComponent: ({ error }) => (
    <p className="text-body-medium text-failure">
      Could not load the agents: {error instanceof Error ? error.message : String(error)}. Is the api running (<code>npm run dev</code>)?
    </p>
  ),
});

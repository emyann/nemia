import { createFileRoute } from '@tanstack/react-router';
import { ChartColumn } from 'lucide-react';
import { EmptyState } from '@/components/ui/ds';

/** The rail's Stats, at /stats: a page to come, which says so. */
export const Route = createFileRoute('/stats')({
  component: StatsPage,
});

/** What Stats shows today: that it is to come, and that nothing is counted here yet. */
function StatsPage() {
  return (
    <div data-stats className="flex min-h-96 items-center">
      <EmptyState media={ChartColumn} title="Stats is to come" description="Nothing is counted here yet: this page waits for its own card." />
    </div>
  );
}

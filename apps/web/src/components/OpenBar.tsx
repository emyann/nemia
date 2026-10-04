/**
 * What the frame's floating bar shows, read from the address (`useBar`): nothing while it is closed, else the bar for the thing it names,
 * drawn afresh for each thing, or for each run for its steps.
 */
import { barValue } from '@/lib/bar';
import type { FeedStatus } from '@/lib/feed';
import { useBar } from '@/lib/useBar';
import { FactoryBar } from './FactoryBar';
import { GaugesBar } from './GaugesBar';
import { StartBar } from './FactoryStart';
import { RunBar } from './RunBar';
import { SpecBar } from './SpecBar';
import { StateBar } from './StateBar';
import { StepBar } from './StepBar';

/**
 * The bar the address opens, keyed by what it shows, so a switch to another thing starts from nothing; none while it is closed. A step's
 * is keyed by its run alone, so a switch to another step of the run keeps the tab a person picked. The gauges say `feed`, the workflow
 * feed's state.
 */
export function OpenBar({ feed }: { feed: FeedStatus }) {
  const { open } = useBar();
  if (!open) return null;
  switch (open.kind) {
    case 'start':
      return <StartBar key={barValue(open)} factory={open.factory} />;
    case 'factory':
      return <FactoryBar key={barValue(open)} factory={open.factory} />;
    case 'step':
      return <StepBar key={`step:${open.run}`} run={open.run} step={open.step} />;
    case 'run':
      return <RunBar key={barValue(open)} run={open.run} />;
    case 'spec':
      return <SpecBar key={barValue(open)} from={open.from} workflow={open.workflow} step={open.step} />;
    case 'state':
      return <StateBar key={barValue(open)} machine={open.machine} state={open.state} />;
    case 'gauges':
      return <GaugesBar feed={feed} />;
  }
}

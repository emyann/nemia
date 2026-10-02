/**
 * What the frame's floating bar shows, read from the address (`useBar`): nothing while it is closed, else the bar for the thing it names,
 * drawn afresh for each thing.
 */
import { barValue } from '@/lib/bar';
import { useBar } from '@/lib/useBar';
import { StartBar } from './FactoryStart';

/** The bar the address opens, keyed by what it shows, so a switch to another thing starts from nothing; none while it is closed. */
export function OpenBar() {
  const { open } = useBar();
  if (!open) return null;
  switch (open.kind) {
    case 'start':
      return <StartBar key={barValue(open)} factory={open.factory} />;
  }
}

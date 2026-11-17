/**
 * What a part's reading stories share: a query client that asks the network nothing (`Unread`), so every read the part makes stays out
 * and the part draws what it draws while it waits; and the play that proves it (`saysReading`): the line the waiting state replaced is
 * said once, in a status region over the kit's skeletons, in the story or in what it opened over the page.
 */
import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, waitFor } from 'storybook/test';

/** Holds `children` under a query client whose queries never fetch: each read the part makes is still out. */
export function Unread({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * The play of a reading story: the status region that says `label`, the line the waiting state replaced, holding the kit's skeletons.
 * @param label The line a screen reader hears.
 */
export const saysReading =
  (label: string) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }): Promise<void> => {
    const named = await waitFor(() => {
      const found = [...canvasElement.ownerDocument.body.querySelectorAll('[role="status"]')].find(
        (status) => status.textContent === label,
      );
      if (!found) throw new Error(`no status says ${label}`);
      return found;
    });
    await expect(named.querySelector('[data-slot="skeleton"]')).not.toBeNull();
  };

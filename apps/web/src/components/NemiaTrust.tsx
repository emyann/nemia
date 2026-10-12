import { CopyButton } from './CopyButton';

/**
 * The line that trusts Nemia's folder, as the api answers it (`trust`), to run once in a terminal: her session is filed only once her
 * folder is trusted, and nothing on the board trusts it. None once it is trusted.
 */
export function TrustLine({ trust }: { trust: string | null }) {
  if (trust === null) return null;
  return (
    <div data-nemia-trust className="flex flex-col gap-1">
      <p className="text-body-small text-muted-foreground">
        No session of hers is filed until her folder is trusted: run this once in a terminal, accept its prompt, then type /exit.
      </p>
      <div className="flex max-w-full items-center gap-1 self-start rounded-md border bg-muted/40 px-2 py-1">
        <code className="font-mono text-body-small break-all">{trust}</code>
        <CopyButton text={trust} />
      </div>
    </div>
  );
}

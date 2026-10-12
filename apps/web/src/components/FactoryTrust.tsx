/**
 * The caution on a factory one of whose places a harness does not trust: each place, what the api said is withheld from the place's own
 * settings meanwhile, and the line that trusts them, as the api answered it. A person weighs it, so it is drawn as theirs, light. Draws
 * nothing for a factory whose places are all trusted.
 */
import { ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { Factory } from '@/lib/api';
import { edged, ink } from '@/lib/meaning';
import { CopyButton } from './CopyButton';

/** The caution for `factory`, marked `data-untrusted` with the factory's name. */
export function FactoryTrust({ factory }: { factory: Pick<Factory, 'name' | 'untrusted' | 'commands'> }) {
  const { untrusted } = factory;
  if (untrusted.length === 0) return null;
  const repairable = untrusted.some((u) => u.never === null);
  return (
    <Alert data-untrusted={factory.name} className={edged.yours}>
      <ShieldAlert className={ink.yours} />
      <AlertTitle className={ink.yours}>
        {untrusted.length === 1 ? 'A place is not trusted' : `${untrusted.length} places are not trusted`}
      </AlertTitle>
      <AlertDescription className="flex min-w-0 flex-col gap-2">
        <ul className="flex flex-col gap-2">
          {untrusted.map((u) => (
            <li key={`${u.harness} ${u.place}`} data-untrusted-place={u.place} className="min-w-0">
              <span className="font-mono text-body-small break-all text-foreground">{u.place}</span> is not trusted for {u.harness}.
              Withheld: <span className="break-words">{u.withheld}.</span>
              {u.never !== null && <span data-untrusted-never> {u.never}</span>}
            </li>
          ))}
        </ul>
        {repairable && (
          <p data-trust-command className="flex items-start gap-1">
            <span className="min-w-0">
              Trust {untrusted.length === 1 ? 'it' : 'them'}:{' '}
              <code className="font-mono text-body-small [overflow-wrap:anywhere] text-foreground">{factory.commands.trust}</code>
            </span>
            <CopyButton text={factory.commands.trust} />
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}

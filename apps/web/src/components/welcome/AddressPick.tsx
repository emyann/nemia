import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Fix, FixStart, ReadinessPiece } from 'objects';
import { CutPress } from '@/components/look';
import { TextField } from '@/components/ui/ds';
import { readinessQuery, startFix } from '@/lib/api/readiness';
import { FollowedFix } from '../setup/FollowedFix';
import { PieceFixes, type Starts } from '../setup/ReadinessList';

/**
 * Whether `piece` is a need of the factory `factory` still missing: a need of one of its workflows, or one its place declares, as the
 * Setup page draws them; what a host's sign-in is, is the factory's own words.
 */
const missingOf = (piece: ReadinessPiece, factory: string) =>
  piece.state === 'missing' && ((piece.area === 'workflow' && piece.factory === factory) || piece.area === 'place');

/**
 * The address way's panel: first what this factory still needs before it can clone and run (each missing need of its workflows and its
 * place, with the fixes the server starts, as the Setup page has them), then the address and Clone, which may take minutes while the
 * repository comes down. `onClone` is handed the address; `pending` while the clone is out; `refused` the api's words on one refused.
 */
export function AddressPick({
  factory,
  onClone,
  pending = false,
  refused,
}: {
  factory: string;
  onClone: (address: string) => void;
  pending?: boolean;
  refused?: string | undefined;
}) {
  const queryClient = useQueryClient();
  const [address, setAddress] = useState('');
  const [fixes, setFixes] = useState<Fix[]>([]);
  const readiness = useQuery(readinessQuery);
  const missing = (readiness.data?.pieces ?? []).filter((p) => missingOf(p, factory));
  const start = useMutation({
    mutationFn: ({ start }: { start: FixStart; key: string }) => startFix(start),
    onSuccess: (fix) => setFixes((started) => [fix, ...started.filter((f) => f.id !== fix.id)]),
  });
  const starts = {
    onStart: (fix: FixStart, key: string) => start.mutate({ start: fix, key }),
    ...(start.isPending ? { starting: start.variables.key } : {}),
    ...(start.isError ? { refused: { key: start.variables.key, message: start.error.message } } : {}),
  };
  const ready = /\S/.test(address);
  return (
    <div data-address-pick className="flex flex-col gap-5">
      {missing.length > 0 && (
        <NeedsFirst
          missing={missing}
          starts={starts}
          fixes={fixes}
          onEnded={() => void queryClient.invalidateQueries({ queryKey: readinessQuery.queryKey })}
        />
      )}
      <form
        data-address-form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) onClone(address.trim());
        }}
      >
        <TextField
          label="Address"
          placeholder="git@github.com:you/my-app.git"
          supportingText="Its clone address, https or ssh, as your git host shows it"
          value={address}
          onChange={setAddress}
          isDisabled={pending}
        />
        {pending && (
          <p data-address-cloning className="m-0 text-body-small text-on-surface-variant">
            Cloning: a large repository takes a few minutes.
          </p>
        )}
        {refused !== undefined && (
          <p role="alert" data-volume-refused className="m-0 text-body-small break-words text-failure">
            {refused}
          </p>
        )}
        <div>
          <CutPress type="submit" data-address-clone isDisabled={!ready || pending} pending={pending}>
            Clone it
          </CutPress>
        </div>
      </form>
    </div>
  );
}

/** What this factory still needs before it clones and runs, each need with its fixes, and the fixes started here, followed. */
function NeedsFirst({
  missing,
  starts,
  fixes,
  onEnded,
}: {
  missing: readonly ReadinessPiece[];
  starts: Starts;
  fixes: readonly Fix[];
  onEnded: () => void;
}) {
  return (
    <section data-address-needs aria-label="What this factory needs first" className="flex flex-col gap-3">
      <p className="m-0 text-body-medium text-on-surface-variant">This factory needs these in place before it clones and runs:</p>
      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {missing.map((piece) => (
          <li
            key={`${piece.factory ?? ''}/${piece.workflow ?? ''}/${piece.name}`}
            data-address-need={piece.name}
            className="flex flex-col gap-2"
          >
            <p className="m-0 text-body-medium text-on-surface">{piece.message}</p>
            <PieceFixes piece={piece} starts={starts} />
          </li>
        ))}
      </ul>
      {fixes.map((fix) => (
        <FollowedFix key={fix.id} fix={fix} onEnded={onEnded} />
      ))}
    </section>
  );
}

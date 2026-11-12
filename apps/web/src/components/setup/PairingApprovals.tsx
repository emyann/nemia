import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import type { Pairing } from 'objects';
import { CutField, CutFrame, CutPress } from '@/components/look';
import { Button } from '@/components/ui/button';
import { Instant } from '@/components/time/Instant';

/** What the list is told to do: approve the pairing by the code typed, and what it says of one: being approved, approved, refused. */
type Approves = {
  onApprove: (id: string, code: string) => void;
  approving?: string;
  approved?: string;
  refused?: { id: string; message: string };
};

/**
 * One pending pairing: its client's name and when it lapses, and Approve, which opens a field for the code the client shows — typed by
 * the person off the other screen, never shown here, since the list carries none — and a press that approves it by that code.
 */
function PendingPairing({ pairing, approves }: { pairing: Pairing; approves: Approves }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const pending = approves.approving === pairing.id;
  const refused = approves.refused?.id === pairing.id ? approves.refused.message : undefined;
  return (
    <li data-pairing={pairing.client} className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-body-medium break-all text-on-surface">{pairing.client}</span>
        <span className="text-body-small text-on-surface-variant">
          lapses <Instant at={pairing.expiresAt} />
        </span>
      </div>
      {open ? (
        <form
          aria-label={`Approve ${pairing.client}`}
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (code.trim() !== '') approves.onApprove(pairing.id, code.trim());
          }}
        >
          <label className="flex min-w-48 flex-1 flex-col gap-1">
            <span className="text-label-medium text-on-surface-variant">The code {pairing.client} shows</span>
            <CutField>
              <input
                data-pairing-code
                name="code"
                autoComplete="off"
                placeholder="XXXX-XXXX"
                value={code}
                disabled={pending}
                onChange={(event) => setCode(event.target.value)}
                className="w-full bg-transparent px-3.5 py-2 font-mono text-body-medium tracking-widest text-on-surface uppercase outline-none placeholder:text-on-surface-variant"
              />
            </CutField>
          </label>
          <CutPress type="submit" isDisabled={pending || code.trim() === ''}>
            {pending ? 'Approving…' : 'Approve'}
          </CutPress>
          <Button variant="ghost" isDisabled={pending} onPress={() => setOpen(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <div>
          <Button variant="outline" data-pairing-approve onPress={() => setOpen(true)}>
            <KeyRound aria-hidden />
            Approve…
          </Button>
        </div>
      )}
      {refused !== undefined && (
        <p role="alert" data-pairing-refused className="text-body-small break-words text-failure">
          Not approved. The api refused it: {refused}
        </p>
      )}
    </li>
  );
}

/**
 * The pairings that wait on the person (phase `waiting`), each a client that asked to pair — a laptop's client, or a browser's Pair
 * this browser — with its name, when it lapses, and Approve by the code the client shows. Once one is approved, the client claims its
 * token by itself; `approved` names the last one approved. None waiting says so.
 */
export function PairingApprovals({ pairings, ...approves }: { pairings: readonly Pairing[] } & Approves) {
  const waiting = pairings.filter((pairing) => pairing.phase === 'waiting');
  return (
    <div data-pairings={waiting.length} className="flex flex-col gap-2">
      {approves.approved !== undefined && (
        <p role="status" data-pairing-approved className="text-body-medium text-on-surface-variant">
          Approved {approves.approved}: it signs itself in within a few seconds.
        </p>
      )}
      {waiting.length === 0 ? (
        <p className="text-body-medium text-on-surface-variant">
          No client waits to pair. A laptop asks with its client's pair command, a browser with Pair this browser on its sign-in.
        </p>
      ) : (
        <CutFrame size={12}>
          <ul className="flex flex-col divide-y divide-outline-variant px-4">
            {waiting.map((pairing) => (
              <PendingPairing key={pairing.id} pairing={pairing} approves={approves} />
            ))}
          </ul>
        </CutFrame>
      )}
    </div>
  );
}

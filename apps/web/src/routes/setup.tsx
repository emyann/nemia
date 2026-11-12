import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { Fix, FixStart } from 'objects';
import { FixRun } from '@/components/setup/FixRun';
import { PairingApprovals } from '@/components/setup/PairingApprovals';
import { ReadinessList } from '@/components/setup/ReadinessList';
import { approvePairing, pairingsQuery } from '@/lib/api/pairing';
import { readinessQuery, startFix } from '@/lib/api/readiness';
import { useFixFollow } from '@/lib/useFixFollow';

/** Settings' Setup, at /setup: what the server needs to run its factories. Its loader reads the readiness read. */
export const Route = createFileRoute('/setup')({
  loader: ({ context }) => context.queryClient.ensureQueryData(readinessQuery),
  component: SetupPage,
  pendingComponent: () => <p className="text-body-medium text-muted-foreground">Reading what this server has in place…</p>,
  errorComponent: ({ error }) => (
    <p className="text-body-medium text-failure">
      Could not read what this server has in place: {error instanceof Error ? error.message : String(error)}. Read it at the server's shell,
      or reload the page once the api answers.
    </p>
  ),
});

/** A started fix followed live (`useFixFollow`) and drawn as it runs (`FixRun`); its end reads the readiness again (`onEnded`). */
function FollowedFix({ fix, onEnded }: { fix: Fix; onEnded: () => void }) {
  const followed = useFixFollow(fix, onEnded);
  return (
    <FixRun
      need={fix.need}
      phase={followed.phase}
      output={followed.output}
      {...(fix.code === undefined ? {} : { code: fix.code })}
      {...(followed.ended?.exitCode === undefined ? {} : { exitCode: followed.ended.exitCode })}
      {...(followed.unread === undefined ? {} : { unread: followed.unread })}
    />
  );
}

/**
 * The fixes started on this visit, newest first, each followed as it runs; the readiness read, each piece with its fixes, a press
 * starting one the server runs; and the pairings that wait on the person's approval.
 */
function Readiness() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(readinessQuery);
  const [fixes, setFixes] = useState<Fix[]>([]);
  const start = useMutation({
    mutationFn: ({ start }: { start: FixStart; key: string }) => startFix(start),
    onSuccess: (fix) => setFixes((started) => [fix, ...started.filter((f) => f.id !== fix.id)]),
  });
  const ended = () => void queryClient.invalidateQueries({ queryKey: readinessQuery.queryKey });
  return (
    <section aria-labelledby="setup-readiness" className="flex flex-col gap-4">
      <h2 id="setup-readiness" className="text-title-medium font-title-medium">
        What the server has in place
      </h2>
      {fixes.length > 0 && (
        <div data-fix-runs className="flex flex-col gap-3">
          {fixes.map((fix) => (
            <FollowedFix key={fix.id} fix={fix} onEnded={ended} />
          ))}
        </div>
      )}
      <ReadinessList
        readiness={data}
        onStart={(fix, key) => start.mutate({ start: fix, key })}
        {...(start.isPending ? { starting: start.variables.key } : {})}
        {...(start.isError ? { refused: { key: start.variables.key, message: start.error.message } } : {})}
      />
    </section>
  );
}

/** The pairings that wait, read every few seconds, and Approve by the code typed; the list is read again once one is approved. */
function Pairings() {
  const queryClient = useQueryClient();
  const pairings = useQuery(pairingsQuery);
  const approve = useMutation({
    mutationFn: ({ code }: { id: string; code: string }) => approvePairing(code),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: pairingsQuery.queryKey }),
  });
  return (
    <section aria-labelledby="setup-pairings" className="flex flex-col gap-4">
      <h2 id="setup-pairings" className="text-title-medium font-title-medium">
        Clients waiting to pair
      </h2>
      {pairings.isError ? (
        <p role="alert" className="text-body-medium break-words text-failure">
          Could not read the pairings: {pairings.error.message}. Read them at the server's shell, or reload the page once the api answers.
        </p>
      ) : pairings.data === undefined ? (
        <p className="text-body-medium text-muted-foreground">Reading the pairings…</p>
      ) : (
        <PairingApprovals
          pairings={pairings.data.pairings}
          onApprove={(id, code) => approve.mutate({ id, code })}
          {...(approve.isPending ? { approving: approve.variables.id } : {})}
          {...(approve.isSuccess ? { approved: approve.data.client } : {})}
          {...(approve.isError ? { refused: { id: approve.variables.id, message: approve.error.message } } : {})}
        />
      )}
    </section>
  );
}

/** Setup: what the server needs to run its factories, each piece's fix, and the clients that wait to pair. */
function SetupPage() {
  return (
    <article data-setup className="mx-auto flex max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-title-large">Setup</h1>
        <p className="text-body-medium text-muted-foreground">
          What this server needs to run its factories, each piece in place or with the fix that puts it there.
        </p>
      </header>
      <Readiness />
      <Pairings />
    </article>
  );
}

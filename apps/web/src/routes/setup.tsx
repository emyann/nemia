import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { ReadinessPiece } from 'objects';
import { CutFrame } from '@/components/look';
import { FollowedFix } from '@/components/setup/FollowedFix';
import { HarnessChecks } from '@/components/setup/HarnessChecks';
import { HarnessChoice, HarnessSkipped } from '@/components/setup/HarnessChoice';
import { PairingApprovals, PairingsReading } from '@/components/setup/PairingApprovals';
import { ReadinessList, ReadinessReading } from '@/components/setup/ReadinessList';
import { approvePairing, pairingsQuery } from '@/lib/api/pairing';
import { quotaQuery } from '@/lib/api/quota';
import { readinessQuery } from '@/lib/api/readiness';
import { quotaTitle } from '@/lib/quota';
import { harnessAsked } from '@/lib/setup';
import { useHarnessActivation } from '@/lib/useHarnessActivation';
import { useNow } from '@/lib/useNow';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

/** Settings' Setup, at /setup: what the server needs to run its factories. Its loader reads the readiness read. */
export const Route = createFileRoute('/setup')({
  staticData: { frame: 'reading' },
  loader: ({ context }) => context.queryClient.ensureQueryData(readinessQuery),
  component: SetupPage,
  pendingComponent: SetupReading,
  errorComponent: ({ error }) => <ReadTrouble what="what this server has in place" error={error} then="Read it at the server's shell." />,
});

/**
 * The fixes started on this visit, newest first, each followed as it runs; over the read, while no harness is activated and the person has
 * not skipped it in this browser (`harnessAsked`), the question of which to activate (`HarnessChoice`), kept on this visit once one is
 * activated so its install's run, its sign-in and its two checks show there; each harness activated, its two checks (`HarnessChecks`);
 * the readiness read, each piece with its fixes, a press starting one the server runs; and the pairings that wait on the person's
 * approval. The activation is the one the welcome drives too (`useHarnessActivation`).
 */
function Readiness() {
  const { data } = useSuspenseQuery(readinessQuery);
  const quota = useQuery(quotaQuery);
  const a = useHarnessActivation(data.pieces);
  const now = useNow(60_000);
  const quotaWords = quota.data === undefined ? undefined : quotaTitle(quota.data, new Date(now));
  const checksOf = (install: ReadinessPiece, signedIn: boolean) => (
    <HarnessChecks
      install={a.checkedInstall(install)}
      {...(signedIn ? { turn: a.turnOf(install.harness?.name ?? install.name) } : {})}
      {...(quotaWords === undefined ? {} : { quota: quotaWords })}
      {...a.starts}
    />
  );
  const chosen = a.chosen;
  const activated = a.choices.filter(
    (choice) => choice !== chosen && choice.install.state === 'met' && choice.install.checks !== undefined,
  );
  return (
    <section aria-labelledby="setup-readiness" className="flex flex-col gap-4">
      <h2 id="setup-readiness" className="text-title-medium font-title-medium">
        What the server has in place
      </h2>
      {chosen !== undefined ? (
        <HarnessChoice
          choices={a.choices}
          activation={{
            choice: chosen,
            ...(a.installRun === undefined ? {} : { run: <FollowedFix key={a.installRun.id} fix={a.installRun} onEnded={a.ended} /> }),
            installed: a.installed,
            checks: checksOf(chosen.install, chosen.signIn?.state === 'met'),
          }}
          {...a.starts}
        />
      ) : harnessAsked(data.pieces, a.skipped) ? (
        <HarnessChoice choices={a.choices} onSkip={a.skip} {...a.starts} onStart={a.activate} />
      ) : (
        a.skipped && harnessAsked(data.pieces, false) && <HarnessSkipped onAskAgain={a.askAgain} />
      )}
      {activated.map((choice) => (
        <CutFrame key={choice.name} size={12}>
          <section data-harness-activated={choice.name} aria-label={`${choice.name}'s checks`} className="flex flex-col gap-1 p-4">
            <h3 className="text-title-small font-title-small">{choice.install.message}</h3>
            {checksOf(choice.install, choice.signIn?.state === 'met')}
          </section>
        </CutFrame>
      ))}
      {a.others.length > 0 && (
        <div data-fix-runs className="flex flex-col gap-3">
          {a.others.map((fix) => (
            <FollowedFix key={fix.id} fix={fix} onEnded={a.ended} />
          ))}
        </div>
      )}
      <ReadinessList readiness={data} {...a.starts} />
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
        <div role="alert">
          <ReadTrouble what="the pairings" error={pairings.error} className="break-words" then="Read them at the server's shell." />
        </div>
      ) : pairings.data === undefined ? (
        <PairingsReading />
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

/** The page's name and what it is for, which need no read. */
function SetupHead() {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-title-large">Setup</h1>
      <p className="text-body-medium text-on-surface-variant">
        What this server needs to run its factories, each piece in place or with the fix that puts it there.
      </p>
    </header>
  );
}

/** Setup while its readiness is read: its head, and the shape of the readiness list. */
function SetupReading() {
  return (
    <article data-setup-reading className="flex flex-col gap-8">
      <SetupHead />
      <ReadinessReading />
    </article>
  );
}

/** Setup: what the server needs to run its factories, each piece's fix, and the clients that wait to pair. */
function SetupPage() {
  return (
    <article data-setup className="flex flex-col gap-8">
      <SetupHead />
      <Readiness />
      <Pairings />
    </article>
  );
}

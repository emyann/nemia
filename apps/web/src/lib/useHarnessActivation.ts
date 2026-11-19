/**
 * The activation of a harness, as Setup and the welcome both drive the one `HarnessChoice`: the fixes started on this visit and how each
 * ended, the harness being activated, the skip kept in this browser, and a check turn started and followed until it settles, its live
 * check laid over the readiness read's (`checkedInstall`). Once a fix or a turn ends, the readiness read is read again.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Fix, FixPhase, FixStart, ReadinessPiece } from 'objects';
import { readinessQuery, startFix, startTurn, turnQuery } from './api/readiness.ts';
import { forgetHarnessSkip, keepHarnessSkip, readHarnessSkipped } from './harnessSkip.ts';
import { harnessChoices } from './setup.ts';

/**
 * The activation's state and what drives it, over the readiness read's `pieces`.
 * @param pieces The readiness read's pieces, as the page read them.
 */
export function useHarnessActivation(pieces: readonly ReadinessPiece[]) {
  const queryClient = useQueryClient();
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [endedAs, setEndedAs] = useState<Record<string, FixPhase>>({});
  const [activating, setActivating] = useState<string>();
  const [skipped, setSkipped] = useState(readHarnessSkipped);
  const [turnId, setTurnId] = useState<string>();
  const start = useMutation({
    mutationFn: ({ start }: { start: FixStart; key: string }) => startFix(start),
    onSuccess: (fix) => setFixes((started) => [fix, ...started.filter((f) => f.id !== fix.id)]),
  });
  const turnStart = useMutation({ mutationFn: (harness: string) => startTurn(harness), onSuccess: (turn) => setTurnId(turn.id) });
  const turn = useQuery({ ...turnQuery(turnId ?? ''), enabled: turnId !== undefined });
  const turnState = turn.data?.check.state;
  useEffect(() => {
    if (turnState !== undefined && turnState !== 'running') void queryClient.invalidateQueries({ queryKey: readinessQuery.queryKey });
  }, [turnState, queryClient]);
  const ended = (fix: Fix) => {
    setEndedAs((was) => ({ ...was, [fix.id]: fix.phase }));
    void queryClient.invalidateQueries({ queryKey: readinessQuery.queryKey });
  };
  const onStart = (fix: FixStart, key: string) => start.mutate({ start: fix, key });
  const starts = {
    onStart,
    ...(start.isPending ? { starting: start.variables.key } : {}),
    ...(start.isError ? { refused: { key: start.variables.key, message: start.error.message } } : {}),
  };
  const choices = harnessChoices(pieces);
  const chosen = choices.find((choice) => choice.name === activating);
  const installRun = chosen === undefined ? undefined : fixes.find((fix) => fix.need === chosen.install.name);
  const checkedInstall = (install: ReadinessPiece) => {
    const live = turn.data;
    if (live === undefined || install.harness?.name !== live.harness || install.checks === undefined) return install;
    return { ...install, checks: install.checks.map((check) => (check.name === 'turn' ? live.check : check)) };
  };
  return {
    choices,
    chosen,
    installRun,
    others: fixes.filter((fix) => fix !== installRun),
    installed:
      chosen !== undefined && (chosen.install.state === 'met' || (installRun !== undefined && endedAs[installRun.id] === 'succeeded')),
    ended,
    starts,
    skipped,
    checkedInstall,
    /** Activate: the install's fix started, and its harness kept as the one being activated on this visit. */
    activate: (fix: FixStart, key: string) => {
      const name = choices.find((choice) => choice.install.name === fix.need)?.name;
      start.mutate({ start: fix, key }, { onSuccess: () => setActivating(name) });
    },
    skip: () => {
      keepHarnessSkip();
      setSkipped(true);
    },
    askAgain: () => {
      forgetHarnessSkip();
      setSkipped(false);
    },
    /** What runs the check turn of `harness`, and what its start says. */
    turnOf: (harness: string) => ({
      onRun: () => turnStart.mutate(harness),
      ...(turnStart.isPending && turnStart.variables === harness ? { pending: true } : {}),
      ...(turnStart.isError && turnStart.variables === harness ? { refused: turnStart.error.message } : {}),
    }),
  };
}

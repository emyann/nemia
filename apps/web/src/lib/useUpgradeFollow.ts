import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Upgrade, UpgradePhase } from 'objects';
import { readinessQuery } from './api/readiness.ts';
import { UnreadAnswer } from './api/read.ts';
import { streamDataOf } from './api/stream.ts';
import { UPGRADE_STREAM_SCHEMAS, upgradeOutputPath, upgradesQuery } from './api/upgrades.ts';
import { versionQuery } from './api/version.ts';

/** How long a stream that sent its end is left to close by itself before the board closes it, in milliseconds. */
const CLOSE_GRACE_MS = 2_000;

/** How long the board waits before opening again a stream the browser gave up on (an answer not 200 while the daemon restarts). */
const REOPEN_MS = 2_000;

/**
 * An upgrade as it is followed: what it printed so far, its phase, the upgrade as it ended once it did, an end the board could not read,
 * and whether the stream is reaching the api again after it had opened — the daemon restarting onto the new release.
 */
type UpgradeFollowed = { output: string; phase: UpgradePhase; ended?: Upgrade; unread?: string; reconnecting: boolean };

/**
 * A started upgrade's output, followed live (`GET /api/upgrades/:id/output`): each `output` event's chunk added to what it printed, its
 * phase `running` from the first, and its `ended` event's `Upgrade`, decoded by `objects`' schema, as its end. The upgrade restarts the
 * daemon that serves the stream: while the EventSource reconnects after it had opened it is `reconnecting`, and a stream the browser gave
 * up on after it had opened (an answer that is not the stream's) is opened again after a pause; the api sends the output from its start,
 * so what was printed is read afresh then. On its end the version, the readiness and the upgrades read are read again, the server now
 * running what it runs. The stream is closed on the error its end fires, or a grace after its end, never on the end itself.
 */
export function useUpgradeFollow(upgrade: Upgrade): UpgradeFollowed {
  const queryClient = useQueryClient();
  const [followed, setFollowed] = useState<UpgradeFollowed>({ output: upgrade.output, phase: upgrade.phase, reconnecting: false });
  const id = upgrade.id;
  useEffect(() => {
    let stream: EventSource | undefined;
    let ended = false;
    let opened = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const readAgain = () => {
      for (const queryKey of [versionQuery.queryKey, readinessQuery.queryKey, upgradesQuery.queryKey])
        void queryClient.invalidateQueries({ queryKey });
    };
    const open = () => {
      const source = new EventSource(upgradeOutputPath(id));
      stream = source;
      source.addEventListener('open', () => {
        opened = true;
        if (!ended) setFollowed((f) => ({ ...f, output: '', reconnecting: false }));
      });
      source.addEventListener('output', (event) => {
        const text = (event as MessageEvent<string>).data;
        setFollowed((f) => ({ ...f, output: f.output + text, phase: f.phase === 'pending' ? 'running' : f.phase }));
      });
      source.addEventListener('ended', (event) => {
        const data = streamDataOf(UPGRADE_STREAM_SCHEMAS, 'ended', (event as MessageEvent<string>).data);
        ended = true;
        if (data instanceof UnreadAnswer) setFollowed((f) => ({ ...f, unread: data.message, reconnecting: false }));
        else
          setFollowed((f) => ({
            output: data.output.length >= f.output.length ? data.output : f.output,
            phase: data.phase,
            ended: data,
            reconnecting: false,
          }));
        readAgain();
        timer = setTimeout(() => source.close(), CLOSE_GRACE_MS);
      });
      source.addEventListener('error', () => {
        if (ended) {
          source.close();
          return;
        }
        if (opened) setFollowed((f) => (f.reconnecting ? f : { ...f, reconnecting: true }));
        if (opened && source.readyState === EventSource.CLOSED) timer = setTimeout(open, REOPEN_MS);
      });
    };
    open();
    return () => {
      clearTimeout(timer);
      stream?.close();
    };
  }, [id, queryClient]);
  return followed;
}

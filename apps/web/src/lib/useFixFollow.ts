import { useEffect, useRef, useState } from 'react';
import type { Fix, FixPhase } from 'objects';
import { FIX_STREAM_SCHEMAS, fixOutputPath } from './api/readiness.ts';
import { UnreadAnswer } from './api/read.ts';
import { streamDataOf } from './api/stream.ts';

/** How long a stream that sent its end is left to close by itself before the board closes it, in milliseconds. */
const CLOSE_GRACE_MS = 2_000;

/** A fix as it is followed: what it printed so far, its phase, the fix as it ended once it did, and an end the board could not read. */
type FixFollowed = { output: string; phase: FixPhase; ended?: Fix; unread?: string };

/**
 * A started fix's output, followed live (`GET /api/readiness/fixes/:id/output`): each `output` event's chunk added to what it printed,
 * its phase `running` from the first, and its `ended` event's `Fix`, decoded by `objects`' schema, as its end — whose output, the tail the
 * api keeps, is what it printed. A stream that opens again (the EventSource's own reconnect) is sent the output from its start, so what
 * was printed is read afresh then. The stream is closed on the error its end fires, or a grace after its end, never on the end itself.
 * `onEnded`, as the last render gave it, is told the fix once it ends.
 */
export function useFixFollow(fix: Fix, onEnded?: (ended: Fix) => void): FixFollowed {
  const [followed, setFollowed] = useState<FixFollowed>({ output: fix.output, phase: fix.phase });
  const id = fix.id;
  const told = useRef(onEnded);
  useEffect(() => {
    told.current = onEnded;
  });
  useEffect(() => {
    const stream = new EventSource(fixOutputPath(id));
    let ended = false;
    let grace: ReturnType<typeof setTimeout> | undefined;
    stream.addEventListener('open', () => {
      if (!ended) setFollowed((f) => ({ ...f, output: '' }));
    });
    stream.addEventListener('output', (event) => {
      const text = (event as MessageEvent<string>).data;
      setFollowed((f) => ({ ...f, output: f.output + text, phase: f.phase === 'pending' ? 'running' : f.phase }));
    });
    stream.addEventListener('ended', (event) => {
      const data = streamDataOf(FIX_STREAM_SCHEMAS, 'ended', (event as MessageEvent<string>).data);
      ended = true;
      if (data instanceof UnreadAnswer) setFollowed((f) => ({ ...f, unread: data.message }));
      else {
        setFollowed((f) => ({ output: data.output.length >= f.output.length ? data.output : f.output, phase: data.phase, ended: data }));
        told.current?.(data);
      }
      grace = setTimeout(() => stream.close(), CLOSE_GRACE_MS);
    });
    stream.addEventListener('error', () => {
      if (ended) stream.close();
    });
    return () => {
      clearTimeout(grace);
      stream.close();
    };
  }, [id]);
  return followed;
}

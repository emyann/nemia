import { useEffect, useRef, useState } from 'react';
import { readTranscript, transcriptPath } from './api';
import { animationFrames, follow, type Following } from './following.ts';
import { mergeEvents } from './transcript';

export type { Following } from './following.ts';

/**
 * A step's conversation: read once, and followed while its task is live.
 *
 * The read gives the events so far, a cursor, and whether the task is live. A step whose task is not is read that once. One
 * whose task is live is followed by an EventSource on the stream route, from that cursor: each `transcript` event is merged
 * in, `settled` ends it, and a dropped connection is the EventSource's to resume — it reconnects with the id of the last event
 * it was sent. Events that arrive together are merged once a frame, not once each: a stream opened on a long session sends
 * hundreds at once.
 *
 * Read afresh for another task: a step tried again is filed as a new one. And read again, keeping what was read, when the step stops or
 * starts waiting on a person (`waiting`): a task held open that signed is not live, nothing of it runs, and a person's answer runs its next
 * turn under the same id — the page would not follow it otherwise.
 */
export function useStepTranscript(runId: string, step: string, taskId: string | null, waiting = false): Following {
  const [state, setState] = useState<Following>({ events: [], live: false, loading: taskId !== null, error: null });
  const read = useRef(taskId);

  useEffect(() => {
    const again = read.current === taskId;
    read.current = taskId;
    if (!again) setState({ events: [], live: false, loading: taskId !== null, error: null });
    if (!taskId) return;
    const reading = new AbortController();
    let stop: (() => void) | undefined;

    readTranscript(runId, step, reading.signal).then(
      (first) => {
        if (reading.signal.aborted) return;
        setState((s) => ({ events: mergeEvents(again ? s.events : [], first.events), live: first.live, loading: false, error: null }));
        if (!first.live || first.cursor === null) return;
        const stream = new EventSource(`${transcriptPath(runId, step)}/stream?after=${encodeURIComponent(first.cursor)}`);
        stop = follow(stream, setState, animationFrames);
      },
      (err: unknown) => {
        if (!reading.signal.aborted) setState({ events: [], live: false, loading: false, error: err instanceof Error ? err.message : String(err) });
      },
    );

    return () => {
      reading.abort();
      stop?.();
    };
  }, [runId, step, taskId, waiting]);

  return state;
}

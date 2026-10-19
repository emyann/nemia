import { useEffect, useRef, useState } from 'react';
import { readTranscript, transcriptPath } from './api';
import { animationFrames } from './follow.ts';
import { followedFrom, followStep, unread, type Following } from './following.ts';
import { mergeEvents } from './transcript';

export type { Following } from './following.ts';

/**
 * A step's conversation: read once, and followed while the step has not finished. `taskId` is the session to read (`sessionToRead`):
 * null for a step with none, which reads nothing.
 *
 * The read gives the events so far, a cursor, and whether the task is live. A step whose task is not, and which waits on no person
 * (`waiting`), is read that once (`followedFrom`). One whose task is live, or held open on a person's word, is followed by an EventSource
 * on the stream route, from that cursor, as `follow` says: the message being written as it comes, where the api pushes it, the next turn
 * and a try once they are filed (`moved`), and `settled` ends it; a dropped connection is the EventSource's to resume — it reconnects with
 * the id of the last event it was sent. Events that arrive together are merged once a frame, not once each: a stream opened on a long
 * session sends hundreds at once.
 *
 * Read afresh for another task: a step tried again is filed as a new one. And read again, keeping what was read, when the step stops or
 * starts waiting on a person (`waiting`).
 */
export function useStepTranscript(runId: string, step: string, taskId: string | null, waiting = false): Following {
  const [state, setState] = useState<Following>(() => unread(taskId !== null));
  const read = useRef(taskId);

  useEffect(() => {
    const again = read.current === taskId;
    read.current = taskId;
    if (!again) setState(unread(taskId !== null));
    if (!taskId) return;
    const reading = new AbortController();
    let stop: (() => void) | undefined;

    readTranscript(runId, step, reading.signal).then(
      (first) => {
        if (reading.signal.aborted) return;
        setState((s) => ({
          ...unread(false),
          events: mergeEvents(again ? s.events : [], first.events),
          live: first.live,
        }));
        const after = followedFrom(first, waiting);
        if (after === null) return;
        const stream = new EventSource(`${transcriptPath(runId, step)}/stream?after=${encodeURIComponent(after)}`);
        stop = followStep(stream, setState, animationFrames);
      },
      (err: unknown) => {
        if (!reading.signal.aborted) setState({ ...unread(false), error: err instanceof Error ? err.message : String(err) });
      },
    );

    return () => {
      reading.abort();
      stop?.();
    };
  }, [runId, step, taskId, waiting]);

  return state;
}

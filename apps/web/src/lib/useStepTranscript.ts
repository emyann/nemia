import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { transcriptPath, transcriptQuery } from './api/steps.ts';
import { animationFrames } from './follow.ts';
import { followedFrom, followStep, unread, type Following } from './following.ts';
import { mergeEvents } from './transcript';

export type { Following } from './following.ts';

/**
 * A step's conversation: read once, and followed while the step has not finished. `taskId` is the session to read (`sessionToRead`):
 * null for a step with none, which reads nothing.
 *
 * The read gives the events so far, every page of them read on at once while the api says `more` (`readTranscript`), a cursor, and
 * whether the task is live. A step whose task is not, and which waits on no person
 * (`waiting`), is read that once (`followedFrom`). One whose task is live, or held open on a person's word, is followed by an EventSource
 * on the stream route, from that cursor, as `follow` says: the message being written as it comes, where the api pushes it, the next turn
 * and a try once they are filed (`moved`), and `settled` ends it; a dropped connection is the EventSource's to resume — it reconnects with
 * the id of the last event it was sent. Events that arrive together are merged once a frame, not once each: a stream opened on a long
 * session sends hundreds at once.
 *
 * The read is the query's (`transcriptQuery`), started once and never aborted: a reader that leaves before it answers (a bar closed, or
 * switched to another step) only stops listening, and one that comes back while it is out shares it.
 *
 * Read afresh for another task: a step tried again is filed as a new one. And read again, keeping what was read, when the step stops or
 * starts waiting on a person (`waiting`).
 * @param runId The run's id.
 * @param step The step's name.
 * @param taskId The task whose conversation is read (`sessionToRead`), or null where the step has none to read.
 * @param waiting Whether the step waits on a person.
 */
export function useStepTranscript(runId: string, step: string, taskId: string | null, waiting = false): Following {
  const [state, setState] = useState<Following>(() => unread(taskId !== null));
  const read = useRef(taskId);
  const client = useQueryClient();

  useEffect(() => {
    const again = read.current === taskId;
    read.current = taskId;
    if (!again) setState(unread(taskId !== null));
    if (!taskId) return;
    let left = false;
    let stop: (() => void) | undefined;

    client.fetchQuery(transcriptQuery(runId, step, taskId)).then(
      (first) => {
        if (left) return;
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
        if (!left) setState({ ...unread(false), error: err instanceof Error ? err.message : String(err) });
      },
    );

    return () => {
      left = true;
      stop?.();
    };
  }, [client, runId, step, taskId, waiting]);

  return state;
}

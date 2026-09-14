import { useEffect, useState } from 'react';
import { readTranscript, transcriptPath, type TranscriptEvent } from './api';
import { mergeEvents } from './transcript';

/** A step's conversation as a page holds it: the events so far, whether more may come, and why it could not be read, if it could not. */
export type Following = { events: TranscriptEvent[]; live: boolean; loading: boolean; error: string | null };

/**
 * A step's conversation: read once, and followed while its task is live.
 *
 * The read gives the events so far, a cursor, and whether the task is live. A step whose task is not is read that once. One
 * whose task is live is followed by an EventSource on the stream route, from that cursor: each `transcript` event is merged
 * in, `settled` ends it, and a dropped connection is the EventSource's to resume — it reconnects with the id of the last event
 * it was sent. Events that arrive together are merged once a frame, not once each: a stream opened on a long session sends
 * hundreds at once.
 *
 * Read afresh for another task: a step tried again is filed as a new one.
 */
export function useStepTranscript(runId: string, step: string, taskId: string | null): Following {
  const [state, setState] = useState<Following>({ events: [], live: false, loading: taskId !== null, error: null });

  useEffect(() => {
    setState({ events: [], live: false, loading: taskId !== null, error: null });
    if (!taskId) return;
    const reading = new AbortController();
    let source: EventSource | undefined;
    let arrived: TranscriptEvent[] = [];
    let frame = 0;
    const flush = () => {
      frame = 0;
      const merged = arrived;
      arrived = [];
      setState((s) => ({ ...s, events: mergeEvents(s.events, merged) }));
    };

    readTranscript(runId, step, reading.signal).then(
      (first) => {
        if (reading.signal.aborted) return;
        setState({ events: mergeEvents([], first.events), live: first.live, loading: false, error: null });
        if (!first.live || first.cursor === null) return;
        const stream = new EventSource(`${transcriptPath(runId, step)}/stream?after=${encodeURIComponent(first.cursor)}`);
        source = stream;
        const end = (error: string | null) => {
          stream.close();
          if (frame) {
            cancelAnimationFrame(frame);
            flush();
          }
          setState((s) => ({ ...s, live: false, error }));
        };
        stream.addEventListener('transcript', (message) => {
          arrived.push(JSON.parse(message.data) as TranscriptEvent);
          frame ||= requestAnimationFrame(flush);
        });
        stream.addEventListener('settled', () => end(null));
        stream.addEventListener('unreadable', (message) => {
          const said = (JSON.parse(message.data) as { error?: unknown }).error;
          end(typeof said === 'string' ? said : 'The conversation could not be read any further.');
        });
        stream.addEventListener('error', () => {
          // A dropped connection is retried by the EventSource itself; it closes only when the api answered with a refusal.
          if (stream.readyState === EventSource.CLOSED) end('The api refused to follow this conversation any further. Reload the page to read it again.');
        });
      },
      (err: unknown) => {
        if (!reading.signal.aborted) setState({ events: [], live: false, loading: false, error: err instanceof Error ? err.message : String(err) });
      },
    );

    return () => {
      reading.abort();
      source?.close();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [runId, step, taskId]);

  return state;
}

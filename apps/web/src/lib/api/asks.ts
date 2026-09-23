/** What a person asks of a run from the board — a try, a round, an approval, an acceptance, words to a session (apps/api/src/asks.ts). */

/** Mirrors `Said` in agent-workflows, the engine's `said` entry: words a person said to a step's running session, when, and to which attempt of its task. */
export type Said = { at: string; attempt: number; text: string };

/** How `wf retry` tries a step again: continue its session, a new one, or its check run again and no session. */
export type RetryMode = 'nudge' | 'fresh' | 'recheck';

/**
 * Ask for another try of a step, as `wf retry` does: the api calls the package's `retry()`, which writes the ask and nothing else, and the
 * next tick files the try. Resolves with the try asked for, its ask file, and the package's `stopFirst` — the tick stops the step's blocked
 * session before it files the try; rejects with the api's refusal in full — the package's words for a message or a budget that cannot ride
 * on the ask, a step that may not be tried again that way, or a budget not above what its tries have cost — or the api's own about the request.
 * `budget` is `--budget`: the cap a step over its budget, or ended at it, is raised to.
 *
 * Sent as `application/json`, which the api requires of it, as of a start.
 */
export async function askTry(runId: string, step: string, how: { mode: RetryMode; model?: string; message?: string; budget?: number }): Promise<{ try: number; file: string; stopFirst: boolean }> {
  const route = `/api/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(step)}/retry`;
  const res = await fetch(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(how) });
  const body = (await res.json().catch(() => undefined)) as { try?: unknown; file?: unknown; stopFirst?: unknown; error?: unknown } | undefined;
  if (res.ok && typeof body?.try === 'number') return { try: body.try, file: String(body.file), stopFirst: body.stopFirst === true };
  if (res.ok) {
    // Written, it may well be: look before asking again.
    throw new Error(
      `POST ${route} answered ${res.status} ${res.statusText} without the try it asked for, so the api and this board disagree about what an ask answers. ` +
        `The ask may be written: look at the step's note (\`wf ls ${runId}\`) before asking again, and restart the api (\`npm run dev\`).`,
    );
  }
  throw new Error(typeof body?.error === 'string' ? body.error : `POST ${route} answered ${res.status} ${res.statusText}`);
}

/**
 * Ask for another round of a run's loop, as `wf round` does — past a cap, with `budget`, `--budget`: the api calls the package's `round()`,
 * which writes the ask and nothing else, and the next tick files the round. Resolves with the looping step, the round asked for, and its ask
 * file; rejects with the api's refusal in full — the package's words for a round the loop may not go, or a budget not above what its steps
 * have cost — or the api's own about the request.
 *
 * Sent as `application/json`, which the api requires of it, as of a try.
 */
export async function askRound(runId: string, how: { step?: string; budget?: number }): Promise<{ step: string; round: number; file: string }> {
  const route = `/api/runs/${encodeURIComponent(runId)}/round`;
  const res = await fetch(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(how) });
  const body = (await res.json().catch(() => undefined)) as { step?: unknown; round?: unknown; file?: unknown; error?: unknown } | undefined;
  if (res.ok && typeof body?.step === 'string' && typeof body.round === 'number') return { step: body.step, round: body.round, file: String(body.file) };
  if (res.ok) {
    // Written, it may well be: look before asking again.
    throw new Error(
      `POST ${route} answered ${res.status} ${res.statusText} without the round it asked for, so the api and this board disagree about what an ask answers. ` +
        `The ask may be written: look at the looping step's note (\`wf ls ${runId}\`) before asking again, and restart the api (\`npm run dev\`).`,
    );
  }
  throw new Error(typeof body?.error === 'string' ? body.error : `POST ${route} answered ${res.status} ${res.statusText}`);
}

/**
 * Approve a step waiting at its gate, as `wf approve` does — with `message`, `--message`, the words every step after the gate is handed: the
 * api calls the package's `approve()`, which writes the approval and nothing else, and the next tick files what waits on the step. Resolves
 * with the try approved, when, the words and the approval's file; rejects with the api's refusal in full — the package's words for a step
 * that may not be approved, or for empty words — or the api's own about the request.
 *
 * Sent as `application/json`, which the api requires of it, as of an ask. Sending the step back is an ask for a try with words (`askTry`).
 */
export async function approveStep(runId: string, step: string, how: { message?: string }): Promise<{ try: number; at: string; message: string | null; file: string }> {
  const route = `/api/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(step)}/approve`;
  const res = await fetch(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(how) });
  const body = (await res.json().catch(() => undefined)) as { try?: unknown; at?: unknown; message?: unknown; file?: unknown; error?: unknown } | undefined;
  if (res.ok && typeof body?.try === 'number' && typeof body.at === 'string') {
    return { try: body.try, at: body.at, message: typeof body.message === 'string' ? body.message : null, file: String(body.file) };
  }
  if (res.ok) {
    // Written, it may well be: look before approving again.
    throw new Error(
      `POST ${route} answered ${res.status} ${res.statusText} without the approval it wrote, so the api and this board disagree about what approving answers. ` +
        `The approval may be written: look at the step (\`wf decide ${runId}\`) before approving again, and restart the api (\`npm run dev\`).`,
    );
  }
  throw new Error(typeof body?.error === 'string' ? body.error : `POST ${route} answered ${res.status} ${res.statusText}`);
}

/**
 * Accept the work of a loop out of rounds as it stands, as `wf accept` does — with `message`, `--message`, why the work is good enough with its
 * findings open, which every step after the loop is handed, and which the package requires: the api calls the package's `accept()`, which
 * writes the acceptance and nothing else, and the next tick files what waits on the looping step. Resolves with the step, the try accepted,
 * when, the words and the acceptance's file; rejects with the api's refusal in full — the package's words for words missing or empty, or for a
 * loop that may not be accepted — or the api's own about the request.
 *
 * Sent as `application/json`, which the api requires of it, as of an approval. Going round once more is `askRound`.
 */
export async function acceptLoop(runId: string, step: string, how: { message: string }): Promise<{ step: string; try: number; at: string; message: string; file: string }> {
  const route = `/api/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(step)}/accept`;
  const res = await fetch(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(how) });
  const body = (await res.json().catch(() => undefined)) as { step?: unknown; try?: unknown; at?: unknown; message?: unknown; file?: unknown; error?: unknown } | undefined;
  if (res.ok && typeof body?.step === 'string' && typeof body.try === 'number' && typeof body.at === 'string') {
    return { step: body.step, try: body.try, at: body.at, message: String(body.message), file: String(body.file) };
  }
  if (res.ok) {
    // Written, it may well be: look before accepting again.
    throw new Error(
      `POST ${route} answered ${res.status} ${res.statusText} without the acceptance it wrote, so the api and this board disagree about what accepting answers. ` +
        `The acceptance may be written: look at the looping step (\`wf ls ${runId}\`) before accepting again, and restart the api (\`npm run dev\`).`,
    );
  }
  throw new Error(typeof body?.error === 'string' ? body.error : `POST ${route} answered ${res.status} ${res.statusText}`);
}

/**
 * Tell a step's running session something, as `wf say` does: the api calls the package's `say()`, which hands the words to the session through
 * the engine, and the engine journals them on the step's task. Resolves with that entry; rejects with the api's refusal in full — the package's
 * words or the engine's, verbatim — or the api's own about the request.
 *
 * Sent as `application/json`, which the api requires of it, as of a start and an ask.
 */
export async function sayToStep(runId: string, step: string, text: string): Promise<Said> {
  const route = `/api/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(step)}/say`;
  const res = await fetch(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
  const body = (await res.json().catch(() => undefined)) as { at?: unknown; attempt?: unknown; text?: unknown; error?: unknown } | undefined;
  if (res.ok && typeof body?.at === 'string' && typeof body.attempt === 'number' && typeof body.text === 'string') {
    return { at: body.at, attempt: body.attempt, text: body.text };
  }
  if (res.ok) {
    // Said, it may well be: look before saying it twice.
    throw new Error(
      `POST ${route} answered ${res.status} ${res.statusText} without what it journalled, so the api and this board disagree about what saying answers. ` +
        `The words may have been said: read the step's record (\`wf decide ${runId}\`) before saying them again, and restart the api (\`npm run dev\`).`,
    );
  }
  throw new Error(typeof body?.error === 'string' ? body.error : `POST ${route} answered ${res.status} ${res.statusText}`);
}

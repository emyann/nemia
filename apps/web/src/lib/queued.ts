/**
 * The one sentence that says why a task filed to start has not, worded from the closed words the api serves (`QueuedFor`): a step's
 * session or its check, and the server's upgrade, each say it through here, so the head of a step, the band over its talk and the
 * upgrade panel never say it two ways.
 */
import type { QueuedFor, QueuedTask } from 'objects';

const MI = 2 ** 20;
const GI = 2 ** 30;

/**
 * Memory as the server's settings write it: whole `Gi` as `4Gi`, one decimal at or past 1Gi (`2.5Gi`), whole `Mi` below.
 * @param bytes The memory, in bytes.
 */
export const memoryWord = (bytes: number) => {
  if (bytes >= GI) return Number.isInteger(bytes / GI) ? `${bytes / GI}Gi` : `${Math.round((bytes / GI) * 10) / 10}Gi`;
  return `${Math.round(bytes / MI)}Mi`;
};

/**
 * Why it waits, in one sentence: for memory (what it needs, what is free, and what is kept for a person's turn where some is withheld
 * from it), for a slot (its pool at its ceiling), or because the server is paused.
 * @param wait What the api says it waits for.
 * @param what What waits, as the sentence opens: `It`, `Its check`, `The upgrade`.
 */
export const queuedSaid = (wait: QueuedFor, what = 'It') => {
  if (wait.for === 'paused') return `${what} waits because the server is paused: it starts once the server resumes.`;
  if (wait.for === 'slot')
    return `${what} waits for a slot: ${wait.pool} has ${wait.ceiling} at work, its ceiling, and it starts once one ends.`;
  const kept = wait.keptBytes === null ? '' : `, and ${memoryWord(wait.keptBytes)} is kept for a person’s turn`;
  return `${what} waits for memory: it needs ${memoryWord(wait.needBytes)}, ${memoryWord(wait.roomBytes)} is free${kept}.`;
};

/**
 * Why a step waits to start, as its head and the band over its talk say it: its session's wait, or its check's.
 * @param queued The step's `queuedFor`: which task waits, and why.
 */
export const stepQueuedSaid = (queued: { task: QueuedTask; wait: QueuedFor }) =>
  queuedSaid(queued.wait, queued.task === 'check' ? 'Its check' : 'Its session');

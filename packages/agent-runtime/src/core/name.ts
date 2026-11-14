/** The join key a session is named by, before it is spawned: read by `domain.ts` and its contracts (`decide`, `observe`). */

/** The join key. Deterministic, so it survives anything that kills this process. */
export const nameFor = (taskId: string, attempt: number) => `ae/${taskId}/${attempt}`;


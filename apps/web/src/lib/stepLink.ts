/**
 * A step's address on the board as a message names it, `/runs/<run>?step=<step>`, read back as the run and the step (`broughtOf`): what her
 * chat draws the run's page's part for (`chatItems`, `lib/chatFollowing.ts`). Pure and with no import, so the guard that holds it to the
 * link `bring-what-waits` teaches reads it alone (`tools/guards/test/brought-link.test.ts`).
 */

/** A step's address on the board: the run's page, its one path segment, with the step its bar opens (`routes/runs.$runId.tsx`). */
const STEP_LINK = /^\/runs\/([^/?#]+)\?step=([^&#]+)$/;

/** `part` URI-decoded, or undefined where it does not decode or decodes to nothing. */
const decoded = (part: string): string | undefined => {
  try {
    const plain = decodeURIComponent(part);
    return plain === '' ? undefined : plain;
  } catch {
    return undefined;
  }
};

/**
 * The run and the step a link of hers names, where it is a step's address on the board (`/runs/<run>?step=<step>`, both parts
 * URI-decoded and neither empty); undefined for every other address, a run's page without a step among them. Pure.
 */
export function broughtOf(href: string): { run: string; step: string } | undefined {
  const parts = STEP_LINK.exec(href);
  if (!parts) return undefined;
  const run = decoded(parts[1]);
  const step = decoded(parts[2]);
  return run === undefined || step === undefined ? undefined : { run, step };
}

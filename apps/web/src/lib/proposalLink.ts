/**
 * A proposal's address on the board as a message names it, `/factories/<factory>/proposals/<name>`, read back as the factory and the
 * proposal (`proposalLinkOf`): what her chat draws the proposal page's own part for (`chatItems`, `lib/chatFollowing.ts`). Pure and with
 * no import, so the guard that holds it to the link `nemia.md` teaches reads it alone (`tools/guards/test/proposal-link.test.ts`).
 */

/** A proposal's address on the board: its page under its factory (`routes/factories.$factory_.proposals.$name.tsx`). */
const PROPOSAL_LINK = /^\/factories\/([^/?#]+)\/proposals\/([^/?#]+)$/;

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
 * The factory and the proposal a link of hers names, where it is a proposal's address on the board
 * (`/factories/<factory>/proposals/<name>`, both parts URI-decoded and neither empty); undefined for every other address. Pure.
 */
export function proposalLinkOf(href: string): { factory: string; name: string } | undefined {
  const parts = PROPOSAL_LINK.exec(href);
  if (!parts) return undefined;
  const factory = decoded(parts[1]);
  const name = decoded(parts[2]);
  return factory === undefined || name === undefined ? undefined : { factory, name };
}

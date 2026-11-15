/**
 * The two pure decisions of `nemia server upgrade` (`contracts/server-upgrade.contract.ts`): the release asked of the server
 * (`upgradeTarget`) and what an upgrade that ended means here (`upgradeEnd`). The runner around them is `upgrade.ts`.
 */
import type { UpgradeEndOf, UpgradeTargetOf } from '../../contracts/server-upgrade.contract.ts';

/**
 * The release asked of the server: the tag typed; with `--back`, the release going back goes to; with neither, the
 * newer release the server's check read, or `newest` where it runs it; refused where none can be named.
 * @param asked What was typed: the tag, null where none was, and whether `--back` was.
 * @param read What the server answered of its releases: the newest its check read and the one going back goes to.
 */
export const upgradeTarget: UpgradeTargetOf = (asked, read) => {
  if (asked.tag !== null) return asked.back ? { kind: 'refused', reason: 'tag-and-back' } : { kind: 'tag', tag: asked.tag };
  if (asked.back) {
    if (read.previous === null) return { kind: 'refused', reason: 'none-older' };
    return read.previous.refused ? { kind: 'refused', reason: 'below-floor' } : { kind: 'tag', tag: read.previous.tag };
  }
  if (read.latest === null) return { kind: 'refused', reason: 'unknown-latest' };
  if (!read.latest.newer) return { kind: 'newest' };
  return read.latest.tag === null ? { kind: 'refused', reason: 'unknown-latest' } : { kind: 'tag', tag: read.latest.tag };
};

/**
 * What an upgrade that ended means here: exit 0 exactly where it succeeded, and whether this client is then behind the server.
 * @param phase The phase the upgrade ended in, `succeeded` alone a success.
 * @param client This client's release, null for a checkout.
 * @param server The release the server runs after the upgrade, null where it says none.
 */
export const upgradeEnd: UpgradeEndOf = (phase, client, server) => {
  const succeeded = phase === 'succeeded';
  return { code: succeeded ? 0 : 1, behind: succeeded && client !== null && server !== null && client !== server };
};

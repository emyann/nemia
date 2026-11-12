/**
 * The two pure decisions of `nemia server upgrade` (`contracts/server-upgrade.contract.ts`): the release asked of the server
 * (`upgradeTarget`) and what an upgrade that ended means here (`upgradeEnd`). The runner around them is `upgrade.ts`.
 */
import type { UpgradeEndOf, UpgradeTargetOf } from '../../contracts/server-upgrade.contract.ts';

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

export const upgradeEnd: UpgradeEndOf = (phase, client, server) => {
  const succeeded = phase === 'succeeded';
  return { code: succeeded ? 0 : 1, behind: succeeded && client !== null && server !== null && client !== server };
};

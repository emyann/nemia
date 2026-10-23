/**
 * What a resumed session's own share is, when its harness prints its totals with its parent's carried on (`resumeCostCarried`): the
 * parent's, as its output said them (`carriedOf`), taken off the resume's (`lessCarried`).
 */
import type { Usage } from '../../core/index.ts';
import type { HarnessOutput } from './detached.ts';
import type { Carried } from './run-file.ts';

/** `usage` with the parent's `carried` totals taken off: a measure either lacks, or that would go below nothing, dropped. */
export const lessCarried = (usage: Usage, carried: Carried, ownTokens?: Usage): Usage | undefined => {
  const { costUsd, apiMs, ...own } = usage;
  const less = (mine: number | undefined, theirs: number | undefined) =>
    mine !== undefined && theirs !== undefined && mine >= theirs ? { value: mine - theirs } : undefined;
  const cost = less(costUsd, carried.costUsd);
  const api = less(apiMs, carried.apiMs);
  const tokens = ownTokens ? tokensLess(own, carried, ownTokens) : own;
  const left: Usage = { ...tokens, ...(cost ? { costUsd: cost.value } : {}), ...(api ? { apiMs: api.value } : {}) };
  return Object.keys(left).length ? left : undefined;
};

/** The token classes a whole session's counts carry its parent's on in, as a run file keeps the parent's (`Carried`). */
const CARRIED_TOKENS = ['uncachedTokens', 'cacheWriteTokens', 'cacheReadTokens', 'outputTokens'] as const;

/**
 * A resumed session's whole counts (`mine`), its parent's taken off each class: where the parent's were not kept in every class, or
 * one would go below nothing, the process's own counts (`own`, `HarnessOutput.ownTokens`) instead — never its parent's too.
 */
const tokensLess = (mine: Usage, carried: Carried, own: Usage): Usage => {
  const { inputTokens: _, uncachedTokens: _u, cacheWriteTokens: _w, cacheReadTokens: _r, outputTokens: _o, ...others } = mine;
  const [uncachedTokens, cacheWriteTokens, cacheReadTokens, outputTokens] = CARRIED_TOKENS.map(
    (k) => (mine[k] ?? NaN) - (carried[k] ?? NaN),
  );
  const inputTokens = uncachedTokens + cacheWriteTokens + cacheReadTokens;
  return [uncachedTokens, cacheWriteTokens, cacheReadTokens, outputTokens].every((n) => n >= 0) && inputTokens > 0
    ? { ...others, inputTokens, uncachedTokens, cacheWriteTokens, cacheReadTokens, outputTokens }
    : { ...others, ...own };
};

/**
 * What a resumed session's parent carried on, as its output says (`told`): its cost and API time, and its token counts where they
 * are its whole session's (`ownTokens` beside them), in every class it gave.
 */
export const carriedOf = (told: HarnessOutput | undefined): Carried => {
  const usage = told?.usage ?? {};
  const keys = ['costUsd', 'apiMs', ...(told?.ownTokens ? CARRIED_TOKENS : [])] as const;
  return Object.fromEntries(keys.flatMap((k) => (usage[k] !== undefined ? [[k, usage[k]]] : [])));
};

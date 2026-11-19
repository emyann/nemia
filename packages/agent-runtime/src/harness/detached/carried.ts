/**
 * What a resumed session's own share is, when its harness prints its totals with its parent's carried on (`resumeCostCarried`): the
 * parent's, as its output said them (`carriedOf`), taken off the resume's (`lessCarried`).
 */
import type { Usage } from '../../core/index.ts';
import type { HarnessOutput } from './detached.ts';
import type { Carried } from './run-file.ts';

/**
 * `usage` with the parent's `carried` totals taken off: a measure either lacks, or that would go below nothing, dropped.
 * @param usage What the resumed session's output says it used, its parent's totals among it.
 * @param carried The totals its parent carried on, as its run file keeps them.
 * @param ownTokens The process's own token counts, where its output gives them beside its whole session's; undefined where the counts it
 *   gives are its own already, and kept whole.
 */
export const lessCarried = (usage: Usage, carried: Carried, ownTokens?: Usage) => {
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
const tokensLess = (mine: Usage, carried: Carried, own: Usage) => {
  const { inputTokens: _, uncachedTokens: _u, cacheWriteTokens: _w, cacheReadTokens: _r, outputTokens: _o, ...others } = mine;
  const less = (k: (typeof CARRIED_TOKENS)[number]) => (mine[k] ?? NaN) - (carried[k] ?? NaN);
  const [uncachedTokens, cacheWriteTokens, cacheReadTokens, outputTokens] = [
    less('uncachedTokens'),
    less('cacheWriteTokens'),
    less('cacheReadTokens'),
    less('outputTokens'),
  ];
  const inputTokens = uncachedTokens + cacheWriteTokens + cacheReadTokens;
  return [uncachedTokens, cacheWriteTokens, cacheReadTokens, outputTokens].every((n) => n >= 0) && inputTokens > 0
    ? { ...others, inputTokens, uncachedTokens, cacheWriteTokens, cacheReadTokens, outputTokens }
    : { ...others, ...own };
};

/**
 * What a resumed session's parent carried on, as its output says (`told`): its cost and API time, and its token counts where they
 * are its whole session's (`ownTokens` beside them), in every class it gave.
 * @param told What the parent's output says, or undefined where it says nothing, which carries nothing.
 */
export const carriedOf = (told: HarnessOutput | undefined) => {
  const usage = told?.usage ?? {};
  const keys = ['costUsd', 'apiMs', ...(told?.ownTokens ? CARRIED_TOKENS : [])] as const;
  return Object.fromEntries(keys.flatMap((k) => (usage[k] !== undefined ? [[k, usage[k]]] : [])));
};

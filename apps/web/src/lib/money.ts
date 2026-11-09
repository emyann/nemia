/**
 * An amount of money, in words: the board's one writer of dollars, by the package's rule (`dollars` and `budgetWord` in the
 * orchestrator's `status.ts`), copied rather than imported, the board reaching the package only through the api. Pure.
 */

/**
 * Dollars for a person: to the cent, and to three figures under one, since a session's $0.004 rounded to `$0.00` would read as nothing;
 * `-$0.13` for an amount below zero, and `—` for none.
 */
export function dollars(usd: number | null): string {
  if (usd === null) return '—';
  const size = Math.abs(usd);
  const said = size > 0 && size < 0.01 ? String(Number(size.toPrecision(3))) : size.toFixed(2);
  return `${usd < 0 && said !== '0.00' ? '-' : ''}$${said}`;
}

/** A budget as its author writes one: `$16` when whole, else as `dollars` says it (`$2.50`). */
export const budgetWord = (usd: number): string => (Number.isInteger(usd) ? `$${usd}` : dollars(usd));

/**
 * Dollars in words for a person (`dollars`), and a budget as its author writes one (`budgetWord`). Pure.
 */
/**
 * Dollars for a person: to the cent, and to three figures under one — a session's $0.004 rounded to "$0.00" is the zero these lines
 * refuse.
 */
export const dollars = (usd: number): string => `$${usd > 0 && usd < 0.01 ? Number(usd.toPrecision(3)) : usd.toFixed(2)}`;

/** A budget as its author writes one: `$3`, `$2.50`. */
export const budgetWord = (usd: number): string => (Number.isInteger(usd) ? `$${usd}` : dollars(usd));

/**
 * Dollars in words for a person (`dollars`), and a budget as its author writes one (`budgetWord`). Pure.
 */
/**
 * Dollars for a person: to the cent, and to three figures under one — a session's $0.004 rounded to "$0.00" is the zero these lines
 * refuse.
 * @param usd The amount, in USD.
 */
export const dollars = (usd: number) => `$${usd > 0 && usd < 0.01 ? Number(usd.toPrecision(3)) : usd.toFixed(2)}`;

/**
 * A budget as its author writes one: `$3`, `$2.50`.
 * @param usd The budget, in USD.
 */
export const budgetWord = (usd: number) => (Number.isInteger(usd) ? `$${usd}` : dollars(usd));

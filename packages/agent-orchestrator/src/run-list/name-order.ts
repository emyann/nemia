/**
 * The order of two names a list reads, written once for the code and the laws that state it (contracts/finished-order.contract.ts). Pure.
 */

/**
 * Whether the name `a` sorts before `b` as `<` compares two strings, by their UTF-16 code units: said through `.sort()` with no
 * comparator, which orders strings by the same code units and which tsverify reads, where it does not read `<` of two strings.
 * @param a The name that would sort first.
 * @param b The name it is compared with.
 */
export const nameFirst = (a: string, b: string) => a !== b && [a, b].sort()[0] === a;

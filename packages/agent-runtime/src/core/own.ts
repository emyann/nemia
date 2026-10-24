/**
 * The value `record` holds under `key` as its own, or `undefined`: a key it does not hold, a prototype's (`toString`) included, is
 * absent. A dictionary read names its miss through this, so the caller decides what an absent key means.
 */
export const own = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

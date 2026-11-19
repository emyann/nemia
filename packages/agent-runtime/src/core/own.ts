/**
 * The value `record` holds under `key` as its own, or `undefined`: a key it does not hold, a prototype's (`toString`) included, is
 * absent. A dictionary read names its miss through this, so the caller decides what an absent key means.
 * @param record The dictionary to read.
 * @param key The key to read it at.
 */
export const own = <T>(record: Readonly<Record<string, T>>, key: string) => (Object.hasOwn(record, key) ? record[key] : undefined);

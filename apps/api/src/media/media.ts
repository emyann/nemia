/** A request body's media type, as the write guard (`guard.ts`) and its contract (`contracts/write-guard.contract.ts`) read it. */

/** The media type `type` says, its parameters (`; charset=utf-8`), its case and its white space left out. */
export const mediaOf = (type: string): string => type.split(';')[0]?.trim().toLowerCase() ?? '';

/** Whether `type` says a JSON body: `application/json`, whatever its parameters, case and white space. */
export const saysJson = (type: string): boolean => mediaOf(type) === 'application/json';

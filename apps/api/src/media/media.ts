/** A request body's media type, as the write guard (`guard.ts`) and its contract (`contracts/write-guard.contract.ts`) read it. */

/**
 * The media type `type` says, its parameters (`; charset=utf-8`), its case and its white space left out.
 * @param type The value of a content-type header.
 */
export const mediaOf = (type: string): string => type.split(';')[0]?.trim().toLowerCase() ?? '';

/**
 * Whether `type` says a JSON body: `application/json`, whatever its parameters, case and white space.
 * @param type The value of a content-type header.
 */
export const saysJson = (type: string): boolean => mediaOf(type) === 'application/json';

/**
 * Whether `type` says a form of files: `multipart/form-data`, whatever its parameters (its `boundary`), case and white space.
 * @param type The value of a content-type header.
 */
export const saysForm = (type: string): boolean => mediaOf(type) === 'multipart/form-data';

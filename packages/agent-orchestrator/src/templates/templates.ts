/**
 * The rules of a template's place and names, pure: where a template is read from (`templateSourceRefusal`), what names one
 * (`templateNameRefusal`), what is a path in its folder (`treePathRefusal`), and a problem of one (`Problem`). The model's checks (`templates.model.ts`) take them.
 */
import path from 'node:path';
import { SKILL_NAME } from '../keys/index.ts';

/** Why `source` names no template's place: a path that is not absolute, or not as `path.resolve` writes it. */
export const templateSourceRefusal = (source: string): string | null =>
  path.isAbsolute(source) && path.resolve(source) === source
    ? null
    : `${JSON.stringify(source)} is no template's place: name its folder or archive by its whole path, ${path.resolve(source)}.`;

/** Why `name` names no template: a template is named by its folder, lowercase words joined by dashes (`SKILL_NAME`). */
export const templateNameRefusal = (name: string): string | null =>
  SKILL_NAME.test(name)
    ? null
    : `a template is named by its folder, and ${name} is not a name: lowercase words joined by dashes. Name another folder.`;

/** Why `at` is no path in a template's folder: absolute, with a backslash, or a part empty, `.` or `..`. */
export const treePathRefusal = (at: string): string | null =>
  at.startsWith('/') || at.includes('\\') || at.split('/').some((part) => part === '' || part === '.' || part === '..')
    ? `${at} is no path in a template's folder: write parts joined by /, none empty, . or .., never absolute.`
    : null;

/** A problem of a template: its file, the line and column it stands on where it is in a document, and the words. */
export type Problem = { file: string; line?: number; col?: number; message: string };

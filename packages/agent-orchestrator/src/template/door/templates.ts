/**
 * The rules of a template's place and names, pure: where a template is read from (`templateSourceRefusal`), what names one
 * (`templateNameRefusal`), what is a path in its folder (`treePathRefusal`), and a problem of one (`Problem`). The model's checks
 * (`templates.model.ts`) take them.
 */
import path from 'node:path';
import { SKILL_NAME } from '../../keys/index.ts';

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

/**
 * A `--template` as a person gives it, as a factory records it: a template's name (`templateNameRefusal` takes it) is a builtin template,
 * kept as the name and resolved on every read (`templatePlace`); anything else is a folder or archive, resolved from the working
 * directory. A folder whose name is a template's is named as a path, `./<name>`.
 */
export const sourceGiven = (given: string): string => (templateNameRefusal(given) === null ? given : path.resolve(given));

/**
 * The name a recorded source fixes with no read of it: a builtin template's is the name it is recorded by; a folder's or an archive's is
 * read off it (an archive's is the top folder inside it), so none is said where it cannot be read.
 */
export const nameOfSource = (source: string): string | undefined => (templateNameRefusal(source) === null ? source : undefined);

/** The folder a recorded source is read from, for a line that cannot fail: a name's folder in `builtins`, a path as it is. */
export const builtinPlace = (source: string, builtins: string): string =>
  templateNameRefusal(source) === null ? path.join(builtins, source) : source;

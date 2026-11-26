/**
 * The lucide icons the board's own code imports, which the bundle hands a canvas as one namespace, `Nemia.Icons`, each by its lucide
 * name: a name imported under another (`Check as Done`) is exported by its lucide name, and a type (`LucideIcon`) is no icon.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SRC } from '../paths.ts';

const IMPORT = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]lucide-react['"]/g;

/**
 * The icon names one file imports from lucide-react; refused when it imports lucide in a form this does not read.
 * @param text the file's source.
 * @param file the file's path, for the refusal.
 */
const iconsIn = (text: string, file: string) => {
  const names = [...text.matchAll(IMPORT)].flatMap(([, list]) =>
    (list ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part && !/^type\s/.test(part))
      .map((part) => (part.split(/\s+as\s+/)[0] ?? '').trim())
      .filter((name) => /^[A-Z][A-Za-z0-9]*$/.test(name)),
  );
  if (/from\s*['"]lucide-react['"]/.test(text) && names.length === 0 && !/import\s*type\s*\{/.test(text))
    throw new Error(`${file} imports lucide-react in a form the producer does not read: import its icons by name, as { Check }`);
  return names;
};

/** Every icon name the board imports from lucide-react, sorted; refused when there is none. */
export const boardIcons = () => {
  const files = fs
    .readdirSync(SRC, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name));
  const names = new Set(files.flatMap((file) => iconsIn(fs.readFileSync(file, 'utf8'), path.relative(SRC, file))));
  if (names.size === 0) throw new Error('the board imports no lucide icon: find where its icons come from, and read them there');
  return [...names].toSorted();
};

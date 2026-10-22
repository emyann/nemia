/**
 * The repository's root, and its workspaces as the root `package.json` names them, for the guards that hold every workspace alike
 * (`suite.test.ts` and the others that import `workspaces`). It reads files and spawns nothing, so a test that imports it reaches no git.
 */
import fs from 'node:fs';
import path from 'node:path';

export const REPO = path.join(import.meta.dirname, '..', '..', '..');

/**
 * The workspace folders the root `package.json` of `root` names, by path from it, in the order it lists them: a `dir/*` glob as the
 * folders under `dir` that hold a `package.json`, sorted, as npm reads it; a plain folder as it is. Throws on any other glob, which a
 * guard would otherwise read as nothing.
 */
export const workspaces = (root = REPO): string[] => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { workspaces?: string[] };
  return (manifest.workspaces ?? []).flatMap((glob) => {
    if (!glob.includes('*')) return [glob];
    const dir = glob.slice(0, -2);
    if (!glob.endsWith('/*') || dir.includes('*'))
      throw new Error(`the root package.json's workspace ${glob} is a glob workspaces.ts does not read: write it as dir/* or a folder`);
    const at = path.join(root, dir);
    if (!fs.existsSync(at)) return [];
    return fs
      .readdirSync(at)
      .filter((name) => fs.existsSync(path.join(at, name, 'package.json')))
      .sort()
      .map((name) => `${dir}/${name}`);
  });
};

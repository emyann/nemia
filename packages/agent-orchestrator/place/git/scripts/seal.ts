/**
 * `seal`: the empty repository `export` gave a tree taken away, once its checks have read it, so the tree holds no repository. Takes
 * `{ tree }`; answers `{ removed }`, whether there was one. Refuses a tree that is not a directory, and a repository that holds a commit,
 * which is no export's and is left as it is.
 */
import fs from 'node:fs';
import path from 'node:path';
import { gitSays, isDirectory, refused, serve, text } from './contract.ts';

serve((request) => {
  const tree = text(request, 'tree');
  if (!isDirectory(tree)) return refused(`${tree} is not a directory, so there is no exported tree to seal`);
  const own = path.join(tree, '.git');
  if (!fs.existsSync(own)) return { removed: false };
  if (gitSays(tree, ['rev-parse', '--verify', '--quiet', 'HEAD']) !== undefined)
    return refused(`${own} holds a commit, so it is not the empty repository an export gives a tree: it is left as it is`);
  fs.rmSync(own, { recursive: true, force: true });
  return { removed: true };
});

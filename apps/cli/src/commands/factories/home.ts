/**
 * The runner of `nemia factory home`: a person's own session in a factory's home. The home is asked of the api of the context in use
 * (`GET /api/factories/<name>/home`), rendered into the client's cache by its digest (`renderedCopy`), the earlier copies of it removed
 * (`prunedCopies`), and the session started there as `ownSessionOf` decides, the repository (the folder typed, else this one) added
 * beside it. Both folders are compared and given by their real paths, so a cache or a repository reached through a link is still told
 * apart. The session runs with the person's terminal; its exit code is the command's.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Args } from 'objects';
import { inUse } from '../../context.ts';
import { asked } from '../../objects.ts';
import { Refused } from '../../refused.ts';
import { homeCopiesDir, prunedCopies, renderedCopy } from '../../home/copy.ts';
import { ownSessionOf } from '../../home/own-session.ts';
import { ownSessionRun } from '../../home/session.ts';
import { textArg } from '../requests.ts';
import { textOf } from './lines.ts';

/**
 * `nemia factory home`: the factory's home rendered read-only on this machine and the person's own session opened in it.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 * @param env The person's environment: the context in use, the cache folder, and the session's environment; this process's by default.
 * @param here The folder the command is typed in, the repository where none is typed; this process's working folder by default.
 */
export async function factoryHome(args: Args, env: NodeJS.ProcessEnv = process.env, here: string = process.cwd()) {
  const factory = textOf(args, 'factory');
  const typed = path.resolve(here, textArg(args, 'repo') ?? '.');
  if (!fs.statSync(typed, { throwIfNoEntry: false })?.isDirectory())
    throw new Refused(`${typed} is not a folder: give the repository to add beside the home, nemia factory home ${factory} <repo>.`);
  const repo = fs.realpathSync(typed);
  const home = await asked('factory home', (c) => c.factories.home({ params: { name: factory } }), env);
  const dir = homeCopiesDir(env, inUse(env), factory);
  const copy = fs.realpathSync(renderedCopy(dir, home));
  prunedCopies(dir, home.digest);
  const session = ownSessionOf({ copy, repo, claudeMd: textArg(args, 'claudeMd') === 'on' });
  if (session.kind === 'refused')
    throw new Refused(
      session.reason === 'repo-holds-home'
        ? `${repo} holds the copy of ${factory}'s home (${copy}), which a session may not write: give a repository outside it, nemia factory home ${factory} <repo>.`
        : `${repo} is inside the copy of ${factory}'s home (${copy}), which is read-only: give a repository outside it, nemia factory home ${factory} <repo>.`,
    );
  process.stderr.write(`home: ${copy}\nrepository: ${repo}\n`);
  return ownSessionRun(session, env, `nemia factory home ${factory} ${repo}`);
}

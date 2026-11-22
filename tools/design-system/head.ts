/**
 * The one question the producer asks git: the board's last commit, which `tokens.json` says it was built from. It lies beside the
 * workspace's manifest, out of `src`, as the guards' own git reads do (`tools/guards/due.ts`): the producer is repository tooling, and
 * a git call in a workspace's `src` belongs to the git place (`packages/agent-orchestrator/test/git-calls.test.ts`).
 */
import { execFileSync } from 'node:child_process';
import { REPO } from './src/paths.ts';

/** The last commit that changed the board, short, and its date: what tokens.json says it was built from, moved by the board alone. */
export const headOf = () => {
  const said = execFileSync('git', ['log', '-1', '--format=%h %cs', '--', 'apps/web'], { cwd: REPO, encoding: 'utf8' }).trim();
  const [sha = 'unknown', date = 'unknown'] = said.split(' ');
  return { sha, date };
};

/**
 * The folders group's handlers (`objects`' `FoldersGroup`): the person's folder listing and the two writes it serves, each the
 * orchestrator's own (`foldersNamed`, `repositoryMade`, `repositoryNew`) run over the request's services (`inRequest`), the place among
 * them, its refusals answered by the one map (`answeredWrite`, objects/refused.ts). Each is the person's alone (`personOnly`): an agent's
 * token is refused 403, since the listing names folders of the machine beyond any step's fence.
 *
 * - `GET /api/folders?path=<typed>` — the names of the folders under what was typed, under the store's folder roots alone. 422 for a
 *   relative path, one under no root (naming `WF_FOLDER_ROOTS`), and one inside a store.
 * - `POST /api/folders/repository` — a folder under the roots made a git repository with one empty first commit. 422 as the listing,
 *   and where git will not make the commit, naming what to set.
 * - `POST /api/repositories` — a new, empty repository made in the store, at `<WF_ROOT>/repositories/<name>`. 422 for a name that is
 *   no repository's.
 */
import { foldersNamed, repositoryMade, repositoryNew } from 'agent-orchestrator';
import { Api } from 'objects';
import { readsBounded } from '../objects/answer-bound.ts';
import { answeredWrite } from '../objects/refused.ts';
import { personOnly } from '../caller/index.ts';

/** What the person does instead, where an agent asks: the board's own page. */
const ON_THE_BOARD = 'the folder on the board\'s "Where is the work?"';

export const foldersHandlers = readsBounded(Api, 'folders', (handlers) =>
  handlers
    .handle('list', ({ query }) =>
      answeredWrite((s) => {
        personOnly(s, 'GET /api/folders', ON_THE_BOARD);
        return s.inRequest(foldersNamed(query.path));
      }),
    )
    .handle('repository', ({ payload }) =>
      answeredWrite((s) => {
        personOnly(s, 'POST /api/folders/repository', `git init ${payload.path}`);
        return s.inRequest(repositoryMade(payload.path));
      }),
    )
    .handle('make', ({ payload }) =>
      answeredWrite((s) => {
        personOnly(s, 'POST /api/repositories', `git init <a folder of yours>`);
        return s.inRequest(repositoryNew(payload.name));
      }),
    ),
);

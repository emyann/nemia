/**
 * The api's words for the label edit it serves from the command table (`nemia label run`'s `POST /api/runs/:runId/labels`): the write
 * guard's, the body it takes, and why a body is not one (400). A card's labels are edited by the Card's `labels` verb (objects/serve.ts).
 */
import type { Words } from '../body.ts';
import type { RouteWords } from '../commands/words.ts';

/** The body `POST …/labels` takes: `nemia label`'s edits and `--overwrite`, as JSON (`LabelEdit`). */
const LABEL_SHAPE = '`{ "labels": ["<key>=<value>", "<key>-", …], "overwrite"?: true }`';

/** Why a label edit's body is not one, by the first key its schema refused: the edits, or `overwrite`. */
const labelIssue =
  (as: string): Words =>
  ({ path: [key], input }) =>
    key === 'labels'
      ? `\`labels\` is the edits, as \`${as} <key>=<value> <key>-\` takes them: a list of text, \`key=value\` to set a key, \`key-\` to take one off. This request's was ${JSON.stringify(input) ?? 'left out'}: ${LABEL_SHAPE}.`
      : key === 'overwrite'
        ? `\`overwrite\` lets a set change a value the labels already have, as \`${as} --overwrite\` does: true or false, or left out. This request's was ${JSON.stringify(input)}.`
        : `POST …/labels takes a JSON object: ${LABEL_SHAPE}.`;

/** A run's labels edited, as the guard's refusals word it (`POST /api/runs/:runId/labels`, `nemia label run`'s route). */
const LABEL_RUN_WORDS: RouteWords = {
  shape: LABEL_SHAPE,
  guard: ({ runId }) => ({
    route: `POST /api/runs/${runId}/labels`,
    does: "edits a run's labels",
    forAnother: 'edit any',
    why: "a run's labels are what its lists, its stats and the feed's watchers select it by",
    reach: "label it from the run's page on the board",
    instead: `Label it from the run's page on the board, or with \`nemia label run ${runId} <key>=<value>\``,
    shape: LABEL_SHAPE,
  }),
  issue: ({ runId }) => labelIssue(`nemia label run ${runId}`),
  strict: true,
};

/** The words of the label edit the table routes, by its command's name, as `WORDS` takes them. */
export const LABEL_WORDS: Readonly<Record<'label run', RouteWords>> = {
  'label run': LABEL_RUN_WORDS,
};

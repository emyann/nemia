/**
 * The api's words for the two label edits it serves from the command table (`nemia label run`'s `POST /api/runs/:runId/labels` and
 * `nemia label inbox`'s `POST /api/inbox/:name/labels`): the write guard's, the body each takes, and why a body is not one (400).
 */
import { inboxNameRefusal } from 'agent-orchestrator';
import type { Words } from '../body.ts';
import type { RouteWords } from './words.ts';

/** The body `POST …/labels` takes, on a run and on a card: `nemia label`'s edits and `--overwrite`, as JSON (`LabelEdit`). */
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

/** A card's labels edited, as the guard's refusals word it (`POST /api/inbox/:name/labels`, `nemia label inbox`'s route). */
const LABEL_INBOX_WORDS: RouteWords = {
  shape: LABEL_SHAPE,
  guard: ({ name }) => ({
    route: `POST /api/inbox/${name}/labels`,
    does: "edits an inbox card's labels",
    forAnother: 'edit any',
    why: "a card's labels are what the inbox selects it by, and what the run started from it inherits",
    reach: "label it from the card's page on the board",
    instead: `Label it from the card's page on the board, or with \`nemia label inbox ${name} <key>=<value>\``,
    shape: LABEL_SHAPE,
  }),
  issue: ({ name }) => labelIssue(`nemia label inbox ${name}`),
  named: ({ name }) => inboxNameRefusal(name) ?? null,
  strict: true,
};

/** The words of the two label edits, by their commands' names, as `WORDS` takes them. */
export const LABEL_WORDS: Readonly<Record<'label run' | 'label inbox', RouteWords>> = {
  'label run': LABEL_RUN_WORDS,
  'label inbox': LABEL_INBOX_WORDS,
};

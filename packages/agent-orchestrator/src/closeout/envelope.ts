/**
 * The closeout's envelope, by version: the v1 shape a harness is asked for, the fields each version's envelope holds, the one cut of a
 * summary to a line, the reading of an envelope's artifacts, and what the run refuses of a v1 envelope. Pure.
 *
 * A closeout with no `apiVersion` is v0, as every closeout given before v1 was: read as it is, converted on read, never rewritten.
 */
import { CLOSEOUT_FIELDS } from '../step/step.ts';

/** The version every closeout is asked for now. */
export const CLOSEOUT_V1 = 'nemia/v1';

/** The longest summary a reader shows, an ellipsis included. */
export const SUMMARY_MAX = 120;

/** The envelope's fields in a v0 closeout: everything else it holds is what the step declared. */
export const V0_FIELDS = ['outcome', 'summary', 'artifacts', 'needs'] as const;

/** The envelope's fields in a v1 closeout (`CLOSEOUT_FIELDS`): everything else it holds is what the step declared. */
export const V1_FIELDS = CLOSEOUT_FIELDS;

/** A file a closeout hands on, by its path. */
const FILE_ARTIFACT = {
  type: 'object',
  description: 'A file you wrote for someone else to read.',
  properties: { path: { type: 'string' } },
  required: ['path'],
  additionalProperties: false,
};

/** A value a closeout hands on, by its name: a pull request's address, a version, a count. */
const VALUE_ARTIFACT = {
  type: 'object',
  description: 'A value, not a file: shown labelled to the person, and as a link when it is an http(s) address.',
  properties: { name: { type: 'string' }, value: { type: 'string' } },
  required: ['name', 'value'],
  additionalProperties: false,
};

/**
 * The v1 envelope as the harness is handed it: every property required and nullable rather than optional, nothing else allowed, and no
 * `maxLength` or `pattern`, which a strict harness may not take. What the summary's length means is said, and read by every reader.
 */
export const ENVELOPE_SCHEMA = {
  type: 'object',
  properties: {
    apiVersion: { type: 'string', enum: [CLOSEOUT_V1] },
    outcome: { type: 'string', enum: ['done', 'blocked'] },
    summary: {
      type: 'string',
      description: `One line of at most ${SUMMARY_MAX} characters; everything else goes in body. A longer one is cut, and the whole of it leads the body.`,
    },
    body: { type: ['string', 'null'], description: 'Markdown: what the summary has no room for. null when there is nothing more.' },
    artifacts: { type: 'array', items: { anyOf: [FILE_ARTIFACT, VALUE_ARTIFACT] } },
    needs: { type: ['string', 'null'], description: 'Only when blocked: what a person has to settle. null when done.' },
  },
  required: ['apiVersion', 'outcome', 'summary', 'body', 'artifacts', 'needs'],
  additionalProperties: false,
};

/**
 * A summary as every reader shows it: its first non-empty line, trimmed, and when that is longer than `SUMMARY_MAX` it is cut at the
 * last space that leaves room for an ellipsis, or hard where it has none, and ends `…`.
 */
export function summaryLine(text: string): string {
  const line =
    text
      .split('\n')
      .map((l) => l.trim())
      .find(Boolean) ?? '';
  if (line.length <= SUMMARY_MAX) return line;
  const room = line.slice(0, SUMMARY_MAX - 1);
  const space = room.lastIndexOf(' ');
  return `${(space > 0 ? room.slice(0, space) : room).trimEnd()}…`;
}

/** A value an envelope hands on: its name and the string it is. */
export type ValueArtifact = { name: string; value: string };

/**
 * An envelope's `artifacts` read into the files it names, by path, and the values it gives. A string is a file, as v0 wrote one, and
 * so is `{path}`; `{name, value}` of two strings is a value; anything else is dropped.
 */
export function artifactsOf(list: unknown): { files: string[]; values: ValueArtifact[] } {
  const files: string[] = [];
  const values: ValueArtifact[] = [];
  for (const a of Array.isArray(list) ? list : []) {
    if (typeof a === 'string') files.push(a);
    else if (a && typeof a === 'object') {
      const o = a as Record<string, unknown>;
      if (typeof o.path === 'string') files.push(o.path);
      else if (typeof o.name === 'string' && typeof o.value === 'string') values.push({ name: o.name, value: o.value });
    }
  }
  return { files, values };
}

/**
 * A closeout's body as the reader gives it: the body given, led by the whole summary when the cut changed it, so nothing written is
 * lost. Undefined when there is nothing beyond the summary.
 */
export function bodyOf(whole: string, summary: string, given: string | undefined): string | undefined {
  const lead = whole.trim() !== summary ? whole.trim() : '';
  return [lead, given?.trim() ?? ''].filter(Boolean).join('\n\n') || undefined;
}

/**
 * What the run refuses of a closeout's envelope, each a sentence saying what to do instead: a `needs` on a `done` v1 closeout. A v0
 * closeout is never refused: it was given before the rule.
 */
export function envelopeRefusals(c: { apiVersion?: string; outcome: string; needs?: string }): string[] {
  if (c.apiVersion !== CLOSEOUT_V1 || c.outcome !== 'done' || !c.needs) return [];
  return [
    '`needs` is set on a `done` closeout: it is only for a step that signs off `blocked`. Move what it says into `body`, or sign off `blocked`.',
  ];
}

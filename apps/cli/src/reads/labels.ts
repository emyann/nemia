/**
 * The labels' words of a moved read (`nemia ls`, `nemia inbox`): `-l <selector>`, given again for another, sent to the api as
 * `selector`, of which one must take a run or a card; `--show-labels` and `-L <key>`, given again for another, the segments each head
 * line ends on, as the in-process printers add them (the orchestrator's `labelSegments` in `runlist/runlist.ts` and `inbox/inbox.ts`).
 */

/** A person's labels, or a run's whole map: a key to its value. */
export type LabelMap = Readonly<Record<string, string>>;

/** What a read was asked of the labels: the selectors to send, whether to show every label, and the keys to show a column of. */
export type LabelsAsked = { selector: string[]; showLabels: boolean; columns: string[] };

/**
 * The words of `args` that are not the labels' (`rest`), and what the labels' asked; null where a `-l` or a `-L` has no word after it,
 * which the old path refuses in its own words.
 */
export function labelsAsked(args: readonly string[]): { rest: string[]; asked: LabelsAsked } | null {
  const asked: LabelsAsked = { selector: [], showLabels: false, columns: [] };
  const rest: string[] = [];
  for (let at = 0; at < args.length; at++) {
    const word = args[at] ?? '';
    if (word === '--show-labels') {
      asked.showLabels = true;
      continue;
    }
    if (word !== '-l' && word !== '-L') {
      rest.push(word);
      continue;
    }
    const value = args[at + 1];
    if (value === undefined) return null;
    (word === '-l' ? asked.selector : asked.columns).push(value);
    at++;
  }
  return { rest, asked };
}

/** `labels` as `a=b,c=d`, in key order, `<none>` where there are none: the orchestrator's `labelsText`. */
export const labelsText = (labels: LabelMap): string => {
  const keys = Object.keys(labels).sort();
  return keys.length === 0 ? '<none>' : keys.map((key) => `${key}=${labels[key] ?? ''}`).join(',');
};

/**
 * What a head line of `map` ends on: `  labels: <labelsText>` with `--show-labels`, then `  <key>: <value>` per `-L` in the order given,
 * `<none>` where the map has none; nothing with neither, so the line is as it was. The orchestrator's `labelSegments`.
 */
export const labelSegments = (map: LabelMap, asked: Pick<LabelsAsked, 'showLabels' | 'columns'>): string =>
  `${asked.showLabels ? `  labels: ${labelsText(map)}` : ''}${asked.columns.map((key) => `  ${key}: ${map[key] ?? '<none>'}`).join('')}`;

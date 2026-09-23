/**
 * A store's run records, read as files: the brief a run was started with, and the folder a person chose to run it on.
 *
 * Plain code, no Effect, and no import from the workspace — the judge reads `agent-orchestrator`'s store as files, never
 * through it (`test/boundary.test.ts`). Only two fields are read of a record, and both were checked against every one of
 * the 99 records in the owner's store on 2026-09-19:
 *
 *   brief        the card's body as it was filed, one JSON string; none of them carries frontmatter, and it is stripped
 *                all the same, by `cardText`, so a brief and a card reach the judge through one function.
 *   workflowDir  an absolute path whose basename is the folder. The path is read and never stat'ed: the folders of the
 *                runs before the freeze (`hold-the-bar-checked*`) are gone from disk, and a label read off a folder that
 *                has to still exist would lose them silently rather than count them out of scope.
 *
 * The frozen `workflow` array is there too — every step's whole body — and is never read: anything that searched a
 * record's text rather than its `brief` would be reading the workflow's words as if a person had written them about the
 * work. A record missing either field is skipped and counted, never guessed at.
 *
 * The label is the folder alone: `-build` is the web property and `dev-planned` the plan one, which is exactly the
 * inverse of `folderOf` in `card.ts`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cardText } from './card.ts';
import { refuse, Refusal } from './key.ts';

/** Where the runs are unless told: `$WF_ROOT`, or `~/.agent-workflows`. The judge's own copy: it imports no workspace. */
export const defaultStore = (env: Readonly<Record<string, string | undefined>>): string =>
  env.WF_ROOT || path.join(os.homedir(), '.agent-workflows');

/** The shipped folders a card can be dispatched to. A run on any other folder is out of scope, and counted as such. */
export const LABELS = ['dev', 'dev-build', 'dev-planned', 'dev-planned-build'] as const;

export type Label = (typeof LABELS)[number];

const isLabel = (name: string): name is Label => (LABELS as readonly string[]).includes(name);

/** The folder a run was started on, or the basename that is not one of the four. */
export const labelOf = (workflowDir: unknown): { label: Label } | { other: string } | null => {
  if (typeof workflowDir !== 'string' || workflowDir.trim() === '') return null;
  const name = path.basename(workflowDir.replace(/[/\\]+$/, ''));
  return isLabel(name) ? { label: name } : { other: name };
};

/** A brief's first line, without its heading marks, short enough to sit in a table. */
export const firstLine = (brief: string, width = 72): string => {
  const line = (brief.split('\n').find((l) => l.trim() !== '') ?? '').trim().replace(/^#+\s*/, '');
  return line.length > width ? `${line.slice(0, width - 1)}…` : line;
};

/** A run in scope: a brief a person wrote, and the folder they sent it to. */
export type Dispatched = {
  readonly id: string;
  readonly folder: Label;
  /** The label, read off the folder: what the person's choice says about each property. */
  readonly web: boolean;
  readonly plan: boolean;
  /** The brief, stripped as `judge card` strips a card. This, and nothing else of the record, is what is asked about. */
  readonly brief: string;
  readonly first: string;
  readonly createdAt?: string;
};

/** A record that is not scored, and why. The reason names no id, so the same reason counts as one line. */
export type Skipped = { readonly file: string; readonly why: string };

export type Store = { readonly runs: readonly Dispatched[]; readonly skipped: readonly Skipped[]; readonly read: number };

const NOT_ONE = `not one of ${LABELS.join(', ')}`;

/** The date `--since` names, as a number. Anything `Date.parse` cannot read is refused by name. */
export const sinceOf = (text: string): number => {
  const at = Date.parse(text);
  if (Number.isNaN(at)) refuse(`judge runs: --since takes a date, such as 2026-09-01 or 2026-09-01T00:00:00Z; ${JSON.stringify(text)} is not one.`);
  return at;
};

/**
 * Every run record under `<store>/runs`, scored or skipped. A store that is not there is refused; a file that is not
 * JSON is skipped by name and is never fatal — one bad file must not cost the measurement the other ninety-eight.
 */
export const readRuns = (store: string, options: { readonly since?: number } = {}): Store => {
  const dir = path.join(store, 'runs');
  if (!fs.existsSync(store)) refuse(`judge runs: there is no store at ${store}. Pass --store <dir>, or set WF_ROOT.`);
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort();
  } catch (e) {
    return refuse(`judge runs: cannot read ${dir}: ${(e as NodeJS.ErrnoException).code ?? (e as Error).message}. A store keeps its run records there; pass --store <dir>.`);
  }
  const runs: Dispatched[] = [];
  const skipped: Skipped[] = [];
  const skip = (file: string, why: string) => skipped.push({ file, why });
  for (const name of names) {
    const file = path.join(dir, name);
    let record: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('it is not an object');
      record = parsed as Record<string, unknown>;
    } catch (e) {
      skip(name, `is not a run record: ${(e as Error).message}`);
      continue;
    }
    const id = typeof record.id === 'string' && record.id !== '' ? record.id : name.replace(/\.json$/, '');
    const folder = labelOf(record.workflowDir);
    if (folder === null) {
      skip(id, 'has no workflowDir: it was written before the field existed');
      continue;
    }
    if ('other' in folder) {
      skip(id, `was run on ${folder.other}, ${NOT_ONE}`);
      continue;
    }
    if (typeof record.brief !== 'string' || record.brief.trim() === '') {
      skip(id, 'has no brief: it was written before the field existed');
      continue;
    }
    const createdAt = typeof record.createdAt === 'string' ? record.createdAt : undefined;
    if (options.since !== undefined) {
      if (createdAt === undefined) {
        skip(id, 'has no createdAt, and --since was given');
        continue;
      }
      const at = Date.parse(createdAt);
      if (Number.isNaN(at) || at < options.since) {
        skip(id, 'was started before --since');
        continue;
      }
    }
    let brief: string;
    try {
      brief = cardText(record.brief);
    } catch (e) {
      if (!(e instanceof Refusal)) throw e;
      skip(id, 'says nothing once its frontmatter is taken off');
      continue;
    }
    runs.push({
      id, folder: folder.label, web: folder.label.endsWith('-build'), plan: folder.label.startsWith('dev-planned'),
      brief, first: firstLine(brief), ...(createdAt !== undefined ? { createdAt } : {}),
    });
  }
  // Oldest first, and the id breaks a tie: two records written in the same millisecond must not depend on readdir's order.
  runs.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id));
  return { runs, skipped, read: names.length };
};

/** How many skipped records share each reason, in the order the reasons first appeared. */
export const reasons = (skipped: readonly Skipped[]): { readonly why: string; readonly count: number }[] => {
  const counts = new Map<string, number>();
  for (const s of skipped) counts.set(s.why, (counts.get(s.why) ?? 0) + 1);
  return [...counts].map(([why, count]) => ({ why, count }));
};

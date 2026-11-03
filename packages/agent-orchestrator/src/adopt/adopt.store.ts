/**
 * A takeover's reads and writes on the store `home`: what it is judged against (`adoptionAt`) — the render's wiring, the cards filed for
 * the factory and whether each was started, the runs on record in it, a base or tree already there, the store's rules it would leave
 * unread — the digest of the plan a person previewed (`planDigest`), and the render staged as the factory's base and tree
 * (`stageAdoption`). The judgement is `adopt.ts`'s; the verbs, `adopt.verb.ts`'s.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Effect } from 'effect';
import { Invalid } from '../refusal/refusal.ts';
import { CardDoor } from '../cards/cards.store.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { parseInboxCard } from '../inbox/inbox.ts';
import { factoriesDirAt } from '../factory/factory.store.ts';
import type { Factory } from '../factory/factory.ts';
import { readRules, rulesAtHome } from '../rules/rules.store.ts';
import { appliedDirAt, digestOf, entriesIn, stageFolder, treeDirAt, treeWiringOf, type Entry } from '../applied/applied.store.ts';
import type { RenderedAt } from '../applied/applied.verb.ts';
import type { Run } from '../record/record.ts';
import type { Adoption, AdoptedCard } from './adopt.ts';

/**
 * What a takeover of a factory reads besides its judgement's input: the runs on record in it, and its store rules' file where they say
 * words.
 */
export type AdoptionRead = { adoption: Adoption; runs: string[]; rules: string | null };

/** The digest of the folder `dir`, or null where it is not there. */
const folderDigest = (dir: string): string | null => (fs.existsSync(dir) ? digestOf(entriesIn(dir)) : null);

/** Whether a run has ended by a person's hand or by landing: cancelled, or a step that landed a commit. */
const ended = (run: Run): boolean =>
  run.cancelledAt !== undefined || Object.values(run.steps).some((s) => s.landed !== undefined && 'commit' in s.landed);

/** The card `text` in the inbox's `file` as a takeover reads it, or none where it is no card or does not read: no start reads it either. */
function cardIn(file: string, text: string): ReturnType<typeof parseInboxCard> | undefined {
  if (!file.endsWith('.md') || file.includes('/')) return undefined;
  try {
    return parseInboxCard(file, text, () => true);
  } catch {
    return undefined;
  }
}

/**
 * What taking `factory` over by `render` is judged against, read off the store `home` and its doors (`AdoptionRead`). A card counts when
 * its `factory:` names this factory, its workflow by its folder's name as a start judges it attached; a run when it names this factory and
 * has not ended. Refused: a render that holds no `factory.json`, or one that does not read (`Invalid`), then `notDone`.
 */
export const adoptionAt = Effect.fn('adoptionAt')(function* (home: string, factory: Factory, render: RenderedAt, notDone: string) {
  const read = treeWiringOf(render.entries);
  if (!('wiring' in read))
    return yield* Effect.fail(
      new Invalid({
        message: `the template's render ${'error' in read ? `has a factory.json that does not read: ${read.error}` : 'holds no factory.json, the wiring a tree runs by'}: correct the template, and check it with nemia template lint <folder>. ${notDone}`,
      }),
    );
  const runs = yield* (yield* RunDoor).runs.list();
  const startedFrom = new Set(runs.flatMap((r) => (r.from?.inbox === undefined ? [] : [r.from.inbox])));
  const cards: AdoptedCard[] = (yield* (yield* CardDoor).cards.entries()).flatMap(({ file, text }) => {
    const card = cardIn(file, text);
    if (card === undefined || card.factory !== factory.name) return [];
    return [
      {
        name: card.name,
        workflow: card.workflow === undefined ? null : path.basename(card.workflow),
        started: startedFrom.has(card.name),
      },
    ];
  });
  const rulesFile = rulesAtHome(home, factory);
  const adoption: Adoption = {
    wiring: read.wiring,
    cards,
    leftovers: { base: folderDigest(appliedDirAt(home, factory.name)), tree: folderDigest(treeDirAt(home, factory.name)) },
    render: digestOf(render.entries),
  };
  return {
    adoption,
    runs: runs.filter((r) => r.factory === factory.name && !ended(r)).map((r) => r.id),
    rules: readRules(rulesFile).words === null ? null : rulesFile,
  } satisfies AdoptionRead;
});

/**
 * The digest of a takeover's plan: the factory's file as it is now, the template's source, its version and parameters, and its render.
 * Any of them changed between the preview and the takeover changes it. The cards and runs, which change by the minute, are judged again
 * at the takeover instead.
 */
export function planDigest(home: string, name: string, render: RenderedAt, source: string): string {
  const file = path.join(factoriesDirAt(home), `${name}.json`);
  const hash = createHash('sha256');
  hash.update(JSON.stringify([source, render.version, render.params, digestOf(render.entries)]));
  hash.update('\0');
  hash.update(fs.readFileSync(file));
  return `sha256:${hash.digest('hex')}`;
}

/**
 * The render `entries` staged as the factory `name`'s base, read-only, then as its tree: each staged whole and renamed into place, and
 * left as it is where it is there already (`stageFolder`), so a takeover stopped half way is finished by the next.
 */
export function stageAdoption(home: string, name: string, entries: readonly Entry[]): void {
  stageFolder(appliedDirAt(home, name), entries, true);
  stageFolder(treeDirAt(home, name), entries, false);
}

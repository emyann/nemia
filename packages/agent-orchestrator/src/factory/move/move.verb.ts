/**
 * A factory moved from one store to another, as two programs the api serves: the export (`factoryExported`), a read of the source whole,
 * and the import (`factoryImported`), the target's filing of what the export answered, all or nothing. Runs never move. Each yields the
 * Factory, Card and Run doors and the place, given the store's root (`StoreRoot`); what each decides is `move.ts`'s, pure.
 *
 * The import refuses every refusal before it writes anything — the name taken, the file sent that does not read as a factory, every
 * repository and volume the target cannot take, together, each naming its flag, the folder sent that does not unpack, a card that does not
 * read — then clones, places the folder, files the factory and its cards, and takes back what it wrote, in reverse, on a failure after.
 * The template is the caller's to take under the store before (`withTemplateTaken`, `'made'`), as `nemia factory apply`'s is.
 */
import { Effect } from 'effect';
import type { FactoryExport, FactoryImported, FactoryImportWrite, MoveCards } from 'objects';
import { brokenBy, fromThrow as tried } from '../../door/door.store.ts';
import { Conflict, Invalid, isRefusal } from '../../refusal/refusal.ts';
import { StoreRoot } from '../../config/root.store.ts';
import { FactoryDoor, factoryRepos, refuseName } from '../door/factories.store.ts';
import { Factory as FactoryModel, FactoryName, isDefaultFactory } from '../factory.model.ts';
import type { Factory } from '../factory.ts';
import { CardDoor } from '../../cards/cards.store.ts';
import { RunDoor } from '../../runs/runs.store.ts';
import { CardName } from '../../inbox/inbox.model.ts';
import { cardsListed, parseInboxCard } from '../../inbox/index.ts';
import { ARCHIVE_LIMIT, packArchive, unpackArchive, type TreeFile } from '../../archive/archive.ts';
import { templateGiven } from '../../template/given.store.ts';
import { treeDir } from '../applied/applied.store.ts';
import { cloned } from '../clones/clones.verb.ts';
import { volumeRefusal } from '../volume/volume.ts';
import { isDirectory, runId } from '../../record/record.store.ts';
import { firstPiece } from '../../piece/piece.ts';
import { cardMoved, factoryOnTarget, fileTextOf, folderOnTarget, renamedFolders, repoOnTarget, volumeKey, volumeOnTarget } from './move.ts';

/** The top folder a factory's folder is packed under: a fixed word, since an archive's top is a name a factory's need not be. */
const PACKED_AS = 'factory';

/** Why a card that a run was started from stays with its store. */
const leftWhy = (runs: readonly string[]): string =>
  `${runs.length > 1 ? 'the runs' : 'the run'} ${runs.join(', ')} ${runs.length > 1 ? 'were' : 'was'} started from it, and runs stay with their store: it stays beside ${runs.length > 1 ? 'them' : 'it'}.`;

/**
 * `GET /api/factories/<name>/export`: the factory `name` as its store holds it, for another store to file — its file's text, its folder
 * packed but what stays with this store (`stays`), its template as a request gives one (`templateGiven`), its instruction's words where
 * they are kept in a folder of this machine that no clone carries, and, unless `cards` is `stay`, its cards in play no run was started
 * from (`cards`) and those a run keeps (`left`). Nothing is written. Refused: the default factory (`Conflict`), which has no folder to
 * move; a factory not filed (`Missing`); a folder past what an archive holds and a template that cannot be packed (`Invalid`).
 */
export const factoryExported = Effect.fn('factoryExported')(function* (name: string, how: { readonly cards?: MoveCards }) {
  const door = yield* FactoryDoor;
  const id = FactoryName.read(name);
  const folder = yield* door.folder.read(id);
  const record = yield* door.factories.read(id);
  if (isDefaultFactory(record))
    return yield* Effect.fail(new Conflict({ message: `${name} is the default factory, which no move takes.` }));
  const archive = folder.files.length ? (yield* tried(() => packArchive(PACKED_AS, folder.files))).archive.toString('base64') : '';
  const template = record.template === undefined ? undefined : yield* templateGiven(record.template.source);
  const instruction = yield* instructionCarried(record);
  const { cards, left } = how.cards === 'stay' ? { cards: [], left: [] } : yield* cardsOf(name);
  return {
    name,
    file: fileTextOf(record),
    folder: { archive },
    ...(template === undefined ? {} : { template }),
    ...(instruction === undefined ? {} : { instruction }),
    cards,
    left,
    stays: [...folder.stays],
  } satisfies FactoryExport;
});

/**
 * The instruction of `factory` the export carries: its words, where they are kept in its first folder and that folder is the source's own,
 * which no clone carries to the target; none where it is kept in the store or its tree (its folder carries it), or in a clone of an
 * origin (the clone carries it), or reads no words.
 */
const instructionCarried = Effect.fn('instructionCarried')(function* (factory: Factory) {
  const [first] = factory.repos;
  if (factory.tree !== undefined || first === undefined || factory.origins?.[first] !== undefined) return undefined;
  const read = yield* (yield* FactoryDoor).instruction.read(FactoryName.read(factory.name));
  return read.store || read.words === null ? undefined : { path: read.file, words: read.words };
});

/** The cards of the factory `name` in play that follow it, each by its name and text, and those a run was started from, with why. */
const cardsOf = Effect.fn('cardsOf')(function* (name: string) {
  const entries = yield* (yield* CardDoor).cards.entries();
  const runs = yield* (yield* RunDoor).runs.list(() => {});
  const texts = new Map(entries.map((e) => [e.file, e.text] as const));
  const mine = cardsListed(entries, runs).filter((card) => card.error === null && card.factory === name);
  return {
    cards: mine.filter((card) => !card.startedAs.length).map((card) => ({ name: card.name, source: texts.get(card.file) ?? '' })),
    left: mine.filter((card) => card.startedAs.length).map((card) => ({ name: card.name, why: leftWhy(card.startedAs) })),
  };
});

/**
 * The factory the export's `file` says, under the name `name`: refused `Invalid`, naming the export to take again, where it reads as
 * none. A templated factory's workflows are its tree's, which travels in its folder, so its schedules and cost lines are judged once it is
 * filed, not here.
 */
function factorySent(name: string, text: string): Factory {
  const again = `Export it again from its store: nemia factory move ${name} --to <context>. Nothing was filed.`;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Invalid({ message: `the factory sent is not JSON. ${again}` });
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw new Invalid({ message: `the factory sent is no factory's file. ${again}` });
  const sent: object = { workflows: [], hires: {}, schedules: {}, ...raw, name };
  const { schedules: _schedules, costLines: _costLines, ...wiringFree } = sent as Factory;
  const broken = brokenBy(FactoryModel, 'template' in sent ? { ...wiringFree, schedules: {} } : sent);
  if (broken !== null) throw new Invalid({ message: `the factory sent: ${broken}. ${again}` });
  return sent as Factory;
}

/** What the import decided of the source's repositories and volumes, before it writes: their places on the target, or every refusal. */
type Decided = {
  readonly repos: Record<string, string>;
  readonly origins: Record<string, string>;
  readonly volumes: Record<string, string>;
  readonly refused: string[];
};

/**
 * Each repository of `source` as the target in the store `home` takes it (`repoOnTarget`, then `factoryRepos`), what was typed for each
 * by its path on the source (`typedRepos`), into `out`.
 */
function reposDecided(home: string, source: Factory, typedRepos: Readonly<Record<string, string>>, out: Decided): void {
  for (const repo of source.repos) {
    const given = repoOnTarget(repo, source.origins?.[repo], typedRepos[repo]);
    if (given.kind === 'refused') {
      out.refused.push(given.message);
      continue;
    }
    try {
      const read = factoryRepos(home, source.name, [given.repo]);
      const [folder] = read.repos;
      if (folder !== undefined) out.repos[repo] = folder;
      Object.assign(out.origins, read.origins);
    } catch (err) {
      if (!isRefusal(err)) throw err;
      out.refused.push(`--repo ${repo}=${given.repo}: ${err.message}`);
    }
  }
}

/**
 * Each repository and volume of `source` as the target in the store `home` takes it (`reposDecided`; `volumeOnTarget` over
 * `volumeRefusal`), what `write` typed for each by its key; a key typed that names none of them refused too.
 */
function decided(home: string, source: Factory, write: FactoryImportWrite): Decided {
  const out: Decided = { repos: {}, origins: {}, volumes: {}, refused: [] };
  const typedRepos = write.repos ?? {};
  reposDecided(home, source, typedRepos, out);
  const typedVolumes = write.volumes ?? {};
  const onTarget = { name: source.name, repos: Object.values(out.repos) };
  for (const volume of source.volumes ?? []) {
    const key = volumeKey(volume);
    const typed = typedVolumes[key];
    const refusal = volumeRefusal(onTarget, { path: typed ?? volume.path, readOnly: volume.readOnly }, home, isDirectory);
    const mounted = volumeOnTarget({ name: key, path: volume.path }, typed, refusal);
    if (mounted.kind === 'refused') out.refused.push(mounted.message);
    else out.volumes[key] = mounted.path;
  }
  const keys = new Set((source.volumes ?? []).map(volumeKey));
  for (const repo of Object.keys(typedRepos).filter((r) => !source.repos.includes(r)))
    out.refused.push(`--repo ${repo}= names no repository of ${source.name}: give one of ${source.repos.join(', ')}.`);
  for (const key of Object.keys(typedVolumes).filter((k) => !keys.has(k)))
    out.refused.push(
      `--volume ${key}= names no volume of ${source.name}: give one of ${[...keys].join(', ') || 'none, since it mounts none'}.`,
    );
  return out;
}

/** The folder sent, unpacked: none for none; refused `Invalid`, every entry at once, as `unpackArchive` refuses it. */
const folderSent = (archive: string): TreeFile[] =>
  archive === '' ? [] : unpackArchive(Buffer.from(archive, 'base64'), ARCHIVE_LIMIT, 'the folder sent').files;

/** A card the export carried, as the target files it: its text moved (`cardMoved`), refused `Invalid` where it does not read as a card. */
function cardSent(card: { readonly name: string; readonly source: string }, factory: string, from: string): { name: string; text: string } {
  try {
    return { name: card.name, text: cardMoved(card.source, { name: card.name, factory, from }) };
  } catch (err) {
    throw new Invalid({ message: `the card ${card.name} sent does not read as a card: ${(err as Error).message} Nothing was filed.` });
  }
}

/** What the import wrote so far, for its undoing: whether the folder was placed and the file filed, and the cards filed, in order. */
type Wrote = { folder: boolean; file: boolean; cards: string[] };

/**
 * What `wrote` says the import wrote of the factory `name`, taken back in reverse: its cards, its file, its folder; each whatever happens.
 */
const undone = (name: string, wrote: Wrote) =>
  Effect.gen(function* () {
    const door = yield* FactoryDoor;
    const cards = yield* CardDoor;
    for (const card of [...wrote.cards].reverse()) yield* Effect.exit(cards.cards.drop(CardName.read(card)));
    if (wrote.file) yield* Effect.exit(door.factories.remove(FactoryName.read(name)));
    if (wrote.folder) yield* Effect.exit(door.folder.remove(FactoryName.read(name)));
  });

/** The card `text` filed under `name` where it is free, else under the name the inbox gives a new card of its body: the name filed. */
const cardFiled = Effect.fn('cardFiled')(function* (name: string, text: string) {
  const cards = (yield* CardDoor).cards;
  const body = parseInboxCard(`${name}.md`, text).body;
  for (let at = CardName.read(name); ; at = CardName.read(runId(firstPiece(body, '\n')))) {
    const filed = yield* Effect.result(cards.add(at, text));
    if (filed._tag === 'Success') return at;
    if (filed.failure._tag !== 'Conflict') return yield* Effect.fail(filed.failure);
  }
});

/**
 * `POST /api/factories/<name>/import`: the factory the export in `write` carries filed in this store under `name`, its template read at
 * `template` — the source the caller took the export's template at (`withTemplateTaken(write.export.template, 'made', …)`), none for a
 * factory made from none. Refused before anything is written: a name that is no factory's (`Invalid`) or the default's (`Conflict`), a
 * factory filed here under it (`Conflict`), a file sent that reads as no factory, a template it names and none was given, every repository
 * with no origin and nothing typed, every volume this machine refuses and every key typed that names none of either, in one refusal each
 * naming its flag, a folder that does not unpack and a card that does not read (`Invalid`). Then its repositories cloned (`cloned`), its
 * folder placed (`Conflict` where one is), its file filed, its cards filed — and on a failure after a write, what was written taken back,
 * cards, file and folder. Its places are not trusted: `untrusted` names each, for the person to trust (`nemia factory trust <name>`).
 */
export const factoryImported = Effect.fn('factoryImported')(function* (
  name: string,
  write: FactoryImportWrite,
  template: string | undefined,
) {
  const home = yield* StoreRoot;
  const door = yield* FactoryDoor;
  const id = FactoryName.read(name);
  yield* tried(() => refuseName(name, 'add'));
  const there = yield* Effect.result(door.factories.read(id));
  if (there._tag === 'Success')
    return yield* Effect.fail(
      new Conflict({
        message: `this store holds a factory ${name} already: remove it here with nemia factory rm ${name}, or keep it and move none over it. Nothing was filed.`,
      }),
    );
  if (there.failure._tag !== 'Missing') return yield* Effect.fail(there.failure);
  const source = yield* tried(() => factorySent(name, write.export.file));
  if (source.template !== undefined && template === undefined)
    return yield* Effect.fail(
      new Invalid({
        message: `the factory sent is made from a template, and the export carries none: export it again with its template, nemia factory move ${name} --to <context>. Nothing was filed.`,
      }),
    );
  const decision = yield* tried(() => decided(home, source, write));
  if (decision.refused.length)
    return yield* Effect.fail(
      new Invalid({
        message: `${name} cannot be filed here:\n${decision.refused.map((why) => `  ${why}`).join('\n')}\nNothing was filed.`,
      }),
    );
  const files = yield* tried(() => folderSent(write.export.folder.archive));
  const cards = yield* tried(() => write.export.cards.map((card) => cardSent(card, name, write.from)));
  const instruction = source.template === undefined ? write.export.instruction?.words : undefined;
  const factory = factoryOnTarget(source, {
    ...(source.template === undefined ? {} : { tree: treeDir(home, name) }),
    repos: decision.repos,
    origins: decision.origins,
    volumes: decision.volumes,
    instructionKept: instruction !== undefined,
    ...(template === undefined ? {} : { template }),
  });
  const placed = folderOnTarget(files, {
    renamed: renamedFolders(source, decision.repos),
    ...(instruction === undefined ? {} : { instruction }),
  });
  yield* cloned(decision.origins);
  const wrote: Wrote = { folder: false, file: false, cards: [] };
  const filed = yield* Effect.gen(function* () {
    yield* door.folder.place(id, placed);
    wrote.folder = true;
    const { schedules, costLines, ...unscheduled } = factory;
    const file = yield* door.factories.create(factory.template === undefined ? factory : { ...unscheduled, schedules: {} });
    wrote.file = true;
    if (factory.template !== undefined && (Object.keys(schedules).length || costLines !== undefined)) {
      const read = yield* door.factories.read(id);
      if (!isDefaultFactory(read)) yield* door.factories.rewrite({ ...read, schedules, ...(costLines === undefined ? {} : { costLines }) });
    }
    const named: Array<{ name: string; was: string }> = [];
    for (const card of cards) {
      const at = yield* cardFiled(card.name, card.text);
      wrote.cards.push(at);
      named.push({ name: at, was: card.name });
    }
    return { file, cards: named };
  }).pipe(Effect.onError(() => undone(name, wrote)));
  return {
    name,
    file: filed.file,
    repos: [...factory.repos],
    cloned: Object.values(decision.origins),
    volumes: (source.volumes ?? []).map((volume) => ({
      name: volumeKey(volume),
      path: decision.volumes[volumeKey(volume)] ?? volume.path,
    })),
    cards: filed.cards,
    untrusted: [...factory.repos],
  } satisfies FactoryImported;
});

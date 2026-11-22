/**
 * `npm run design-system -- [--out <dir>] [--since <dir>]`: builds every file of the board's Design System artifact into `<dir>/project`
 * (`.design-system` at the repository's root unless told), from the checkout as it stands, with no step done by hand; verifies every
 * card in both themes, the faces and the icons; and says in its last lines which files were added, changed and removed against the
 * last build (`--since`, else the manifest the last build left in the same folder), so a person's session publishes only those. Every
 * fault is named with what to do, and any fault exits 1. It publishes nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { capsPassed } from './decide.ts';
import { bundleOf, scriptOf } from './bundle/bundle.ts';
import { writeEntry, type BoardCard } from './bundle/entry.ts';
import { boardIcons } from './bundle/icons.ts';
import { inertModule } from './bundle/seams.ts';
import { cardScript, heightOf, pageOf, type Card } from './cards/previews.ts';
import type { CellReport } from './cards/runner.ts';
import { writeDocs, type Told } from './docs/docs.ts';
import { COVER } from './docs/cover.ts';
import { kitCards, type KitCard } from './kit/cards.ts';
import { kitStories, kitVersion } from './kit/kit.ts';
import { changeLines, changesSince, lastManifest, manifestOf, recordManifest } from './manifest/manifest.ts';
import { REPO, WORK, filesUnder, layout, writeIn, type Layout } from './paths.ts';
import { boardStories } from './stories/stories.ts';
import { boardFaces, copyFaces, type Face } from './stylesheet/fonts.ts';
import { stylesheetOf } from './stylesheet/stylesheet.ts';
import { tokensOf } from './tokens/tokens.ts';
import { typesOf } from './types/types.ts';
import { checkFaces, checkIcons } from './verify/checks.ts';
import { verifyCards } from './verify/verify.ts';

/** The folder a build writes to unless told another. */
const DEFAULT_OUT = path.join(REPO, '.design-system');

/** What the cards' scripts are built from, besides their stories. */
type Built = {
  entry: string;
  board: BoardCard[];
  kit: KitCard[];
  kitFolder: string;
  kitVersion: string;
  icons: string[];
  body: string;
  exported: string[];
  faces: Face[];
};

/** Builds the script, the stylesheet, the faces, the tokens and the types, and says what the cards are built from. */
const buildParts = async (where: Layout) => {
  const version = kitVersion();
  const kitFolder = await kitStories(version);
  const inert = inertModule(kitFolder);
  const icons = boardIcons();
  const { entry, cards: board } = await writeEntry(boardStories(), inert, icons);
  const kit = kitCards(kitFolder);
  const twice = board.filter((card) => kit.some((one) => one.name === card.base)).map((card) => card.base);
  if (twice.length) throw new Error(`a board card and a kit card share a name: ${twice.join(', ')}: rename the board's story file`);
  const { body, exported } = await bundleOf(entry);
  const faces = boardFaces();
  copyFaces(where.project, faces);
  const sources = [path.join(kitFolder, 'stories'), WORK, path.join(import.meta.dirname, 'cards')];
  writeIn(path.join(where.project, 'components', 'bundle.css'), await stylesheetOf(faces, sources));
  const components = Object.fromEntries(
    board.flatMap((card) =>
      card.from
        ? [[card.base, `apps/web/src/${card.from === 'components/look/index.ts' ? `components/look/${card.base}.tsx` : card.from}`]]
        : [],
    ),
  );
  writeIn(path.join(where.project, 'tokens.json'), tokensOf(faces, components, version));
  writeIn(path.join(where.project, 'components', 'index.d.ts'), typesOf(entry, icons));
  return { entry, board, kit, kitFolder, kitVersion: version, icons, body, exported, faces, inert } satisfies Built & { inert: string };
};

/** The cards of the artifact: one a board story file, then the kit's. */
const cardsOf = (built: Built) => [
  ...built.board.map(
    (card) =>
      ({
        name: card.base,
        group: card.group,
        rooted: true,
        page: !card.component,
        files: [{ file: card.file, shown: card.stories }],
      }) satisfies Card,
  ),
  ...built.kit.map((card) => ({ name: card.name, group: card.group, rooted: false, page: false, files: card.files }) satisfies Card),
];

/** Writes every card's page at `heights`, eight scripts built at once, and returns each card's script. */
const writeCards = async (where: Layout, cards: readonly Card[], built: Built & { inert: string }) => {
  const scripts = new Map<string, string>();
  const queue = [...cards];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let card = queue.shift(); card; card = queue.shift()) {
        const script = await cardScript(card, { inert: built.inert, exported: built.exported, kit: built.kitFolder });
        scripts.set(card.name, script);
        writeIn(path.join(where.project, 'components', card.name, 'preview.html'), pageOf(card, script, heightOf(card.name, undefined)));
      }
    }),
  );
  return scripts;
};

/** Each board card with the stories its card drew and the ones it left out, from what its page reported. */
const toldOf = (board: readonly BoardCard[], reports: Readonly<Record<string, CellReport[]>>) =>
  board.map((card) => {
    const reported = reports[card.base] ?? [];
    return {
      ...card,
      name: card.base,
      kept: reported.filter((report) => report.fate === 'card').map((report) => report.name),
      left: reported.filter((report) => report.fate !== 'card').map((report) => ({ story: report.name, fate: report.fate })),
    } satisfies Told;
  });

/** The build's whole run, its faults returned. */
const produce = async (where: Layout) => {
  const built = await buildParts(where);
  const cards = cardsOf(built);
  writeIn(
    path.join(where.project, 'components', 'bundle.js'),
    scriptOf(
      built.body,
      [...new Set([...built.board.filter((card) => card.component).map((card) => card.base), ...built.kit.map((card) => card.name)])],
      built.exported,
    ),
  );
  const scripts = await writeCards(where, cards, built);
  writeIn(path.join(where.project, 'components', 'Cover', 'preview.html'), COVER);
  const verified = await verifyCards(where.project, where.shots, [
    ...cards.map(({ name, rooted }) => ({ name, rooted })),
    { name: 'Cover', rooted: false },
  ]);
  const told = toldOf(built.board, verified.reports);
  for (const card of cards) {
    const kept = !card.rooted || told.some((one) => one.name === card.name && one.kept.length > 0);
    const dir = path.join(where.project, 'components', card.name);
    if (kept)
      writeIn(path.join(dir, 'preview.html'), pageOf(card, scripts.get(card.name) ?? '', heightOf(card.name, verified.heights[card.name])));
    else fs.rmSync(dir, { recursive: true, force: true });
  }
  const listed = [
    ...new Set([
      ...told.filter((card) => card.component && card.kept.length > 0).map((card) => card.name),
      ...built.kit.map((card) => card.name),
    ]),
  ];
  const script = scriptOf(built.body, listed, built.exported);
  writeIn(path.join(where.project, 'components', 'bundle.js'), script);
  const tokens = JSON.parse(fs.readFileSync(path.join(where.project, 'tokens.json'), 'utf8')) as {
    color: { tokens: { name: string; value: string | Record<string, string> }[] };
  };
  const valueOf = (role: string, theme: string) => {
    const value = tokens.color.tokens.find((token) => token.name === `md-sys-color-${role}`)?.value;
    return typeof value === 'string' || value === undefined ? (value ?? '') : (value[theme] ?? '');
  };
  writeDocs(
    where.project,
    { told, kit: built.kit, kitVersion: built.kitVersion, icons: built.icons, valueOf },
    fs.readFileSync(path.join(where.project, 'components', 'index.d.ts'), 'utf8'),
  );
  const faults = [
    ...verified.faults,
    ...(await checkFaces(where.project, where.shots, built.faces)),
    ...(await checkIcons(where.project, where.shots, built.icons)),
  ];
  const caps = capsPassed({
    scriptBytes: Buffer.byteLength(script),
    stylesheetBytes: fs.statSync(path.join(where.project, 'components', 'bundle.css')).size,
    files: filesUnder(where.project).length,
  });
  faults.push(
    ...caps.map(
      (cap) =>
        `the ${cap} passed the artifact's cap: ${cap === 'script' ? 'move a heavy import out of what the stories reach' : cap === 'stylesheet' ? 'scan fewer sources' : 'draw fewer cards'}`,
    ),
  );
  const drawn = told.filter((card) => card.kept.length > 0).length;
  console.log(
    `design-system: ${drawn} board cards, ${built.kit.length} kit cards and the cover; bundle.js ${Buffer.byteLength(script)} bytes; grounds ${JSON.stringify(verified.grounds)}`,
  );
  return faults;
};

/** Reads `--out` and `--since`. */
const argsOf = (argv: readonly string[]) => {
  const { values } = parseArgs({ args: [...argv], options: { out: { type: 'string' }, since: { type: 'string' } }, strict: true });
  return { out: path.resolve(values.out ?? DEFAULT_OUT), since: values.since === undefined ? undefined : path.resolve(values.since) };
};

/**
 * Runs a build and exits 1 on any fault.
 * @param argv the command's arguments.
 */
export const main = async (argv: readonly string[]) => {
  const { out, since } = argsOf(argv);
  const where = layout(out);
  const before = lastManifest(since ?? out);
  for (const dir of [where.project, where.shots, WORK]) fs.rmSync(dir, { recursive: true, force: true });
  let faults: string[];
  try {
    faults = await produce(where);
  } catch (error) {
    faults = [`the build stopped: ${error instanceof Error ? error.message : String(error)}`];
  }
  const manifest = manifestOf(where.project);
  const changes = changesSince(before, manifest);
  recordManifest(where.manifest, manifest, faults);
  writeIn(where.changes, `${JSON.stringify(changes, null, 1)}\n`);
  for (const fault of faults) console.error(`design-system: ${fault}`);
  if (faults.length) console.error(`design-system: ${faults.length} faults: the build is not one to publish`);
  console.log(changeLines(changes, since ?? `the last build in ${path.relative(REPO, out) || out}`).join('\n'));
  return faults.length ? 1 : 0;
};

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));

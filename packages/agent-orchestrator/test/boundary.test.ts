/**
 * The package's boundary, as a test rather than a sentence in the README (`docs/architecture.md` says the same rules in prose).
 *
 * **Every file is of one of five kinds, named below.** `PURE` files hold the judgement — `assess` in `tick/assess.ts`, the verdict in
 * `check.ts`, the format in `workflow.ts` and the folders it re-exports — and import no runtime, read no disk and spawn nothing, which is
 * what lets them be tested as data. `STORE` files are the I/O beneath the controllers: they import no runtime, never a controller and never
 * the client, and load as a tree with no cycle; only the client and the controllers beneath the CLI import them. `CONTROLLER` files use the
 * runtime through the client: `runner.ts`, the package's root, the verbs it re-exports, one feature each, and the CLI above them, which
 * parses, calls and prints, and so reaches the package through `runner.ts` and the format through `workflow.ts` alone — as each bin
 * reaches it through the CLI. The client and the controllers import one another with no cycle. `MODEL` files are a layer's declaration
 * of its entities as Effect Schemas, beside each context's glossary (`modelBreaks`): they import Effect, other model files and pure
 * files alone, and no pure file imports one, so the pure entries load none. A file in `src/` or `bin/` that no kind names fails the
 * suite: a new file is sorted when it is written.
 *
 * **A file in a feature folder takes its kind from its name** (`kindOf`): `<name>.store.ts` is a store, `<name>.verb.ts` a controller,
 * `<name>.model.ts` a model, any other `<name>.ts` pure, and every file under `src/cli/` is the CLI. A file at the root of `src` or in
 * `bin` is named in a list below. Tests beside the code (`*.test.ts`) are of no kind and are not read.
 *
 * **A pure file reaches nothing outside the process**: no disk, no process, no network (`http`, `https`, `net`), nothing of the machine
 * (`os`), bare or as `node:` (`IMPURE`), and it reads neither `process.env` nor `fetch` outside its comment lines (`globalsIn`).
 *
 * **A place's code stands beside the package, behind one door** (`placeBreaks`): a file under `place/<name>/` imports node's built-ins,
 * `effect`, the files of its own place, and what a place is (`PLACE_REACHES`, the files of `src/place/` that say it), and nothing else; and
 * of `src` and `bin`, one file alone imports a place's code, `PLACE_DOOR`, so every other file asks the place it is given.
 *
 * **The runtime is reached through one client**, `CLIENT`, `runtime-client.ts`: of the package's files, it alone imports agent-runtime,
 * a type included; every controller beneath the CLI imports it, or imports a controller that reaches it, and it imports no controller.
 * The runtime's vocabulary, `agent-runtime/vocabulary` (`VOCABULARY`), pure, is the one entry any file imports, a pure one included.
 *
 * The api's `test/kinds.test.ts` holds its readers to the same globals with a copy of the scanners, `PROCESS_ENV` and `FETCH`, which this
 * test holds to its own: the two packages share no test code.
 *
 * Each rule is a pure function over a map of each file's imports, run first on planted sources it must refuse (`REFUSED`), so that none
 * passes by seeing nothing, and then on the package. A rule a session can re-break is a rule this suite refuses.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';

const PKG = path.join(import.meta.dirname, '..');

/** Judgement at the root of `src`: no runtime, no disk, no process, and no file of the other three kinds. */
const PURE = ['run', 'workflow'].map((f) => `src/${f}.ts`);

/**
 * The I/O beneath the controllers at the root of `src`: none, as every store sits in a feature folder under a `.store.ts` name. A store
 * imports no runtime, never a controller or the client, and loads as a tree (`STORE_BOTTOM`, `STORE_SHARED`).
 */
const STORE: readonly string[] = [];

/**
 * What uses the runtime at the root of `src` and in `bin`, through the client: the root, the controllers it re-exports, and the CLI
 * above them.
 */
const CONTROLLER = ['src/runner.ts', 'bin/nemia.ts', 'bin/wf.ts'];

/** The package's bins: `nemia`, and `nemia`, its alias. */
const BINS = ['bin/nemia.ts', 'bin/wf.ts'];

/** The CLI's folder: every file in it is a controller, and the CLI. */
const CLI_FOLDER = 'src/cli/';

/** The CLI's files, which reach the package through the root (`CLI_REACHES`, `BIN_REACHES`), never the client or the store. */
const isCli = (file: string): boolean => BINS.includes(file) || file.startsWith(CLI_FOLDER);

/** The one file that imports agent-runtime. */
const CLIENT = 'src/runtime-client.ts';

type Kind = 'PURE' | 'STORE' | 'CONTROLLER' | 'CLIENT' | 'MODEL';

/** The folder of the printer and the whole diagram: every file in it is a model file. */
const MODEL_FOLDER = 'src/model/';

/** The kinds a file is named in: a root file by the lists above, a file in a folder by its name, and a test beside the code by none. */
function kindsOf(file: string): Kind[] {
  const listed = Object.entries({ PURE, STORE, CONTROLLER, CLIENT: [CLIENT] })
    .filter(([, files]) => files.includes(file))
    .map(([kind]) => kind as Kind);
  if (listed.length || !/^src\/.+\/[^/]+\.ts$/.test(file) || file.endsWith('.test.ts')) return listed;
  if (file.startsWith(CLI_FOLDER) || file.endsWith('.verb.ts')) return ['CONTROLLER'];
  if (file.endsWith('.model.ts')) return ['MODEL'];
  return file.endsWith('.store.ts') ? ['STORE'] : ['PURE'];
}

/** The files of each kind among `sources`, each file of one kind. */
function kinds(sources: Sources): Record<Kind, string[]> {
  const out: Record<Kind, string[]> = { PURE: [], STORE: [], CONTROLLER: [], CLIENT: [], MODEL: [] };
  for (const file of Object.keys(sources).sort()) {
    const of = kindsOf(file);
    if (of.length === 1) out[of[0]].push(file);
  }
  return out;
}

/** The controllers beneath the CLI: each reaches the client, and they and the client alone import the store. */
const beneathCli = (sources: Sources): string[] => kinds(sources).CONTROLLER.filter((f) => !isCli(f));

/** The bottom of the store's tree: they import no store file. */
const STORE_BOTTOM = ['src/record/places.store.ts', 'src/skills/read.store.ts', 'src/meter/tally.store.ts', 'src/config/config.store.ts'];

/**
 * The store files another store file may import, each with the store files it may import itself: the bottom, the skills read
 * (`skills/read.store.ts`) among it, then the agents read on it with a person's custom instructions (`agents/read.store.ts`), the folders
 * on both (`folder.store.ts`), a run's steps on the folders and the configuration (`steps.store.ts`), the run store on them and the
 * store's pause on the bottom,
 * the schedules' cron and tries on the run store, a templated factory's tree, base and status on it (`applied.store.ts`), the factories on
 * the run store and both, and the run store's files on them and on the configuration (`runStore`, whose `keptRuns` reads
 * `WF_VERIFY_REST`), the door's pattern on the store's root (`door.store.ts`) and each door on it and the stores it is over — the Run
 * door on the run store's files, the Factory door on the factories and a factory's level, rules and servers, each on the run store —
 * what a place is and how its processes are stopped, on no store file (`place.store.ts`), then a step's workspace, cut by the place, a
 * workflow folder written on the run store, the two reads and the factories, and where a run looks and a place's workflow folders
 * (`lookup.store.ts`) on the run store and the skills read; what a branch changed, as the place says, on the place (`changes.store.ts`),
 * a step's own agent read for a hire (`own-agent.store.ts`), on no store file, and where the branches stood on the run store and the place
 * (`standing.store.ts`), and a run's result branches (`branches.store.ts`), which a landing reads beside its place (`landing.store.ts`);
 * and the feed's file on the run store and the tally (`feed.store.ts`), whose one schema for a line of it the deliverer's file decodes a
 * kept digest with, so the two cannot drift. No
 * other store file is imported by another, so the tree has no cycle; outside the store, the client and the controllers beneath the CLI
 * alone import them.
 */
const STORE_SHARED: Record<string, readonly string[]> = {
  'src/record/places.store.ts': [],
  'src/skills/read.store.ts': [],
  'src/meter/tally.store.ts': [],
  'src/config/config.store.ts': [],
  'src/config/root.store.ts': ['src/config/config.store.ts'],
  'src/agents/read.store.ts': ['src/skills/read.store.ts'],
  'src/folder/folder.store.ts': ['src/agents/read.store.ts', 'src/skills/read.store.ts'],
  'src/record/steps.store.ts': ['src/config/config.store.ts', 'src/folder/folder.store.ts'],
  'src/revisions/revisions.store.ts': ['src/config/config.store.ts'],
  'src/record/record.store.ts': [
    ...STORE_BOTTOM,
    'src/folder/folder.store.ts',
    'src/record/steps.store.ts',
    'src/revisions/revisions.store.ts',
  ],
  'src/pause/pause.store.ts': STORE_BOTTOM,
  'src/schedule/schedule.store.ts': ['src/record/record.store.ts'],
  'src/applied/applied.store.ts': ['src/record/record.store.ts'],
  'src/factory/own-agent.store.ts': [],
  'src/factory/factory.store.ts': [
    'src/record/record.store.ts',
    'src/schedule/schedule.store.ts',
    'src/applied/applied.store.ts',
    'src/factory/own-agent.store.ts',
  ],
  'src/record/files.store.ts': ['src/record/record.store.ts', 'src/pause/pause.store.ts', 'src/config/config.store.ts'],
  'src/place/place.store.ts': [],
  'src/workspace/worktree.store.ts': [
    'src/record/record.store.ts',
    'src/record/places.store.ts',
    'src/meter/tally.store.ts',
    'src/place/place.store.ts',
  ],
  'src/folder/write.store.ts': [
    'src/record/record.store.ts',
    'src/agents/read.store.ts',
    'src/skills/read.store.ts',
    'src/factory/factory.store.ts',
  ],
  'src/folder/lookup.store.ts': ['src/record/record.store.ts', 'src/skills/read.store.ts'],
  'src/branches/branches.store.ts': [
    'src/meter/tally.store.ts',
    'src/record/files.store.ts',
    'src/record/record.store.ts',
    'src/workspace/worktree.store.ts',
  ],
  'src/branches/changes.store.ts': ['src/place/place.store.ts'],
  'src/feed/feed.store.ts': ['src/record/record.store.ts', 'src/meter/tally.store.ts'],
  'src/standing/standing.store.ts': ['src/record/record.store.ts', 'src/place/place.store.ts'],
  'src/door/door.store.ts': ['src/config/root.store.ts'],
  'src/runs/runs.store.ts': ['src/door/door.store.ts', 'src/record/files.store.ts'],
  'src/level/level.store.ts': ['src/record/record.store.ts'],
  'src/rules/rules.store.ts': ['src/record/record.store.ts'],
  'src/servers/servers.store.ts': ['src/record/record.store.ts'],
  'src/factory/factories.store.ts': [
    'src/door/door.store.ts',
    'src/factory/factory.store.ts',
    'src/level/level.store.ts',
    'src/rules/rules.store.ts',
    'src/servers/servers.store.ts',
  ],
};

/**
 * The doors' memory stand-ins: store files no file of `src` imports, only a test, so the shipped program never holds its runs in
 * memory.
 */
const STAND_INS: readonly string[] = ['src/runs/memory.store.ts', 'src/factory/memory.store.ts'];

/** The package's files the CLI may import, beside the files of its own folder. */
const CLI_REACHES = ['src/runner.ts', 'src/workflow.ts'];

/** The package's files a bin may import: the CLI, and what it exits with, imported before the package loads. */
const BIN_REACHES = ['src/cli/main.ts', 'src/cli/exit.ts'];

/** The node modules a pure file never imports, bare or as `node:`: the disk, a process, the network and the machine. */
const IMPURE = ['fs', 'fs/promises', 'child_process', 'http', 'https', 'net', 'os'].flatMap((m) => [m, `node:${m}`]);

/** The globals a pure file never reads, named in its sources as a module is: the environment and the network. */
const IMPURE_GLOBALS = ['global:process.env', 'global:fetch'];

type Sources = Record<string, readonly string[]>;

/** Every module a piece of source names: imports and re-exports, type-only included, and `import()`. */
function importsIn(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/gm)) found.add(m[1]);
  for (const m of text.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) found.add(m[1]);
  for (const m of text.matchAll(/\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) found.add(m[1]);
  return [...found].sort();
}

/** Source text with each comment line blanked: a line that opens with `//`, `/*` or `*`. */
const withoutComments = (text: string): string =>
  text
    .split('\n')
    .map((line) => (/^\s*(\/\/|\/\*|\*)/.test(line) ? '' : line))
    .join('\n');

/** `process.env` however a file reaches it: read off `process`, by `['env']`, or destructured from it (`const { env } = process`). */
const PROCESS_ENV = /\bprocess\s*(?:\.\s*env\b|\[\s*['"`]env['"`]\s*\])|\{[^}]*\benv\b[^}]*\}\s*=\s*(?:globalThis\s*\.\s*)?process\b/;

/**
 * The global `fetch` however a file reaches it: called, passed, aliased, destructured or typed off; never a method of another object
 * (`client.fetch`), a longer name (`prefetch`, `sec-fetch-site`), a quoted word or an object's key (`{ fetch: x }`).
 */
const FETCH = /(?:^|[^.\w$'"`-])fetch(?![\w$-])(?!\s*:)|\bglobalThis\s*\.\s*fetch\b/m;

/** The impure globals a piece of source reads outside its comment lines, each as `IMPURE_GLOBALS` names it. */
function globalsIn(text: string): string[] {
  const code = withoutComments(text);
  const found: string[] = [];
  if (PROCESS_ENV.test(code)) found.push('global:process.env');
  if (FETCH.test(code)) found.push('global:fetch');
  return found;
}

/** A relative module as the package path it names (`../runner.ts` in `src/cli/main.ts` is `src/runner.ts`); any other as written. */
const resolved = (file: string, mod: string): string => (mod.startsWith('.') ? path.posix.join(path.posix.dirname(file), mod) : mod);

/** Each source file's imports, resolved, and the impure globals it reads: `src/` and `bin/`, every `.ts`. */
function sourcesOf(texts: Record<string, string>): Sources {
  return Object.fromEntries(
    Object.entries(texts).map(([file, text]) => [file, [...importsIn(text).map((m) => resolved(file, m)), ...globalsIn(text)]]),
  );
}

/** Every `.ts` under `src` and `bin`, in folders too, but the tests beside the code. */
const packageSources = (): Sources =>
  sourcesOf(
    Object.fromEntries(
      ['src', 'bin'].flatMap((dir) =>
        fs
          .readdirSync(path.join(PKG, dir), { recursive: true, encoding: 'utf8' })
          .map((f) => `${dir}/${f.split(path.sep).join('/')}`)
          .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
          .map((f) => [f, fs.readFileSync(path.join(PKG, f), 'utf8')]),
      ),
    ),
  );

/** The runtime's pure door to its vocabulary, which any file may import: by that exact name, and no subpath of it. */
const VOCABULARY = 'agent-runtime/vocabulary';

/** The runtime by any entry but its vocabulary (`VOCABULARY`): what the client alone imports. */
const isRuntime = (m: string): boolean => m !== VOCABULARY && (m === 'agent-runtime' || m.startsWith('agent-runtime/'));

/**
 * Effect, by any subpath. A pure file takes what a store file decoded, and the api loads `agent-orchestrator/run` and
 * `agent-orchestrator/workflow`, which are pure and load no Effect but `PURE_EFFECT`: a schema lives beside the read it decodes.
 */
const isEffect = (m: string): boolean => m === 'effect' || m.startsWith('effect/') || m.startsWith('@effect/');

/** The one module of Effect a pure file may import, by that exact name: the tagged refusals' `TaggedError` (`src/refusal/refusal.ts`). */
const PURE_EFFECT = 'effect/Data';

/** Every file is of exactly one kind, and every file a kind names is there. */
function unsorted(sources: Sources): string[] {
  const out: string[] = [];
  for (const file of Object.keys(sources).sort()) {
    const of = kindsOf(file);
    if (!of.length)
      out.push(
        `${file} is of no kind: put it in a feature folder under a name that says its kind, or name it in PURE, STORE, CONTROLLER or CLIENT in test/boundary.test.ts`,
      );
    if (of.length > 1) out.push(`${file} is named in ${of.join(' and ')}: a file is of one kind`);
  }
  for (const [kind, files] of Object.entries({ PURE, STORE, CONTROLLER, CLIENT: [CLIENT] }))
    for (const file of files) if (!(file in sources)) out.push(`${kind} names ${file}, which is not there`);
  return out;
}

/**
 * A pure file imports no runtime, no disk, no process, no network, nothing of the machine, no Effect but `PURE_EFFECT`, and no store,
 * controller, client or model file, and reads neither the environment nor `fetch`.
 */
function impurities(sources: Sources): string[] {
  const of = kinds(sources);
  return of.PURE.flatMap((file) =>
    (sources[file] ?? [])
      .filter(
        (m) =>
          isRuntime(m) ||
          (isEffect(m) && m !== PURE_EFFECT) ||
          IMPURE.includes(m) ||
          IMPURE_GLOBALS.includes(m) ||
          of.STORE.includes(m) ||
          of.CONTROLLER.includes(m) ||
          of.MODEL.includes(m) ||
          m === CLIENT,
      )
      .map((m) => `${file} is pure and imports ${m}`),
  );
}

/**
 * A model file imports Effect (any of its modules), other model files and pure files, and nothing else — no store, controller or
 * client file, no runtime, no node module, no global of the process — so a model is a declaration a door adopts, never a door
 * itself; and `src/model/` holds model files alone.
 */
function modelBreaks(sources: Sources): string[] {
  const of = kinds(sources);
  const out = of.MODEL.flatMap((file) =>
    (sources[file] ?? [])
      .filter((m) => !isEffect(m) && !of.MODEL.includes(m) && !of.PURE.includes(m))
      .map((m) => `${file} is a model file and imports ${m}: a model imports effect, other model files and pure files alone`),
  );
  for (const file of Object.keys(sources).sort())
    if (file.startsWith(MODEL_FOLDER) && kindsOf(file)[0] !== 'MODEL')
      out.push(
        `${file} is in ${MODEL_FOLDER}, which holds model files alone: name it <name>.model.ts, or put it beside the feature it serves`,
      );
  return out;
}

/**
 * A store file imports no runtime, no controller and not the client, and store files import each other only as the tree has it; outside
 * the store, only the client and the controllers beneath the CLI import a store file — never a bin or a file of `src/cli/`, which
 * reach the package through the root — and some one of them imports each.
 */
function treeBreaks(sources: Sources): string[] {
  const { STORE: stores, CONTROLLER: controllers } = kinds(sources);
  const beneath = beneathCli(sources);
  const out: string[] = [];
  for (const file of stores) {
    for (const m of sources[file] ?? []) {
      if (isRuntime(m)) out.push(`${file} is a store file and imports ${m}`);
      if (controllers.includes(m) || m === CLIENT)
        out.push(`${file} is a store file and imports ${m}, ${m === CLIENT ? 'the client' : 'a controller'}: a cycle`);
      if (!stores.includes(m)) continue;
      const allowed = STORE_SHARED[file] ?? Object.keys(STORE_SHARED);
      if (!allowed.includes(m))
        out.push(
          `${file} imports ${m}, which the tree does not let it: ${allowed.length ? `of the store it imports ${allowed.join(', ')}` : 'it is the bottom, and imports no store file'}`,
        );
    }
    if (STAND_INS.includes(file)) {
      for (const [user, imports] of Object.entries(sources))
        if (imports.includes(file))
          out.push(`${user} imports ${file}, a stand-in: a test gives it to its program, and no file of src imports it`);
      continue;
    }
    if (![CLIENT, ...beneath].some((user) => (sources[user] ?? []).includes(file)))
      out.push(`${file} is imported by no controller and not by the client: a store file is the controllers' I/O`);
  }
  for (const [file, imports] of Object.entries(sources)) {
    if (stores.includes(file) || file === CLIENT || beneath.includes(file)) continue;
    for (const m of imports)
      if (stores.includes(m))
        out.push(`${file} imports ${m}, a store file: only the client and the controllers beneath the CLI import the store`);
  }
  return out;
}

/**
 * The CLI reaches the package only through `runner.ts`, `workflow.ts` and its own folder, and each bin only through the CLI and what it
 * exits with.
 */
function cliBreaks(sources: Sources): string[] {
  const reaching = (file: string, reaches: readonly string[], own: (m: string) => boolean) =>
    (sources[file] ?? [])
      .filter((m) => (m.startsWith('src/') || m.startsWith('bin/')) && !reaches.includes(m) && !own(m))
      .map((m) => `${file} imports ${m}: it reaches the package through ${reaches.join(' and ')}`);
  const cli = Object.keys(sources)
    .filter((f) => isCli(f) && !BINS.includes(f))
    .sort();
  return [
    ...cli.flatMap((file) => reaching(file, CLI_REACHES, (m) => m.startsWith(CLI_FOLDER))),
    ...BINS.flatMap((bin) => reaching(bin, BIN_REACHES, () => false)),
  ];
}

/**
 * Only the client imports agent-runtime, a type included — and it does; every controller beneath the CLI imports the client or a
 * controller that reaches it, followed through controller imports, and the client imports no controller.
 */
function clientBreaks(sources: Sources): string[] {
  const controllers = kinds(sources).CONTROLLER;
  const out = Object.entries(sources)
    .filter(([file, imports]) => file !== CLIENT && imports.some(isRuntime))
    .map(([file]) => `${file} imports agent-runtime, and only ${CLIENT} may`);
  if (!(sources[CLIENT] ?? []).some(isRuntime)) out.push(`${CLIENT} imports no agent-runtime: CLIENT names the wrong file`);
  const reaches = (file: string, seen: Set<string>): boolean => {
    const imports = sources[file] ?? [];
    if (imports.includes(CLIENT)) return true;
    seen.add(file);
    return imports.some((m) => controllers.includes(m) && !seen.has(m) && reaches(m, seen));
  };
  for (const file of beneathCli(sources))
    if (!reaches(file, new Set()))
      out.push(
        `${file} is a controller and reaches ${CLIENT} through none of its imports: the controllers reach the runtime through the client`,
      );
  for (const m of sources[CLIENT] ?? [])
    if (controllers.includes(m)) out.push(`${CLIENT} imports ${m}, a controller: the client is beneath every controller`);
  return out;
}

/**
 * No cycle among the client and the controllers: an ES module read in a cycle can be read before it has run, and a name it exports is then
 * not yet there. Each cycle is named once, from its least file, found as the shortest way back to its start, breadth first.
 */
function cycles(sources: Sources): string[] {
  const nodes = [CLIENT, ...kinds(sources).CONTROLLER].sort();
  const edges = (file: string) => (sources[file] ?? []).filter((m) => nodes.includes(m)).sort();
  const found = new Set<string>();
  for (const from of nodes) {
    const back = new Map<string, string>();
    const queue = [from];
    while (queue.length) {
      const at = queue.shift()!;
      for (const next of edges(at)) {
        if (next === from) {
          const loop = [from];
          for (let step = at; step !== from; step = back.get(step)!) loop.splice(1, 0, step);
          const least = loop.indexOf([...loop].sort()[0]);
          const turned = [...loop.slice(least), ...loop.slice(0, least)];
          found.add(`a cycle: ${[...turned, turned[0]].join(' → ')}`);
          queue.length = 0;
          break;
        }
        if (!back.has(next)) {
          back.set(next, at);
          queue.push(next);
        }
      }
    }
  }
  return [...found].sort();
}

/** Each file of a place's code (`place/<name>/`, in folders too) with its imports, the relative ones resolved from the package. */
const placeSources = (): Sources => {
  const dir = path.join(PKG, 'place');
  return Object.fromEntries(
    fs
      .readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .map((f) => `place/${f.split(path.sep).join('/')}`)
      .filter((f) => /^place\/[^/]+\/.+\.ts$/.test(f) && !f.endsWith('.test.ts'))
      .map((f) => [f, importsIn(fs.readFileSync(path.join(PKG, f), 'utf8')).map((m) => resolved(f, m))]),
  );
};

/** A node built-in, bare or as `node:`. */
const isBuiltin = (m: string): boolean => m.startsWith('node:') || builtinModules.includes(m);

/** The files of `src` a place's code may import: what a place is, its contract and its service. */
const PLACE_REACHES = ['src/place/place.ts', 'src/place/place.store.ts'];

/** The one file of `src` that imports a place's code, and gives it to whoever composes a program. */
const PLACE_DOOR = 'src/place/builtin.store.ts';

/** The one place the door gives: the shipped program is handed no other, and no test place. */
const DOOR_GIVES = 'place/git/';

/**
 * A place's code stands beside the package: a file of `place/<name>/` imports node's built-ins, `effect`, the files of its own place and
 * `PLACE_REACHES`, never another package, another place or the rest of `src`; and of `packageFiles`, the package's `src` and `bin`,
 * `PLACE_DOOR` alone imports a file under `place/`, and of those only one under `DOOR_GIVES`.
 */
function placeBreaks(sources: Sources, packageFiles: Sources = {}): string[] {
  const own = (file: string) => `${file.split('/').slice(0, 2).join('/')}/`;
  const inPlace = Object.entries(sources).flatMap(([file, imports]) =>
    imports
      .filter((m) => !isBuiltin(m) && !isEffect(m) && !m.startsWith(own(file)) && !PLACE_REACHES.includes(m))
      .map(
        (m) => `${file} imports ${m}: a place's code imports node's built-ins, effect, its own files and ${PLACE_REACHES.join(', ')} alone`,
      ),
  );
  const throughDoor = Object.entries(packageFiles).flatMap(([file, imports]) =>
    file === PLACE_DOOR
      ? imports
          .filter((m) => m.startsWith('place/') && !m.startsWith(DOOR_GIVES))
          .map((m) => `${file} imports ${m}: the door gives the place under ${DOOR_GIVES} alone, and a test gives its own`)
      : imports
          .filter((m) => m.startsWith('place/'))
          .map((m) => `${file} imports ${m}: ${PLACE_DOOR} alone imports a place's code, and every other file asks the place it is given`),
  );
  return [...inPlace, ...throughDoor];
}

/** The package's sources with `file`'s imports changed by `change`: a copy, so each plant breaks one thing. */
const planted = (file: string, change: (imports: readonly string[]) => readonly string[]): Sources => {
  const sources = { ...packageSources() };
  sources[file] = change(sources[file] ?? []);
  return sources;
};
const adding = (file: string, mod: string): Sources => planted(file, (imports) => [...imports, mod]);
/** The package's sources with `mod` imported by no file. */
const unimported = (mod: string): Sources =>
  Object.fromEntries(Object.entries(packageSources()).map(([file, imports]) => [file, imports.filter((m) => m !== mod)]));

test('the scanner sees every way a file can name a module — or the rules below would pass by seeing nothing', () => {
  const text = [
    "import type { TaskView } from 'agent-runtime';",
    'import {',
    '  a,',
    '  b,',
    "} from './multi-line.ts';",
    "export { verdictWord } from './check.ts';",
    "import 'side-effect';",
    "const fs = await import('node:fs');",
    "// a comment that mentions from 'nowhere' is not an import",
  ].join('\n');
  assert.deepEqual(importsIn(text), ['./check.ts', './multi-line.ts', 'agent-runtime', 'node:fs', 'side-effect']);
  assert.deepEqual(
    sourcesOf({ 'bin/wf.ts': "import { main } from '../src/cli/main.ts';" }),
    { 'bin/wf.ts': ['src/cli/main.ts'] },
    'a relative module is the package path it names',
  );
});

test('the scanner sees the environment and fetch outside comment lines, and only there', () => {
  const text = [
    "const home = process.env.HOME ?? '';",
    'const answer = await fetch(',
    "  'http://localhost',",
    ');',
    "const root = process['env'];",
    'const f = globalThis.fetch;',
    '// a comment that reads process.env.X and calls fetch( is not code',
  ].join('\n');
  assert.deepEqual(globalsIn(text), IMPURE_GLOBALS);
  assert.deepEqual(globalsIn(text.split('\n').slice(0, 2).join('\n')), IMPURE_GLOBALS, 'each on a line of its own');
  for (const read of ['.then(fetch)', 'const f = fetch;', 'const { fetch } = globalThis;', 'export const t: typeof fetch = f;'])
    assert.deepEqual(globalsIn(read), ['global:fetch'], `${read} reads the global fetch`);
  for (const read of ['const { env } = process;', 'const { argv, env: e } = process;', 'const { env } = globalThis.process;'])
    assert.deepEqual(globalsIn(read), ['global:process.env'], `${read} reads the environment`);
  assert.deepEqual(globalsIn('const e = globalThis.process.env.X;'), ['global:process.env']);
  for (const none of [
    'const r = await client.fetch(url);',
    'const e = run.process.envelope;',
    'prefetch(url);',
    'fetchAll(url);',
    'const o = { fetch: x };',
    "const name = 'fetch';",
    "c.req.header('sec-fetch-site');",
    'const { envelope } = process;',
  ])
    assert.deepEqual(globalsIn(none), [], `${none} reads no global`);
  assert.deepEqual(
    globalsIn(['/**', ' * Reads `process.env.WF_ROOT` and calls `fetch(url)`.', ' */', '// fetch(', '/* process.env */'].join('\n')),
    [],
    'a JSDoc or a comment line names them and reads nothing',
  );
  assert.deepEqual(sourcesOf({ 'src/x/x.ts': "import fs from 'node:fs';\nconst x = process.env.X;" }), {
    'src/x/x.ts': ['node:fs', 'global:process.env'],
  });
});

test("the api's copy of the globals' scanners is this test's own, character for character", () => {
  const copy = fs.readFileSync(path.join(PKG, '..', '..', 'apps', 'api', 'test', 'kinds.test.ts'), 'utf8');
  for (const [name, pattern] of Object.entries({ PROCESS_ENV, FETCH }))
    assert.ok(
      copy.includes(`const ${name} = ${String(pattern)};`),
      `apps/api/test/kinds.test.ts declares ${name} as ${String(pattern)}: copy it from here`,
    );
});

test('every file in src and bin is of one kind, and every file a kind names is there', () => {
  assert.deepEqual(unsorted(packageSources()), []);
});

test('REFUSED: a file of no kind, a file of two, and a kind naming a file that is gone', () => {
  assert.deepEqual(unsorted({ ...packageSources(), 'src/x.ts': [] }), [
    'src/x.ts is of no kind: put it in a feature folder under a name that says its kind, or name it in PURE, STORE, CONTROLLER or CLIENT in test/boundary.test.ts',
  ]);
  const { 'src/run.ts': _, ...gone } = packageSources();
  assert.deepEqual(unsorted(gone), ['PURE names src/run.ts, which is not there']);
  const { [CLIENT]: __, ...clientGone } = packageSources();
  assert.deepEqual(unsorted(clientGone), ['CLIENT names src/runtime-client.ts, which is not there']);
  const named = [...PURE, ...STORE, ...CONTROLLER, CLIENT];
  assert.equal(named.length, new Set(named).size, 'and no file is in two kinds today');
  assert.deepEqual(
    named.filter((f) => !/^(src|bin)\/[^/]+\.ts$/.test(f)),
    [],
    'the lists name files at the root of src and bin: a file in a folder takes its kind from its name',
  );
});

test('a file in a folder takes its kind from its name, and a test beside the code is of none', () => {
  assert.deepEqual(kindsOf('src/retry/retry.ts'), ['PURE']);
  assert.deepEqual(kindsOf('src/retry/index.ts'), ['PURE']);
  assert.deepEqual(kindsOf('src/record/record.store.ts'), ['STORE']);
  assert.deepEqual(kindsOf('src/retry/retry.verb.ts'), ['CONTROLLER']);
  assert.deepEqual(kindsOf('src/record/record.model.ts'), ['MODEL']);
  assert.deepEqual(kindsOf('src/model/er.model.ts'), ['MODEL']);
  assert.deepEqual(kindsOf('src/cli/flags.ts'), ['CONTROLLER']);
  assert.deepEqual(kindsOf('src/retry/retry.test.ts'), []);
  assert.deepEqual(kindsOf('src/x.ts'), [], 'a root file is sorted by the lists alone');
  assert.deepEqual(kindsOf('bin/x.store.ts'), [], 'and so is a file in bin');
});

test('REFUSED: a pure file in a folder that reads the disk, a store in a folder that imports the runtime, and a verb that reaches no client', () => {
  assert.deepEqual(impurities({ ...packageSources(), 'src/x/x.ts': ['node:fs'] }), ['src/x/x.ts is pure and imports node:fs']);
  assert.deepEqual(impurities({ ...packageSources(), 'src/x/index.ts': ['src/x/x.store.ts'], 'src/x/x.store.ts': [] }), [
    'src/x/index.ts is pure and imports src/x/x.store.ts',
  ]);
  const store = { ...adding('src/tick/tick.verb.ts', 'src/x/x.store.ts'), 'src/x/x.store.ts': ['agent-runtime'] };
  assert.deepEqual(treeBreaks(store), ['src/x/x.store.ts is a store file and imports agent-runtime']);
  assert.deepEqual(clientBreaks({ ...packageSources(), 'src/x/x.verb.ts': ['src/x/x.store.ts'] }), [
    'src/x/x.verb.ts is a controller and reaches src/runtime-client.ts through none of its imports: the controllers reach the runtime through the client',
  ]);
});

test("REFUSED: a file of src that imports a door's memory stand-in", () => {
  assert.deepEqual(treeBreaks(packageSources()), [], 'the shipped program imports no stand-in');
  const broken = treeBreaks(adding('src/tick/tick.verb.ts', 'src/runs/memory.store.ts'));
  assert.equal(broken.length, 1);
  assert.ok(broken[0].startsWith('src/tick/tick.verb.ts imports src/runs/memory.store.ts'), broken[0]);
});

test('model files import effect, other model files and pure files alone, no pure file imports one, and src/model/ holds model files alone', () => {
  const sources = packageSources();
  assert.ok(
    ['src/model/er.model.ts', 'src/record/record.model.ts'].every((f) => f in sources),
    'the scan reads the model files',
  );
  assert.deepEqual(modelBreaks(sources), []);
  const reached = new Set<string>();
  const reach = (file: string): void => {
    if (reached.has(file)) return;
    reached.add(file);
    for (const m of sources[file] ?? []) if (m in sources) reach(m);
  };
  for (const entry of PURE) reach(entry);
  assert.deepEqual(
    [...reached].filter((f) => kindsOf(f)[0] === 'MODEL'),
    [],
    'no model file is reachable from agent-orchestrator/run or /workflow, which load no Effect but effect/Data',
  );
});

test('REFUSED: a pure file that imports a model file, and a model file that imports a store file, the disk or the runtime, or sits in src/model/ under another name', () => {
  assert.deepEqual(impurities(adding('src/record/record.ts', 'src/record/record.model.ts')), [
    'src/record/record.ts is pure and imports src/record/record.model.ts',
  ]);
  assert.deepEqual(impurities(adding('src/run.ts', 'src/model/er.model.ts')), ['src/run.ts is pure and imports src/model/er.model.ts']);
  for (const m of ['src/record/record.store.ts', 'node:fs', 'agent-runtime'])
    assert.deepEqual(modelBreaks(adding('src/record/record.model.ts', m)), [
      `src/record/record.model.ts is a model file and imports ${m}: a model imports effect, other model files and pure files alone`,
    ]);
  assert.deepEqual(modelBreaks({ ...packageSources(), 'src/model/words.ts': [] }), [
    'src/model/words.ts is in src/model/, which holds model files alone: name it <name>.model.ts, or put it beside the feature it serves',
  ]);
  for (const m of ['effect', 'effect/Schema', 'src/model/brand.model.ts', 'src/record/record.ts', 'src/forget/forget.ts'])
    assert.deepEqual(modelBreaks(adding('src/record/record.model.ts', m)), [], `${m} is let through`);
});

test('pure files import no runtime, read no disk, spawn nothing, load no Effect but effect/Data, and reach for no store or controller file', () => {
  assert.deepEqual(impurities(packageSources()), []);
});

test('REFUSED: a pure file that reads the disk, spawns, imports the runtime or Effect other than effect/Data, or reaches for a store or a controller file', () => {
  assert.deepEqual(impurities(adding('src/run.ts', 'effect')), ['src/run.ts is pure and imports effect']);
  assert.deepEqual(impurities(adding('src/daemon/daemon.ts', 'effect/Schema')), ['src/daemon/daemon.ts is pure and imports effect/Schema']);
  assert.deepEqual(impurities(adding('src/run.ts', 'effect/DataX')), ['src/run.ts is pure and imports effect/DataX']);
  assert.deepEqual(impurities(adding('src/run.ts', 'effect/Data/internal')), ['src/run.ts is pure and imports effect/Data/internal']);
  assert.deepEqual(impurities(adding('src/run.ts', '@effect/Data')), ['src/run.ts is pure and imports @effect/Data']);
  assert.deepEqual(impurities(adding('src/run.ts', 'effect/Data')), [], 'effect/Data, and it alone, is let through');
  assert.ok(
    ['src/status/status.ts', 'src/record/record.ts'].every((f) => f in packageSources()),
    'the plants go into files the scan reads',
  );
  assert.deepEqual(impurities(adding('src/status/status.ts', 'effect')), ['src/status/status.ts is pure and imports effect']);
  assert.deepEqual(impurities(adding('src/record/record.ts', 'node:fs')), ['src/record/record.ts is pure and imports node:fs']);
  assert.ok(
    ['src/retry/retry.ts', 'src/list/list.ts', 'src/tick/assess.ts'].every((f) => f in packageSources()),
    'the plants go into files the scan reads',
  );
  assert.deepEqual(impurities(adding('src/retry/retry.ts', 'effect')), ['src/retry/retry.ts is pure and imports effect']);
  assert.deepEqual(impurities(adding('src/list/list.ts', 'node:fs')), ['src/list/list.ts is pure and imports node:fs']);
  assert.deepEqual(impurities(adding('src/tick/assess.ts', 'src/record/record.store.ts')), [
    'src/tick/assess.ts is pure and imports src/record/record.store.ts',
  ]);
  assert.ok('src/branches/branches.ts' in packageSources());
  assert.deepEqual(impurities(adding('src/branches/branches.ts', 'node:fs')), ['src/branches/branches.ts is pure and imports node:fs']);
  assert.deepEqual(impurities(adding('src/workflow.ts', 'fs')), ['src/workflow.ts is pure and imports fs']);
  assert.deepEqual(impurities(adding('src/check/check.ts', 'node:child_process')), [
    'src/check/check.ts is pure and imports node:child_process',
  ]);
  assert.deepEqual(impurities(adding('src/run.ts', 'agent-runtime/harness')), ['src/run.ts is pure and imports agent-runtime/harness']);
  assert.deepEqual(impurities(adding('src/run.ts', 'agent-runtime')), ['src/run.ts is pure and imports agent-runtime']);
  assert.deepEqual(impurities(adding('src/run.ts', 'agent-runtime/vocabulary/x')), [
    'src/run.ts is pure and imports agent-runtime/vocabulary/x',
  ]);
  assert.deepEqual(
    impurities(adding('src/workflow/fence.ts', 'agent-runtime/vocabulary')),
    [],
    'the vocabulary, and it alone, is let through',
  );
  assert.ok('src/agents/agents.ts' in packageSources());
  assert.deepEqual(impurities(adding('src/agents/agents.ts', 'src/agents/agents.store.ts')), [
    'src/agents/agents.ts is pure and imports src/agents/agents.store.ts',
  ]);
  assert.deepEqual(impurities(adding('src/workflow.ts', 'src/folder/folder.store.ts')), [
    'src/workflow.ts is pure and imports src/folder/folder.store.ts',
  ]);
  assert.deepEqual(impurities(adding('src/keys/keys.ts', 'node:fs')), ['src/keys/keys.ts is pure and imports node:fs']);
  assert.deepEqual(impurities(adding('src/workflow/step-file.ts', 'src/folder/folder.store.ts')), [
    'src/workflow/step-file.ts is pure and imports src/folder/folder.store.ts',
  ]);
  assert.deepEqual(impurities(adding('src/feed/feed.ts', 'src/runner.ts')), ['src/feed/feed.ts is pure and imports src/runner.ts']);
  assert.deepEqual(impurities(adding('src/run.ts', 'src/tick/tick.verb.ts')), ['src/run.ts is pure and imports src/tick/tick.verb.ts']);
  assert.deepEqual(impurities(adding('src/timeline/timeline.ts', CLIENT)), [
    'src/timeline/timeline.ts is pure and imports src/runtime-client.ts',
  ]);
  assert.deepEqual(impurities(adding('src/views/views-words.ts', CLIENT)), [
    'src/views/views-words.ts is pure and imports src/runtime-client.ts',
  ]);
  assert.deepEqual(impurities(adding('src/views/views-words.ts', 'src/views/views.verb.ts')), [
    'src/views/views-words.ts is pure and imports src/views/views.verb.ts',
  ]);
});

test('REFUSED: a pure file that reaches the network or the machine, reads the environment or calls fetch', () => {
  for (const m of ['node:os', 'os', 'node:http', 'http', 'node:https', 'node:net', 'net'])
    assert.deepEqual(impurities(adding('src/run.ts', m)), [`src/run.ts is pure and imports ${m}`]);
  assert.deepEqual(impurities(adding('src/workflow.ts', 'global:process.env')), ['src/workflow.ts is pure and imports global:process.env']);
  assert.deepEqual(impurities(adding('src/tick/assess.ts', 'global:fetch')), ['src/tick/assess.ts is pure and imports global:fetch']);
  const read = sourcesOf({ 'src/x/x.ts': 'export const root = () => process.env.WF_ROOT;\nexport const get = (u: string) => fetch(u);' });
  assert.deepEqual(impurities({ ...packageSources(), ...read }), [
    'src/x/x.ts is pure and imports global:process.env',
    'src/x/x.ts is pure and imports global:fetch',
  ]);
  const reached = sourcesOf({
    'src/x/a.ts': 'export const go = (p: Promise<URL>) => p.then(fetch);',
    'src/x/b.ts': 'const f = fetch;\nexport const g = f;',
    'src/x/c.ts': 'const { env } = process;\nexport const home = env.HOME;',
  });
  assert.deepEqual(impurities({ ...packageSources(), ...reached }), [
    'src/x/a.ts is pure and imports global:fetch',
    'src/x/b.ts is pure and imports global:fetch',
    'src/x/c.ts is pure and imports global:process.env',
  ]);
  const said = sourcesOf({ 'src/x/x.ts': '/** Reads no `process.env` and calls no `fetch(url)`. */\nexport const x = 1;' });
  assert.deepEqual(impurities({ ...packageSources(), ...said }), [], 'a JSDoc that names them is let through');
  assert.deepEqual(impurities(adding('src/wait/wait.verb.ts', 'global:process.env')), [], 'a controller reads the environment');
});

test("a place's code imports node built-ins, effect, its own files and what a place is alone, and one file of src imports it", () => {
  const sources = placeSources();
  assert.ok('place/git/git.ts' in sources, `the scan read ${Object.keys(sources).join(', ') || 'no file'}`);
  assert.ok(sources['place/git/verbs/land.ts'].includes('place/git/git.ts'), 'and read their imports');
  assert.ok(sources['place/git/git.ts'].includes('src/place/place.store.ts'));
  assert.ok(packageSources()[PLACE_DOOR].includes('place/git/place.ts'), 'the door imports the git place');
  assert.deepEqual(placeBreaks(sources, packageSources()), []);
});

test("REFUSED: a place's file that imports a package, the rest of src or another place, and a file of src but the door that imports a place", () => {
  const at = 'place/git/git.ts';
  const plant = (m: string): Sources => ({ ...placeSources(), [at]: [...placeSources()[at], m] });
  for (const m of [
    'agent-runtime',
    'agent-orchestrator/run',
    'src/run.ts',
    'src/runtime-client.ts',
    'src/tick/tick.verb.ts',
    'place/other/x.ts',
  ])
    assert.deepEqual(placeBreaks(plant(m)), [
      `${at} imports ${m}: a place's code imports node's built-ins, effect, its own files and ${PLACE_REACHES.join(', ')} alone`,
    ]);
  for (const m of ['node:fs', 'fs', 'path', 'node:child_process', 'effect', 'place/git/verbs/open.ts', 'src/place/place.ts'])
    assert.deepEqual(placeBreaks(plant(m)), [], `${m} is let through`);
  for (const file of [
    'src/tick/tick.verb.ts',
    'src/place/place.store.ts',
    'src/place/landing.store.ts',
    'src/cli/main.ts',
    'bin/nemia.ts',
  ]) {
    assert.ok(file in packageSources(), file);
    assert.deepEqual(placeBreaks(placeSources(), adding(file, 'place/git/place.ts')), [
      `${file} imports place/git/place.ts: ${PLACE_DOOR} alone imports a place's code, and every other file asks the place it is given`,
    ]);
  }
  assert.deepEqual(placeBreaks(placeSources(), unimported('place/git/place.ts')), [], 'and a package that imports none breaks nothing');
});

test('REFUSED: the door importing the test place, or any place but git — the shipped program is never handed a stand-in', () => {
  assert.ok('place/memory/index.ts' in placeSources(), 'the test place is there to be imported');
  for (const m of ['place/memory/index.ts', 'place/memory/place.ts', 'place/other/x.ts'])
    assert.deepEqual(placeBreaks(placeSources(), adding(PLACE_DOOR, m)), [
      `${PLACE_DOOR} imports ${m}: the door gives the place under ${DOOR_GIVES} alone, and a test gives its own`,
    ]);
  assert.deepEqual(
    placeBreaks(placeSources(), adding(PLACE_DOOR, 'place/git/declared.ts')),
    [],
    'another file of the git place is let through',
  );
});

test('store files import no runtime, no controller and not the client, load as a tree beneath the controllers, and only the client and the controllers beneath the CLI import them', () => {
  assert.deepEqual(treeBreaks(packageSources()), []);
});

test('REFUSED: a store file that imports the runtime, a controller or the client, a store import off the tree, one no controller imports, and one the CLI imports', () => {
  assert.deepEqual(treeBreaks(adding('src/record/record.store.ts', 'agent-runtime')), [
    'src/record/record.store.ts is a store file and imports agent-runtime',
  ]);
  assert.ok('src/branches/branches.store.ts' in packageSources());
  assert.deepEqual(treeBreaks(adding('src/branches/branches.store.ts', 'src/runner.ts')), [
    'src/branches/branches.store.ts is a store file and imports src/runner.ts, a controller: a cycle',
  ]);
  assert.deepEqual(treeBreaks(adding('src/folder/folder.store.ts', 'src/record/record.store.ts')), [
    'src/folder/folder.store.ts imports src/record/record.store.ts, which the tree does not let it: of the store it imports src/agents/read.store.ts, src/skills/read.store.ts',
  ]);
  assert.deepEqual(treeBreaks(adding('src/folder/folder.store.ts', 'src/folder/write.store.ts')), [
    'src/folder/folder.store.ts imports src/folder/write.store.ts, which the tree does not let it: of the store it imports src/agents/read.store.ts, src/skills/read.store.ts',
  ]);
  assert.deepEqual(treeBreaks(adding('src/folder/folder.store.ts', 'src/agents/agents.store.ts')), [
    'src/folder/folder.store.ts imports src/agents/agents.store.ts, which the tree does not let it: of the store it imports src/agents/read.store.ts, src/skills/read.store.ts',
  ]);
  assert.deepEqual(treeBreaks(adding('src/folder/folder.store.ts', 'src/skills/skills.store.ts')), [
    'src/folder/folder.store.ts imports src/skills/skills.store.ts, which the tree does not let it: of the store it imports src/agents/read.store.ts, src/skills/read.store.ts',
  ]);
  assert.deepEqual(treeBreaks(adding('src/folder/folder.store.ts', 'src/agents/custom.store.ts')), [
    'src/folder/folder.store.ts imports src/agents/custom.store.ts, which the tree does not let it: of the store it imports src/agents/read.store.ts, src/skills/read.store.ts',
  ]);
  assert.ok('src/skills/read.store.ts' in packageSources());
  assert.deepEqual(treeBreaks(adding('src/skills/read.store.ts', 'src/folder/folder.store.ts')), [
    'src/skills/read.store.ts imports src/folder/folder.store.ts, which the tree does not let it: it is the bottom, and imports no store file',
  ]);
  assert.deepEqual(treeBreaks(adding('src/skills/read.store.ts', 'src/agents/read.store.ts')), [
    'src/skills/read.store.ts imports src/agents/read.store.ts, which the tree does not let it: it is the bottom, and imports no store file',
  ]);
  assert.ok('src/agents/read.store.ts' in packageSources());
  assert.deepEqual(treeBreaks(adding('src/agents/read.store.ts', 'src/record/record.store.ts')), [
    'src/agents/read.store.ts imports src/record/record.store.ts, which the tree does not let it: of the store it imports src/skills/read.store.ts',
  ]);
  assert.deepEqual(treeBreaks(adding('src/agents/read.store.ts', 'src/folder/folder.store.ts')), [
    'src/agents/read.store.ts imports src/folder/folder.store.ts, which the tree does not let it: of the store it imports src/skills/read.store.ts',
  ]);
  assert.deepEqual(treeBreaks(adding('src/agents/read.store.ts', 'src/agents/custom.store.ts')), [
    'src/agents/read.store.ts imports src/agents/custom.store.ts, which the tree does not let it: of the store it imports src/skills/read.store.ts',
  ]);
  assert.deepEqual(treeBreaks(adding('src/folder/write.store.ts', 'src/workspace/worktree.store.ts')), [
    'src/folder/write.store.ts imports src/workspace/worktree.store.ts, which the tree does not let it: of the store it imports src/record/record.store.ts, src/agents/read.store.ts, src/skills/read.store.ts, src/factory/factory.store.ts',
  ]);
  assert.deepEqual(treeBreaks(adding('src/factory/factory.store.ts', 'src/folder/write.store.ts')), [
    'src/factory/factory.store.ts imports src/folder/write.store.ts, which the tree does not let it: of the store it imports src/record/record.store.ts, src/schedule/schedule.store.ts, src/applied/applied.store.ts, src/factory/own-agent.store.ts',
  ]);
  assert.deepEqual(treeBreaks(adding('src/skills/skills.store.ts', 'src/agents/agents.store.ts')), [
    'src/skills/skills.store.ts imports src/agents/agents.store.ts, which the tree does not let it: of the store it imports src/record/places.store.ts, src/skills/read.store.ts, src/meter/tally.store.ts, src/config/config.store.ts, src/config/root.store.ts, src/agents/read.store.ts, src/folder/folder.store.ts, src/record/steps.store.ts, src/revisions/revisions.store.ts, src/record/record.store.ts, src/pause/pause.store.ts, src/schedule/schedule.store.ts, src/applied/applied.store.ts, src/factory/own-agent.store.ts, src/factory/factory.store.ts, src/record/files.store.ts, src/place/place.store.ts, src/workspace/worktree.store.ts, src/folder/write.store.ts, src/folder/lookup.store.ts, src/branches/branches.store.ts, src/branches/changes.store.ts, src/feed/feed.store.ts, src/standing/standing.store.ts, src/door/door.store.ts, src/runs/runs.store.ts, src/level/level.store.ts, src/rules/rules.store.ts, src/servers/servers.store.ts, src/factory/factories.store.ts',
  ]);
  assert.deepEqual(treeBreaks(adding('src/record/files.store.ts', 'src/workspace/worktree.store.ts')), [
    'src/record/files.store.ts imports src/workspace/worktree.store.ts, which the tree does not let it: of the store it imports src/record/record.store.ts, src/pause/pause.store.ts, src/config/config.store.ts',
  ]);
  assert.deepEqual(treeBreaks(adding('src/record/record.store.ts', 'src/workspace/worktree.store.ts')), [
    'src/record/record.store.ts imports src/workspace/worktree.store.ts, which the tree does not let it: of the store it imports src/record/places.store.ts, src/skills/read.store.ts, src/meter/tally.store.ts, src/config/config.store.ts, src/folder/folder.store.ts, src/record/steps.store.ts, src/revisions/revisions.store.ts',
  ]);
  assert.ok('src/place/place.store.ts' in packageSources());
  assert.deepEqual(treeBreaks(adding('src/place/place.store.ts', 'src/branches/branches.store.ts')), [
    'src/place/place.store.ts imports src/branches/branches.store.ts, which the tree does not let it: it is the bottom, and imports no store file',
  ]);
  assert.deepEqual(treeBreaks(adding('src/branches/branches.store.ts', 'src/place/place.store.ts')), [
    'src/branches/branches.store.ts imports src/place/place.store.ts, which the tree does not let it: of the store it imports src/meter/tally.store.ts, src/record/files.store.ts, src/record/record.store.ts, src/workspace/worktree.store.ts',
  ]);
  assert.deepEqual(treeBreaks(adding('src/inbox/inbox.store.ts', 'src/decide/decide.verb.ts')), [
    'src/inbox/inbox.store.ts is a store file and imports src/decide/decide.verb.ts, a controller: a cycle',
  ]);
  assert.deepEqual(treeBreaks(adding('src/record/record.store.ts', CLIENT)), [
    'src/record/record.store.ts is a store file and imports src/runtime-client.ts, the client: a cycle',
  ]);
  assert.deepEqual(treeBreaks(adding('src/agents/agents.store.ts', 'src/tick/tick.verb.ts')), [
    'src/agents/agents.store.ts is a store file and imports src/tick/tick.verb.ts, a controller: a cycle',
  ]);
  assert.deepEqual(treeBreaks(adding('src/agents/agents.store.ts', 'src/inbox/inbox.store.ts')), [
    'src/agents/agents.store.ts imports src/inbox/inbox.store.ts, which the tree does not let it: of the store it imports src/record/places.store.ts, src/skills/read.store.ts, src/meter/tally.store.ts, src/config/config.store.ts, src/config/root.store.ts, src/agents/read.store.ts, src/folder/folder.store.ts, src/record/steps.store.ts, src/revisions/revisions.store.ts, src/record/record.store.ts, src/pause/pause.store.ts, src/schedule/schedule.store.ts, src/applied/applied.store.ts, src/factory/own-agent.store.ts, src/factory/factory.store.ts, src/record/files.store.ts, src/place/place.store.ts, src/workspace/worktree.store.ts, src/folder/write.store.ts, src/folder/lookup.store.ts, src/branches/branches.store.ts, src/branches/changes.store.ts, src/feed/feed.store.ts, src/standing/standing.store.ts, src/door/door.store.ts, src/runs/runs.store.ts, src/level/level.store.ts, src/rules/rules.store.ts, src/servers/servers.store.ts, src/factory/factories.store.ts',
  ]);
  assert.deepEqual(treeBreaks(unimported('src/agents/agents.store.ts')), [
    "src/agents/agents.store.ts is imported by no controller and not by the client: a store file is the controllers' I/O",
  ]);
  assert.deepEqual(treeBreaks(unimported('src/skills/read.store.ts')), [
    "src/skills/read.store.ts is imported by no controller and not by the client: a store file is the controllers' I/O",
  ]);
  assert.deepEqual(treeBreaks(unimported('src/agents/read.store.ts')), [
    "src/agents/read.store.ts is imported by no controller and not by the client: a store file is the controllers' I/O",
  ]);
  assert.deepEqual(treeBreaks(unimported('src/daemon/daemon.store.ts')), [
    "src/daemon/daemon.store.ts is imported by no controller and not by the client: a store file is the controllers' I/O",
  ]);
  assert.deepEqual(treeBreaks(adding('bin/wf.ts', 'src/branches/branches.store.ts')), [
    'bin/wf.ts imports src/branches/branches.store.ts, a store file: only the client and the controllers beneath the CLI import the store',
  ]);
  assert.deepEqual(treeBreaks(adding('bin/nemia.ts', 'src/branches/branches.store.ts')), [
    'bin/nemia.ts imports src/branches/branches.store.ts, a store file: only the client and the controllers beneath the CLI import the store',
  ]);
  assert.deepEqual(treeBreaks(adding('src/cli/main.ts', 'src/record/record.store.ts')), [
    'src/cli/main.ts imports src/record/record.store.ts, a store file: only the client and the controllers beneath the CLI import the store',
  ]);
  assert.deepEqual(treeBreaks(adding('src/cli/start.ts', 'src/record/record.store.ts')), [
    'src/cli/start.ts imports src/record/record.store.ts, a store file: only the client and the controllers beneath the CLI import the store',
  ]);
});

test('the CLI reaches the package only through runner.ts, workflow.ts and its own folder, and each bin only through cli/main.ts and cli/exit.ts', () => {
  const sources = packageSources();
  assert.deepEqual(cliBreaks(sources), []);
  assert.deepEqual(
    [sources['src/cli/main.ts'], sources['src/cli/flags.ts'], sources['bin/nemia.ts'], sources['bin/wf.ts']].map((imports) =>
      imports.filter((m) => m.startsWith('src/')).sort(),
    ),
    [
      ['src/cli/decide/decide.ts', 'src/cli/flags.ts', 'src/cli/runs.ts', 'src/cli/start.ts', 'src/cli/writers.ts', 'src/runner.ts'],
      ['src/runner.ts'],
      ['src/cli/exit.ts', 'src/cli/main.ts'],
      ['src/cli/exit.ts', 'src/cli/main.ts'],
    ],
    "a file of the CLI's folder reaches the root and its own folder, and each bin the CLI's two doors: let through",
  );
  assert.deepEqual(
    cliBreaks(adding('src/cli/main.ts', 'src/record/record.store.ts')),
    ['src/cli/main.ts imports src/record/record.store.ts: it reaches the package through src/runner.ts and src/workflow.ts'],
    'REFUSED: the CLI reaching past runner.ts',
  );
  assert.deepEqual(
    cliBreaks(adding('src/cli/decide/decide.ts', 'src/record/record.store.ts')),
    ['src/cli/decide/decide.ts imports src/record/record.store.ts: it reaches the package through src/runner.ts and src/workflow.ts'],
    'REFUSED: a verb in a folder of the CLI reaching past runner.ts',
  );
  assert.deepEqual(
    cliBreaks(adding('src/cli/main.ts', 'src/tick/tick.verb.ts')),
    ['src/cli/main.ts imports src/tick/tick.verb.ts: it reaches the package through src/runner.ts and src/workflow.ts'],
    'REFUSED: the CLI reaching a controller beneath the root',
  );
  assert.deepEqual(
    cliBreaks(adding('src/cli/main.ts', 'src/agents/agents.ts')),
    ['src/cli/main.ts imports src/agents/agents.ts: it reaches the package through src/runner.ts and src/workflow.ts'],
    'REFUSED: the CLI reaching a part of the format past its entry',
  );
  assert.deepEqual(
    cliBreaks(adding('src/cli/start.ts', 'src/record/record.store.ts')),
    ['src/cli/start.ts imports src/record/record.store.ts: it reaches the package through src/runner.ts and src/workflow.ts'],
    "REFUSED: a family of the CLI's folder reaching past runner.ts",
  );
  assert.deepEqual(
    cliBreaks(adding('bin/wf.ts', 'src/runner.ts')),
    ['bin/wf.ts imports src/runner.ts: it reaches the package through src/cli/main.ts and src/cli/exit.ts'],
    'REFUSED: bin/wf.ts reaching past the CLI',
  );
  assert.deepEqual(
    cliBreaks(adding('bin/wf.ts', 'src/cli/flags.ts')),
    ['bin/wf.ts imports src/cli/flags.ts: it reaches the package through src/cli/main.ts and src/cli/exit.ts'],
    "REFUSED: bin/wf.ts reaching a family of the CLI's folder past its doors",
  );
  assert.deepEqual(
    cliBreaks(adding('bin/nemia.ts', 'src/runner.ts')),
    ['bin/nemia.ts imports src/runner.ts: it reaches the package through src/cli/main.ts and src/cli/exit.ts'],
    'REFUSED: bin/nemia.ts reaching past the CLI',
  );
  assert.deepEqual(
    cliBreaks(adding('bin/wf.ts', 'bin/nemia.ts')),
    ['bin/wf.ts imports bin/nemia.ts: it reaches the package through src/cli/main.ts and src/cli/exit.ts'],
    'REFUSED: the alias reaching the other bin',
  );
});

test(`the runtime is reached through one client: only ${CLIENT} imports agent-runtime — not even for a type — and every controller beneath the CLI imports it`, () => {
  assert.deepEqual(clientBreaks(packageSources()), []);
});

test('REFUSED: a type imported from the runtime by a controller, a store file, a pure file or the CLI, a client that imports none, a controller that goes round it, and a client above a controller', () => {
  assert.deepEqual(clientBreaks(adding('src/tick/tick.verb.ts', 'agent-runtime')), [
    'src/tick/tick.verb.ts imports agent-runtime, and only src/runtime-client.ts may',
  ]);
  assert.deepEqual(clientBreaks(adding('src/runner.ts', 'agent-runtime')), [
    'src/runner.ts imports agent-runtime, and only src/runtime-client.ts may',
  ]);
  assert.deepEqual(clientBreaks(adding('src/agents/agents.store.ts', 'agent-runtime')), [
    'src/agents/agents.store.ts imports agent-runtime, and only src/runtime-client.ts may',
  ]);
  assert.deepEqual(clientBreaks(adding('src/record/record.store.ts', 'agent-runtime')), [
    'src/record/record.store.ts imports agent-runtime, and only src/runtime-client.ts may',
  ]);
  assert.deepEqual(clientBreaks(adding('src/timeline/timeline.ts', 'agent-runtime/harness')), [
    'src/timeline/timeline.ts imports agent-runtime, and only src/runtime-client.ts may',
  ]);
  assert.deepEqual(clientBreaks(adding('src/cli/main.ts', 'agent-runtime')), [
    'src/cli/main.ts imports agent-runtime, and only src/runtime-client.ts may',
  ]);
  assert.deepEqual(clientBreaks(adding('src/cli/flags.ts', 'agent-runtime')), [
    'src/cli/flags.ts imports agent-runtime, and only src/runtime-client.ts may',
  ]);
  assert.deepEqual(clientBreaks(adding('bin/wf.ts', 'agent-runtime')), [
    'bin/wf.ts imports agent-runtime, and only src/runtime-client.ts may',
  ]);
  assert.deepEqual(clientBreaks(adding('bin/nemia.ts', 'agent-runtime')), [
    'bin/nemia.ts imports agent-runtime, and only src/runtime-client.ts may',
  ]);
  assert.deepEqual(clientBreaks(adding('src/agents/agents.store.ts', 'agent-runtime/vocabulary/x')), [
    'src/agents/agents.store.ts imports agent-runtime, and only src/runtime-client.ts may',
  ]);
  assert.deepEqual(clientBreaks(adding('src/tick/tick.verb.ts', 'agent-runtime/vocabulary')), [], "the vocabulary is any file's");
  assert.deepEqual(clientBreaks(planted(CLIENT, (imports) => imports.filter((m) => !isRuntime(m)))), [
    'src/runtime-client.ts imports no agent-runtime: CLIENT names the wrong file',
  ]);
  assert.deepEqual(clientBreaks(planted('src/views/views.verb.ts', (imports) => imports.filter((m) => m !== CLIENT))), [
    'src/views/views.verb.ts is a controller and reaches src/runtime-client.ts through none of its imports: the controllers reach the runtime through the client',
  ]);
  assert.deepEqual(clientBreaks(planted('src/meter/meter.verb.ts', (imports) => imports.filter((m) => m !== CLIENT))), [
    'src/meter/meter.verb.ts is a controller and reaches src/runtime-client.ts through none of its imports: the controllers reach the runtime through the client',
  ]);
  assert.deepEqual(clientBreaks(adding(CLIENT, 'src/tick/tick.verb.ts')), [
    'src/runtime-client.ts imports src/tick/tick.verb.ts, a controller: the client is beneath every controller',
  ]);
});

test('REFUSED: a verb that reaches the client only through a controller that no longer does; the link through a controller is let through', () => {
  const linked = { ...packageSources(), 'src/plan/plan.verb.ts': ['src/start/start.verb.ts'], 'src/start/start.verb.ts': [CLIENT] };
  assert.deepEqual(clientBreaks(linked), [], 'plan.verb.ts reaches the client through start.verb.ts');
  assert.deepEqual(clientBreaks({ ...linked, 'src/plan/plan.verb.ts': [] }), [
    'src/plan/plan.verb.ts is a controller and reaches src/runtime-client.ts through none of its imports: the controllers reach the runtime through the client',
  ]);
  assert.deepEqual(clientBreaks({ ...linked, 'src/start/start.verb.ts': ['src/plan/plan.verb.ts'] }), [
    'src/inbox/inbox.verb.ts is a controller and reaches src/runtime-client.ts through none of its imports: the controllers reach the runtime through the client',
    'src/plan/plan.verb.ts is a controller and reaches src/runtime-client.ts through none of its imports: the controllers reach the runtime through the client',
    'src/start/start.verb.ts is a controller and reaches src/runtime-client.ts through none of its imports: the controllers reach the runtime through the client',
  ]);
  assert.deepEqual(
    clientBreaks({ ...linked, 'src/plan/plan.verb.ts': ['src/start/start.store.ts'], 'src/start/start.store.ts': [CLIENT] }),
    [
      'src/plan/plan.verb.ts is a controller and reaches src/runtime-client.ts through none of its imports: the controllers reach the runtime through the client',
    ],
    'through a controller, never a store',
  );
  assert.deepEqual(clientBreaks(planted('src/inbox/inbox.verb.ts', (imports) => imports.filter((m) => m !== 'src/start/start.verb.ts'))), [
    'src/inbox/inbox.verb.ts is a controller and reaches src/runtime-client.ts through none of its imports: the controllers reach the runtime through the client',
  ]);
});

test('the client and the controllers import one another with no cycle', () => {
  assert.deepEqual(cycles(packageSources()), []);
});

test('REFUSED: a cycle between two controllers, a longer one, and one through the client', () => {
  assert.deepEqual(cycles(adding('src/meter/meter.verb.ts', 'src/tick/tick.verb.ts')), [
    'a cycle: src/meter/meter.verb.ts → src/tick/tick.verb.ts → src/meter/meter.verb.ts',
  ]);
  assert.deepEqual(cycles(adding('src/start/start.verb.ts', 'src/tick/tick.verb.ts')), [
    'a cycle: src/inbox/inbox.verb.ts → src/start/start.verb.ts → src/tick/tick.verb.ts → src/inbox/inbox.verb.ts',
    'a cycle: src/schedule/schedule.verb.ts → src/start/start.verb.ts → src/tick/tick.verb.ts → src/schedule/schedule.verb.ts',
  ]);
  assert.deepEqual(cycles(adding(CLIENT, 'src/views/views.verb.ts')), [
    'a cycle: src/runtime-client.ts → src/views/views.verb.ts → src/runtime-client.ts',
  ]);
});

/**
 * The commands of a machine's needs and its readiness, entries of the command table: `nemia doctor`, every piece the server needs with
 * the command or fix that puts it there (`readinessOf`), and `nemia doctor fix`, which starts a need's fix on the server (`startFix`)
 * and, at the command line, follows what it prints to its end (`followFix`), a code it declares shown on a line of its own. `nemia
 * readiness`, the read's former name, is refused, naming `nemia doctor` (`READINESS_RETIRED`). `nemia doctor carry` installs, at this
 * release's pins, the harnesses the store holds activated or a release carries (`carryHarnesses`): what `nemia upgrade` runs of the new
 * release before it switches.
 */
import { Effect, Stream } from 'effect';
import type { Fix, FixStart, Readiness } from 'objects';
import type { Args } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { tried } from '../runtime-client.ts';
import { Invalid } from '../refusal/refusal.ts';
import { StoreRoot } from '../config/root.store.ts';
import { carryHarnesses, type CarryRan } from '../release/carry.store.ts';
import { runningRelease } from '../release/version.verb.ts';
import { followFix, startFix } from './fix.verb.ts';
import { readinessOf } from './readiness.verb.ts';

/** Each state's mark at the head of a piece's line. */
const MARK = { met: '✓', missing: '✗', unknown: '?' } as const;

/** The lines `nemia doctor` prints: whether the server is ready, then each piece, its state, its words, and each fix's command. */
export const readinessLines = (r: Readiness): string[] => [
  r.ready ? 'ready: every piece is in place' : 'not ready: a piece marked ✗ is missing, its fix below it',
  ...r.pieces.flatMap((p) => [
    `${MARK[p.state]} ${p.area}  ${p.name}${p.factory === undefined ? '' : `  (${p.factory}${p.workflow === undefined ? '' : `/${p.workflow}`})`}: ${p.message}`,
    ...p.fixes.map((f) => `    ${f.command}  — ${f.message}`),
  ]),
];

/** `nemia doctor [--json]`: every piece of the server, in place or missing, each with what fixes it. */
export const DOCTOR: Command<Readiness> = {
  name: 'doctor',
  usage: '[--json]',
  help: [
    'every piece this server needs before a run: each harness installed and',
    'signed in, the service and its linger, the bind, the machine, the git',
    "identity, each factory's workflows' and repository's needs, a factory, a",
    'newer release — each in place or missing, with the command or fix that',
    'puts it there. --json: the whole read',
  ],
  spec: {
    positionals: [],
    flags: [{ flag: '--json', kind: 'switch', key: 'json', only: { side: 'cli', why: 'the api answers the whole read, as JSON' } }],
    unknown: (arg) => `nemia doctor does not take ${arg}: nemia doctor [--json].`,
  },
  writes: false,
  class: 'read',
  only: { side: 'cli', why: 'the api answers GET /api/readiness by readinessOf, which takes no argument' },
  served: [{ endpoint: 'readiness.read' }],
  handler: () => readinessOf(),
  print: (data, args) => (args.json === true ? [JSON.stringify(data, null, 2)] : readinessLines(data)),
};

/** The answers `--answer <name>=<value>` gave, by name; refused (`Invalid`) where one has no name before its `=`. */
const answersIn = (given: Args[string]): Record<string, string> => {
  const list = Array.isArray(given) ? given : typeof given === 'string' ? [given] : [];
  return Object.fromEntries(
    list.map((pair: string) => {
      const at = pair.indexOf('=');
      if (at <= 0)
        throw new Invalid({
          message: `--answer takes <name>=<value>, and was given ${pair}: nemia doctor fix <need> --answer email=me@example.com.`,
        });
      return [pair.slice(0, at), pair.slice(at + 1)];
    }),
  );
};

/** What `nemia doctor fix` was asked, as `startFix` takes it; refused (`Invalid`) where `--index` is no whole number from 0. */
export const fixStartOf = (args: Args): FixStart => {
  const index = args.index === undefined ? undefined : Number(args.index);
  if (index !== undefined && (!Number.isInteger(index) || index < 0))
    throw new Invalid({
      message: `--index takes a whole number from 0, and was given ${String(args.index)}: nemia doctor fix <need> --index 1.`,
    });
  const answers = answersIn(args.answer);
  return {
    need: String(args.need ?? ''),
    ...(typeof args.factory === 'string' ? { factory: args.factory } : {}),
    ...(typeof args.workflow === 'string' ? { workflow: args.workflow } : {}),
    ...(index === undefined ? {} : { index }),
    ...(Object.keys(answers).length ? { answers } : {}),
  };
};

/** Each code `pattern` finds in `text`, in order: none for a pattern that is no regular expression. */
export const codesIn = (pattern: string, text: string): string[] => {
  try {
    return [...text.matchAll(new RegExp(pattern, 'g'))].map((m) => m[0]).filter(Boolean);
  } catch {
    return [];
  }
};

/** A code a fix declared, as the command line shows it: on a line of its own, spaced from what is around it. */
export const codeShown = (code: string): string => `\n\n    ${code}\n\n`;

/**
 * The fix `fix`'s output followed to its end (`followFix`), each piece written to stdout as it comes, and each new code its declared
 * pattern finds shown set apart (`codeShown`): the command line's follow, which a device-code sign-in is read from. Answers the fix as it
 * ended.
 */
const followed = (fix: Fix) =>
  Effect.gen(function* () {
    const stream = yield* followFix(fix.id);
    let ended = fix;
    let seen = '';
    const shown = new Set<string>();
    yield* Stream.runForEach(stream, (moment) =>
      Effect.sync(() => {
        if (moment.kind === 'ended') {
          ended = moment.fix;
          return;
        }
        process.stdout.write(moment.text);
        seen += moment.text;
        for (const code of fix.code === undefined ? [] : codesIn(fix.code, seen))
          if (!shown.has(code)) {
            shown.add(code);
            process.stdout.write(codeShown(code));
          }
      }),
    );
    return ended;
  });

/** What `nemia doctor fix` says of the fix once it is told: how it ended, or where it goes on. */
const fixLines = (fix: Fix): string[] => {
  if (fix.phase === 'succeeded') return [`fix ${fix.id} of ${fix.need} succeeded: nemia doctor reads the need again`];
  if (fix.phase === 'failed')
    return [
      `fix ${fix.id} of ${fix.need} failed${fix.exitCode === undefined ? '' : ` (exit ${fix.exitCode})`}: read what it printed above, then nemia doctor fix ${fix.need} again`,
    ];
  return [`fix ${fix.id} of ${fix.need} is ${fix.phase}: the daemon runs it, and the board shows what it prints as it runs`];
};

/**
 * `nemia doctor fix <need> [--factory f [--workflow w]] [--index n] [--answer k=v]… [--detach]`: a need's fix started, and followed.
 */
export const DOCTOR_FIX: Command<Fix> = {
  name: 'doctor fix',
  usage: '<need> [--factory <factory> [--workflow <workflow>]] [--index <n>] [--answer <name>=<value>]... [--detach]',
  help: [
    "start a need's fix on this server, as nemia doctor lists it: a place's",
    "or a harness's need by its name, a workflow's with its --factory and",
    "--workflow, a repository's with its --factory alone; --index picks",
    'among its fixes, --answer gives each answer it asks. Follows what it',
    'prints to its end, a code it shows set apart; --detach starts it and',
    'returns',
  ],
  spec: {
    positionals: [{ key: 'need', takes: 'required', kind: 'name' }],
    flags: [
      { flag: '--factory', kind: 'name', key: 'factory', takes: 'the factory whose workflow or repository declares the need' },
      { flag: '--workflow', kind: 'name', key: 'workflow', takes: 'the workflow that declares the need' },
      { flag: '--index', kind: 'text', key: 'index', takes: "which of the need's fixes, from 0" },
      { flag: '--answer', kind: 'text', key: 'answer', many: true, takes: '<name>=<value>, given again for another' },
      {
        flag: '--detach',
        kind: 'switch',
        way: true,
        sets: { follow: 'no' },
        only: { side: 'cli', why: 'the api answers the fix started, and serves its output apart' },
      },
    ],
    defaults: { follow: 'yes' },
    unknown: (arg) =>
      `nemia doctor fix does not take ${arg}: nemia doctor fix <need> [--factory <factory> [--workflow <workflow>]] [--index <n>] [--answer <name>=<value>]... [--detach].`,
    missing: 'nemia doctor fix takes the need to fix: nemia doctor fix <need>, as nemia doctor names it.',
  },
  writes: true,
  ticks: true,
  class: 'none',
  only: {
    side: 'cli',
    why: "the api answers POST /api/readiness/fixes by startFix with objects' FixStart, and serves the fix's output apart",
  },
  served: [{ endpoint: 'readiness.fix', request: async (input) => fixStartOf(input as Args) }],
  handler: (args) =>
    Effect.gen(function* () {
      const started = yield* startFix(yield* tried(() => fixStartOf(args)));
      return args.follow === 'yes' ? yield* followed(started) : started;
    }),
  print: (fix) => fixLines(fix),
};

/**
 * `nemia doctor carry`: each harness the store at its root holds activated, or the release this runs from or another installed release
 * carries in its own tree, installed at this release's pins (`carryHarnesses`), each said as it goes. Refused (`Invalid`, exit 2) where
 * an install fails, after trying the rest, naming `nemia doctor fix <harness>`. Run on this machine alone: `nemia upgrade` runs the new
 * release's before it switches to it.
 */
export const DOCTOR_CARRY: Command<CarryRan> = {
  name: 'doctor carry',
  usage: '',
  help: [
    "install, at this release's pins, each harness the store has activated",
    'or a release of it carries: what nemia upgrade runs of the new release',
    'before it switches',
  ],
  spec: { positionals: [], flags: [], unknown: (arg) => `nemia doctor carry takes nothing, not ${arg}: nemia doctor carry.` },
  writes: true,
  class: 'none',
  only: { side: 'cli', why: "it installs into this machine's tools folder, as the upgrade that runs it does" },
  handler: () =>
    Effect.gen(function* () {
      const home = yield* StoreRoot;
      const ran = carryHarnesses(home, process.env, runningRelease().root);
      if (ran.code !== 0) {
        const failed = ran.harnesses.filter((h) => h.kind === 'failed').map((h) => h.name);
        return yield* Effect.fail(
          new Invalid({
            message: `nemia doctor carry: ${failed.join(', ')} did not install: read what it printed above, then nemia doctor fix ${failed[0] ?? '<harness>'} runs its install again.`,
          }),
        );
      }
      return ran;
    }),
  print: (ran) => [ran.harnesses.length ? `carried ${ran.harnesses.map((h) => `${h.name} ${h.pin}`).join(', ')}` : 'no harness to carry'],
};

/** What `nemia readiness`, the read's former name, is refused with: the command it became. */
const RETIRED_WORDS = 'nemia readiness is retired: nemia doctor reads every piece, and nemia doctor fix <need> starts a fix.';

/**
 * `nemia readiness`, the read's former name, and anything typed after it (`nemia readiness fix <need>`): refused (`Invalid`, exit 2),
 * naming `nemia doctor`. Run at the command line alone, served on no endpoint.
 */
export const READINESS_RETIRED: Command = {
  name: 'readiness',
  usage: '',
  help: ['retired: nemia doctor reads what it read'],
  spec: { positionals: [], flags: [], unknown: () => RETIRED_WORDS },
  writes: false,
  class: 'read',
  only: { side: 'cli', why: 'retired: nemia doctor is the read, served on the port' },
  handler: () => Effect.fail(new Invalid({ message: RETIRED_WORDS })),
  print: () => [],
};

/** The needs' and the readiness read's commands, in the order `nemia`'s help lists them. */
export const NEEDS_COMMANDS: readonly Command[] = [DOCTOR, DOCTOR_FIX, DOCTOR_CARRY, READINESS_RETIRED] as readonly Command[];

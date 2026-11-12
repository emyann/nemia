/**
 * The commands of a machine's needs and its readiness, entries of the command table: `nemia readiness`, every piece the server needs
 * with the command or fix that puts it there (`readinessOf`), and `nemia readiness fix`, which starts a need's fix on the server
 * (`startFix`) and, at the command line, follows what it prints to its end (`followFix`), a code it declares shown on a line of its own.
 */
import { Effect, Stream } from 'effect';
import type { Fix, FixStart, Readiness } from 'objects';
import type { Args } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { tried } from '../runtime-client.ts';
import { Invalid } from '../refusal/refusal.ts';
import { followFix, startFix } from './fix.verb.ts';
import { readinessOf } from './readiness.verb.ts';

/** Each state's mark at the head of a piece's line. */
const MARK = { met: '✓', missing: '✗', unknown: '?' } as const;

/** The lines `nemia readiness` prints: whether the server is ready, then each piece, its state, its words, and each fix's command. */
export const readinessLines = (r: Readiness): string[] => [
  r.ready ? 'ready: every piece is in place' : 'not ready: a piece marked ✗ is missing, its fix below it',
  ...r.pieces.flatMap((p) => [
    `${MARK[p.state]} ${p.area}  ${p.name}${p.factory === undefined ? '' : `  (${p.factory}/${p.workflow ?? ''})`}: ${p.message}`,
    ...p.fixes.map((f) => `    ${f.command}  — ${f.message}`),
  ]),
];

/** `nemia readiness [--json]`: every piece of the server, in place or missing, each with what fixes it. */
export const READINESS: Command<Readiness> = {
  name: 'readiness',
  usage: '[--json]',
  help: [
    'every piece this server needs before a run: the harness sign-in, the',
    'service and its linger, the bind, the machine, the git identity, each',
    "factory's workflows' needs, a factory, a newer release — each in place",
    'or missing, with the command or fix that puts it there. --json: the',
    'whole read',
  ],
  spec: {
    positionals: [],
    flags: [{ flag: '--json', kind: 'switch', key: 'json', only: { side: 'cli', why: 'the api answers the whole read, as JSON' } }],
    unknown: (arg) => `nemia readiness does not take ${arg}: nemia readiness [--json].`,
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
          message: `--answer takes <name>=<value>, and was given ${pair}: nemia readiness fix <need> --answer email=me@example.com.`,
        });
      return [pair.slice(0, at), pair.slice(at + 1)];
    }),
  );
};

/** What `nemia readiness fix` was asked, as `startFix` takes it; refused (`Invalid`) where `--index` is no whole number from 0. */
export const fixStartOf = (args: Args): FixStart => {
  const index = args.index === undefined ? undefined : Number(args.index);
  if (index !== undefined && (!Number.isInteger(index) || index < 0))
    throw new Invalid({
      message: `--index takes a whole number from 0, and was given ${String(args.index)}: nemia readiness fix <need> --index 1.`,
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

/** What `nemia readiness fix` says of the fix once it is told: how it ended, or where it goes on. */
const fixLines = (fix: Fix): string[] => {
  if (fix.phase === 'succeeded') return [`fix ${fix.id} of ${fix.need} succeeded: nemia readiness reads the need again`];
  if (fix.phase === 'failed')
    return [
      `fix ${fix.id} of ${fix.need} failed${fix.exitCode === undefined ? '' : ` (exit ${fix.exitCode})`}: read what it printed above, then nemia readiness fix ${fix.need} again`,
    ];
  return [`fix ${fix.id} of ${fix.need} is ${fix.phase}: the daemon runs it, and the board shows what it prints as it runs`];
};

/** `nemia readiness fix <need> [--factory f --workflow w] [--index n] [--answer k=v]… [--detach]`: a need's fix started, and followed. */
export const READINESS_FIX: Command<Fix> = {
  name: 'readiness fix',
  usage: '<need> [--factory <factory> --workflow <workflow>] [--index <n>] [--answer <name>=<value>]... [--detach]',
  help: [
    "start a need's fix on this server, as nemia readiness lists it: a",
    "place's need by its name, a workflow's with its --factory and",
    '--workflow; --index picks among its fixes, --answer gives each answer',
    'it asks. Follows what it prints to its end, a code it shows set apart;',
    '--detach starts it and returns',
  ],
  spec: {
    positionals: [{ key: 'need', takes: 'required', kind: 'name' }],
    flags: [
      { flag: '--factory', kind: 'name', key: 'factory', takes: 'the factory whose workflow declares the need' },
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
      `nemia readiness fix does not take ${arg}: nemia readiness fix <need> [--factory <factory> --workflow <workflow>] [--index <n>] [--answer <name>=<value>]... [--detach].`,
    missing: 'nemia readiness fix takes the need to fix: nemia readiness fix <need>, as nemia readiness names it.',
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

/** The needs' and the readiness read's commands, in the order `nemia`'s help lists them. */
export const NEEDS_COMMANDS: readonly Command[] = [READINESS, READINESS_FIX] as readonly Command[];

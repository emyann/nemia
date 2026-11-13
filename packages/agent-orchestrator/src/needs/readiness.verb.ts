/**
 * The readiness read (`readinessOf`): every piece a person's server needs to run its factories, each in place, missing, not known or not
 * activated, with the command or the fix that puts it there and what it costs while missing (`cost`: a run waits on it, or it keeps the
 * server up or open) — each declared harness's two needs (installed, signed in), the service and its linger, the bind, the machine
 * (cgroup v2, the user's service manager, the tools folder, whether the sessions' memory fits it), the places' needs, every factory's
 * workflows' needs, the places' repository needs in each factory's repository, a factory at all, and a newer release — and whether a
 * run was ever started here (`ran`). Composed
 * from facts the package already holds; the machine's are read through `ReadinessFacts`, which a test hands its own. A controller: it
 * reads the store, this process's needs' readings (`NeedsMemory`), or the checks run now where it keeps none.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Effect, Exit } from 'effect';
import { DEFAULT_HARNESS, HARNESS_DECLARATIONS, memoryBytesOf } from 'agent-runtime/vocabulary';
import type { Need, NeedState, Readiness, ReadinessCost, ReadinessFix, ReadinessPiece, ReadinessState } from 'objects';
import { pathLedByTools, StoreRoot, toolsBinDir, toolsDir } from '../config/root.store.ts';
import { maxConcurrent, memoryLimit, memoryRequest, memoryReserved, type Env } from '../config/config.store.ts';
import { isRefusal } from '../refusal/refusal.ts';
import { listedAtOnce } from '../factory/door/factories.store.ts';
import type { Factory, FactoryListing } from '../factory/factory.ts';
import { workflowDirAt, workflowNeedsRead } from '../folder/folder.store.ts';
import { placesOf } from '../folder/lookup.store.ts';
import { factoryFills } from '../factory/rules/rules.store.ts';
import { stepsOf } from '../steps/steps.verb.ts';
import { WorkflowDoor } from '../workflows/workflows.store.ts';
import { carriedDirOf } from '../frozen/frozen.store.ts';
import { PlaceService } from '../place/place.store.ts';
import { tried } from '../runtime-client.ts';
import { archiveInstall, type Running } from '../release/index.ts';
import { toolsNeed, toolsNemia } from '../release/nemia-link.store.ts';
import { latestRelease, runningRelease } from '../release/version.verb.ts';
import { BIND_PUBLIC_VARIABLE, bindExposure, DEFAULT_NAME, kindOfBind, memoryFit, reservedFor, type MemoryFit } from '../service/index.ts';
import { claudeTokenStatus, tokenAgeWords, tokenWarningLine, TOKEN_MAKER, TOKEN_NAME, TOKEN_RENEWAL } from '../sign-in/sign-in.store.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { fixCommandOf, type FixAt } from './needs.ts';
import { harnessOfNeed, harnessVersionWord, signInNeedOf, versionIn } from './harness.ts';
import { trustCommandOf } from '../trust/trust.ts';
import {
  checkKey,
  factoryRepository,
  factoryWorkflows,
  harnessesHolding,
  heldOnNeeds,
  runHarnesses,
  harnessCheckOf,
  isRepositoryNeed,
  repositoryCheckOf,
  trustedOf,
  needsMemo,
  NeedsMemory,
  needsOnce,
  type FactoryWorkflow,
  type NeedsMemo,
} from './needs.verb.ts';

/** What a run of a command answered: its exit code (null where a signal ended it) and what it printed; undefined where it did not start. */
export type CommandRead = { readonly code: number | null; readonly out: string } | undefined;

/**
 * The machine's facts the read asks, each a seam a test hands its own: the environment the api listens under (`NEMIA_BIND`,
 * `NEMIA_BIND_PUBLIC`, PATH), the user, whether a file is there, a command run with its answer (a harness's version among them), the
 * release this process runs, and the machine's memory in bytes, undefined where it was not read. Whether a harness is installed and
 * signed in is the needs' memory's (`NeedsMemory`), never a fact here.
 */
export type ReadinessFacts = {
  readonly env: Env;
  readonly memoryBytes?: number | undefined;
  readonly user: string;
  readonly exists: (file: string) => boolean;
  readonly run: (command: string, args: readonly string[]) => CommandRead;
  readonly running: Running;
};

/** How long a command the read runs may take. */
const READ_MS = 5_000;

/** The machine's facts as this process reads them. */
export const liveFacts = (): ReadinessFacts => ({
  env: process.env,
  user: os.userInfo().username,
  exists: (file) => fs.existsSync(file),
  run: (command, args) => {
    const ran = spawnSync(command, [...args], { encoding: 'utf8', timeout: READ_MS });
    return ran.error !== undefined ? undefined : { code: ran.status, out: `${ran.stdout ?? ''}${ran.stderr ?? ''}` };
  },
  running: runningRelease(),
  memoryBytes: os.totalmem(),
});

/** A fix a person types: its words and its command. */
const typed = (message: string, command: string): ReadinessFix => ({ message, command, startable: false, kind: 'typed' });

/**
 * What a piece is, which each piece declares: its name, its area, and what it costs while it is missing (`ReadinessCost`), which
 * `missingSaid` tells a person apart.
 */
type Of = { readonly name: string; readonly area: ReadinessPiece['area']; readonly cost: ReadinessCost };

/** A piece of the read. */
const piece = (
  { name, area, cost }: Of,
  state: ReadinessState,
  message: string,
  fixes: readonly ReadinessFix[] = [],
  more: Partial<Pick<ReadinessPiece, 'factory' | 'workflow' | 'addressKind' | 'harness'>> = {},
): ReadinessPiece => ({ name, area, state, message, fixes, ...more, cost });

/** The service and its linger keep the server up: a run waits on neither while the daemon runs. */
const SERVICE: Of = { name: 'service', area: 'service', cost: 'server' };
const LINGER: Of = { name: 'linger', area: 'service', cost: 'server' };

/** The bind keeps the server open, to this machine or a network: no run waits on it. */
const BIND: Of = { name: 'bind', area: 'bind', cost: 'server' };

/** The tools folder holds what a fix installs, which a step's session finds there: a run waits on it. */
const TOOLS: Of = { name: 'tools', area: 'machine', cost: 'run' };

/** Whether the sessions' memory fits the machine keeps the server up: a run waits on none, and an admitted one may take the machine. */
const MEMORY_FIT: Of = { name: 'memory-fit', area: 'machine', cost: 'server' };

/** A factory: a run starts in one. */
const FACTORY: Of = { name: 'factory', area: 'factory', cost: 'run' };

/** A newer release keeps the server current: no run waits on it. */
const RELEASE: Of = { name: 'release', area: 'release', cost: 'server' };

/** The service: its unit running under the user's service manager, and the user's linger, which keeps it running once they log out. */
function servicePieces(facts: ReadinessFacts): ReadinessPiece[] {
  const unit = `${DEFAULT_NAME}.service`;
  const active = facts.run('systemctl', ['--user', 'is-active', unit]);
  const service =
    active === undefined
      ? piece(SERVICE, 'unknown', `whether ${unit} runs could not be read: systemctl is not here`)
      : active.out.trim() === 'active'
        ? piece(SERVICE, 'met', `${unit} runs`)
        : piece(SERVICE, 'missing', `${unit} does not run (${active.out.trim() || `exit ${active.code}`})`, [
            typed('install the service and start it', 'nemia service install'),
          ]);
  const shown = facts.run('loginctl', ['show-user', facts.user, '-p', 'Linger']);
  const said = shown?.out.trim();
  const linger =
    shown === undefined || shown.code !== 0 || !said?.startsWith('Linger=')
      ? piece(LINGER, 'unknown', `whether ${facts.user}'s services outlive their sessions could not be read`)
      : said === 'Linger=yes'
        ? piece(LINGER, 'met', `${facts.user}'s services run while nobody is logged in`)
        : piece(LINGER, 'missing', `${facts.user}'s services stop when they log out`, [
            typed('keep them running, once, as an administrator', `sudo loginctl enable-linger ${facts.user}`),
          ]);
  return [service, linger];
}

/** The bind: the kind of the address the api listens on (`kindOfBind`), and whether a public or wildcard one was acknowledged. */
function bindPiece(facts: ReadinessFacts): ReadinessPiece {
  const bind = facts.env.NEMIA_BIND?.trim() || '127.0.0.1';
  const kind = kindOfBind(bind);
  const acknowledged = facts.env[BIND_PUBLIC_VARIABLE] === '1';
  if (bindExposure(kind, acknowledged) === 'unacknowledged')
    return piece(
      BIND,
      'missing',
      `the api listens on ${bind}, a ${kind} address, which no one acknowledged`,
      [
        typed('bind a private address of this machine instead', 'nemia service addresses'),
        typed(`acknowledge it (${BIND_PUBLIC_VARIABLE}=1)`, `nemia service install --bind ${bind} --public`),
      ],
      { addressKind: kind },
    );
  const reach = kind === 'loopback' ? 'this machine alone reaches it' : `it is reached on its ${kind} network`;
  return piece(BIND, 'met', `the api listens on ${bind}: ${reach}`, [], { addressKind: kind });
}

/**
 * The machine: cgroup v2, the user's service manager reached, and the tools folder made and first on the daemon's PATH. A run waits on
 * the first two only where the daemon files its sessions under a memory limit (`WF_MEMORY_LIMIT`), which needs both; else they keep the
 * service alone.
 */
function machinePieces(home: string, facts: ReadinessFacts): ReadinessPiece[] {
  const limited = (facts.env.WF_MEMORY_LIMIT ?? '') !== '';
  const kernel: Of = { name: 'cgroup-v2', area: 'machine', cost: limited ? 'run' : 'server' };
  const manager: Of = { name: 'systemd-user', area: 'machine', cost: limited ? 'run' : 'server' };
  const cgroup = facts.exists('/sys/fs/cgroup/cgroup.controllers')
    ? piece(kernel, 'met', 'the kernel holds cgroup v2: a session runs under its memory limit')
    : piece(
        kernel,
        'missing',
        'the kernel holds no cgroup v2, so no session can be held to a memory limit: boot with systemd.unified_cgroup_hierarchy=1, or leave WF_MEMORY_LIMIT unset',
      );
  const answered = facts.run('systemctl', ['--user', 'show-environment']);
  const user =
    answered === undefined
      ? piece(manager, 'unknown', "whether the user's service manager runs could not be read: systemctl is not here")
      : answered.code === 0
        ? piece(manager, 'met', "the user's service manager (systemd --user) answers")
        : piece(manager, 'missing', "the user's service manager (systemd --user) does not answer", [
            typed('log in as the user once, so their manager starts, and keep it with linger', `sudo loginctl enable-linger ${facts.user}`),
          ]);
  return [cgroup, user, toolsPiece(home, facts), memoryFitPiece(facts)];
}

/** `bytes` in whole MiB, as a person reads them. */
const mib = (bytes: number): string => `${Math.floor(bytes / 2 ** 20)} MiB`;

/** `bytes` as a quantity a setting takes, in whole Mi. */
const mi = (bytes: number): string => `${Math.floor(bytes / 2 ** 20)}Mi`;

/** `n` sessions, said. */
const sessions = (n: number): string => `${n} session${n === 1 ? '' : 's'}`;

/** The memory settings the daemon runs under, as its readers answer them: each quantity as written, and the sessions at once. */
type MemorySet = {
  readonly limit: string | undefined;
  readonly request: string | undefined;
  readonly reserved: string | undefined;
  readonly at: number;
};

/** `env`'s memory settings, or the words of the refusal the daemon would answer one of them with. */
function memorySetOf(env: Env): MemorySet | { readonly refused: string } {
  try {
    return { limit: memoryLimit(env), request: memoryRequest(env), reserved: memoryReserved(env), at: maxConcurrent(env) };
  } catch (refused) {
    if (!isRefusal(refused)) throw refused;
    return { refused: refused.message };
  }
}

/** The fix every memory-fit piece offers: the settings sized to this machine. */
const SIZED = typed('size the sessions to this machine', 'nemia service install --size auto');

/** What `fit` says of `set` on a machine read as `floor`, as the memory-fit piece. */
function fitPiece(fit: MemoryFit, set: MemorySet, floor: string): ReadinessPiece {
  switch (fit.verdict) {
    case 'fits':
      return piece(MEMORY_FIT, 'met', `${sessions(set.at)} at once fit ${floor}`);
    case 'uncounted':
      return piece(
        MEMORY_FIT,
        'unknown',
        `no session's memory is counted against this machine's, with neither WF_MEMORY_LIMIT nor WF_MEMORY_REQUEST set: set WF_MEMORY_REQUEST (each session's ask) and WF_MEMORY_LIMIT, or size them with nemia service install --size auto`,
        [SIZED],
      );
    case 'over': {
      const asked = set.request === undefined ? 'its limit, WF_MEMORY_LIMIT, with no WF_MEMORY_REQUEST set' : 'WF_MEMORY_REQUEST';
      const change =
        fit.sessionsFit >= 1
          ? `Set WF_MAX_CONCURRENT=${fit.sessionsFit}, or WF_MEMORY_REQUEST=${mi(Math.floor(fit.allocatableBytes / set.at))} or under for ${sessions(set.at)}`
          : `Set WF_MEMORY_REQUEST=${mi(fit.allocatableBytes)} or under`;
      return piece(
        MEMORY_FIT,
        'missing',
        `${sessions(set.at)} at once (WF_MAX_CONCURRENT=${set.at}), each asking ${mib(fit.perSessionBytes)} (${asked}), are more than the ${mib(fit.allocatableBytes)} of ${floor}: ${sessions(fit.sessionsFit)} ${fit.sessionsFit === 1 ? 'fits' : 'fit'}. ${change}, or size them with nemia service install --size auto`,
        [SIZED],
      );
    }
    case 'limitOver':
      return piece(
        MEMORY_FIT,
        'missing',
        `one session may grow to WF_MEMORY_LIMIT=${set.limit ?? ''}, more than the ${mib(fit.allocatableBytes)} of ${floor}: set WF_MEMORY_LIMIT=${mi(fit.allocatableBytes)} or under, or size it with nemia service install --size auto`,
        [SIZED],
      );
  }
}

/** A quantity a reader answered, in bytes, or null where unset. */
const bytesOrNull = (quantity: string | undefined): number | null => (quantity === undefined ? null : (memoryBytesOf(quantity) ?? null));

/**
 * Whether the settings the daemon runs under fit this machine (`memoryFit`): the sessions at once (`WF_MAX_CONCURRENT`), each counted
 * at its default request (`WF_MEMORY_REQUEST`), else its default limit (`WF_MEMORY_LIMIT`), against the machine's memory less the floor
 * kept (`WF_MEMORY_RESERVED`, else an eighth of it, 1 GiB at least: `reservedFor`), and one session's limit against the same. Missing,
 * naming how many fit and the setting to change, where they do not, or where a setting is one the daemon refuses, in its words; not
 * known where nothing is counted or the memory was not read.
 */
function memoryFitPiece(facts: ReadinessFacts): ReadinessPiece {
  const totalBytes = facts.memoryBytes;
  if (totalBytes === undefined || !Number.isInteger(totalBytes) || totalBytes < 1)
    return piece(MEMORY_FIT, 'unknown', "this machine's memory could not be read, so whether its sessions fit it is not known");
  const set = memorySetOf(facts.env);
  if ('refused' in set) return piece(MEMORY_FIT, 'missing', set.refused);
  const reservedBytes = bytesOrNull(set.reserved) ?? reservedFor(Math.floor(totalBytes / 2 ** 20)) * 2 ** 20;
  if (reservedBytes > totalBytes)
    return piece(
      MEMORY_FIT,
      'missing',
      `${set.reserved === undefined ? 'the floor kept, 1 GiB at least,' : `WF_MEMORY_RESERVED=${set.reserved}`} is more than this machine's ${mib(totalBytes)}, so no session is admitted: set WF_MEMORY_RESERVED under it`,
    );
  const fit = memoryFit({
    totalBytes,
    reservedBytes,
    maxConcurrent: set.at,
    limitBytes: bytesOrNull(set.limit),
    requestBytes: bytesOrNull(set.request),
  });
  return fitPiece(
    fit,
    set,
    `this machine's ${mib(totalBytes)} less the ${mib(reservedBytes)} kept for the daemon and the machine (WF_MEMORY_RESERVED)`,
  );
}

/**
 * The tools folder: made and first on the daemon's PATH, and, where this process runs a release unpacked from an archive, holding its
 * `nemia` (`toolsNemia`, followed through its link), so a step's session runs the `nemia` its settings allow. Each part missing offers
 * its own fix: the daemon's restart, which makes the folder and puts it first, and `nemia doctor fix tools` (`toolsNeed`), which links
 * `nemia`. A checkout's process reads no link, since its person has their own `nemia`.
 */
function toolsPiece(home: string, facts: ReadinessFacts): ReadinessPiece {
  const bin = toolsBinDir(home);
  const made = facts.exists(bin);
  const onPath = (facts.env.PATH ?? '').split(path.delimiter).includes(bin);
  const linked = !archiveInstall(facts.running) || facts.exists(toolsNemia(home));
  if (made && onPath && linked)
    return piece(
      TOOLS,
      'met',
      `the tools folder ${bin} is first on the daemon's PATH${archiveInstall(facts.running) ? ', and holds nemia' : ''}`,
    );
  const placed = made && onPath;
  const said = [
    ...(placed ? [] : [`the tools folder ${bin} is ${made ? 'not on this process’s PATH' : 'not made yet'}`]),
    ...(linked ? [] : [`${toolsNemia(home)} is not there, so no step's session runs nemia`]),
  ].join('; ');
  return piece(TOOLS, 'missing', said, [
    ...(placed ? [] : [typed('start the daemon again, which makes it and puts it first', 'nemia service restart')]),
    ...(linked ? [] : needFixes(toolsNeed(home), 'missing')),
  ]);
}

/**
 * A need's fixes as the read offers them, by the piece's `state`: a piece in place offers only what takes it away (`removes`), any other
 * all but that. One the server runs (`puts`, `removes`) is started by `nemia doctor fix` with its index, its asks and its code; one a
 * person types (`typed`) is offered as its own command, which no server starts.
 */
const needFixes = (need: Need, state: NeedState, at?: FixAt, fixes = need.fixes ?? []): ReadinessFix[] =>
  fixes.flatMap((fix, index): ReadinessFix[] => {
    if ((fix.kind === 'removes') !== (state === 'met')) return [];
    if (fix.kind === 'typed') return [typed(fix.message, fix.command)];
    return [
      {
        message: fix.message,
        command: `${fixCommandOf(need.name, at)}${index ? ` --index ${index}` : ''}${(fix.asks ?? []).map((a) => ` --answer ${a.name}=<${a.name}>`).join('')}`,
        startable: true,
        index,
        ...(fix.asks?.length ? { asks: fix.asks } : {}),
        ...(fix.code === undefined ? {} : { code: fix.code }),
        ...(fix.kind === 'removes' ? { kind: 'removes' as const } : {}),
      },
    ];
  });

/** A need's piece, its state off `memo` under `key`: `unknown` where no reading is kept. */
const needPiece = (
  need: Need,
  area: ReadinessPiece['area'],
  read: NeedState | undefined,
  at?: FixAt,
  fixes?: Need['fixes'],
  more: Partial<Pick<ReadinessPiece, 'harness'>> = {},
  message: string = need.message,
): ReadinessPiece => {
  const state = read ?? 'unknown';
  return piece({ name: need.name, area, cost: 'run' }, state, message, needFixes(need, state, at, fixes), { ...at, ...more });
};

/**
 * What the version command of the harness `name` answered, in the store `home`, with the tools folder first on its PATH: the first
 * `x.y.z` it printed, none where it did not start or printed none.
 */
const versionFound = (home: string, facts: ReadinessFacts, command: string): string | undefined => {
  const ran = facts.run('env', [`PATH=${pathLedByTools(home, facts.env.PATH)}`, `NEMIA_TOOLS=${toolsDir(home)}`, 'sh', '-c', command]);
  return ran === undefined || ran.code !== 0 ? undefined : versionIn(ran.out);
};

/** What the read says of the version found against the pin, by `harnessVersionWord`. */
const VERSION_WORDS = {
  tested: (found: string) => `${found}, the version this release was tested with`,
  untested: (found: string, pin: string) => `${found}, untested: this release was tested with ${pin}, and it still runs`,
  unread: () => 'its version could not be read',
} as const;

/**
 * The harnesses a run would be held on (`harnessesHolding`, `runHarnesses`, by which `runNeeds` holds runs), each read as a run reads its
 * steps, so the read and the holding cannot drift: each factory's workflow as a start in it would load it — through the Workflow door,
 * its agents found along the places a run of it looks (`lookupRoots`: its tree, which a template's overlays render into, the factory's
 * repository, then the store's own), its steps filled by the factory's hires (`factoryFills`) — and each run's frozen steps while its needs
 * may hold it, a run of a folder that is no factory's among them. A folder that does not load names none: a start of it is refused, and
 * says why.
 */
const harnessesNamed = Effect.fnUntraced(function* (home: string, factories: readonly FactoryListing[]) {
  const named = new Set<string>();
  for (const f of factories) {
    if ('error' in f) continue;
    for (const w of factoryWorkflows([f])) for (const h of yield* workflowHarnesses(home, f, w)) named.add(h);
  }
  for (const run of yield* (yield* RunDoor).runs.list()) {
    if (!heldOnNeeds(run)) continue;
    const steps = yield* stepsOf(run).pipe(Effect.orElseSucceed(() => []));
    for (const h of harnessesHolding(run, steps)) named.add(h);
  }
  return named;
});

/**
 * The harnesses the steps of the workflow `w` of the factory `f` run sessions on (`runHarnesses`), its folder loaded as a start in `f`
 * loads it: its agents looked for in the factory's repository, its tree where it names none, and in the store `home`, its steps filled by
 * the factory's hires. None where it does not load.
 */
const workflowHarnesses = Effect.fnUntraced(function* (home: string, f: Factory, w: FactoryWorkflow) {
  const door = (yield* WorkflowDoor).workflows;
  const loaded = yield* Effect.exit(
    Effect.flatMap(
      tried(() => ({ dir: workflowDirAt(w.dir), fills: factoryFills(home, f, w.workflow).fills })),
      ({ dir, fills }) => door.read(dir, placesOf(home, f.repos[0] ?? f.tree), fills),
    ),
  );
  return Exit.isSuccess(loaded) ? runHarnesses(loaded.value) : [];
});

/**
 * The harnesses the read counts: the default, each a run would be held on (`harnessesNamed`), and each whose install is in place, which a
 * person activated. Any other is `inactive`.
 */
const harnessesWanted = (memo: NeedsMemo, named: ReadonlySet<string>): Set<string> => {
  const installed = memo.harnessNeeds.flatMap((need) => {
    const of = harnessOfNeed(need.name, HARNESS_DECLARATIONS);
    return of?.part === 'install' && memo.readings.get(checkKey(harnessCheckOf(need))) === 'met' ? [of.name] : [];
  });
  return new Set([DEFAULT_HARNESS, ...named, ...installed]);
};

/**
 * The piece of a harness nobody activated and nothing runs on (`harnessesWanted`), `inactive`: its install with the fix a missing one
 * offers, and its sign-in with none, since no sign-in runs before the install.
 */
const inactivePiece = (need: Need, of: NonNullable<ReturnType<typeof harnessOfNeed>>): ReadinessPiece => {
  const harness = { harness: { name: of.name, part: of.part } };
  if (of.part === 'install')
    return piece(
      { name: need.name, area: 'harness', cost: 'run' },
      'inactive',
      `${of.needs.title} (${of.needs.program}) is not activated, and no factory's workflow runs on it: activate it when one does`,
      needFixes(need, 'missing'),
      harness,
    );
  return piece(
    { name: need.name, area: 'harness', cost: 'run' },
    'inactive',
    `${of.needs.title} is not activated, so its sign-in is not asked`,
    [],
    harness,
  );
};

/**
 * Each harness the runtime declares needs for, as its two pieces off `memo` (`harnessNeeds`), area `harness`, each naming its harness and
 * which of its needs it is (`harness`): the install, its message saying the version found against the pin where it is in place
 * (`harnessVersionWord`); and the sign-in. The default harness's sign-in is missing, whatever its check says, while the token the store
 * keeps is readable by others, since such a file does not load: its fix is the `chmod 600` that lets only the person read it. A kept
 * token that loads says its age, off its file's write time, and near or past its year its warning (`tokenWarningLine`), with the commands
 * that make a new one: still met, since it loads. A harness not `wanted` (`harnessesWanted`) is `inactive`, both its pieces: its install
 * with the fix a missing one offers, so it is activated from the read as any other is, and its sign-in with none, since no sign-in runs
 * before the install; once installed it is wanted, and the read after the install offers them.
 */
function harnessPieces(home: string, memo: NeedsMemo, facts: ReadinessFacts, wanted: ReadonlySet<string>): ReadinessPiece[] {
  return memo.harnessNeeds.flatMap((need) => {
    const of = harnessOfNeed(need.name, HARNESS_DECLARATIONS);
    if (of === undefined) return [];
    const harness = { harness: { name: of.name, part: of.part } };
    if (!wanted.has(of.name)) return [inactivePiece(need, of)];
    const read = memo.readings.get(checkKey(harnessCheckOf(need)));
    if (of.part === 'install') {
      if (read !== 'met') return [needPiece(need, 'harness', read, undefined, undefined, harness)];
      const found = versionFound(home, facts, of.needs.version);
      const word = harnessVersionWord(found, of.needs.pin);
      const said = word === 'unread' ? VERSION_WORDS.unread() : VERSION_WORDS[word](found ?? '', of.needs.pin);
      return [
        needPiece(need, 'harness', read, undefined, undefined, harness, `${of.needs.title} (${of.needs.program}) is installed: ${said}`),
      ];
    }
    if (need.name !== signInNeedOf(DEFAULT_HARNESS)) return [needPiece(need, 'harness', read, undefined, undefined, harness)];
    const status = claudeTokenStatus(home);
    if (status.state === 'set' && status.mode !== '0600')
      return [
        piece(
          { name: need.name, area: 'harness', cost: 'run' },
          'missing',
          `the token file ${status.file} is readable by others (${status.mode}), so it does not load`,
          [typed('let only you read it', `chmod 600 ${status.file}`)],
          harness,
        ),
      ];
    const later = 'whether it is still good shows only when a session or the quota is refused';
    if (read !== 'met' || status.state !== 'set') return [needPiece(need, 'harness', read, undefined, undefined, harness)];
    const warning = tokenWarningLine(status);
    if (warning !== undefined)
      return [
        piece(
          { name: need.name, area: 'harness', cost: 'run' },
          'met',
          warning,
          [typed(`make a new one: ${TOKEN_RENEWAL}`, `${TOKEN_MAKER} && nemia ${TOKEN_NAME} set && nemia service restart`)],
          harness,
        ),
      ];
    const age = tokenAgeWords(status) ?? 'its age unread';
    return [
      needPiece(
        need,
        'harness',
        read,
        undefined,
        undefined,
        harness,
        `${need.message}: a token is kept and loads (${status.file}, ${age}), and ${later}`,
      ),
    ];
  });
}

/**
 * The places' needs, then each factory's workflows' own: a need that fills a place's is said under its workflow as the place's need, its
 * fixes first, the place's after, as `startFix` finds them; a workflow whose needs do not read says why, and a need of a factory whose
 * places are not trusted (`untrusted`) is `unknown`, its check never run, with the command that trusts them.
 */
function needPieces(memo: NeedsMemo, workflows: readonly FactoryWorkflow[], untrusted: ReadonlySet<string>): ReadinessPiece[] {
  const place = memo.placeNeeds.filter((need) => !isRepositoryNeed(need));
  const out: ReadinessPiece[] = place.map((need) => needPiece(need, 'place', memo.readings.get(checkKey({ check: need.check }))));
  for (const w of workflows) {
    const read = workflowNeedsRead(w.dir);
    const at = { factory: w.factory, workflow: w.workflow };
    if (read.error !== undefined)
      out.push(piece({ name: `${w.workflow}-needs`, area: 'workflow', cost: 'run' }, 'unknown', read.error, [], at));
    for (const need of read.needs) {
      const filled = place.find((p) => p.name === need.fills);
      if (filled !== undefined) {
        const state = memo.readings.get(checkKey({ check: filled.check }));
        out.push(needPiece(filled, 'workflow', state, at, [...(need.fixes ?? []), ...(filled.fixes ?? [])]));
        continue;
      }
      if (untrusted.has(w.factory)) {
        out.push(
          piece(
            { name: need.name, area: 'workflow', cost: 'run' },
            'unknown',
            `${need.message}: not checked, since the factory ${w.factory}'s places are not trusted`,
            [typed('trust its places, then its check runs', trustCommandOf(w.factory))],
            at,
          ),
        );
        continue;
      }
      const key = checkKey({ check: need.check, workflowFiles: w.dir, carriedFiles: carriedDirOf(w.dir) });
      out.push(needPiece(need, 'workflow', memo.readings.get(key), at));
    }
  }
  return out;
}

/**
 * The places' repository needs (`scope: repository`), one piece each per factory, area `repository`, read in the factory's repository
 * (`factoryRepository`) and fixed there by `nemia doctor fix <need> --factory <factory>`; a factory whose places are not trusted
 * (`untrusted`) has each `unknown`, its check never run, with the command that trusts them, and one that does not read has none.
 */
function repositoryPieces(memo: NeedsMemo, factories: readonly FactoryListing[], untrusted: ReadonlySet<string>): ReadinessPiece[] {
  const needs = memo.placeNeeds.filter(isRepositoryNeed);
  return factories.flatMap((f) => {
    const repository = factoryRepository(f);
    if (repository === undefined) return [];
    const at = { factory: f.name };
    return needs.map((need) =>
      untrusted.has(f.name)
        ? piece(
            { name: need.name, area: 'repository', cost: 'run' },
            'unknown',
            `${need.message}: not checked, since the factory ${f.name}'s places are not trusted`,
            [typed('trust its places, then its check runs', trustCommandOf(f.name))],
            at,
          )
        : needPiece(need, 'repository', memo.readings.get(checkKey(repositoryCheckOf(need, repository))), at),
    );
  });
}

/** A factory filed at all: none yet names the command that files one. */
function factoryPiece(factories: readonly FactoryListing[]): ReadinessPiece {
  if (!factories.length)
    return piece(FACTORY, 'missing', 'no factory is filed: a run starts in one', [
      typed('file one from a template, on a repository', 'nemia factory add <name> --template <template> --repo <url>'),
    ]);
  return piece(
    FACTORY,
    'met',
    `${factories.length} factor${factories.length === 1 ? 'y is' : 'ies are'} filed: ${factories.map((f) => f.name).join(', ')}`,
  );
}

/** A newer release, as the release check last read it (`latestRelease`): met either way, with `nemia upgrade` where one is out. */
function releasePiece(home: string, facts: ReadinessFacts): ReadinessPiece {
  const latest = latestRelease(home, facts.running);
  if (latest === undefined)
    return piece(
      RELEASE,
      'unknown',
      facts.running.kind === 'checkout'
        ? 'a checkout runs here: no release is checked for'
        : 'no release check has read the newest release yet',
    );
  return latest.newer
    ? piece(RELEASE, 'met', `${latest.version} is out, newer than this release`, [typed('take it', 'nemia upgrade')])
    : piece(RELEASE, 'met', `this is the newest release (${latest.version})`);
}

/**
 * Every piece of the store's server, in the read's order (`Readiness`), `ready` where none is missing, and whether a run was ever
 * started here (`ran`). The needs are read off this process's memory (`NeedsMemory`) where it keeps one that has swept, else every
 * check is run now on a memory of the read's own, the place's and the harnesses' needs among them; a check with no reading is
 * `unknown`.
 */
export const readinessOf = Effect.fn('readinessOf')(function* (facts: ReadinessFacts = liveFacts()) {
  const home = yield* StoreRoot;
  const place = yield* PlaceService;
  const kept = yield* NeedsMemory;
  const memo = kept ?? needsMemo(home);
  if (!memo.placeNeeds.length) memo.placeNeeds = place.declared.needs ?? [];
  if (kept === undefined || (memo.version === 0 && memo.readings.size === 0)) yield* needsOnce(memo);
  const factories = yield* tried(() => listedAtOnce(home));
  const workflows = factoryWorkflows(factories);
  const trusted = new Set((yield* trustedOf(factories)).map((f) => f.name));
  const untrusted = new Set(factories.map((f) => f.name).filter((name) => !trusted.has(name)));
  const pieces: ReadinessPiece[] = [
    ...harnessPieces(home, memo, facts, harnessesWanted(memo, yield* harnessesNamed(home, factories))),
    ...servicePieces(facts),
    bindPiece(facts),
    ...machinePieces(home, facts),
    ...needPieces(memo, workflows, untrusted),
    ...repositoryPieces(memo, factories, untrusted),
    factoryPiece(factories),
    releasePiece(home, facts),
  ];
  const ran = (yield* (yield* RunDoor).runs.ids()).length > 0;
  return { ready: pieces.every((p) => p.state !== 'missing'), pieces, ran } satisfies Readiness;
});

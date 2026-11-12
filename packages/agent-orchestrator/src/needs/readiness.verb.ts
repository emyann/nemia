/**
 * The readiness read (`readinessOf`): every piece a person's server needs before a factory's first run, each in place, missing or not
 * known, with the command or the fix that puts it there — each declared harness's two needs (installed, signed in), the service and its
 * linger, the bind, the machine (cgroup v2, the user's service manager, the tools folder), the places' needs, every factory's workflows'
 * needs, the places' repository needs in each factory's repository, a factory at all, and a newer release. Composed from facts the
 * package already holds; the machine's are read through `ReadinessFacts`, which a test hands its own. A controller: it reads the store,
 * this process's needs' readings (`NeedsMemory`), or the checks run now where it keeps none.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Effect } from 'effect';
import { DEFAULT_HARNESS, HARNESS_DECLARATIONS } from 'agent-runtime/vocabulary';
import type { Need, NeedState, Readiness, ReadinessFix, ReadinessPiece } from 'objects';
import { pathLedByTools, StoreRoot, toolsBinDir, toolsDir } from '../config/root.store.ts';
import type { Env } from '../config/config.store.ts';
import { listedAtOnce } from '../factory/door/factories.store.ts';
import type { FactoryListing } from '../factory/factory.ts';
import { workflowNeedsRead } from '../folder/folder.store.ts';
import { carriedDirOf } from '../frozen/frozen.store.ts';
import { PlaceService } from '../place/place.store.ts';
import { tried } from '../runtime-client.ts';
import type { Running } from '../release/index.ts';
import { latestRelease, runningRelease } from '../release/version.verb.ts';
import { BIND_PUBLIC_VARIABLE, bindExposure, DEFAULT_NAME, kindOfBind } from '../service/index.ts';
import { claudeTokenStatus } from '../sign-in/sign-in.store.ts';
import { fixCommandOf, type FixAt } from './needs.ts';
import { harnessOfNeed, harnessVersionWord, signInNeedOf, versionIn } from './harness.ts';
import { trustCommandOf } from '../trust/trust.ts';
import {
  checkKey,
  factoryRepository,
  factoryWorkflows,
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
 * `NEMIA_BIND_PUBLIC`, PATH), the user, whether a file is there, a command run with its answer (a harness's version among them), and the
 * release this process runs. Whether a harness is installed and signed in is the needs' memory's (`NeedsMemory`), never a fact here.
 */
export type ReadinessFacts = {
  readonly env: Env;
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
});

/** A fix a person types: its words and its command. */
const typed = (message: string, command: string): ReadinessFix => ({ message, command, startable: false, kind: 'typed' });

/** A piece of the read. */
const piece = (
  name: string,
  area: ReadinessPiece['area'],
  state: NeedState,
  message: string,
  fixes: readonly ReadinessFix[] = [],
  more: Partial<Pick<ReadinessPiece, 'factory' | 'workflow' | 'addressKind' | 'harness'>> = {},
): ReadinessPiece => ({ name, area, state, message, fixes, ...more });

/** The service: its unit running under the user's service manager, and the user's linger, which keeps it running once they log out. */
function servicePieces(facts: ReadinessFacts): ReadinessPiece[] {
  const unit = `${DEFAULT_NAME}.service`;
  const active = facts.run('systemctl', ['--user', 'is-active', unit]);
  const service =
    active === undefined
      ? piece('service', 'service', 'unknown', `whether ${unit} runs could not be read: systemctl is not here`)
      : active.out.trim() === 'active'
        ? piece('service', 'service', 'met', `${unit} runs`)
        : piece('service', 'service', 'missing', `${unit} does not run (${active.out.trim() || `exit ${active.code}`})`, [
            typed('install the service and start it', 'nemia service install'),
          ]);
  const shown = facts.run('loginctl', ['show-user', facts.user, '-p', 'Linger']);
  const said = shown?.out.trim();
  const linger =
    shown === undefined || shown.code !== 0 || !said?.startsWith('Linger=')
      ? piece('linger', 'service', 'unknown', `whether ${facts.user}'s services outlive their sessions could not be read`)
      : said === 'Linger=yes'
        ? piece('linger', 'service', 'met', `${facts.user}'s services run while nobody is logged in`)
        : piece('linger', 'service', 'missing', `${facts.user}'s services stop when they log out`, [
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
      'bind',
      'bind',
      'missing',
      `the api listens on ${bind}, a ${kind} address, which no one acknowledged`,
      [
        typed('bind a private address of this machine instead', 'nemia service addresses'),
        typed(`acknowledge it (${BIND_PUBLIC_VARIABLE}=1)`, `nemia service install --bind ${bind} --public`),
      ],
      { addressKind: kind },
    );
  const reach = kind === 'loopback' ? 'this machine alone reaches it' : `it is reached on its ${kind} network`;
  return piece('bind', 'bind', 'met', `the api listens on ${bind}: ${reach}`, [], { addressKind: kind });
}

/** The machine: cgroup v2, the user's service manager reached, and the tools folder made and first on the daemon's PATH. */
function machinePieces(home: string, facts: ReadinessFacts): ReadinessPiece[] {
  const cgroup = facts.exists('/sys/fs/cgroup/cgroup.controllers')
    ? piece('cgroup-v2', 'machine', 'met', 'the kernel holds cgroup v2: a session runs under its memory limit')
    : piece(
        'cgroup-v2',
        'machine',
        'missing',
        'the kernel holds no cgroup v2, so no session can be held to a memory limit: boot with systemd.unified_cgroup_hierarchy=1, or leave WF_MEMORY_LIMIT unset',
      );
  const manager = facts.run('systemctl', ['--user', 'show-environment']);
  const user =
    manager === undefined
      ? piece('systemd-user', 'machine', 'unknown', "whether the user's service manager runs could not be read: systemctl is not here")
      : manager.code === 0
        ? piece('systemd-user', 'machine', 'met', "the user's service manager (systemd --user) answers")
        : piece('systemd-user', 'machine', 'missing', "the user's service manager (systemd --user) does not answer", [
            typed('log in as the user once, so their manager starts, and keep it with linger', `sudo loginctl enable-linger ${facts.user}`),
          ]);
  const bin = toolsBinDir(home);
  const onPath = (facts.env.PATH ?? '').split(path.delimiter).includes(bin);
  const tools =
    facts.exists(bin) && onPath
      ? piece('tools', 'machine', 'met', `the tools folder ${bin} is first on the daemon's PATH`)
      : piece(
          'tools',
          'machine',
          'missing',
          `the tools folder ${bin} is ${facts.exists(bin) ? 'not on this process’s PATH' : 'not made yet'}`,
          [typed('start the daemon again, which makes it and puts it first', 'nemia service restart')],
        );
  return [cgroup, user, tools];
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
  return piece(need.name, area, state, message, needFixes(need, state, at, fixes), { ...at, ...more });
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
 * Each harness the runtime declares needs for, as its two pieces off `memo` (`harnessNeeds`), area `harness`, each naming its harness and
 * which of its needs it is (`harness`): the install, its message saying the version found against the pin where it is in place
 * (`harnessVersionWord`); and the sign-in. The default harness's sign-in is missing, whatever its check says, while the token the store
 * keeps is readable by others, since such a file does not load: its fix is the `chmod 600` that lets only the person read it.
 */
function harnessPieces(home: string, memo: NeedsMemo, facts: ReadinessFacts): ReadinessPiece[] {
  return memo.harnessNeeds.flatMap((need) => {
    const of = harnessOfNeed(need.name, HARNESS_DECLARATIONS);
    if (of === undefined) return [];
    const harness = { harness: { name: of.name, part: of.part } };
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
          need.name,
          'harness',
          'missing',
          `the token file ${status.file} is readable by others (${status.mode}), so it does not load`,
          [typed('let only you read it', `chmod 600 ${status.file}`)],
          harness,
        ),
      ];
    const later = 'whether it is still good shows only when a session or the quota is refused';
    const message =
      read === 'met' && status.state === 'set' ? `${need.message}: a token is kept and loads (${status.file}), and ${later}` : need.message;
    return [needPiece(need, 'harness', read, undefined, undefined, harness, message)];
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
    if (read.error !== undefined) out.push(piece(`${w.workflow}-needs`, 'workflow', 'unknown', read.error, [], at));
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
            need.name,
            'workflow',
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
            need.name,
            'repository',
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
    return piece('factory', 'factory', 'missing', 'no factory is filed: a run starts in one', [
      typed('file one from a template, on a repository', 'nemia factory add <name> --template <template> --repo <url>'),
    ]);
  return piece(
    'factory',
    'factory',
    'met',
    `${factories.length} factor${factories.length === 1 ? 'y is' : 'ies are'} filed: ${factories.map((f) => f.name).join(', ')}`,
  );
}

/** A newer release, as the release check last read it (`latestRelease`): met either way, with `nemia upgrade` where one is out. */
function releasePiece(home: string, facts: ReadinessFacts): ReadinessPiece {
  const latest = latestRelease(home, facts.running);
  if (latest === undefined)
    return piece(
      'release',
      'release',
      'unknown',
      facts.running.kind === 'checkout'
        ? 'a checkout runs here: no release is checked for'
        : 'no release check has read the newest release yet',
    );
  return latest.newer
    ? piece('release', 'release', 'met', `${latest.version} is out, newer than this release`, [typed('take it', 'nemia upgrade')])
    : piece('release', 'release', 'met', `this is the newest release (${latest.version})`);
}

/**
 * Every piece of the store's server, in the read's order (`Readiness`), `ready` where none is missing. The needs are read off this
 * process's memory (`NeedsMemory`) where it keeps one that has swept, else every check is run now on a memory of the read's own, the
 * place's and the harnesses' needs among them; a check with no reading is `unknown`.
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
    ...harnessPieces(home, memo, facts),
    ...servicePieces(facts),
    bindPiece(facts),
    ...machinePieces(home, facts),
    ...needPieces(memo, workflows, untrusted),
    ...repositoryPieces(memo, factories, untrusted),
    factoryPiece(factories),
    releasePiece(home, facts),
  ];
  return { ready: pieces.every((p) => p.state !== 'missing'), pieces } satisfies Readiness;
});

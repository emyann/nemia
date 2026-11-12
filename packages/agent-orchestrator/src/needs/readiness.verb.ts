/**
 * The readiness read (`readinessOf`): every piece a person's server needs before a factory's first run, each in place, missing or not
 * known, with the command or the fix that puts it there — the harness's sign-in, the service and its linger, the bind, the machine (cgroup
 * v2, the user's service manager, the tools folder), the places' needs, every factory's workflows' needs, a factory at all, and a newer
 * release. Composed from facts the package already holds; the machine's are read through `ReadinessFacts`, which a test hands its own.
 * A controller: it reads the store, this process's needs' readings (`NeedsMemory`), or the checks run now where it keeps none.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Effect } from 'effect';
import {
  claudeSignIn,
  CLAUDE_SIGN_IN_MS,
  codexSignIn,
  CODEX_SIGN_IN_COMMAND,
  CODEX_SIGN_IN_MS,
  type ClaudeSignIn,
  type CodexSignIn,
} from '../runtime-client.ts';
import { DEFAULT_HARNESS } from 'agent-runtime/vocabulary';
import type { Need, NeedState, Readiness, ReadinessFix, ReadinessPiece } from 'objects';
import { StoreRoot, toolsBinDir } from '../config/root.store.ts';
import type { Env } from '../config/config.store.ts';
import { listedAtOnce } from '../factory/door/factories.store.ts';
import type { FactoryListing } from '../factory/factory.ts';
import { workflowNeedsRead } from '../folder/folder.store.ts';
import { frontmatterKey } from '../former/former.ts';
import { carriedDirOf } from '../frozen/frozen.store.ts';
import { firstPiece } from '../piece/piece.ts';
import { PlaceService } from '../place/place.store.ts';
import { tried } from '../runtime-client.ts';
import type { Running } from '../release/index.ts';
import { latestRelease, runningRelease } from '../release/version.verb.ts';
import { BIND_PUBLIC_VARIABLE, bindExposure, DEFAULT_NAME, kindOfBind } from '../service/index.ts';
import { claudeTokenStatus, TOKEN_MAKER, TOKEN_NAME, TOKEN_VARIABLE } from '../sign-in/sign-in.store.ts';
import { fixCommandOf } from './needs.ts';
import { checkKey, factoryWorkflows, needsMemo, NeedsMemory, needsOnce, type FactoryWorkflow, type NeedsMemo } from './needs.verb.ts';

/** What a run of a command answered: its exit code (null where a signal ended it) and what it printed; undefined where it did not start. */
export type CommandRead = { readonly code: number | null; readonly out: string } | undefined;

/**
 * The machine's facts the read asks, each a seam a test hands its own: the environment the api listens under (`NEMIA_BIND`,
 * `NEMIA_BIND_PUBLIC`, the default harness's token variable, PATH), the user, whether a file is there, a command run with its answer, the
 * default harness's own login (`claudeSignIn`), the second harness's sign-in (`codexSignIn`), and the release this process runs.
 */
export type ReadinessFacts = {
  readonly env: Env;
  readonly user: string;
  readonly exists: (file: string) => boolean;
  readonly run: (command: string, args: readonly string[]) => CommandRead;
  readonly signIn: (env: Env) => CodexSignIn;
  readonly ownSignIn: (env: Env) => ClaudeSignIn;
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
  signIn: (env) => codexSignIn({ ...env }, CODEX_SIGN_IN_MS),
  ownSignIn: (env) => claudeSignIn({ ...env }, CLAUDE_SIGN_IN_MS),
  running: runningRelease(),
});

/** The harness the second sign-in read is of, named by the program its sign-in runs (`CODEX_SIGN_IN_COMMAND`'s first word). */
const SECOND_HARNESS = firstPiece(CODEX_SIGN_IN_COMMAND, ' ');

/** A word with its first letter in capitals. */
const capital = (word: string): string => `${word.charAt(0).toUpperCase()}${word.slice(1)}`;

/** A fix a person types: its words and its command. */
const typed = (message: string, command: string): ReadinessFix => ({ message, command, startable: false });

/** A piece of the read. */
const piece = (
  name: string,
  area: ReadinessPiece['area'],
  state: NeedState,
  message: string,
  fixes: readonly ReadinessFix[] = [],
  more: Partial<Pick<ReadinessPiece, 'factory' | 'workflow' | 'addressKind'>> = {},
): ReadinessPiece => ({ name, area, state, message, fixes, ...more });

/**
 * The default harness's sign-in: its token kept in the store (`claudeTokenStatus`), given in the environment, or, with neither, its own
 * login (`claudeSignIn`), which a session runs under as well. Said as set and loading,
 * never as good: the harness takes any token at its word, so an expired or wrong one shows only when a session or the quota is refused.
 */
function harnessPiece(home: string, facts: ReadinessFacts): ReadinessPiece {
  const name = TOKEN_NAME;
  const set = `nemia ${TOKEN_NAME} set`;
  const make = typed(`make a token with ${TOKEN_MAKER}, then keep it with ${set} < token.txt`, `${TOKEN_MAKER} && ${set}`);
  const own = `${capital(DEFAULT_HARNESS)} token`;
  const status = claudeTokenStatus(home);
  const later = 'whether it is still good shows only when a session or the quota is refused';
  if (status.state === 'set' && status.mode !== '0600')
    return piece(name, 'harness', 'missing', `the ${own} file ${status.file} is readable by others (${status.mode}), so it does not load`, [
      typed('let only you read it', `chmod 600 ${status.file}`),
    ]);
  if (status.state === 'set') return piece(name, 'harness', 'met', `a ${own} is set and loads (${status.file}): ${later}`);
  if (facts.env[TOKEN_VARIABLE]) return piece(name, 'harness', 'met', `a ${own} is set and loads (${TOKEN_VARIABLE}): ${later}`);
  if (facts.ownSignIn(facts.env) === 'signed-in')
    return piece(name, 'harness', 'met', `no ${own} is kept, and ${capital(DEFAULT_HARNESS)} Code is signed in by its own login: ${later}`);
  return piece(name, 'harness', 'missing', `no ${own} is kept: a session signs in with it`, [make]);
}

/** The text of `file`, none where it does not read: such a file names no harness, and its workflow's own load says why. */
const textOf = (file: string): string | undefined => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
};

/** The harnesses the agents and steps of `workflows` name (`harness:` in their files), read off their folders as they are now. */
function harnessesNamed(workflows: readonly FactoryWorkflow[]): Set<string> {
  const named = new Set<string>();
  const read = (file: string) => {
    const text = textOf(file);
    const harness = text === undefined ? undefined : frontmatterKey(text, 'harness');
    if (harness !== undefined) named.add(harness);
  };
  const mdIn = (dir: string): string[] => {
    try {
      return fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    } catch {
      return [];
    }
  };
  for (const w of workflows) {
    for (const f of mdIn(w.dir)) read(path.join(w.dir, f));
    const agents = path.join(path.dirname(w.dir), 'agents');
    for (const f of mdIn(agents)) read(path.join(agents, f));
  }
  return named;
}

/** The second harness's sign-in, where a factory's workflow runs on it: none otherwise. */
function secondHarnessPieces(workflows: readonly FactoryWorkflow[], facts: ReadinessFacts): ReadinessPiece[] {
  if (!harnessesNamed(workflows).has(SECOND_HARNESS)) return [];
  const name = `${SECOND_HARNESS}-sign-in`;
  const read = facts.signIn(facts.env);
  if (read.state === 'signed-in') return [piece(name, 'harness', 'met', `${capital(SECOND_HARNESS)} is signed in on this machine`)];
  if (read.state === 'unknown')
    return [piece(name, 'harness', 'unknown', `whether ${capital(SECOND_HARNESS)} is signed in could not be read: is it installed?`)];
  return [
    piece(name, 'harness', 'missing', `${capital(SECOND_HARNESS)} is not signed in on this machine${read.said ? `: "${read.said}"` : ''}`, [
      typed('sign in with a device code, as the user the daemon runs as', CODEX_SIGN_IN_COMMAND),
    ]),
  ];
}

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

/** A need's fixes as the read offers them: each started by the server, with the command that starts it, its asks and its code. */
const needFixes = (need: Need, workflow?: { factory: string; workflow: string }, fixes = need.fixes ?? []): ReadinessFix[] =>
  fixes.map((fix, index) => ({
    message: fix.message,
    command: `${fixCommandOf(need.name, workflow)}${index ? ` --index ${index}` : ''}${(fix.asks ?? []).map((a) => ` --answer ${a.name}=<${a.name}>`).join('')}`,
    startable: true,
    index,
    ...(fix.asks?.length ? { asks: fix.asks } : {}),
    ...(fix.code === undefined ? {} : { code: fix.code }),
  }));

/** A need's piece, its state off `memo` under `key`: `unknown` where no reading is kept. */
const needPiece = (
  need: Need,
  area: ReadinessPiece['area'],
  state: NeedState | undefined,
  workflow?: { factory: string; workflow: string },
  fixes?: Need['fixes'],
): ReadinessPiece => piece(need.name, area, state ?? 'unknown', need.message, needFixes(need, workflow, fixes), workflow ?? {});

/**
 * The places' needs, then each factory's workflows' own: a need that fills a place's is said under its workflow as the place's need, its
 * fixes first, the place's after, as `startFix` finds them; a workflow whose needs do not read says why.
 */
function needPieces(memo: NeedsMemo, workflows: readonly FactoryWorkflow[]): ReadinessPiece[] {
  const place = memo.placeNeeds;
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
      const key = checkKey({ check: need.check, workflowFiles: w.dir, carriedFiles: carriedDirOf(w.dir) });
      out.push(needPiece(need, 'workflow', memo.readings.get(key), at));
    }
  }
  return out;
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
 * place's needs among them; a check with no reading is `unknown`.
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
  const pieces: ReadinessPiece[] = [
    harnessPiece(home, facts),
    ...secondHarnessPieces(workflows, facts),
    ...servicePieces(facts),
    bindPiece(facts),
    ...machinePieces(home, facts),
    ...needPieces(memo, workflows),
    factoryPiece(factories),
    releasePiece(home, facts),
  ];
  return { ready: pieces.every((p) => p.state !== 'missing'), pieces } satisfies Readiness;
});

/**
 * A person's own Claude Code session in a factory's home (apps/cli, `nemia factory home`): the client renders the home the api serves
 * into a copy of its own, named by the home's digest, and starts the person's session there, as a step's session starts in its run's
 * copy (packages/agent-orchestrator/contracts/session-home.contract.ts): the copy is the session's working folder, its Claude Code
 * project, read-only to it; the person's repository is added beside it; and the session reads its settings from that project alone,
 * as a step's does, never the person's own. Which earlier copies of the same home the client removes when it renders one is decided
 * here too.
 *
 * Each spec exports its type under the function's name, and the code takes it. Every type the signatures need is declared here.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** What the client knows when it starts a person's session in a home. */
export type OwnSessionPlace = {
  /** The client's rendered copy of the factory's home, absolute, with no trailing `/`. */
  readonly copy: string;
  /** The person's repository to add beside it, absolute, with no trailing `/`. */
  readonly repo: string;
  /** Whether the repository's memory files (its root CLAUDE.md) load, as a volume's `claudeMd` switch says for a step: off by default. */
  readonly claudeMd: boolean;
};

/** One flag of the command line Claude Code is started with, and its value. */
export type SessionFlag = { readonly name: string; readonly value: string };

/** What the session's environment adds to the person's own: the variable that loads an added folder's memory files, where it is on. */
export type SessionEnv = { readonly CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD?: '1' };

/**
 * The person's session: started in `cwd` with `flags` and `env` added; or refused, where the repository holds the copy
 * (`repo-holds-home`: the copy would be part of the repository the session may write) or the copy holds the repository
 * (`home-holds-repo`: the repository would be read-only, a part of the home).
 */
export type OwnSession =
  | { readonly kind: 'start'; readonly cwd: string; readonly flags: readonly SessionFlag[]; readonly env: SessionEnv }
  | { readonly kind: 'refused'; readonly reason: 'repo-holds-home' | 'home-holds-repo' };

/** The flag that adds a folder beside the session's working folder. */
const ADD_DIR = '--add-dir';
/** The flag whose rules the session is denied. */
const DENIED = '--disallowedTools';
/** The flag that names the settings the session reads. */
const SOURCES = '--setting-sources';

/** The deny that holds a folder read-only, spelled as the runtime spells a read-only mount's: `Edit(//<path>/**)`. */
const editDenied = (folder: string) => 'Edit(/' + folder + '/**)';

/** Whether `inner` is `outer` or a folder under it. */
const within = (inner: string, outer: string) => inner === outer || inner.startsWith(outer + '/');

/** Whether a path is absolute, not the root, and has no trailing `/`. */
const plain = (p: string) => p.startsWith('/') && p.length > 1 && !p.endsWith('/');

/** Whether the copy and the repository are nested, either in the other or the same folder. */
const nested = (i: OwnSessionPlace) => within(i.copy, i.repo) || within(i.repo, i.copy);

/** Whether `flags` holds the flag `name` with the value `value`. */
const has = (flags: readonly SessionFlag[], name: string, value: string) => flags.some((f) => f.name === name && f.value === value);

const ownSessionSpec = spec<(i: OwnSessionPlace) => OwnSession>({
  /** Both folders are absolute, neither the root, neither with a trailing `/`. */
  requires: ({ input: [i] }) => plain(i.copy) && plain(i.repo),
  ensures: {
    refusedExactlyWhenNested: {
      description: 'A session is refused exactly where the repository and the copy of the home are nested, or the same folder',
      condition: ({ input: [i], output }) => (output.kind === 'refused') === nested(i),
    },
    saysWhichHoldsWhich: {
      description:
        'A refusal says which holds the other: the repository holding the copy (or being it), else the copy holding the repository',
      condition: ({ input: [i], output }) =>
        output.kind !== 'refused' || output.reason === (within(i.copy, i.repo) ? 'repo-holds-home' : 'home-holds-repo'),
    },
    startsInTheCopy: {
      description: "The session starts in the client's copy of the home: its CLAUDE.md, skills, settings and servers are the project's",
      condition: ({ input: [i], output }) => output.kind !== 'start' || output.cwd === i.copy,
    },
    repoAddedBeside: {
      description: "The person's repository is added beside the home",
      condition: ({ input: [i], output }) => output.kind !== 'start' || has(output.flags, ADD_DIR, i.repo),
    },
    homeReadOnly: {
      description: 'The session may edit nothing in the copy of the home: a home changes only by a proposal',
      condition: ({ input: [i], output }) => output.kind !== 'start' || has(output.flags, DENIED, editDenied(i.copy)),
    },
    projectSettingsOnly: {
      description: "The session reads the home's settings alone, as a step's does, and none of the person's own",
      condition: ({ output }) =>
        output.kind !== 'start' ||
        (has(output.flags, SOURCES, 'project') && output.flags.every((f) => f.name !== SOURCES || f.value === 'project')),
    },
    nothingElse: {
      description: 'The session is given those three flags once each and nothing more: no mode, no prompt, no other folder',
      condition: ({ output }) =>
        output.kind !== 'start' ||
        (output.flags.length === 3 && output.flags.every((f) => f.name === ADD_DIR || f.name === DENIED || f.name === SOURCES)),
    },
    memoryBySwitch: {
      description: "The repository's memory files load exactly where the person switched them on",
      condition: ({ input: [i], output }) =>
        output.kind !== 'start' || (output.env.CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD === '1') === i.claudeMd,
    },
  },
});

/** `ownSessionOf`'s type, which the code takes: it then imports nothing of tsverify. */
export type OwnSessionOf = Implementation<typeof ownSessionSpec>;

/** Whether a folder's name is a render still being written: the sibling a copy is written into before it is renamed in place. */
const inFlight = (name: string) => name.startsWith('.');

const staleCopiesSpec = spec<(present: readonly string[], current: string) => readonly string[]>({
  /** The current copy's name is a digest, never a render in flight. */
  requires: ({ input: [, current] }) => current.length > 0 && !inFlight(current),
  ensures: {
    keepsTheCurrent: {
      description: 'The copy of the home as it is now is never removed',
      condition: ({ input: [, current], output }) => !output.includes(current),
    },
    keepsRendersInFlight: {
      description: 'A render still being written, by this client or another, is never removed',
      condition: ({ output }) => output.every((name) => !inFlight(name)),
    },
    removesEveryEarlierCopy: {
      description: 'Every other copy of the same home, an earlier version of it, is removed',
      condition: ({ input: [present, current], output }) =>
        present.every((name) => name === current || inFlight(name) || output.includes(name)),
    },
    onlyWhatIsThere: {
      description: 'Nothing is named for removal that is not among the copies there',
      condition: ({ input: [present], output }) => output.every((name) => present.includes(name)),
    },
  },
});

/** `staleCopiesOf`'s type, which the code takes: it then imports nothing of tsverify. */
export type StaleCopiesOf = Implementation<typeof staleCopiesSpec>;

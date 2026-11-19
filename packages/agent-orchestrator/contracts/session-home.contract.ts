/**
 * Where a step's session starts, and the folder it works on (agent-orchestrator): the run's frozen copy of its factory's home is the
 * session's working folder, its Claude Code project, and the step's workspace is added beside it (`sessionStart`); the step's own
 * rules, written for the folder it works on, are read against that folder wherever the session stands (`inWorkspace`); and which
 * added folders' memory files Claude Code loads, by each folder's switch (`memoryFiles`).
 *
 * Each spec exports its type under the function's name, and the code takes it. Every type the signatures need is declared here.
 */
import { assume, type Implementation, spec } from '@emyann/tsverify';
import { expandedIn, WORKSPACE_EXPRESSION } from '../src/filed/session-start/expression.ts';

export { WORKSPACE_EXPRESSION };

/** A folder a session is filed with beside its working folder, as the runtime's task takes it. */
export type AddedFolder = {
  /** The folder's absolute path. */
  readonly path: string;
  /** Whether the session may only read it: the runtime denies an edit anywhere under it. */
  readonly readOnly: boolean;
  /**
   * Whether the task's own rules alone decide what the session writes there: the runtime adds neither the allow it gives a writable
   * folder nor the deny it gives a read-only one. Absent: the runtime's rule for its mode.
   */
  readonly ruled?: true;
};

/** What the filing knows of a step when it chooses where its session starts. */
export type SessionPlaceOf = {
  /** The step's workspace: its worktree, or the run's, absolute. */
  readonly workspace: string;
  /** The run's frozen copy of its factory's home, absolute; undefined where the run froze none. */
  readonly home: string | undefined;
  /** Whether the step runs on this machine: no remote agent. */
  readonly local: boolean;
  /** Whether the step's harness declares a writable added folder (`writableMount`), as Claude Code does and Codex does not. */
  readonly addsFolders: boolean;
  /** Whether the step's fence writes anything (not `writesNothing`). */
  readonly writes: boolean;
};

/** Where the session starts, the folder it works on when that is not where it starts, and what it is denied for it. */
export type SessionStart = {
  /** The session's working folder: its Claude Code project. */
  readonly cwd: string;
  /** The workspace, added beside the home; null where the session starts in the workspace itself. */
  readonly worked: AddedFolder | null;
  /** Rules denied to the session for its start: an edit anywhere in the home. */
  readonly denies: readonly string[];
};

/**
 * The deny that holds a folder read-only, spelled as the runtime spells a read-only mount's: `Edit(//<path>/**)`. Joined with `+`,
 * which the solver reads, where a template string is an unknown string of its parts.
 * @param folder The folder denied, absolute.
 */
export const editDenied = (folder: string): string => 'Edit(/' + folder + '/**)';

/** Whether the session starts in the home: there is one, the step runs here, and its harness can add the workspace writable beside it. */
const startsInHome = (i: SessionPlaceOf): boolean => i.home !== undefined && i.local && i.addsFolders;

const sessionStartSpec = spec<(i: SessionPlaceOf) => SessionStart>({
  /** The workspace and the home are absolute paths, and the home is not the workspace. */
  requires: ({ input: [i] }) => i.workspace.startsWith('/') && (i.home === undefined || (i.home.startsWith('/') && i.home !== i.workspace)),
  ensures: {
    inTheHome: {
      description: "A step on this machine whose harness adds a writable folder starts in its run's home, where the run froze one",
      condition: ({ input: [i], output }) => !startsInHome(i) || output.cwd === i.home,
    },
    asBefore: {
      description:
        'A run that froze no home, a remote step, and a harness that cannot add a writable folder start in the workspace, as before: nothing added, nothing denied',
      condition: ({ input: [i], output }) =>
        startsInHome(i) || (output.cwd === i.workspace && output.worked === null && output.denies.length === 0),
    },
    workedBeside: {
      description: 'A session in the home has its workspace added beside it',
      condition: ({ input: [i], output }) => !startsInHome(i) || output.worked?.path === i.workspace,
    },
    writesByItsFence: {
      description:
        "The workspace is writable to a step whose fence writes, by the step's own rules alone, and read-only to one whose fence writes nothing",
      condition: ({ input: [i], output }) =>
        output.worked === null ||
        (i.writes ? output.worked.readOnly === false && output.worked.ruled === true : output.worked.readOnly === true),
    },
    readOnlyUnruled: {
      description: "A workspace read-only to the session keeps the runtime's deny for a read-only folder: it is never ruled",
      condition: ({ output }) => output.worked === null || output.worked.readOnly === false || output.worked.ruled === undefined,
    },
    homeReadOnly: {
      description: 'A session in the home may write nothing there: the home changes only by a proposal',
      condition: ({ input: [i], output }) => !startsInHome(i) || (i.home !== undefined && output.denies.includes(editDenied(i.home))),
    },
    deniesOnlyTheHome: {
      description: 'The start denies nothing but the home',
      condition: ({ input: [i], output }) => output.denies.every((rule) => i.home !== undefined && rule === editDenied(i.home)),
    },
  },
});

/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type SessionStartOf = Implementation<typeof sessionStartSpec>;

/** The tools whose rule names a file by its path, as Claude Code reads one. */
const FILE_TOOLS: readonly string[] = ['Read', 'Edit', 'Write', 'NotebookEdit'];

/** A rule's tool and what is inside its parentheses, or null for a bare tool. */
const partsOf = (rule: string): { tool: string; inner: string | null } => {
  const open = rule.indexOf('(');
  if (open < 0 || !rule.endsWith(')')) return { tool: rule, inner: null };
  return { tool: rule.slice(0, open), inner: rule.slice(open).slice(1, -1) };
};

/** Whether a file rule's path is read from the session's working folder: neither absolute (`/`, `//`) nor the user's (`~`). */
const relative = (inner: string): boolean => inner.length > 0 && !inner.startsWith('/') && !inner.startsWith('~');

/** A relative path with its leading `./` taken off, where it has one. */
const bare = (inner: string): string => (inner.startsWith('./') ? inner.slice(2) : inner);

/**
 * The expansion of `${{ workspace }}` the code calls (`expandedIn`), taken on trust: a split and a join, which the solver does not
 * read. Its laws are held on the real function by `src/filed/session-start/expression.test.ts` (`brokenOn`).
 */
export const expandedPure = assume<[text: string, workspace: string], string>(expandedIn, {
  pure: true,
  ensures: {
    /** A text that names no expression is as it was. */
    noneAsWritten: ({ input: [text], output }) => text.includes(WORKSPACE_EXPRESSION) || output === text,
    /** No expression is left, where the workspace names none. */
    noneLeft: ({ input: [, workspace], output }) => workspace.includes(WORKSPACE_EXPRESSION) || !output.includes(WORKSPACE_EXPRESSION),
    /** The text before the first expression is kept, and the workspace stands where the expression stood. */
    inItsPlace: ({ input: [text, workspace], output }) =>
      !text.includes(WORKSPACE_EXPRESSION) || output.startsWith(text.slice(0, text.indexOf(WORKSPACE_EXPRESSION)) + workspace),
  },
});

const inWorkspaceSpec = spec<(rule: string, workspace: string) => string>({
  /** The workspace is an absolute path with no expression in it. */
  requires: ({ input: [, workspace] }) => workspace.startsWith('/') && !workspace.includes(WORKSPACE_EXPRESSION),
  ensures: {
    expressionExpanded: {
      description: 'A rule that names `${{ workspace }}` names no expression once filed',
      condition: ({ input: [rule], output }) => !rule.includes(WORKSPACE_EXPRESSION) || !output.includes(WORKSPACE_EXPRESSION),
    },
    expressionInItsPlace: {
      description: "The step's workspace stands where the rule's first `${{ workspace }}` stood, what was before it kept",
      condition: ({ input: [rule, workspace], output }) =>
        !rule.includes(WORKSPACE_EXPRESSION) || output.startsWith(rule.slice(0, rule.indexOf(WORKSPACE_EXPRESSION)) + workspace),
    },
    relativeFileRuleInTheWorkspace: {
      description:
        "A file rule with a relative path names that path in the workspace, as it named it in the session's folder when the workspace was that folder",
      condition: ({ input: [rule, workspace], output }) => {
        const { tool, inner } = partsOf(rule);
        if (rule.includes(WORKSPACE_EXPRESSION) || inner === null || !FILE_TOOLS.includes(tool) || !relative(inner)) return true;
        return output === tool + '(/' + workspace + '/' + bare(inner) + ')';
      },
    },
    otherwiseAsWritten: {
      description:
        "Any other rule is filed as written: a bare tool, a file rule's absolute or user path, and another tool's rule with no expression",
      condition: ({ input: [rule], output }) => {
        const { tool, inner } = partsOf(rule);
        if (rule.includes(WORKSPACE_EXPRESSION)) return true;
        if (inner !== null && FILE_TOOLS.includes(tool) && relative(inner)) return true;
        return output === rule;
      },
    },
  },
});

/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type InWorkspace = Implementation<typeof inWorkspaceSpec>;

/** A folder added to a session, and whether a person switched its memory files (CLAUDE.md) on for the factory's sessions. */
export type MemoryFolder = { readonly path: string; readonly claudeMd: boolean };

/**
 * What the session is given for its added folders' memory files: whether Claude Code loads them at all
 * (`CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD`, one switch for every added folder), and the folders it is told to skip
 * (`claudeMdExcludes`, `<path>/**`), so that only the folders switched on are read.
 */
export type MemoryFiles = { readonly load: boolean; readonly excludes: readonly string[] };

/**
 * The exclude that skips every memory file under a folder.
 * @param folder The folder skipped, absolute.
 */
export const everyFileUnder = (folder: string): string => folder + '/**';

/** Whether `inner` is `outer` or a folder under it. */
const within = (inner: string, outer: string): boolean => inner === outer || inner.startsWith(outer + '/');

const memoryFilesSpec = spec<(folders: readonly MemoryFolder[]) => MemoryFiles>({
  /**
   * Each folder is an absolute path, and no folder left off is a folder switched on, inside one or around one: a folder both left
   * off and switched on could be neither skipped nor read.
   */
  requires: ({ input: [folders] }) =>
    folders.every((f) => f.path.startsWith('/')) &&
    folders.every((f) => f.claudeMd || folders.every((g) => !g.claudeMd || (!within(f.path, g.path) && !within(g.path, f.path)))),
  ensures: {
    offByDefault: {
      description: "Where no added folder is switched on, no added folder's memory file loads, and nothing is excluded",
      condition: ({ input: [folders], output }) => folders.some((f) => f.claudeMd) || (!output.load && output.excludes.length === 0),
    },
    loadedWhereSwitchedOn: {
      description: 'Where a person switched an added folder on, memory files of added folders load',
      condition: ({ input: [folders], output }) => !folders.some((f) => f.claudeMd) || output.load,
    },
    othersSkipped: {
      description: 'While they load, every added folder left off is skipped whole',
      condition: ({ input: [folders], output }) =>
        !output.load || folders.every((f) => f.claudeMd || output.excludes.includes(everyFileUnder(f.path))),
    },
    switchedOnRead: {
      description: 'No exclude is a folder switched on, or a folder inside one',
      condition: ({ input: [folders], output }) =>
        folders.every((f) => !f.claudeMd || output.excludes.every((e) => !e.endsWith('/**') || !within(e.slice(0, -3), f.path))),
    },
    excludesOnlyFolders: {
      description: 'Each exclude is an added folder left off',
      condition: ({ input: [folders], output }) =>
        output.excludes.every((e) => folders.some((f) => !f.claudeMd && e === everyFileUnder(f.path))),
    },
  },
});

/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type MemoryFilesOf = Implementation<typeof memoryFilesSpec>;

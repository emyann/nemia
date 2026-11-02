/**
 * The Agent door's contract (`AgentDoor`, `src/agents/agent-door.store.ts`), as walks (`door-walks.ts`): every method's rows, run on the
 * files by `src/agents/agent-door.store.test.ts` and on the memory stand-in by `src/agents/agent-memory.store.test.ts`. An agent written
 * is listed, there at a version, read back and found where a run looks, written again at its version, renamed, and removed and gone;
 * a person's custom instructions for it are written, read, found on it and cleared. And the write check, each refusal leaving nothing
 * written: a name that is no agent's, a new agent at a name taken, a write at a version it moved on from or of one gone, a rename onto
 * another agent, a removal with no version or at a stale one, an agent one repository has in both its places, custom instructions for
 * no agent and blank ones.
 *
 * Each walk is on a side of its own: a fresh store, or a fresh stand-in. What the files alone are asked — a link, a sidecar, a step that
 * still names an agent, the place — is a test of the files' own (`agent-door.store.test.ts`, `test/write-agent.test.ts`).
 */
import type { DoorSide, DoorWalk } from './door-walks.ts';
import { act, done } from './door-walks.ts';
import type { AgentAt, AgentDoorShape } from '../src/agents/agent-door.store.ts';
import { AgentName } from '../src/agents/agents.model.ts';
import type { AgentDraft } from '../src/agents/agents.ts';

type Walk = DoorWalk<AgentDoorShape>;
type Side = DoorSide<AgentDoorShape>;

/** An agent drafted as the board sends one: `scribe` unless named, a description, two keys and its words, each changed by `over`. */
export const anAgent = (name = 'scribe', over: Partial<AgentDraft> = {}): AgentDraft => ({
  name,
  description: `Use ${name} when a change needs its notes written.`,
  keys: { model: 'sonnet', tools: 'Read, Write' },
  body: `Write the notes, ${name}.`,
  ...over,
});

/** The name `name` as the door takes it. */
const named = (name: string): AgentName => AgentName.read(name);

/** Your folder of agents on a side: `<root>/workflows/agents`. */
export const yoursAt = ({ root }: Side): AgentAt => ({ dir: `${root}/workflows/agents` });

/** A repository of a side, `<root>/repo`, whose agents and custom instructions a walk reads. */
const repoOf = ({ root }: Side): string => `${root}/repo`;

/** `name` written on a side as a new agent of yours, at the version it is at after. */
const written = (side: Side, name = 'scribe', draft: AgentDraft = anAgent(name)): string =>
  done(side.door.agents.write(named(name), draft, undefined, yoursAt(side))).version;

/** What your folder holds on a side: the agents listed, by name. */
const listed = (side: Side) => done(side.door.agents.list(yoursAt(side).dir));

/** Of an agent read, what a walk compares. */
const plain = ({ name, description, keys, body }: { name: string; description?: string | null; keys: object; body: string }) => ({
  name,
  description,
  keys,
  body,
});

export const AGENT_WALKS: Readonly<Record<string, readonly Walk[]>> = {
  'agents.found': [
    {
      name: 'none in an empty store',
      walk: (side) => [...done(side.door.agents.found({ dir: `${side.root}/workflows/_`, places: { home: side.root } })).keys()],
      says: [],
    },
    {
      name: 'yours, with your custom instructions, where a run on a repository looks',
      walk: (side) => {
        written(side);
        done(side.door.custom.write(named('scribe'), 'Write in French.', repoOf(side)));
        const found = done(side.door.agents.found({ dir: `${repoOf(side)}/workflows/_`, places: { repo: repoOf(side), home: side.root } }));
        const scribe = found.get('scribe');
        if (scribe === undefined || scribe instanceof Error) return { refused: scribe?._tag ?? 'none' };
        return { ...plain(scribe), custom: scribe.customInstructions };
      },
      says: {
        name: 'scribe',
        description: 'Use scribe when a change needs its notes written.',
        keys: { model: 'sonnet', tools: 'Read, Write' },
        body: 'Write the notes, scribe.',
        custom: 'Write in French.',
      },
    },
    {
      name: 'the first place that has a name wins: the repository’s over yours',
      walk: (side) => {
        written(side, 'scribe', anAgent('scribe', { body: 'Yours.' }));
        const repo = { dir: `${repoOf(side)}/workflows/agents`, anywhere: true };
        done(side.door.agents.write(named('scribe'), anAgent('scribe', { body: 'The repository’s.' }), undefined, repo));
        const found = done(side.door.agents.found({ dir: `${repoOf(side)}/workflows/_`, places: { repo: repoOf(side), home: side.root } }));
        const scribe = found.get('scribe');
        return scribe instanceof Error ? { refused: scribe._tag } : scribe?.body;
      },
      says: 'The repository’s.',
    },
    {
      name: 'REFUSED: a name one repository has in both its places is refused, naming both, and stops nothing else',
      walk: (side) => {
        const holder = (at: string) => ({ dir: `${repoOf(side)}/${at}/agents`, anywhere: true });
        done(side.door.agents.write(named('scribe'), anAgent(), undefined, holder('workflows')));
        done(side.door.agents.write(named('scribe'), anAgent(), undefined, holder('.claude')));
        done(side.door.agents.write(named('notary'), anAgent('notary'), undefined, holder('workflows')));
        const found = done(side.door.agents.found({ dir: `${repoOf(side)}/workflows/_`, places: { repo: repoOf(side) } }));
        const { scribe, notary } = Object.fromEntries(found);
        return {
          scribe:
            scribe instanceof Error ? { refused: scribe._tag, both: scribe.message.includes(`${repoOf(side)}/.claude/agents`) } : 'read',
          notary: notary instanceof Error ? { refused: notary._tag } : 'read',
        };
      },
      says: { scribe: { refused: 'Invalid', both: true }, notary: 'read' },
    },
  ],
  'agents.list': [
    { name: 'none in an empty store', walk: (side) => listed(side), says: [] },
    {
      name: 'each written, by name, sorted',
      walk: (side) => {
        written(side, 'zeta');
        written(side, 'alpha');
        return listed(side);
      },
      says: ['alpha', 'zeta'],
    },
    {
      name: 'REFUSED: a holder that is no whole path is Invalid',
      walk: (side) => act(side.door.agents.list('workflows/agents')),
      says: { refused: 'Invalid' },
    },
  ],
  'agents.read': [
    {
      name: 'an agent written, read back as it was drafted',
      walk: (side) => {
        written(side);
        return plain(done(side.door.agents.read(named('scribe'), yoursAt(side))));
      },
      says: {
        name: 'scribe',
        description: 'Use scribe when a change needs its notes written.',
        keys: { model: 'sonnet', tools: 'Read, Write' },
        body: 'Write the notes, scribe.',
      },
    },
    {
      name: 'REFUSED: one not there is Missing',
      walk: (side) => act(side.door.agents.read(named('scribe'), yoursAt(side))),
      says: { refused: 'Missing' },
    },
  ],
  'agents.there': [
    {
      name: 'nothing before it is written',
      walk: (side) => done(side.door.agents.there(named('scribe'), yoursAt(side))),
      says: { kind: 'none' },
    },
    {
      name: 'held at the version its write answered',
      walk: (side) => {
        const version = written(side);
        const there = done(side.door.agents.there(named('scribe'), yoursAt(side)));
        return there.kind === 'held' && there.version === version;
      },
      says: true,
    },
  ],
  'agents.write': [
    {
      name: 'a new agent: its file written, the agent it reads as answered',
      walk: (side) => {
        const { dir, agent, written: files, removed } = done(side.door.agents.write(named('scribe'), anAgent(), undefined, yoursAt(side)));
        return { dir, name: agent.name, written: files, removed };
      },
      says: { dir: '<root>/workflows/agents', name: 'scribe', written: ['scribe.md'], removed: [] },
    },
    {
      name: 'changed at its version: written, at another version, read back changed',
      walk: (side) => {
        const version = written(side);
        const now = done(side.door.agents.write(named('scribe'), anAgent('scribe', { body: 'Write less.' }), version, yoursAt(side)));
        return { moved: now.version !== version, body: done(side.door.agents.read(named('scribe'), yoursAt(side))).body };
      },
      says: { moved: true, body: 'Write less.' },
    },
    {
      name: 'renamed at its version: the new file written, the old removed',
      walk: (side) => {
        const version = written(side);
        const { written: files, removed } = done(side.door.agents.write(named('scribe'), anAgent('notary'), version, yoursAt(side)));
        return { written: files, removed, listed: listed(side) };
      },
      says: { written: ['notary.md'], removed: ['scribe.md'], listed: ['notary'] },
    },
    {
      name: 'REFUSED: a new agent at a name taken is a Conflict, the agent as it was',
      walk: (side) => {
        written(side);
        return {
          write: act(side.door.agents.write(named('scribe'), anAgent('scribe', { body: 'Over it.' }), undefined, yoursAt(side))),
          body: done(side.door.agents.read(named('scribe'), yoursAt(side))).body,
        };
      },
      says: { write: { refused: 'Conflict' }, body: 'Write the notes, scribe.' },
    },
    {
      name: 'REFUSED: at a version it moved on from is a Conflict, the agent as it was',
      walk: (side) => {
        const version = written(side);
        done(side.door.agents.write(named('scribe'), anAgent('scribe', { body: 'Write less.' }), version, yoursAt(side)));
        return {
          write: act(side.door.agents.write(named('scribe'), anAgent('scribe', { body: 'Write more.' }), version, yoursAt(side))),
          body: done(side.door.agents.read(named('scribe'), yoursAt(side))).body,
        };
      },
      says: { write: { refused: 'Conflict' }, body: 'Write less.' },
    },
    {
      name: 'REFUSED: given a version of one gone is Missing, nothing written',
      walk: (side) => ({
        write: act(side.door.agents.write(named('scribe'), anAgent(), '0123456789abcdef', yoursAt(side))),
        listed: listed(side),
      }),
      says: { write: { refused: 'Missing' }, listed: [] },
    },
    {
      name: 'REFUSED: a name that is no agent’s is Invalid, nothing written',
      walk: (side) => ({
        drafted: act(side.door.agents.write(named('a/b'), anAgent('a/b'), undefined, yoursAt(side))),
        renamed: act(side.door.agents.write(named('scribe'), anAgent('README'), undefined, yoursAt(side))),
        listed: listed(side),
      }),
      says: { drafted: { refused: 'Invalid' }, renamed: { refused: 'Invalid' }, listed: [] },
    },
    {
      name: 'REFUSED: a key no agent has is Invalid, nothing written',
      walk: (side) => ({
        write: act(
          side.door.agents.write(named('scribe'), anAgent('scribe', { keys: { agent: 'other' } as never }), undefined, yoursAt(side)),
        ),
        listed: listed(side),
      }),
      says: { write: { refused: 'Invalid' }, listed: [] },
    },
    {
      name: 'REFUSED: a rename with no version is Invalid, nothing written',
      walk: (side) => {
        written(side);
        return { write: act(side.door.agents.write(named('scribe'), anAgent('notary'), undefined, yoursAt(side))), listed: listed(side) };
      },
      says: { write: { refused: 'Invalid' }, listed: ['scribe'] },
    },
    {
      name: 'REFUSED: a rename onto another agent is a Conflict, both as they were',
      walk: (side) => {
        const version = written(side);
        written(side, 'notary');
        return {
          write: act(side.door.agents.write(named('scribe'), anAgent('notary', { body: 'Over it.' }), version, yoursAt(side))),
          body: done(side.door.agents.read(named('notary'), yoursAt(side))).body,
          listed: listed(side),
        };
      },
      says: { write: { refused: 'Conflict' }, body: 'Write the notes, notary.', listed: ['notary', 'scribe'] },
    },
  ],
  'agents.remove': [
    {
      name: 'removed at its version, its file named, and gone',
      walk: (side) => {
        const version = written(side);
        const { dir, removed } = done(side.door.agents.remove(named('scribe'), version, yoursAt(side)));
        return { dir, removed, there: done(side.door.agents.there(named('scribe'), yoursAt(side))).kind };
      },
      says: { dir: '<root>/workflows/agents', removed: ['scribe.md'], there: 'none' },
    },
    {
      name: 'REFUSED: with no version is Invalid, at one it moved on from a Conflict, the agent kept',
      walk: (side) => {
        written(side);
        return [
          act(side.door.agents.remove(named('scribe'), undefined, yoursAt(side))),
          act(side.door.agents.remove(named('scribe'), '0123456789abcdef', yoursAt(side))),
          listed(side),
        ];
      },
      says: [{ refused: 'Invalid' }, { refused: 'Conflict' }, ['scribe']],
    },
    {
      name: 'REFUSED: not there is Missing',
      walk: (side) => act(side.door.agents.remove(named('scribe'), '0123456789abcdef', yoursAt(side))),
      says: { refused: 'Missing' },
    },
  ],
  'custom.read': [
    {
      name: 'none for an agent given none',
      walk: (side) => {
        written(side);
        return done(side.door.custom.read(named('scribe'), repoOf(side))) ?? null;
      },
      says: null,
    },
    {
      name: 'REFUSED: for no agent where a run looks is Missing',
      walk: (side) => act(side.door.custom.read(named('ghost'), repoOf(side))),
      says: { refused: 'Missing' },
    },
  ],
  'custom.write': [
    {
      name: 'written to your store, the file answered, and read back trimmed',
      walk: (side) => {
        written(side);
        return {
          file: done(side.door.custom.write(named('scribe'), '  Write in French.\n\n', repoOf(side))),
          words: done(side.door.custom.read(named('scribe'), repoOf(side))),
        };
      },
      says: { file: '<root>/custom-instructions/scribe.md', words: 'Write in French.' },
    },
    {
      name: 'for an agent only the repository’s .claude/agents has',
      walk: (side) => {
        done(
          side.door.agents.write(named('helper'), anAgent('helper'), undefined, { dir: `${repoOf(side)}/.claude/agents`, anywhere: true }),
        );
        return done(side.door.custom.write(named('helper'), 'Help in French.', repoOf(side)));
      },
      says: '<root>/custom-instructions/helper.md',
    },
    {
      name: 'for the store’s own agent, nemia, whom no place names',
      walk: (side) => [
        done(side.door.custom.write(named('nemia'), 'Write to me in French.', repoOf(side))),
        done(side.door.custom.read(named('nemia'), repoOf(side))),
      ],
      says: ['<root>/custom-instructions/nemia.md', 'Write to me in French.'],
    },
    {
      name: 'REFUSED: for no agent where a run looks is Missing, nothing written',
      walk: (side) => [
        act(side.door.custom.write(named('ghost'), 'Boo.', repoOf(side))),
        done(side.door.custom.read(named('nemia'), repoOf(side))) ?? null,
      ],
      says: [{ refused: 'Missing' }, null],
    },
    {
      name: 'REFUSED: blank words, or a frontmatter block, are Invalid, the words as they were',
      walk: (side) => {
        written(side);
        done(side.door.custom.write(named('scribe'), 'Write in French.', repoOf(side)));
        return [
          act(side.door.custom.write(named('scribe'), ' \n\t', repoOf(side))),
          act(side.door.custom.write(named('scribe'), '---\nmodel: opus\n---\nWrite.', repoOf(side))),
          done(side.door.custom.read(named('scribe'), repoOf(side))),
        ];
      },
      says: [{ refused: 'Invalid' }, { refused: 'Invalid' }, 'Write in French.'],
    },
  ],
  'custom.clear': [
    {
      name: 'removed, and none after; cleared again, there were none',
      walk: (side) => {
        written(side);
        done(side.door.custom.write(named('scribe'), 'Write in French.', repoOf(side)));
        return [
          done(side.door.custom.clear(named('scribe'), repoOf(side))),
          done(side.door.custom.read(named('scribe'), repoOf(side))) ?? null,
          done(side.door.custom.clear(named('scribe'), repoOf(side))),
        ];
      },
      says: [true, null, false],
    },
    {
      name: 'REFUSED: for no agent where a run looks is Missing',
      walk: (side) => act(side.door.custom.clear(named('ghost'), repoOf(side))),
      says: { refused: 'Missing' },
    },
  ],
};

/**
 * The long help of `nemia factory --help`: every form of the factory's verbs, what a factory is, and what each verb does and refuses,
 * the forms of its volumes, settings and cost lines spelled once beside their own words. Pure.
 */
import { COST_LINE_FORMS, SETTING_FORMS, VOLUME_FORMS } from './commands-factories-settings.ts';

/** `nemia factory --help`. */
export const FACTORY_MANUAL = `nemia factory [ls]
nemia factory add <name> --repo <path|url> [--repo <path|url> ...] [--no-trust]
nemia factory apply <name> --template <name|folder|archive> --repo <path|url> [--repo <path|url> ...] [--set <key>=<value> ...] [--no-trust]
nemia factory adopt <name> --template <name|folder|archive> [--set <key>=<value> ...] --plan <digest>
nemia factory diff <name> --to <x.y.z> [--template <name|folder|archive>]
nemia factory diff <name> --template <name|folder|archive> [--set <key>=<value> ...]
nemia factory upgrade <name> --to <x.y.z> [--template <name|folder|archive>] [--downgrade]
nemia factory resolve <name> <conflict> --ours|--theirs|--file <path>
nemia factory attach <factory> <workflow> [--repo <name>]
nemia factory detach <factory> <workflow>
nemia factory hire <factory> <agent> --step <workflow>/<step>
nemia factory fire <factory> --step <workflow>/<step>
nemia factory schedule <factory> <workflow> --cron <expr> --brief <text> [--tz <zone>]
nemia factory unschedule <factory> <workflow>
nemia factory servers <factory>
nemia factory server add <factory> <server> --url <address> [--transport http|sse] [--header <name>=<value> ...] [--client-id <id>] [--callback-port <port>]
nemia factory server rm <factory> <server>
${VOLUME_FORMS}
${SETTING_FORMS}
${COST_LINE_FORMS}
nemia factory rules <name> [--file <path>|- | --clear]
nemia factory instruction <name> [--path <path> | --store | --clear]
nemia factory instruct <name> --file <path>|- | --clear
nemia factory revisions <name> follow|pinned
nemia factory trust <name>
nemia factory rm <name>

A factory is a named grouping in the store: \${WF_ROOT:-~/.agent-workflows}/factories/, one <name>.json per
factory, naming the repositories its work is on, the workflows it offers and the agents it hires into their steps:

    { "repos": ["/home/me/code/app"], "workflows": ["build"], "hires": { "build/implement": "implementer" },
      "instruction": { "path": "docs/NEMIA.md" }, "volumes": [{ "path": "/home/me/notes", "readOnly": true }] }

  nemia factory     lists the default factory first — every run and card that names no factory; it is no file,
                 and is read, never written — then each factory by name with its repositories. A file that
                 does not read as a factory is listed with why, and a place a harness does not trust with
                 what is withheld there and the line that trusts it.
  nemia factory add files a factory: its name a lowercase slug (letters, digits, dashes; 40 at most), and one
                 --repo at least, each a directory, written as an absolute path and named once. Each place
                 is then trusted for every harness that keeps a trust of a folder, under the repository it
                 is in, so the place's own settings apply to the sessions of its steps: the place, what the
                 trust grants and how to take it back are printed, and nothing for a place already trusted.
                 --no-trust files the factory and trusts nothing. A trust that could not be given never
                 refuses the add: the line says why, and what repairs it.
  nemia factory apply files a factory made from a template that passes its check (nemia template lint), its
                 parameters given with --set, typed as nemia.yaml declares them, a default filling one not
                 given. Its file names the template; the daemon renders the template into
                 factories/<name>/applied/, read-only, and seeds factories/<name>/tree/ from it once — the
                 workflows, agents, skills, wiring (factory.json) and NEMIA.md the factory runs from, yours to
                 change after — and writes factories/<name>/status.json: the version, the digest and the
                 conditions Applied and ConflictsPending. Its attach, detach, hire, fire and instruct write the
                 tree, and nemia workflows, agents and skills write into it with --factory <name>. Its places
                 are trusted as nemia factory add trusts them, unless --no-trust.
  nemia factory adopt takes a factory you made by hand over by a template, in place (nemia factory adopt --help). On
                 such a factory, nemia factory diff previews the takeover and prints the digest --plan takes.
  nemia factory diff previews an upgrade of a templated factory to --to: the template, at its place or at --template,
                 rendered at that version with the factory's parameters and merged three ways — the base, your
                 tree, the render — each file whole first, factory.json by key, a step's frontmatter by key and
                 its body by line; what merges cleanly, and each conflict with its sides. It writes nothing.
  nemia factory upgrade writes --to, and --template and --set where given, into the factory's file, and nothing else:
                 the daemon merges on its next pass once each conflict has a choice (ConflictsPending in status.json); a
                 run in flight keeps its frozen folders. With --to the version applied, a --set changes parameters alone.
                 Refused: a template at another version than --to, the version applied with nothing to change or its
                 template changed under it, a lower one without --downgrade, a --set without diff's --plan for it.
  nemia factory resolve writes your choice for one conflict, by the address nemia factory diff names: --ours keeps
                 your tree's side, --theirs the template's, --file <path> the text of a file; kept for the merge
                 under way in factories/<name>/resolutions.json. A conflict in a text file directly in a workflow's
                 folder is resolved by a proposal of that workflow: once each of its conflicts has a choice, the
                 folder they compose is proposed, and the daemon merges it once you approve it
                 (nemia proposals approve <p> -n <name>); decline it to choose again.
  nemia factory attach attaches a workflow, by its folder's name: the factory then offers it, and only the
                 workflows attached to it — none, until one is. Only the name is stored, and a step that
                 names its own agent is filled already; whether the workflow exists is judged at the start.
                 --repo <name> names the repository its runs work on, by its folder's name: required where
                 the factory has several repositories, its only one otherwise. A card and a brief started
                 in the factory run on it, never on the folder they are typed in; attach an attached
                 workflow again with --repo to change it.
  nemia factory detach takes a workflow back, once the factory hires no one into its steps, schedules it no more
                 and sets it no cost line.
  nemia factory hire hires an agent into a step, <workflow>/<step> — the workflow by its folder's name, the step
                 by its file's, without .md: one agent a step, so a second hire replaces the first. Any agent
                 fills any step; it is found, when the run starts, where the step's own agent: would be.
                 A step whose own file names its agent: takes no hire.
  nemia factory fire takes a step's hire back.
  nemia factory schedule has the daemon start a run of an attached workflow at each fire of a cron (five or six
                 fields, read in --tz, the machine's zone when none), asked what --brief says, on --repo or the
                 factory's one repository, at every level; a pause stops it. A daemon that was down starts
                 what it missed once. A second schedule of the workflow replaces the first.
  nemia factory unschedule takes a workflow's schedule back.
  nemia factory cost-line sets what a run of a workflow the factory offers may cost before its gate says so, in
                 dollars (nemia factory cost-line set --help): a gate whose caps let the run cost more says so,
                 and no rule of auto approves it unasked. Kept in the factory's file, never in a template, and
                 frozen on a run at its start; cost-line rm takes it back.
  nemia factory rules prints the factory's rules and policies, writes them (--file <path>, - for stdin) or
                 removes them (--clear): words told to every agent hired into it, after its custom
                 instructions and before the step's own note, kept by the store in factories/<name>/RULES.md
                 beside its file (in its tree, for a factory made from a template), never in a repository.
                 Words only: a frontmatter block is refused. Read once at nemia start and frozen with the
                 run's steps, so a run in flight keeps the rules it was started with. A step on a remote
                 agent is not told them.
  nemia factory instruction says where the factory's instruction is kept, and prints it: what Nemia, who operates
                 the factory, is to know of it, read by her and told to no step. NEMIA.md in its first
                 folder — the first --repo it was filed with — unless its file names another path there
                 (--path <path>, relative, never climbing out), or the store (--store), in
                 factories/<name>/NEMIA.md beside its file. --clear goes back to NEMIA.md.
  nemia factory instruct writes the instruction the store keeps (--file <path>, - for stdin), or removes it
                 (--clear): only while the factory keeps its instruction in the store. A file in a
                 folder is edited there.
  nemia factory revisions says whether the factory's runs follow merged revisions, as a Pod's imagePullPolicy says
                 whether a container takes a newer image. follow (Always): every new filing of a run — a step,
                 a retry, a round — is filed on the workflow, agents, skills and rules as the files hold them
                 then; what was filed is not run again, and no step is added or removed. pinned
                 (IfNotPresent), the default: a run keeps what it resolved at its first filing until nemia
                 refresh <run>. Written into the factory's file, or into its tree's factory.json for a factory
                 made from a template, whose nemia.yaml says it as spec.revisions; read by every pass after, so
                 a run in flight takes it at its next filing.
  nemia factory trust trusts a factory's places again, as nemia factory add does: for a factory filed before
                 places were trusted, one filed with --no-trust, or a trust taken back since.
  nemia factory rm  removes a factory's file, one that does not read included, then the instruction and the
                 rules the store keeps for it. A trust given to its places is left: its line said how to
                 take it back.

nemia start --factory <name> starts a run in a factory, of a workflow attached to it: each step its hires fill runs
as its agent, and the start is refused while a step names no agent and is hired none, or names its own agent
and is hired one too. Every run is started in a factory: with no --factory, in the one whose repository holds
--repo or the directory nemia start is typed in, and refused where none or two do; a card names its own, by its
factory: line or --factory. The default factory holds the history of runs and cards that named none, and an
agent's try; no start names it.

Refused by name, and nothing written: a name that is not a slug, the name default, an add with no --repo or
with a --repo that is neither a directory nor a git URL Nemia clones, an add of a name already filed, an rm, trust,
attach, detach, hire or fire of a
name with no factory, rules or an instruction of the default factory, rules that are blank or open with a
frontmatter block, two of --path, --store and --clear, a --path
that is empty, absolute or climbs out of the folder, an instruct of an instruction kept in a folder or of blank
words, a workflow's name that is empty, hidden, holds a slash or is agents or skills, a detach
of a workflow not attached, still hired into, scheduled or given a cost line, a schedule of a workflow not attached, of a cron or a zone
that does not read, or with an empty brief, an unschedule of a workflow not scheduled, a --step that is not <workflow>/<step>, a hire into a workflow
not attached or into a step whose file names its own agent:, and a fire of a step with no hire. A start in a factory of a workflow it has not attached is
refused, naming the attach.`;

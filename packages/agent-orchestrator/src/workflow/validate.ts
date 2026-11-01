/**
 * The steps of a folder checked together: `validate` refuses what no one step file shows — a step that waits on one not there, steps that
 * wait on each other, a workspace, a mode or a loop the team cannot run — and `orderSteps`, `upstreamOf`, `fansOut` and `terminalSteps`
 * read the graph the `after` edges draw.
 */
import { endsOnBase, LOOP_REPLIES, stepPlace, type Workflow, WorkflowError } from '../step/step.ts';
import { isRemoteHarness } from '../harness/harness.ts';
import { contextText, sessionContext } from '../keys/index.ts';
import { LINE_NAME } from '../workspace/workspace.ts';

/**
 * Whether a team works in folders the run makes, with no git repository (`place: folder`): every step says it, or none does
 * (`validate`).
 */
export const isFolderTeam = (steps: readonly Pick<Workflow, 'place'>[]): boolean =>
  steps.length > 0 && steps.every((s) => stepPlace(s) === 'folder');

/** What `after` reads of a step: its name, and the names of the steps it waits on. */
type Waits = { readonly name: string; readonly after: readonly string[] };

/** Why `s` cannot wait as its `after:` says among the steps named `names` — a name no step has, or its own — or undefined where it can. */
const waitRefusal = (s: Waits, names: ReadonlySet<string>): string | undefined => {
  for (const a of s.after) {
    if (!names.has(a)) return `${s.name}: waits on "${a}", which is not a step here`;
    if (a === s.name) return `${s.name}: waits on itself`;
  }
  return undefined;
};

/**
 * Why the steps do not wait as their `after:` lines say: the first step that waits on a name no step has, or on itself, or undefined
 * where each waits on others of them. One rule, read by `validate` and by the model's `Workflow` (`folder/folder.model.ts`).
 */
export function afterRefusal(steps: readonly Waits[]): string | undefined {
  const names = new Set(steps.map((s) => s.name));
  for (const s of steps) {
    const refused = waitRefusal(s, names);
    if (refused !== undefined) return refused;
  }
  return undefined;
}

/**
 * Why the steps wait on each other, naming them, or undefined where none does: some are left once every step that waits on nothing left
 * is taken away. One rule, read by `validate` and by the model's `Workflow`.
 */
export function cycleRefusal(steps: readonly Waits[]): string | undefined {
  const pending = new Map(steps.map((s) => [s.name, new Set(s.after)]));
  for (let moved = true; moved;) {
    moved = false;
    for (const [name, deps] of pending) {
      if (deps.size === 0) {
        pending.delete(name);
        for (const other of pending.values()) other.delete(name);
        moved = true;
      }
    }
  }
  return pending.size ? `these steps wait on each other: ${[...pending.keys()].sort().join(', ')}` : undefined;
}

/**
 * The ways a folder of markdown is not a workflow: a step waits on one that does not exist, the steps
 * wait on each other, or a step reads the output of one that has not finished or declares none. All
 * are caught here, before anything is spent.
 *
 * A step reads an `input:` it waits on through `after:` or through `resume:`, which the parser adds to `after`. A step resumes a session
 * on the harness that made it, never another, and in the one window of its session's whole chain (`sessionContext`). The steps wait on
 * each other when some are left once every step that waits on nothing left is taken away.
 */
export function validate(steps: readonly Workflow[]): void {
  const names = new Set(steps.map((s) => s.name));
  for (const s of steps) {
    const waits = waitRefusal(s, names);
    if (waits !== undefined) throw new WorkflowError(waits);
    for (const from of s.input ?? []) {
      const producer = steps.find((x) => x.name === from);
      if (!producer)
        throw new WorkflowError(`${s.name}: \`input: ${from}\` names a step that is not here. Correct the name, or delete the line.`);
      if (!upstreamOf(steps, s.name).has(from) && s.resume !== from) {
        throw new WorkflowError(
          `${s.name}: \`input: ${from}\`, but ${s.name} does not wait on ${from}, directly or through the steps between — a step cannot read the product of work that has not finished. Add ${from} to \`after:\`, or delete the line.`,
        );
      }
      if (!producer.output) {
        throw new WorkflowError(
          `${s.name}: \`input: ${from}\`, but ${from} declares no \`output:\`, so nothing of its closeout travels — its summary goes to the person who decides, never to a step. Give ${from}.md an \`output:\` schema, or delete the line.`,
        );
      }
    }
    if (s.resume) {
      const target = steps.find((x) => x.name === s.resume);
      if (!target) throw new WorkflowError(`${s.name}: resumes "${s.resume}", which is not a step here`);
      if ((target.harness ?? 'claude') !== (s.harness ?? 'claude')) {
        throw new WorkflowError(`${s.name}: resumes ${target.name}, which runs on a different harness (${target.harness ?? 'claude'})`);
      }
      const window = sessionContext(target, steps);
      if (s.context !== undefined && s.context !== window) {
        throw new WorkflowError(
          `${s.name}: \`context: ${contextText(s.context)}\`, and it continues ${target.name}'s session, which runs on ${window === undefined ? "the model's whole window" : `\`context: ${contextText(window)}\``}. A session keeps one window: delete the line, and ${s.name} continues on ${target.name}'s${window === undefined ? '' : `, or give ${target.name} the window you meant for both`}.`,
        );
      }
    }
  }

  validateFolder(steps);
  validateBaseWorkspace(steps);
  validateSlot(steps);

  const cycle = cycleRefusal(steps);
  if (cycle !== undefined) throw new WorkflowError(cycle);

  validateLoops(steps);
}

/**
 * Why nobody may file an ending's `check:`: it has no `gate: true`, so no approval starts it, and it waits on no step with a `loop:`,
 * so no pass of a step that could send the work back routes it either. Undefined where one of the two holds.
 *
 * A `check:` there is the run's own: it runs the command on the merge the step staged and commits that merge onto the base branch on its
 * word (`landingDue`). Nothing may start that but a person's approval, or the pass of a step the ending waits on that can send the work
 * back — a review, which judges the work and files another round instead where it should not land. An ending with neither would land
 * whatever its session staged on nobody's word. The rule reads two steps, the ending and what it waits on, which is why it is here and
 * not in `workspaceOf`, given one step's keys.
 */
function unfilableCheck(steps: readonly Workflow[], s: Workflow): string | undefined {
  if (s.check === undefined || s.gate === true) return undefined;
  if (s.after.some((name) => steps.some((x) => x.name === name && x.loop))) return undefined;
  const waits = s.after.length ? `no step with a \`loop:\` (it waits on ${s.after.join(', ')})` : 'nothing';
  const before = s.after.length === 1 ? s.after[0] : 'the step before it';
  return (
    `, and \`check: ${s.check}\` is a command the run executes there on the merge the step leaves staged, committing it onto the base` +
    ` branch when it passes — which is nobody's to start unless a person approves it or a step that can send the work back has passed,` +
    ` and this step has no \`gate: true\` and waits on ${waits}. Add \`gate: true\`, give ${before} a \`loop:\` so that its pass files the` +
    ` landing, or delete the \`check:\` line.`
  );
}

/**
 * The ways a step cannot run in the repository's own checkout (`workspace: base`): it is not the workflow's last step, or its `check:`
 * is nobody's to file (`unfilableCheck`).
 *
 * The checkout is where a person's work is, and it is one directory, on the base branch. A step after this one would start from a
 * checkout this one has changed, and a step running beside it would share that directory — the arrangement worktrees exist to prevent.
 * So a workflow has one such step, at its end, and it is refused here rather than at the moment two sessions collide.
 */
function validateBaseWorkspace(steps: readonly Workflow[]): void {
  for (const s of steps.filter((x) => endsOnBase(x))) {
    const named = `${s.name}: \`workspace: base\` runs the step in the repository's own checkout`;
    const waiting = steps.filter((x) => x.after.includes(s.name)).map((x) => x.name);
    if (waiting.length) {
      throw new WorkflowError(
        `${named}, and ${waiting.join(', ')} ${waiting.length > 1 ? 'wait' : 'waits'} on it — each would start from a checkout this step has changed, and none of them is where the run's work is. It is a workflow's last step: nothing may wait on it. Move ${waiting.join(', ')} before ${s.name}, or delete the line.`,
      );
    }
    const beside = steps.filter((x) => x.name !== s.name && !steps.some((other) => other.after.includes(x.name))).map((x) => x.name);
    if (beside.length) {
      throw new WorkflowError(
        `${named}, and ${beside.join(', ')} ${beside.length > 1 ? 'end' : 'ends'} the workflow beside it, so both could be working in that one directory at once. A run has one ending: make ${s.name} wait on ${beside.join(', ')}, or delete the line.`,
      );
    }
    const unfilable = unfilableCheck(steps, s);
    if (unfilable) throw new WorkflowError(`${named}${unfilable}`);
  }
}

/**
 * The one way a team cannot work in folders (`place: folder`): some of its steps do not say so.
 *
 * A run is of one kind — a repository run, whose steps work on branches of one repository, or a folder run, which needs no repository — and
 * the kind is the run's, frozen on its record at start (`place`). A loaded step always says its place (`placeRequired`), and one frozen
 * before the key reads as git (`stepPlace`), so a team that says `place: folder` on some steps and not on others would be both. Refused,
 * rather than one of the two guessed.
 */
function validateFolder(steps: readonly Workflow[]): void {
  const folder = steps.filter((s) => stepPlace(s) === 'folder').map((s) => s.name);
  const not = steps.filter((s) => stepPlace(s) !== 'folder').map((s) => s.name);
  if (!folder.length || !not.length) return;
  throw new WorkflowError(
    `${folder.join(', ')} ${folder.length > 1 ? 'say' : 'says'} \`place: folder\`, and ${not.join(', ')} ${not.length > 1 ? 'work' : 'works'} on a repository, as \`place: git\` — every step of a team says \`place: folder\`, or none does.` +
      ` A run works in folders it makes, with no git repository, or on branches of one: it cannot do both. Write \`place: folder\` on ${not.join(', ')}, or \`place: git\` on ${folder.join(', ')}.`,
  );
}

/**
 * The one way a run cannot take no run slot (`slot: none`): its workflow has another step.
 *
 * The cap on runs in flight holds the work this machine does at once. A run outside it is a session that watches the runs inside it —
 * one step, which is how a reader tells the two apart at a glance, and how the machinery does. The line on one step of a workflow of
 * work would take the whole run out of the cap, since a slot is a run's and not a step's, so it is refused here rather than let the
 * run's other steps past the cap with nothing said.
 */
function validateSlot(steps: readonly Workflow[]): void {
  const watcher = steps.find((s) => s.slot === 'none');
  const beside = steps.filter((s) => s !== watcher).map((s) => s.name);
  if (!watcher || !beside.length) return;
  throw new WorkflowError(
    `${watcher.name}: \`slot: none\` takes this step's whole RUN out of the cap on runs in flight (WF_MAX_RUNS), and this workflow has ${beside.join(', ')} beside it` +
      ` — a slot is a run's, not a step's, so ${beside.join(', ')} would run outside the cap too. A run that takes no slot is one step: a session that watches the other runs.` +
      ` Delete the line, or give ${watcher.name} a folder of its own.`,
  );
}

/**
 * The steps in the order they run: every step after each step its `after` names, and otherwise in the order they are given — by name,
 * for the steps `loadWorkflows` reads, since a folder lists them so. `resume:` is in `after` already, and `loop:` is the edge back, which
 * orders nothing. Pure.
 *
 * What a run's steps are listed in. In the folder's order, alphabetical, `nemia start`, `nemia ls`, `nemia decide` and the board read a
 * `plan → implement ⇄ review` workflow as implement, plan, review. The order given breaks a tie, not the name, so a workflow frozen in an
 * order that already runs forward reads as it was frozen: the board lists a run's steps in its record's order, and holds that to `list`'s.
 * It ends on any input, because a record read back is not validated again: an `after` naming a step that is not here orders nothing, and
 * steps that wait on each other go last, as given, rather than nowhere.
 */
export function orderSteps<S extends Pick<Workflow, 'name' | 'after'>>(steps: readonly S[]): S[] {
  const names = new Set(steps.map((s) => s.name));
  const order: S[] = [];
  const placed = new Set<string>();
  let pending = [...steps];
  for (;;) {
    const next = pending.find((s) => s.after.every((a) => placed.has(a) || !names.has(a)));
    if (!next) break;
    order.push(next);
    placed.add(next.name);
    pending = pending.filter((s) => s !== next);
  }
  return [...order, ...pending];
}

/** Every step `name` waits on, directly or through another. */
export function upstreamOf(steps: readonly Workflow[], name: string): Set<string> {
  const found = new Set<string>();
  const queue = [name];
  while (queue.length) {
    const at = queue.pop();
    const current = steps.find((s) => s.name === at);
    for (const a of current?.after ?? []) {
      if (!found.has(a)) {
        found.add(a);
        queue.push(a);
      }
    }
  }
  return found;
}

/**
 * The steps a round of `looping`'s loop files again, in the workflow's order: its target, every step between
 * the target and it, and itself. `[]` for a step with no `loop:`.
 */
export function loopSpan(steps: readonly Workflow[], looping: Workflow): string[] {
  const target = looping.loop;
  if (!target) return [];
  const up = upstreamOf(steps, looping.name);
  return steps
    .filter((s) => s.name === target || s.name === looping.name || (up.has(s.name) && upstreamOf(steps, s.name).has(target)))
    .map((s) => s.name);
}

/**
 * The ways a loop cannot run as a round: it names no earlier step, or a round could not file its steps again as
 * they were filed the first time.
 *
 * A round works in the workspaces the first one made. A step that inherits its predecessor's gets the target's
 * new commits by being there; one that forked or merged a worktree of its own was cut once, from the first
 * round's branch, and would review work that is not the change. So a loop's steps are a chain. A step in
 * one is a new session each round, so it cannot `resume:` another; a step in two would be re-filed by a round of
 * either; and a target's `output:` may not take the field the run adds to it. A target runs on a harness of ours: each round continues
 * it in the session it kept, and the run keeps none of a remote agent's.
 */
function validateLoops(steps: readonly Workflow[]): void {
  const spans = new Map<string, Workflow>();
  for (const s of steps) {
    const target = s.loop;
    if (!target) continue;
    const named = `${s.name}: \`loop: ${target}\``;
    if (target === s.name) {
      throw new WorkflowError(
        `${named} names this step. A loop runs an earlier step again, then every step between it and this one, then this one: name the step this one reviews, which it waits on through \`after\`.`,
      );
    }
    const producer = steps.find((x) => x.name === target);
    if (!producer) throw new WorkflowError(`${named} names a step that is not here. Correct the name, or delete the line.`);
    if (isRemoteHarness(producer.harness)) {
      throw new WorkflowError(
        `${named}, and ${target} runs on \`harness: ${producer.harness}\`, a remote A2A agent: a loop's target is continued each round in the session it kept, and the run keeps none of a remote agent's. Loop back to a step on a harness of ours, or delete the line.`,
      );
    }
    if (!upstreamOf(steps, s.name).has(target)) {
      throw new WorkflowError(
        `${named}, but ${s.name} does not wait on ${target}, directly or through the steps between — a loop runs again work that finished before this step. Add ${target} to \`after:\`, or name a step ${s.name} waits on.`,
      );
    }
    if (producer.output && Object.hasOwn(producer.output.schema.properties, LOOP_REPLIES)) {
      throw new WorkflowError(
        `${target}: \`output: ${producer.output.file}\` declares \`${LOOP_REPLIES}\`, and ${s.name} loops back to ${target} (\`loop: ${target}\`), so the run adds \`${LOOP_REPLIES}\` to its closeout: its answer to each finding. Rename the field.`,
      );
    }

    const span = loopSpan(steps, s);
    for (const name of span) {
      const other = spans.get(name);
      if (other) {
        throw new WorkflowError(
          `${name} is in two loops: ${other.name}'s (\`loop: ${other.loop}\`) and ${s.name}'s (\`loop: ${target}\`). A round of either would file it again under the other. Give it one loop: make one loop's steps end before the other's begin.`,
        );
      }
      spans.set(name, s);
      if (name === target) continue;
      const step = steps.find((x) => x.name === name);
      if (step === undefined) continue;
      if (step.resume) {
        throw new WorkflowError(
          `${name}: \`resume: ${step.resume}\`, and ${name} is in ${s.name}'s loop (\`loop: ${target}\`), which files it as a new session each round — so it cannot continue another. Delete the line: only the loop's first step, ${target}, is continued, and the run does that itself.`,
        );
      }
      const [from] = step.after;
      const siblings = steps.filter((x) => from !== undefined && x.after.includes(from)).map((x) => x.name);
      if (step.after.length !== 1 || siblings.length !== 1) {
        const why =
          step.after.length > 1
            ? `it waits on ${step.after.join(' and ')}, so it merges their branches into a worktree of its own`
            : `${siblings.filter((x) => x !== name).join(' and ')} ${siblings.length > 2 ? 'wait' : 'waits'} on ${from} too, so ${name} forks a worktree of its own`;
        throw new WorkflowError(
          `${named} files ${span.filter((x) => x !== target).join(', then ')} again after ${target} each round, in the workspace ${target} works in, and ${name} does not work there: ${why}, cut once, which would not have the next round's work. A loop's steps are a chain — each waits on the one before it, and nothing else does. Move what runs beside them after ${s.name}.`,
        );
      }
    }
  }
}

/**
 * Could two steps of this workflow ever run at the same time?
 *
 * True when there is more than one starting point, or when any step is followed by more than one.
 * `nemia start` refuses `--no-worktree` on a workflow that fans out: without isolation those steps would
 * share a directory, which is the arrangement the whole worktree design exists to prevent.
 */
export function fansOut(steps: readonly Workflow[]): boolean {
  const roots = steps.filter((s) => s.after.length === 0);
  if (roots.length > 1) return true;
  return steps.some((s) => steps.filter((x) => x.after.includes(s.name)).length > 1);
}

/**
 * The steps nothing waits on — where a run's work ends up.
 *
 * A run that succeeded is useless if nobody can find what it produced, so this is what `nemia ls`
 * reports as the result. Usually one step; several when a workflow deliberately ends wide.
 */
export function terminalSteps(steps: readonly Workflow[]): Workflow[] {
  return steps.filter((s) => !steps.some((other) => other.after.includes(s.name)));
}

/**
 * Why a folder's steps are no step set to run, with the fix, or undefined where they are one.
 *
 * Structural, and about the set alone, so it is pure and can be asked of a folder nobody is starting: a step named `run` (`LINE_NAME`),
 * the name a run's own line of work is cut under, whose cut and the run's would claim one branch; a step named for another step's
 * check (`<name>-check`) or try (`<name>-try<N>`, `<name>-try<N>-check`), whose tasks a run files under those names and would read one as
 * the other; and, where the run's steps work in place (`isolate: false`), a team that says `place: folder`, which has no base branch to
 * work on, one that can run two steps at once (`fansOut`), which would share a directory, and an ending (`workspace: base`), which would
 * merge a result branch the run does not have.
 *
 * Asked twice, of the same set: of the folder `nemia start` is given, which it refuses (`stepsToStart`), and of the folder a run that has
 * filed nothing takes again on a pass (`stepsNow`), which keeps the set it froze and says so. What is left to `nemia start` alone reads
 * more than the set — the place a skill resolves to, the engine's remote agents, the store's path, a harness's config — and refuses the
 * filing itself where a pass takes it.
 */
export function stepSetRefusal(steps: readonly Workflow[], isolate: boolean): string | undefined {
  if (!isolate && isFolderTeam(steps))
    return (
      `--no-worktree: this workflow's steps say \`place: folder\`, so each works in a folder the run makes, with no git repository — there is no base branch for them to work on in place.\n` +
      `Start it without --no-worktree.`
    );
  if (!isolate && fansOut(steps))
    return (
      'this workflow can run two steps at once, and --no-worktree would put them in the same directory.\n' +
      'Either drop --no-worktree, or make the steps a chain.'
    );
  const ending = !isolate ? steps.find((s) => endsOnBase(s)) : undefined;
  if (ending)
    return (
      `${ending.name}: \`workspace: base\` ends this workflow by merging the run's result branch onto the base branch, and --no-worktree gives the run no result branch — every step works on the base branch itself, where the work already is, so there would be nothing to merge.\n` +
      `Either drop --no-worktree, or start a workflow whose last step is not an ending.`
    );
  const line = steps.find((s) => s.name === LINE_NAME);
  if (line)
    return (
      `${LINE_NAME}: a step may not be named \`${LINE_NAME}\`. A run cuts its own line of work — one worktree and one branch per card — ` +
      `under that name (\`worktrees/<run>/${LINE_NAME}\`, on the run's branch of that name), so this step's cut and the run's ` +
      `would claim one branch. Rename ${LINE_NAME}.md.`
    );
  const clash = steps.find((s) => s.check && steps.some((other) => other.name === `${s.name}-check`));
  if (clash)
    return `${clash.name}-check: a step may not be named for another step's check. ${clash.name} has a \`check:\`, and the run files it as ${clash.name}-check. Rename ${clash.name}-check.md.`;
  const tryClash = steps
    .map((s) => ({ s, of: /^(.+)-try\d+(?:-check)?$/.exec(s.name)?.[1] }))
    .find(({ of }) => of && steps.some((other) => other.name === of));
  if (tryClash)
    return `${tryClash.s.name}: a step may not be named for another step's try. The run files ${tryClash.of} tried again as ${tryClash.of}-try2, its check as ${tryClash.of}-try2-check, and on. Rename ${tryClash.s.name}.md.`;
  return undefined;
}

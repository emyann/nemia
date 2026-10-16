/**
 * A step given a tool nothing its session gets allows: `unallowedRefusal`. Under a fence word that refuses a call no allow rule reaches
 * rather than asking a person about it (`FenceReach.refusing`), such a tool can never be called — the session is listed it and refused
 * it on every try, which no feed of warnings tells from a fence working as meant. So the contradiction is refused where the world the
 * session will get is known, before a session is paid for.
 *
 * Pure: the rules of the repository the run works in arrive as data (`projectAllows`, read through the client), and which words refuse
 * such a call and which tools run with no rule are the runtime's answers (`fenceReach`).
 */
import { AGENTS_FOLDER, type Workflow } from '../step/step.ts';
import { DEFAULT_HARNESS, isRemoteHarness } from '../harness/harness.ts';
import { toolOf } from './fence.ts';
import { fenceReach, type FenceReach } from 'agent-runtime/vocabulary';

/**
 * A step judged and found wanting: the tool nothing allows, the `tools:` line that gives it, the fence word the step runs in, and
 * whether the repository's own settings were among the rules it was judged against.
 */
type Unallowed = { readonly tool: string; readonly tools: readonly string[]; readonly word: string; readonly checkout: boolean };

/**
 * The fence word step `step` runs its sessions in on `reach` — its own, else the word a task naming none runs in — where that word
 * refuses what no allow rule reaches; `undefined` where it asks about such a call instead, or where the harness takes no rule at all.
 */
function refusingWord(step: Workflow, reach: FenceReach): string | undefined {
  if (reach.by !== 'mode') return undefined;
  const word = step.permissionMode ?? reach.given;
  return reach.refusing.includes(word) ? word : undefined;
}

/**
 * The first tool of step `step`'s `tools:` that nothing its session gets allows, with what it was judged against: the step's resolved
 * `allowedTools:` — its agent's, where the step writes none of its own — and `allows`, the rules the repository's own settings grant,
 * unless the step says `place: folder`, whose session works in a folder the run makes and gets none of them. A tool the harness runs
 * with no rule at all (`FenceReach.unfenced`) is allowed. `undefined` for a step with no `tools:` line, which is given every tool, for
 * one whose fence word asks rather than refuses, and for one on a remote agent, whose operator holds its fence.
 */
function unallowedIn(step: Workflow, allows: readonly string[]): Unallowed | undefined {
  const harness = step.harness ?? DEFAULT_HARNESS;
  const reach = isRemoteHarness(harness) ? undefined : fenceReach(harness);
  const word = reach === undefined ? undefined : refusingWord(step, reach);
  if (reach === undefined || word === undefined || step.tools === undefined) return undefined;
  const checkout = step.place !== 'folder';
  const rules = [...(step.allowedTools ?? []), ...(checkout ? allows : [])];
  const named = new Set(rules.map((rule) => toolOf(rule.trim())));
  const tool = step.tools.find((given) => !reach.unfenced.includes(given) && !named.has(given));
  return tool === undefined ? undefined : { tool, tools: step.tools, word, checkout };
}

/** Where step `step`'s fence is written: its agent's file, or `undefined` for a step that is its own fence. */
const fenceFile = (step: Workflow): string | undefined =>
  step.agent === undefined ? undefined : `${AGENTS_FOLDER}/${step.agent.name}.md`;

/** The allow lists the refusal says held no rule for the tool, in the order a session gets them. */
function lists(step: Workflow, found: Unallowed): string {
  const file = fenceFile(step);
  const own = file === undefined ? "not this step's `allowedTools:`" : `not ${file}'s \`allowedTools:\`, not this step's`;
  return found.checkout
    ? `${own}, and not the checkout's own settings`
    : `${own} — and a step that works in a folder the run makes has no checkout whose settings could allow it`;
}

/** Where the allow belongs, and what taking the tool off instead costs: an agent's file reaches every step of it, a step's line one. */
function fixes(step: Workflow, found: Unallowed): string {
  const file = fenceFile(step);
  const scoped = `\`allowedTools: ${found.tool}\`, or narrowed to what it needs, \`${found.tool}(…)\``;
  const where =
    file === undefined
      ? `on this step — ${scoped}`
      : `in ${file}, where every step of ${step.agent?.name} gets it — ${scoped} — or on this step alone`;
  return `Allow it ${where}, or take \`${found.tool}\` off \`tools:\`, so the session is not given what it cannot call.`;
}

/**
 * Why step `step` is given the tool `found.tool` it can never call, in words that name the step, the tool, the word it runs in, where
 * its fence is written and the fixes; `untrusted` is appended where it says something.
 */
const said = (step: Workflow, found: Unallowed, untrusted: string | undefined): string =>
  `${step.name}: \`tools: ${found.tools.join(', ')}\` gives its session \`${found.tool}\`, and it runs in \`${found.word}\`, in which a ` +
  `call no allow rule reaches is refused and never asked about: nothing its session gets allows \`${found.tool}\` — ` +
  `${lists(step, found)}. Every call of it would be refused, looking in the feed like a fence doing its job. ${fixes(step, found)}` +
  (untrusted === undefined ? '' : ` ${untrusted}`);

/**
 * Why the first step of `steps` is given a tool nothing its session gets allows, or `undefined` when every step's tools are callable.
 * `allows` are the allow rules the repository the run works in grants a session started there (`projectAllows`), counted whatever the
 * harness's trust of that directory: the rules were measured to reach a step's session here, and gating on the trust would refuse
 * steps that work.
 *
 * @param untrusted Asked only once a tool is found: a sentence naming the trust of the run's repository as a second thing to check,
 *   where the harness does not have it (`untrustedNote`), and `undefined` where there is nothing to say. A thunk, so the refusing road
 *   alone reads the harness's own file.
 */
export function unallowedRefusal(
  steps: readonly Workflow[],
  allows: readonly string[],
  untrusted: () => string | undefined = () => undefined,
): string | undefined {
  for (const step of steps) {
    const found = unallowedIn(step, allows);
    if (found !== undefined) return said(step, found, untrusted());
  }
  return undefined;
}

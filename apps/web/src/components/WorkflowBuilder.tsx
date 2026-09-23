import { useCallback, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Background, BackgroundVariant, MarkerType, Position, ReactFlow, type Connection } from '@xyflow/react';
import {
  BuildRefusal,
  keyFormQuery,
  saveWorkflow,
  workflowsQuery,
  type WorkflowListing,
  type WorkflowSaved,
} from '../lib/api';
import {
  addStep,
  connect,
  disconnect,
  draftGraph,
  draftOf,
  listedWith,
  nameRefusal,
  orderOf,
  placesOf,
  schemasOf,
  toPut,
  unsaved,
  unsavedSteps,
  type DraftStep,
} from '../lib/builder';
import { edgeStroke, LOOP_SOURCE, LOOP_TARGET } from '../lib/canvas';
import { extentOf } from '../lib/layout';
import { BuilderEdge, type BuilderFlowEdge } from './BuilderEdge';
import { StepForm, type DraftUpdate } from './StepForm';
import { SpecNode, type SpecFlowNode } from './StepNode';

// Declared once: a new object per render makes React Flow warn and mount every node afresh.
const nodeTypes = { spec: SpecNode };
const edgeTypes = { builder: BuilderEdge };

const FIT = { padding: 0.2, maxZoom: 1 };

/** Room under the lowest row for an edge drawn beneath it — a loop's, or one of steps that wait on each other — and its button. */
const UNDER_ROOM = 100;

const BUTTON =
  'rounded border border-neutral-300 px-2.5 py-1 text-sm font-medium hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:border-neutral-700 dark:hover:bg-neutral-900';
const PRIMARY =
  'rounded bg-neutral-900 px-3 py-1 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 dark:disabled:hover:bg-neutral-100';
const INPUT =
  'block w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:placeholder:text-neutral-500 dark:focus:border-neutral-400';

/**
 * A folder of yours, built on the board: its steps as blocks with handles, drawn left to right by `after`. Drag from a block's right-hand dot
 * to another's left-hand dot and that one waits on it; from the violet dot underneath, and the block runs the other again (`loop:`, with its
 * rounds). An edge's button takes its key away. A block is added with a name and what it is told, and a block clicked opens its form.
 *
 * Nothing is written until Save, which puts the whole folder with any schema pasted for an `output:` (`PUT /api/workflows/yours/:name`), at
 * the version the draft was read from. The api answers the folder read back from disk, which the draft starts again from; or the package's
 * refusal, shown above the canvas and on each step it names (`SaveRefused`); or, for a folder changed on disk since, a 409 with Read the folder
 * again. Changes not saved are marked on the card and on each step.
 */
export function WorkflowBuilder({ workflow, onClose }: { workflow: WorkflowListing; onClose: () => void }) {
  const queryClient = useQueryClient();
  const form = useQuery(keyFormQuery);
  // What the draft is compared with: the folder as the listing had it when the builder opened, and as the api read it back after each save.
  const [base, setBase] = useState(workflow);
  const [steps, setSteps] = useState<DraftStep[]>(() => draftOf(workflow));
  const [selected, setSelected] = useState<string | null>(workflow.steps[0]?.name ?? null);
  // A new form, with its fields as the draft has them, after a save or a discard.
  const [version, setVersion] = useState(0);
  const [adding, setAdding] = useState(false);
  const [refusal, setRefusal] = useState<BuildRefusal | null>(null);
  const [saved, setSaved] = useState<WorkflowSaved | null>(null);

  const update: DraftUpdate = useCallback((change) => {
    setSteps((all) => change(all));
    setSaved(null);
  }, []);

  /** The draft started again from `listing`, the folder as the api read it: after a save, or once the folder is read again. */
  const startFrom = (listing: WorkflowListing) => {
    setBase(listing);
    setSteps(draftOf(listing));
    setVersion((v) => v + 1);
  };

  // One write: the steps and the schemas pasted for them, judged together by the api before either is written, at the version the draft
  // was read from, so a folder changed on disk since is refused rather than written over.
  const save = useMutation({
    mutationFn: (draft: DraftStep[]) => saveWorkflow(base.name, { version: base.version, steps: toPut(draft), schemas: schemasOf(draft) }),
    onMutate: () => {
      setRefusal(null);
      setSaved(null);
    },
    onSuccess: (answer) => {
      startFrom(answer.workflow);
      setSaved(answer);
      queryClient.setQueryData(workflowsQuery.queryKey, (list) => listedWith(list, answer.workflow));
      void queryClient.invalidateQueries({ queryKey: workflowsQuery.queryKey, exact: true });
    },
    onError: (err) => {
      const refused = err instanceof BuildRefusal ? err : new BuildRefusal(err.message, []);
      setRefusal(refused);
      if (refused.steps[0]) setSelected(refused.steps[0]);
    },
  });

  // The folder read again after a save refused because it changed on disk: the draft starts from what it holds now, and what was drawn is
  // let go — the refusal said so. A folder gone, or one that no longer reads, has no builder: the card says why.
  const reread = useMutation({
    mutationFn: () => queryClient.fetchQuery({ ...workflowsQuery, staleTime: 0 }),
    onSuccess: (list) => {
      const now = list.find((w) => w.from === 'yours' && w.name === base.name);
      if (!now || now.error) return onClose();
      startFrom(now);
      setRefusal(null);
      setSaved(null);
    },
    // The read failed, and the save's answer still says what the folder may hold: its status is kept, so a 409's "nothing written" is not
    // turned into "it may have been written" by a read that wrote nothing either (`SaveRefused`).
    onError: (err) => setRefusal((was) => new BuildRefusal(`Could not read the folder again: ${err.message}`, [], was?.status ?? null)),
  });

  const dirty = unsaved(steps, base);
  const changedSteps = new Set(unsavedSteps(steps, base));
  const order = orderOf(steps);
  const { at, cycle } = placesOf(steps);
  const graph = draftGraph(steps);
  const refusedSteps = new Set(refusal?.steps ?? []);

  const nodes: SpecFlowNode[] = steps.map((step) => ({
    id: step.name,
    type: 'spec',
    position: at.get(step.name)!,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: {
      name: step.name,
      index: order.indexOf(step.name),
      spec: step.spec,
      build: { unsaved: changedSteps.has(step.name), refused: refusedSteps.has(step.name), selected: selected === step.name },
    },
    draggable: false,
    selectable: false,
  }));
  const edges: BuilderFlowEdge[] = graph.edges.map((edge) => {
    const loop = edge.kind === 'loop';
    const id = loop ? `loop:${edge.from}->${edge.to}` : `${edge.from}->${edge.to}`;
    return {
      id,
      source: edge.from,
      target: edge.to,
      type: 'builder',
      ...(loop ? { sourceHandle: LOOP_SOURCE, targetHandle: LOOP_TARGET } : {}),
      markerEnd: { type: MarkerType.ArrowClosed, color: edgeStroke('to-come', loop), width: 20, height: 20, markerUnits: 'userSpaceOnUse' },
      data: { loop, said: loop ? `${edge.from}'s loop back to ${edge.to}` : `the edge ${edge.from} → ${edge.to}`, remove: () => update((all) => disconnect(all, id)) },
      selectable: false,
      focusable: false,
    };
  });
  const height = Math.min(Math.max(extentOf(at).height + (cycle || graph.edges.some((e) => e.kind === 'loop') ? UNDER_ROOM : 0) + 60, 260), 460);
  const step = steps.find((s) => s.name === selected) ?? null;

  return (
    <section aria-label={`Builder of ${base.name}`} data-builder={base.name} className="space-y-3">
      <div role="toolbar" aria-label={`Build ${base.name}`} className="flex flex-wrap items-center gap-2">
        <span
          data-unsaved={dirty || undefined}
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            dirty ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
          }`}
        >
          {dirty ? 'Unsaved changes' : 'Saved'}
        </span>
        <button type="button" onClick={() => setAdding(true)} disabled={adding} className={BUTTON}>
          Add a step
        </button>
        <span className="flex-1" />
        <button
          type="button"
          disabled={!dirty || save.isPending}
          onClick={() => {
            setSteps(draftOf(base));
            setVersion((v) => v + 1);
            setRefusal(null);
          }}
          className={BUTTON}
        >
          Discard changes
        </button>
        <button type="button" onClick={onClose} className={BUTTON}>
          {dirty ? 'Discard and close' : 'Close'}
        </button>
        <button type="button" disabled={!dirty || save.isPending || !steps.length} onClick={() => save.mutate(steps)} className={PRIMARY}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>

      {refusal && <SaveRefused refusal={refusal} rereading={reread.isPending} onReread={() => reread.mutate()} />}
      {saved && !dirty && (
        <p data-saved className="text-xs text-neutral-500">
          Saved to <code className="font-mono break-all">{saved.workflow.dir}</code>: {fileLine(saved)}.
        </p>
      )}

      {adding && (
        <AddStep
          steps={steps}
          onAdd={(name, body) => {
            update((all) => addStep(all, name, body));
            setSelected(name);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div
          aria-label={`The steps of ${base.name}, to draw`}
          className="self-start overflow-hidden rounded border border-neutral-200 lg:sticky lg:top-4 dark:border-neutral-800"
          style={{ height }}
        >
          <ReactFlow
            // Fitted again whenever a step comes, goes or moves — an edge drawn moves the step it points at a column right — so every step
            // stays in the frame to draw from.
            key={steps.map((s) => `${s.name}@${at.get(s.name)!.x},${at.get(s.name)!.y}`).join('\n')}
            id={`builder-${base.name}`}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={false}
            nodesConnectable
            elementsSelectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            onConnect={(connection: Connection) => update((all) => connect(all, connection.source, connection.target, connection.sourceHandle === LOOP_SOURCE))}
            connectionRadius={30}
            onNodeClick={(_, node) => setSelected(node.id)}
            zoomOnScroll={false}
            zoomOnDoubleClick={false}
            preventScrolling={false}
            deleteKeyCode={null}
            colorMode="system"
            defaultMarkerColor={null}
            fitView
            fitViewOptions={FIT}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} />
          </ReactFlow>
        </div>

        <aside aria-label="Step" className="min-w-0 rounded border border-neutral-200 p-3 dark:border-neutral-800">
          {form.error ? (
            <p className="text-xs text-red-700 dark:text-red-400">Could not read the keys a step may set: {form.error.message}</p>
          ) : !form.data ? (
            <p className="text-xs text-neutral-500">Reading the keys a step may set…</p>
          ) : step ? (
            <StepForm
              key={`${step.name}:${version}`}
              step={step}
              steps={steps}
              form={form.data}
              schemas={base.schemas}
              refused={refusal?.steps.includes(step.name) ? refusal.message : null}
              update={update}
              onRemoved={() => setSelected(null)}
            />
          ) : (
            <p className="text-xs text-neutral-500">
              Click a step to set its keys. Drag from a step&apos;s right-hand dot to another&apos;s left-hand dot to have it wait; from the violet dot
              underneath, to loop back.
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}

/**
 * What a save that did not go through says, by what the api answered.
 *
 * A 4xx is the api's judgement of the request — the package's refusal, a body it will not read, a folder changed since (409) — and it writes
 * nothing, so the banner says so. Anything else leaves what the folder holds unknown: a 500 is a write that broke off partway, and an answer
 * with no status of its own may have been carried out all the same — a fetch that never landed, or one the api answered without what it wrote
 * (`build` in lib/api/builder.ts), which is why the words for it are what the api did not say rather than that it said nothing. None of them says
 * nothing was written, and each offers to read the folder again, as a 409 does — the one way back to what is on disk, since the draft is a
 * folder read at a version the api no longer has.
 */
export function SaveRefused({ refusal, rereading, onReread }: { refusal: BuildRefusal; rereading: boolean; onReread: () => void }) {
  const nothingWritten = refusal.status !== null && refusal.status < 500;
  return (
    <div data-refused className="space-y-1 rounded border border-red-300 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40">
      <p className="text-sm font-medium text-red-800 dark:text-red-300">
        {nothingWritten ? (
          <>
            Not saved, and nothing written. The api refused it
            {refusal.steps.length > 0 && <>, for {refusal.steps.join(' and ')}</>}:
          </>
        ) : (
          <>
            Not saved. The folder may have been written all the same: {refusal.status === null ? 'the api did not say what it wrote' : `the api broke off (${refusal.status})`},
            and what the folder holds is what is on disk:
          </>
        )}
      </p>
      <p className="font-mono text-xs whitespace-pre-wrap break-words text-red-800 dark:text-red-300">{refusal.message}</p>
      {(!nothingWritten || refusal.status === 409) && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="button" disabled={rereading} onClick={onReread} className={BUTTON}>
            {rereading ? 'Reading…' : 'Read the folder again'}
          </button>
          <span className="text-xs text-red-800 dark:text-red-300">The changes drawn here are let go; copy what you need first.</span>
        </div>
      )}
    </div>
  );
}

/** What a save did to the folder's files, in a line: written, left as they were, removed. */
function fileLine({ written, kept, removed }: WorkflowSaved): string {
  const said = [
    written.length ? `wrote ${written.join(', ')}` : '',
    kept.length ? `left ${kept.join(', ')} as ${kept.length === 1 ? 'it was' : 'they were'}` : '',
    removed.length ? `removed ${removed.join(', ')}` : '',
  ].filter(Boolean);
  return said.join('; ') || 'nothing to change';
}

/** A block added: a name — its file's, without .md — and what it is told. */
function AddStep({ steps, onAdd, onCancel }: { steps: readonly DraftStep[]; onAdd: (name: string, body: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const nameId = useId();
  const bodyId = useId();
  const refused = name ? nameRefusal(steps, name) : null;

  return (
    <form
      aria-label="Add a step"
      className="space-y-2 rounded border border-dashed border-neutral-300 p-3 dark:border-neutral-700"
      onSubmit={(event) => {
        event.preventDefault();
        if (!nameRefusal(steps, name) && body.trim()) onAdd(name, body);
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <div className="space-y-1">
          <label htmlFor={nameId} className="block text-xs font-medium">
            Step name
          </label>
          <input id={nameId} value={name} onChange={(event) => setName(event.target.value)} placeholder="review" className={`${INPUT} font-mono`} />
          {refused && <p className="text-xs text-red-700 dark:text-red-400">{refused}</p>}
        </div>
        <div className="space-y-1">
          <label htmlFor={bodyId} className="block text-xs font-medium">
            What it is told
          </label>
          <textarea id={bodyId} value={body} rows={3} onChange={(event) => setBody(event.target.value)} className={`${INPUT} resize-y`} />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={Boolean(nameRefusal(steps, name)) || !body.trim()} className={PRIMARY}>
          Add
        </button>
        <button type="button" onClick={onCancel} className={BUTTON}>
          Cancel
        </button>
      </div>
    </form>
  );
}

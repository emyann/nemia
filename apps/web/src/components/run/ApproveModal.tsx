import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { XIcon } from 'lucide-react';
import { IconButton, ModalDialog, Title } from '@/components/ui/ds';
import { CutFrame, CutPress, type FrameHue } from '@/components/look';
import { agentsQuery } from '@/lib/api/agents';
import { CUT_MODAL } from '@/lib/classes';
import { useRunRead } from '@/lib/runView';
import { WAIT_ACTIONS } from '@/lib/words';
import type { WaitAction as Action } from '../../../contracts/wait-action.contract.ts';
import { Answered } from '../gate/Ask';
import { StepPart } from '../step/part/StepPart';
import { Unread } from '../step/StepBar';

/**
 * The modal's one frame, the look's cut frame in `hue` at the part's width at M: the title `said` and its close on one row at its top,
 * then `children`, which scroll inside the frame under that row when they are taller than the window, the frame's one-pixel edge
 * kept inside the kit's 16 pixels from each edge of the window.
 */
function Framed({ hue, said, onClose, children }: { hue: FrameHue; said: string; onClose: () => void; children: ReactNode }) {
  return (
    <CutFrame hue={hue} size={24} className="w-[416px] max-w-full">
      <div data-approve-modal className="flex max-h-[calc(100dvh-2rem-2px)] flex-col">
        <div className="flex shrink-0 items-center justify-between gap-4 pt-3 pr-4 pl-4">
          <Title size="medium" component="h2" className="m-0">
            {said}
          </Title>
          <IconButton variant="standard" size="xsmall" icon={XIcon} aria-label="Close" onPress={onClose} className="shrink-0" />
        </div>
        <div className="min-h-0 overflow-y-auto">{children}</div>
      </div>
    </CutFrame>
  );
}

/**
 * The run `run` read once the modal opens, and the agents: the step's part at M, which holds the gate's own approve and send back, or
 * the step's questions and its answer, as the run's page offers them, its body drawn in the modal's one frame, in the step's hue, under
 * the title `said` and its close.
 */
function Opened({ run, step, said, onClose }: { run: string; step: string; said: string; onClose: () => void }) {
  const { view, error } = useRunRead(run);
  const agents = useQuery(agentsQuery);
  if (!view)
    return (
      <Framed hue="none" said={said} onClose={onClose}>
        <Unread id={run} error={error} />
      </Framed>
    );
  return (
    <StepPart
      view={view}
      step={step}
      size="M"
      agents={agents.data}
      frame={(body, hue) => (
        <Framed hue={hue} said={said} onClose={onClose}>
          {body}
        </Framed>
      )}
    />
  );
}

/**
 * A waiting card's button, `action`: its verb alone on its face, Approve or Answer, whatever the step's name, and the verb with the step
 * as its name and its hover (`WAIT_ACTIONS`); and the modal it opens, named so too: the step's part at M, as the run's page draws it.
 * At an approval's gate, the closeout it asks to approve, its questions, budgets, round and checks, ending in Approve and Send back, both
 * the gate's own; at a step that waits on an answer, what it needs, its questions and the answer that asks its next try. The part's own
 * cut frame is the modal's one frame, the title and its close inside it: the kit's dialog draws no surface of its own around it, and
 * keeps the scrim, the focus trap and Escape. The modal closes once the api has taken the answer (`Answered`).
 * @param props.run The run's id.
 * @param props.action What the button does, and the name of the step that waits.
 */
export function WaitAction({ run, action }: { run: { id: string }; action: Action }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const { face, named } = WAIT_ACTIONS[action.verb];
  const said = named(action.step);
  const marked = action.verb === 'approve' ? { 'data-approve': action.step } : { 'data-answer': action.step };
  return (
    <>
      <span title={said} className="inline-flex">
        <CutPress {...marked} aria-label={said} onPress={() => setOpen(true)}>
          {face}
        </CutPress>
      </span>
      <ModalDialog
        isOpen={open}
        onClose={close}
        title={said}
        className={CUT_MODAL}
      >
        {open && (
          <Answered.Provider value={close}>
            <Opened run={run.id} step={action.step} said={said} onClose={close} />
          </Answered.Provider>
        )}
      </ModalDialog>
    </>
  );
}

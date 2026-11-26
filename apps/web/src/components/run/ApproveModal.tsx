import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { XIcon } from 'lucide-react';
import { IconButton, ModalDialog, Title } from '@/components/ui/ds';
import { CutFrame, CutPress, type FrameHue } from '@/components/look';
import { agentsQuery } from '@/lib/api/agents';
import { useRunRead } from '@/lib/runView';
import { approves } from '@/lib/words';
import { GateAnswered } from '../gate/Gate';
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
 * The run `run` read once the modal opens, and the agents: the step's part at M, which holds the gate's own approve and send back, its
 * body drawn in the modal's one frame, in the step's hue, under the title `said` and its close.
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
 * A waiting card's button at an approval's gate, `Approve <step>`, and the modal it opens: the step's part at M, as the run's page draws
 * it, with the closeout it asks to approve, its questions, budgets, round and checks, ending in Approve and Send back, both the gate's
 * own. The part's own cut frame is the modal's one frame, the title and its close inside it: the kit's dialog draws no surface of its
 * own around it, and keeps the scrim, the focus trap and Escape. The modal closes once the api has taken either answer
 * (`GateAnswered`).
 * @param props.run The run's id.
 * @param props.step The name of the step that waits at its approval's gate.
 */
export function ApproveAction({ run, step }: { run: { id: string }; step: string }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const said = approves(step);
  return (
    <>
      <CutPress data-approve={step} onPress={() => setOpen(true)}>
        {said}
      </CutPress>
      <ModalDialog
        isOpen={open}
        onClose={close}
        title={said}
        className="max-h-[calc(100dvh-2rem)] w-fit max-w-[calc(100vw-2rem)] min-w-0 overflow-visible rounded-none bg-transparent p-0 shadow-none"
      >
        {open && (
          <GateAnswered.Provider value={close}>
            <Opened run={run.id} step={step} said={said} onClose={close} />
          </GateAnswered.Provider>
        )}
      </ModalDialog>
    </>
  );
}

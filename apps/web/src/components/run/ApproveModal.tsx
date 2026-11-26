import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { XIcon } from 'lucide-react';
import { IconButton, ModalDialog } from '@/components/ui/ds';
import { CutPress } from '@/components/look';
import { agentsQuery } from '@/lib/api/agents';
import { useRunRead } from '@/lib/runView';
import { approves } from '@/lib/words';
import { GateAnswered } from '../gate/Gate';
import { StepPart } from '../step/part/StepPart';
import { Unread } from '../step/StepBar';

/**
 * The run `run` read once the modal opens, and the agents: the step's part at M, which holds the gate's own approve and send back.
 */
function Opened({ run, step }: { run: string; step: string }) {
  const { view, error } = useRunRead(run);
  const agents = useQuery(agentsQuery);
  if (!view) return <Unread id={run} error={error} />;
  return <StepPart view={view} step={step} size="M" agents={agents.data} />;
}

/**
 * A waiting card's button at an approval's gate, `Approve <step>`, and the modal it opens: the step's part at M, as the run's page draws
 * it, with the closeout it asks to approve, its questions, budgets, round and checks, ending in Approve and Send back, both the gate's
 * own. The modal closes once the api has taken either answer (`GateAnswered`).
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
        className="max-h-[calc(100dvh-2rem)] w-fit max-w-[calc(100vw-2rem)] overflow-y-auto p-3"
      >
        {open && (
          <GateAnswered.Provider value={close}>
            <div data-approve-modal className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-4 px-1">
                <h2 className="m-0 text-title-medium text-on-surface">{said}</h2>
                <IconButton variant="standard" size="xsmall" icon={XIcon} aria-label="Close" onPress={close} className="shrink-0" />
              </div>
              <Opened run={run.id} step={step} />
            </div>
          </GateAnswered.Provider>
        )}
      </ModalDialog>
    </>
  );
}

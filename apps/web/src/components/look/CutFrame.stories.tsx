import type { Meta, StoryObj } from '@storybook/react-vite';
import { Cell, Column, Row, Table, TableBody, TableHeader } from '@/components/ui/ds';
import { endedWords, sinceCreated, waitSentence } from '@/lib/runWords';
import { CopyId } from './CopyId';
import { CutFrame, FRAMED_BOX, FRAMED_END, FRAMED_ROW, FRAMED_TABLE } from './CutFrame';
import { RunSteps } from './RunSteps';
import { AT_WORK, CARD, GATE, ON_OTHER, ON_PLAIN, REFUSED } from './stories.fixtures';
import { TextLink } from './TextLink';

/** The look's cut-corner frame: in each hue and at each cut, on two grounds, with a link in its cut corner, and around a table. */
const meta: Meta = { title: 'Look/CutFrame' };
export default meta;

const WAITING = { steps: GATE, cancelledAt: null, holding: null, waiting: null, waitingOnYou: ['land'] };

/** A frame as wide as a card of the runs page, around `children`. */
const CARD_WIDE = { width: 400 };

/** Nothing, with a size: what a frame is drawn around where only its shape is read. */
const EMPTY = { width: 220, height: 96 };

/** A frame that waits on a person, cut 28: a card with its title link, what it waits for, its rail and its age. */
export const Yours: StoryObj = {
  render: () => (
    <div style={CARD_WIDE}>
      <CutFrame hue="yours">
        <div style={CARD}>
          <TextLink to="." search={{ read: 'review' } as never} data-card-link>
            The Tool errors panels show Bash apart
          </TextLink>
          <span>{waitSentence(WAITING)}</span>
          <RunSteps steps={GATE} cancelled={false} held={false} names />
          <span>{sinceCreated(27 * 60_000 + 40_000)}</span>
        </div>
      </CutFrame>
    </div>
  ),
};

/** A frame in the hue of a session at work. */
export const Alive: StoryObj = {
  render: () => (
    <div style={CARD_WIDE}>
      <CutFrame hue="alive">
        <div style={CARD}>
          <span>A run at work</span>
          <RunSteps steps={AT_WORK} cancelled={false} held={false} names />
        </div>
      </CutFrame>
    </div>
  ),
};

/** A quiet frame, in no hue, cut 24 as a table's is. */
export const Quiet: StoryObj = {
  render: () => (
    <div style={CARD_WIDE}>
      <CutFrame size={24}>
        <div style={CARD}>
          <span>
            {endedWords('undecided').word}: {endedWords('undecided').title}
          </span>
          <RunSteps steps={REFUSED} cancelled={false} held={false} />
        </div>
      </CutFrame>
    </div>
  ),
};

/** A quiet frame cut 12, the cut of a button. */
export const SmallCut: StoryObj = {
  render: () => (
    <div style={ON_PLAIN}>
      <CutFrame size={12}>
        <div style={EMPTY} />
      </CutFrame>
    </div>
  ),
};

/** A frame that waits on a person on the page's own ground: its glow follows its cut. */
export const OnThePage: StoryObj = {
  render: () => (
    <div data-ground="plain" style={ON_PLAIN}>
      <CutFrame hue="yours">
        <div style={EMPTY} />
      </CutFrame>
    </div>
  ),
};

/** A quiet frame on a ground unlike its own: that ground shows in both cut corners. */
export const OnAnotherGround: StoryObj = {
  render: () => (
    <div data-ground="other" style={ON_OTHER}>
      <CutFrame size={24}>
        <div style={EMPTY} />
      </CutFrame>
    </div>
  ),
};

/** A link in a frame's cut corner: with the keyboard on it, its ring is drawn whole over the cut. */
export const LinkInTheCutCorner: StoryObj = {
  render: () => (
    <div style={{ width: 360 }}>
      <CutFrame hue="yours">
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start', minHeight: 64 }}>
          <TextLink to="." search={{ read: 'corner' } as never} data-ring-probe>
            In the cut corner
          </TextLink>
        </div>
      </CutFrame>
    </div>
  ),
};

/** A table in the look's cut frame, as the runs page draws one: `rows` of an id and its copy control under a header, `name`d. */
function Framed({ name, rows, width }: { name: string; rows: readonly string[]; width: number }) {
  return (
    <div data-ground="other" data-framed={name} style={ON_OTHER}>
      <div style={{ width }}>
        <CutFrame size={24}>
          <div data-table-box className={`${FRAMED_BOX} ${FRAMED_END}`}>
            <Table aria-label={`A framed table: ${name}`} density="dense" className={FRAMED_TABLE} style={{ minWidth: 520 }}>
              <TableHeader>
                <Column id="run" isRowHeader>
                  Run
                </Column>
                <Column id="id" align="end">
                  Id
                </Column>
              </TableHeader>
              <TableBody>
                {rows.map((id) => (
                  <Row key={id} id={id} className={FRAMED_ROW}>
                    <Cell>{id}</Cell>
                    <Cell>
                      <CopyId id={id} short />
                    </Cell>
                  </Row>
                ))}
              </TableBody>
            </Table>
          </div>
        </CutFrame>
      </div>
    </div>
  );
}

/** A framed table with one row: no line under it, the frame's edge closes it. */
export const TableOfOneRow: StoryObj = { render: () => <Framed name="one" rows={['the-tool-errors-panels-2e13']} width={640} /> };

/** A framed table with several rows: a line under each but the last. */
export const TableOfSeveralRows: StoryObj = {
  render: () => (
    <Framed name="several" rows={['the-tool-errors-panels-2e13', 'lay-the-diamond-top-e2e4', 'a-table-in-a-cut-frame-liog']} width={640} />
  ),
};

/** A framed table narrower than its columns: it scrolls sideways, its bar past the bottom-left cut. */
export const TableNarrowerThanItsColumns: StoryObj = {
  render: () => <Framed name="narrow" rows={['the-tool-errors-panels-2e13', 'lay-the-diamond-top-e2e4']} width={390} />,
};

/** A frame in the hue of what failed: its edge in failure, and no glow. */
export const Failure: StoryObj = {
  render: () => (
    <div data-ground="plain" style={ON_PLAIN}>
      <CutFrame hue="failure">
        <div style={EMPTY} />
      </CutFrame>
    </div>
  ),
};

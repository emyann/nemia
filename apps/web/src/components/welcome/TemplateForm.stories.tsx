import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import type { Template } from 'objects';
import { BROKEN, oneBroken, SDLC, sent, TAKEN, templatesServed, writesRefused } from '../../../.storybook/fixtures/templates';
import { TemplateForm } from './TemplateForm';

/** What a story of the form draws: the templates offered, and what is told of a factory made. */
type Args = { templates: readonly Template[]; onMade: (name: string) => void };

/**
 * The template way's form: the templates Nemia builds in, what the chosen one gives, the parameters it asks open and the rest folded, and
 * a name. Its apply is answered by MSW
 * (`.storybook/fixtures/templates.ts`), which keeps what it was sent.
 */
const meta: Meta<Args> = {
  tags: ['network'],
  title: 'Pages/Template form',
  args: { templates: [SDLC], onMade: fn() },
  parameters: { msw: templatesServed },
  render: (args) => (
    <div style={{ width: 560 }}>
      <TemplateForm {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof meta>;

/** sdlc offered and chosen, what it gives said, and Make the factory waiting on a name. */
export const Offered: Story = {
  play: async ({ canvasElement }) => {
    const form = within(canvasElement);
    const offer = canvasElement.querySelector<HTMLElement>('[data-template-offer="sdlc"]')!;
    await expect(offer).toHaveAttribute('data-selected', 'true');
    await expect(within(offer).getByText(SDLC.spec.description!)).toBeVisible();
    await expect(form.getByText(SDLC.status.workflows.join(', '))).toBeVisible();
    await expect(form.getByText(SDLC.status.agents.join(', '))).toBeVisible();
    await expect(form.getByRole('button', { name: 'Make the factory' })).toBeDisabled();
  },
};

/**
 * A name typed and pressed, no parameter's field touched: sdlc applied by its name alone, no volume and no `sets`, so every parameter
 * keeps its default, and the factory told made.
 */
export const Made: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const form = within(canvasElement);
    sent.length = 0;
    await userEvent.type(form.getByRole('textbox', { name: /Name/ }), 'my-app');
    await userEvent.click(form.getByRole('button', { name: 'Make the factory' }));
    await waitFor(() => expect(args.onMade).toHaveBeenCalledWith('my-app'), { timeout: 5000 });
    await expect(sent).toEqual([{ route: 'POST /api/factories/my-app/apply', body: { template: { name: 'sdlc' } } }]);
  },
};

/** The apply refused: the api's words said as an alert, and the press offered again. */
export const Refused: Story = {
  parameters: { msw: writesRefused },
  play: async ({ args, canvasElement, userEvent }) => {
    const form = within(canvasElement);
    await userEvent.type(form.getByRole('textbox', { name: /Name/ }), 'my-app');
    await userEvent.click(form.getByRole('button', { name: 'Make the factory' }));
    await waitFor(() => expect(canvasElement.querySelector('[data-factory-refused]')).toHaveTextContent(TAKEN), { timeout: 5000 });
    await expect(canvasElement.querySelector('[data-factory-refused]')).toHaveAttribute('role', 'alert');
    await expect(form.getByRole('button', { name: 'Make the factory' })).toBeEnabled();
    await expect(args.onMade).not.toHaveBeenCalled();
  },
};

/** A template Nemia cannot read: offered disabled, its problem its line, sdlc still chosen. */
export const OneBroken: Story = {
  args: { templates: [SDLC, BROKEN] },
  parameters: { msw: oneBroken },
  play: async ({ canvasElement }) => {
    const broken = canvasElement.querySelector<HTMLElement>('[data-template-offer="broken"]')!;
    await expect(within(broken).getByRole('radio')).toBeDisabled();
    await expect(within(broken).getByText(BROKEN.status.problems![0])).toBeVisible();
    await expect(canvasElement.querySelector('[data-template-offer="sdlc"]')).toHaveAttribute('data-selected', 'true');
  },
};

/** sdlc's asked parameter drawn open, empty, with what it is for; the one a volume sets drawn nowhere; the rest folded away. */
export const Asked: Story = {
  play: async ({ canvasElement }) => {
    const asked = canvasElement.querySelector<HTMLElement>('[data-template-param="frontDoorLabel"]')!;
    await expect(asked).toBeVisible();
    await expect(within(asked).getByRole('textbox', { name: 'frontDoorLabel' })).toHaveValue('');
    await expect(within(asked).getByText(SDLC.spec.parameters.frontDoorLabel.description)).toBeVisible();
    await expect(canvasElement.querySelector('[data-template-param="github"]')).toBeNull();
    await expect(canvasElement.querySelector('[data-template-param="ciCheck"]')).toBeNull();
    await expect(within(canvasElement).getByRole('button', { name: 'More parameters' })).toHaveAttribute('aria-expanded', 'false');
  },
};

/** The asked label filled and a folded switch turned off: each sent as a `--set` word, in the order sdlc declares them. */
export const Filled: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const form = within(canvasElement);
    sent.length = 0;
    await userEvent.type(form.getByRole('textbox', { name: 'frontDoorLabel' }), 'route');
    await userEvent.click(form.getByRole('button', { name: 'More parameters' }));
    await userEvent.click(form.getByRole('switch', { name: /landingWaitsOnCi/ }));
    await userEvent.type(form.getByRole('textbox', { name: /Name/ }), 'my-app');
    await userEvent.click(form.getByRole('button', { name: 'Make the factory' }));
    await waitFor(() => expect(args.onMade).toHaveBeenCalledWith('my-app'), { timeout: 5000 });
    await expect(sent).toEqual([
      {
        route: 'POST /api/factories/my-app/apply',
        body: { template: { name: 'sdlc' }, sets: ['frontDoorLabel=route', 'landingWaitsOnCi=false'] },
      },
    ]);
  },
};

/** More parameters pressed: the folded fields drawn at their defaults; pressed again, taken away. */
export const MoreFolded: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const form = within(canvasElement);
    const more = form.getByRole('button', { name: 'More parameters' });
    await userEvent.click(more);
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await expect(form.getByRole('textbox', { name: 'ciCheck' })).toHaveValue('ci');
    await expect(form.getByRole('switch', { name: /landingWaitsOnCi/ })).toBeChecked();
    await userEvent.click(more);
    await waitFor(() => expect(canvasElement.querySelector('[data-template-param="ciCheck"]')).toBeNull());
  },
};

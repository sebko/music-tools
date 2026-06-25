import Badge from './Badge';

export default {
  title: 'Patterns/Badge',
  component: Badge,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['success', 'info', 'warning', 'accent'],
    },
    position: {
      control: 'select',
      options: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    },
  },
  decorators: [
    (Story) => (
      <div className="relative w-48 h-48 bg-background-secondary rounded-base border-2 border-border">
        <Story />
      </div>
    ),
  ],
};

export const Default = {
  args: { children: 'NEW' },
};

export const AllVariants = {
  render: () => (
    <div className="flex gap-6">
      {['success', 'info', 'warning', 'accent'].map((variant) => (
        <div key={variant} className="relative w-32 h-32 bg-background-secondary rounded-base border-2 border-border overflow-hidden">
          <Badge variant={variant} position="top-left">
            {variant.toUpperCase()}
          </Badge>
        </div>
      ))}
    </div>
  ),
  decorators: [],
};

export const AllPositions = {
  render: () => (
    <div className="relative w-48 h-48 bg-background-secondary rounded-base border-2 border-border">
      <Badge variant="info" position="top-left">TL</Badge>
      <Badge variant="success" position="top-right">TR</Badge>
      <Badge variant="accent" position="bottom-left">BL</Badge>
      <Badge variant="warning" position="bottom-right">BR</Badge>
    </div>
  ),
  decorators: [],
};

export const WithIcon = {
  args: { children: '✓', variant: 'success', position: 'bottom-right' },
};

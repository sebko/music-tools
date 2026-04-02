import Button from './Button';

export default {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'primary', 'secondary', 'destructive'],
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl'],
    },
    isLoading: { control: 'boolean' },
    isDisabled: { control: 'boolean' },
  },
};

export const Default = {
  args: { children: 'Button' },
};

export const Primary = {
  args: { children: 'Primary', variant: 'primary' },
};

export const Secondary = {
  args: { children: 'Secondary', variant: 'secondary' },
};

export const Destructive = {
  args: { children: 'Delete', variant: 'destructive' },
};

export const Small = {
  args: { children: 'Small', size: 'sm' },
};

export const Large = {
  args: { children: 'Large', size: 'lg' },
};

export const Loading = {
  args: { children: 'Loading...', variant: 'primary', isLoading: true },
};

export const Disabled = {
  args: { children: 'Disabled', isDisabled: true },
};

export const AllVariants = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button variant="default">Default</Button>
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="destructive">Destructive</Button>
    </div>
  ),
};

export const AllSizes = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="xs">Extra Small</Button>
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
      <Button size="xl">Extra Large</Button>
    </div>
  ),
};

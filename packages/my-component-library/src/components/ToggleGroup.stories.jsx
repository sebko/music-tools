import { useState } from 'react';
import ToggleGroup from './ToggleGroup';

export default {
  title: 'Components/ToggleGroup',
  component: ToggleGroup,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
  },
};

const defaultOptions = [
  { value: 'grid', label: 'Grid' },
  { value: 'list', label: 'List' },
  { value: 'table', label: 'Table' },
];

export const Default = {
  render: (args) => {
    const [value, setValue] = useState('grid');
    return <ToggleGroup {...args} options={defaultOptions} value={value} onChange={setValue} />;
  },
};

export const Small = {
  render: () => {
    const [value, setValue] = useState('grid');
    return <ToggleGroup options={defaultOptions} value={value} onChange={setValue} size="sm" />;
  },
};

export const Large = {
  render: () => {
    const [value, setValue] = useState('grid');
    return <ToggleGroup options={defaultOptions} value={value} onChange={setValue} size="lg" />;
  },
};

export const TwoOptions = {
  render: () => {
    const [value, setValue] = useState('on');
    return (
      <ToggleGroup
        options={[
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
        ]}
        value={value}
        onChange={setValue}
      />
    );
  },
};

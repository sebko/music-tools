import { useState } from 'react';
import SearchInput from './SearchInput';

export default {
  title: 'Patterns/SearchInput',
  component: SearchInput,
  tags: ['autodocs'],
};

export const Default = {
  render: () => {
    const [value, setValue] = useState('');
    return <SearchInput value={value} onChange={setValue} className="w-64" />;
  },
};

export const WithValue = {
  render: () => {
    const [value, setValue] = useState('Aphex Twin');
    return <SearchInput value={value} onChange={setValue} className="w-64" />;
  },
};

export const CustomPlaceholder = {
  render: () => {
    const [value, setValue] = useState('');
    return (
      <SearchInput
        value={value}
        onChange={setValue}
        placeholder="Search albums..."
        className="w-80"
      />
    );
  },
};

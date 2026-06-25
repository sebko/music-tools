import { useState } from 'react';
import FilterToggle from './FilterToggle';

export default {
  title: 'Components/FilterToggle',
  component: FilterToggle,
  tags: ['autodocs'],
};

const defaultFilters = [
  { key: 'all', label: 'All' },
  { key: 'matched', label: 'Matched' },
  { key: 'unmatched', label: 'Unmatched' },
];

export const Default = {
  render: () => {
    const [active, setActive] = useState('all');
    return <FilterToggle filters={defaultFilters} activeFilter={active} onFilterChange={setActive} />;
  },
};

export const TwoFilters = {
  render: () => {
    const [active, setActive] = useState('recent');
    return (
      <FilterToggle
        filters={[
          { key: 'recent', label: 'Recent' },
          { key: 'oldest', label: 'Oldest' },
        ]}
        activeFilter={active}
        onFilterChange={setActive}
      />
    );
  },
};

export const ManyFilters = {
  render: () => {
    const [active, setActive] = useState('all');
    return (
      <FilterToggle
        filters={[
          { key: 'all', label: 'All' },
          { key: 'rock', label: 'Rock' },
          { key: 'jazz', label: 'Jazz' },
          { key: 'electronic', label: 'Electronic' },
          { key: 'hip-hop', label: 'Hip Hop' },
        ]}
        activeFilter={active}
        onFilterChange={setActive}
      />
    );
  },
};

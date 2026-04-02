import { useState } from 'react';
import Toolbar from './Toolbar';
import FilterToggle from './FilterToggle';
import SearchInput from './SearchInput';
import Button from './Button';

export default {
  title: 'Patterns/Toolbar',
  component: Toolbar,
  tags: ['autodocs'],
};

export const Default = {
  render: () => (
    <Toolbar
      left={
        <FilterToggle
          filters={[
            { key: 'all', label: 'All' },
            { key: 'matched', label: 'Matched' },
            { key: 'unmatched', label: 'Unmatched' },
          ]}
          activeFilter="all"
          onFilterChange={() => {}}
        />
      }
      right={<Button variant="primary" size="sm">Scan</Button>}
    />
  ),
};

export const WithSearch = {
  render: () => {
    const [search, setSearch] = useState('');
    return (
      <Toolbar
        left={
          <FilterToggle
            filters={[
              { key: 'albums', label: 'Albums' },
              { key: 'singles', label: 'Singles' },
            ]}
            activeFilter="albums"
            onFilterChange={() => {}}
          />
        }
        right={<SearchInput value={search} onChange={setSearch} placeholder="Search..." className="w-56" />}
      />
    );
  },
};

export const LeftOnly = {
  render: () => (
    <Toolbar left={<Button variant="secondary" size="sm">Back</Button>} />
  ),
};
